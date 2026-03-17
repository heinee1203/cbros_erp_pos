import type { FastifyPluginAsync } from "fastify";
import {
  createSaleSchema,
  completeSaleSchema,
  voidSaleSchema,
  refundSaleSchema,
} from "@apex/types";
import { POS_ROLES, REFUND_ROLES } from "@apex/types";
import {
  createSale,
  parkSale,
  resumeSale,
  voidSale,
  completeSale,
  refundSale,
  getSale,
  getSaleByNumber,
  getSaleByIdempotencyKey,
  getSaleJournal,
  listSales,
} from "./service";
import { parseQuery, salesQuerySchema } from "../../lib/validate-query";

function assertPosRole(role: string) {
  if (!POS_ROLES.includes(role as any)) {
    throw new Error("Insufficient role for POS operations");
  }
}

export const salesRoutes: FastifyPluginAsync = async (app) => {
  // ─── POST /sales ─────────────────────────────────
  // Create a new sale in OPEN status
  app.post("/", async (request, reply) => {
    const { orgId, locationId } = request.storeContext!;
    if (!locationId) {
      return reply.status(400).send({ error: "A specific location must be selected for this operation" });
    }
    const { userId, role } = request.user;
    assertPosRole(role);

    const parsed = createSaleSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ error: "Validation failed", details: parsed.error.flatten() });
    }

    try {
      const result = await createSale(parsed.data, orgId, locationId, userId);
      return reply.status(201).send(result);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // ─── POST /sales/:id/park ────────────────────────
  // Park an open sale (OPEN -> PARKED)
  app.post("/:id/park", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;
    const { userId, role } = request.user;
    assertPosRole(role);

    try {
      const result = await parkSale(id, orgId, userId);
      return reply.send(result);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // ─── POST /sales/:id/resume ──────────────────────
  // Resume a parked sale (PARKED -> OPEN)
  app.post("/:id/resume", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;
    const { userId, role } = request.user;
    assertPosRole(role);

    try {
      const result = await resumeSale(id, orgId, userId);
      return reply.send(result);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // ─── POST /sales/:id/void ───────────────────────
  // Void a sale (QUOTE/OPEN/PARKED -> VOIDED)
  app.post("/:id/void", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;
    const { userId, role } = request.user;
    assertPosRole(role);

    const parsed = voidSaleSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ error: "Validation failed", details: parsed.error.flatten() });
    }

    try {
      const result = await voidSale(id, orgId, userId, parsed.data.notes);
      return reply.send(result);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // ─── POST /sales/:id/complete ────────────────────
  // Complete a sale — THE CHECKOUT PATH
  // Deducts inventory, creates SALE journal entries
  app.post("/:id/complete", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;
    const { userId, role } = request.user;
    assertPosRole(role);

    const parsed = completeSaleSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ error: "Validation failed", details: parsed.error.flatten() });
    }

    try {
      const result = await completeSale(id, orgId, userId, parsed.data);
      return reply.send(result);
    } catch (err: any) {
      if (
        err.code === "23505" ||
        err.message?.includes("unique constraint") ||
        err.message?.includes("idempotency")
      ) {
        return reply
          .status(409)
          .send({ error: "Duplicate request (idempotency key already used)" });
      }
      return reply.status(400).send({ error: err.message });
    }
  });

  // ─── POST /sales/:id/refund ──────────────────────
  // Refund a completed sale — admin/manager only
  // Creates RETURN journal entries (reversal)
  app.post("/:id/refund", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;
    const { userId, role } = request.user;

    if (!REFUND_ROLES.includes(role as any)) {
      return reply
        .status(403)
        .send({ error: "Only ADMIN or MANAGER can process refunds" });
    }

    const parsed = refundSaleSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ error: "Validation failed", details: parsed.error.flatten() });
    }

    try {
      const result = await refundSale(id, orgId, userId, role, parsed.data);
      return reply.send(result);
    } catch (err: any) {
      if (
        err.code === "23505" ||
        err.message?.includes("unique constraint") ||
        err.message?.includes("idempotency")
      ) {
        return reply
          .status(409)
          .send({ error: "Duplicate request (idempotency key already used)" });
      }
      return reply.status(400).send({ error: err.message });
    }
  });

  // ─── GET /sales ────────────────────────────────────
  // List sales with filters, pagination, joined display fields
  app.get("/", async (request, reply) => {
    const q = parseQuery(salesQuerySchema, request.query, reply);
    if (!q) return;

    const { orgId, locationId } = request.storeContext!;
    const { role } = request.user;

    const allLocations = q.allLocations === "true" || !locationId;
    if (allLocations && !["ADMIN", "MANAGER"].includes(role)) {
      return reply
        .status(403)
        .send({ error: "Cross-location access requires ADMIN or MANAGER" });
    }

    const result = await listSales(orgId, {
      locationId: allLocations ? undefined : locationId,
      status: q.status?.split(",").filter(Boolean),
      from: q.from,
      to: q.to,
      q: q.q,
      cursor: q.cursor,
      limit: q.limit,
    });

    return reply.send(result);
  });

  // ─── GET /sales/by-number/:saleNo ────────────────
  // Resolve sale by public sale_no (for deep-linking)
  app.get("/by-number/:saleNo", async (request, reply) => {
    const { saleNo } = request.params as { saleNo: string };
    const { orgId } = request.storeContext!;

    const result = await getSaleByNumber(saleNo, orgId);
    if (!result) {
      return reply.status(404).send({ error: "Sale not found" });
    }
    return reply.send(result);
  });

  // ─── GET /sales/by-idempotency-key/:key ────────────
  // Reconciliation lookup for mobile POS — returns sale if it was
  // already completed with this idempotency key
  app.get("/by-idempotency-key/:key", async (request, reply) => {
    const { key } = request.params as { key: string };
    const { orgId } = request.storeContext!;

    const result = await getSaleByIdempotencyKey(key, orgId);
    if (!result) {
      return reply.status(404).send({ error: "No sale found for this idempotency key" });
    }
    return reply.send(result);
  });

  // ─── GET /sales/:id ─────────────────────────────
  // Get sale details with enriched lines
  app.get("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;

    const result = await getSale(id, orgId);
    if (!result) {
      return reply.status(404).send({ error: "Sale not found" });
    }
    return reply.send(result);
  });

  // ─── GET /sales/:id/journal ──────────────────────
  // Get sale-related journal entries
  app.get("/:id/journal", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;

    const entries = await getSaleJournal(id, orgId);
    return reply.send({ data: entries });
  });
};
