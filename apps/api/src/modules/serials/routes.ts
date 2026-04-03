import type { FastifyPluginAsync } from "fastify";
import { UserRole } from "@apex/types";
import { db } from "@apex/database";
import { products, locations, serialNumbers } from "@apex/database/schema";
import { eq, and, sql } from "drizzle-orm";
import { listSerials, lookupSerial, getSerialsBySale, bulkRegisterSerials, getTireAgeReport } from "./service";

const SERIAL_ADMIN_ROLES = [UserRole.ADMIN, UserRole.MANAGER];

export const serialRoutes: FastifyPluginAsync = async (app) => {
  // ─── GET / — List serials ───────────────────
  app.get("/", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const q = request.query as Record<string, string | undefined>;

    const limit = Math.min(parseInt(q.limit ?? "50", 10), 200);
    const cursor = q.cursor;

    const result = await listSerials({
      orgId,
      productId: q.productId,
      status: q.status,
      locationId: q.locationId,
      search: q.search,
      cursor,
      limit,
    });

    return reply.send(result);
  });

  // ─── GET /lookup/:serialNumber — Lookup a specific serial ───────────────────
  app.get("/lookup/:serialNumber", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { serialNumber } = request.params as { serialNumber: string };

    const serial = await lookupSerial(orgId, serialNumber);
    if (!serial) {
      return reply.status(404).send({ error: "Serial number not found" });
    }

    return reply.send(serial);
  });

  // ─── GET /validate — Check if a serial number already exists ───────────────────
  app.get("/validate", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const q = request.query as { serialNumber?: string; productId?: string };

    if (!q.serialNumber) {
      return reply.status(400).send({ error: "serialNumber is required" });
    }

    const conditions = [
      eq(serialNumbers.orgId, orgId),
      eq(serialNumbers.serialNumber, q.serialNumber),
    ];
    if (q.productId) {
      conditions.push(eq(serialNumbers.productId, q.productId));
    }

    const [existing] = await db
      .select({ id: serialNumbers.id, status: serialNumbers.status })
      .from(serialNumbers)
      .where(and(...conditions))
      .limit(1);

    return reply.send({
      exists: !!existing,
      status: existing?.status ?? null,
    });
  });

  // ─── GET /by-sale/:saleId — Get serials for a sale ───────────────────
  app.get("/by-sale/:saleId", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { saleId } = request.params as { saleId: string };

    const data = await getSerialsBySale(orgId, saleId);
    return reply.send({ data });
  });

  // ─── POST /bulk-register — Manually register serials ───────────────────
  app.post("/bulk-register", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { role } = request.user;

    if (!SERIAL_ADMIN_ROLES.includes(role as any)) {
      return reply.status(403).send({ error: "Insufficient role for serial registration" });
    }

    const body = request.body as {
      productId?: string;
      locationId?: string;
      serialNumbers?: (string | { serialNumber: string; dotCode?: string })[];
      serials?: { serialNumber: string; dotCode?: string }[];
    };

    // Support both legacy string[] and new object[] formats
    const serialInput = body.serials ?? body.serialNumbers;
    if (!body.productId || !body.locationId || !Array.isArray(serialInput) || serialInput.length === 0) {
      return reply.status(400).send({
        error: "productId, locationId, and a non-empty serialNumbers/serials array are required",
      });
    }

    // Validate product exists and is serialized
    const [product] = await db
      .select({ id: products.id, isSerialized: products.isSerialized })
      .from(products)
      .where(and(eq(products.id, body.productId), eq(products.orgId, orgId)))
      .limit(1);

    if (!product) {
      return reply.status(404).send({ error: "Product not found" });
    }
    if (!product.isSerialized) {
      return reply.status(400).send({ error: "Product is not configured for serial tracking" });
    }

    // Validate location exists
    const [location] = await db
      .select({ id: locations.id })
      .from(locations)
      .where(and(eq(locations.id, body.locationId), eq(locations.orgId, orgId)))
      .limit(1);

    if (!location) {
      return reply.status(404).send({ error: "Location not found" });
    }

    const result = await bulkRegisterSerials(orgId, body.productId, body.locationId, serialInput);
    return reply.status(201).send(result);
  });

  // ─── GET /tire-age-report — Tire age report ───────────────────
  app.get("/tire-age-report", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const q = request.query as Record<string, string | undefined>;

    const result = await getTireAgeReport(orgId, {
      locationId: q.locationId,
      status: q.status,
      cursor: q.cursor,
      limit: q.limit ? parseInt(q.limit, 10) : undefined,
    });

    return reply.send(result);
  });
};
