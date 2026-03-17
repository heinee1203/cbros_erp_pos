import type { FastifyPluginAsync } from "fastify";
import { createAdjustmentSchema } from "@apex/types";
import { UserRole } from "@apex/types";
import { createAdjustment } from "./service";
import { db } from "@apex/database";
import { stockJournal, products, locations } from "@apex/database/schema";
import { eq, and, sql, inArray, desc } from "drizzle-orm";

// Roles allowed to make manual adjustments
const ADJUSTMENT_ROLES = [
  UserRole.ADMIN,
  UserRole.MANAGER,
  UserRole.WAREHOUSE_STAFF,
];

const ADJUSTMENT_REFERENCE_TYPES = [
  "ADJUSTMENT",
  "STOCKTAKE",
  "OPENING_BALANCE",
] as const;

export const adjustmentRoutes: FastifyPluginAsync = async (app) => {
  // ─── GET /inventory/adjustments ───────────────────
  // List stock adjustments (journal entries with adjustment reference types)
  app.get("/", async (request, reply) => {
    const { orgId, locationId } = request.storeContext!;
    const q = request.query as Record<string, string | undefined>;

    const page = parseInt(q.page ?? "1", 10);
    const limit = Math.min(parseInt(q.limit ?? "50", 10), 200);
    const offset = (page - 1) * limit;

    const conditions = [
      eq(stockJournal.orgId, orgId),
      inArray(stockJournal.referenceType, [...ADJUSTMENT_REFERENCE_TYPES]),
    ];

    // Location filter (default to current store-context location)
    if (q.location === "all" || !locationId) {
      // No location filter — org-wide view
    } else {
      conditions.push(eq(stockJournal.locationId, q.locationId ?? locationId));
    }

    // Reason code filter
    if (q.reasonCode) {
      conditions.push(sql`${stockJournal.reasonCode} = ${q.reasonCode}`);
    }

    // Direction filter
    if (q.direction === "add") {
      conditions.push(sql`${stockJournal.changeQuantity} > 0`);
    } else if (q.direction === "deduct") {
      conditions.push(sql`${stockJournal.changeQuantity} < 0`);
    }

    const where = and(...conditions);

    // Count total
    const [countResult] = await db
      .select({ total: sql<number>`COUNT(*)::int` })
      .from(stockJournal)
      .where(where);

    const total = countResult?.total ?? 0;

    // Fetch rows with product and location names
    const rows = await db
      .select({
        id: stockJournal.id,
        productId: stockJournal.productId,
        productName: products.name,
        productSku: products.sku,
        locationId: stockJournal.locationId,
        locationName: locations.name,
        changeQuantity: stockJournal.changeQuantity,
        balanceAfter: stockJournal.balanceAfter,
        referenceType: stockJournal.referenceType,
        reasonCode: stockJournal.reasonCode,
        notes: stockJournal.notes,
        userId: stockJournal.userId,
        effectiveAt: stockJournal.effectiveAt,
        createdAt: stockJournal.createdAt,
      })
      .from(stockJournal)
      .innerJoin(products, eq(stockJournal.productId, products.id))
      .innerJoin(locations, eq(stockJournal.locationId, locations.id))
      .where(where)
      .orderBy(desc(stockJournal.effectiveAt))
      .limit(limit)
      .offset(offset);

    return reply.send({
      data: rows,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  });

  // ─── POST /inventory/adjustments ───────────────────
  // Create a manual stock adjustment
  app.post("/", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { userId, role } = request.user;

    // Cashiers cannot make adjustments
    if (!ADJUSTMENT_ROLES.includes(role as any)) {
      return reply
        .status(403)
        .send({ error: "Insufficient role for stock adjustments" });
    }

    const parsed = createAdjustmentSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ error: "Validation failed", details: parsed.error.flatten() });
    }

    try {
      const result = await createAdjustment(
        parsed.data,
        orgId,
        userId,
        role,
      );
      return reply.status(201).send(result);
    } catch (err: any) {
      // Idempotency check — duplicate key means request was already processed
      // postgres.js uses err.code '23505' for unique_violation
      if (
        err.code === "23505" ||
        err.message?.includes("unique constraint") ||
        err.message?.includes("duplicate key") ||
        err.message?.includes("idempotency_key")
      ) {
        return reply
          .status(409)
          .send({ error: "Duplicate request (idempotency key already used)" });
      }
      return reply.status(400).send({ error: err.message });
    }
  });
};
