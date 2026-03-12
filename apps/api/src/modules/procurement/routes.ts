import type { FastifyPluginAsync } from "fastify";
import {
  createPOSchema,
  submitPOSchema,
  receivePOSchema,
  closeVariancePOSchema,
  cancelPOSchema,
  paginationSchema,
  PROCUREMENT_ROLES,
} from "@apex/types";
import {
  createPO,
  submitPO,
  receivePO,
  closeWithVariance,
  cancelPO,
  getPO,
  getPOByNumber,
  listPOs,
  getPOReceiptEvents,
  getPOReceipts,
  getPOJournal,
  listSuppliers,
} from "./service";

function assertProcurementRole(role: string) {
  if (!PROCUREMENT_ROLES.includes(role as any)) {
    throw new Error("Insufficient role for procurement operations");
  }
}

export const procurementRoutes: FastifyPluginAsync = async (app) => {
  // ─── GET /procurement/suppliers ──────────────────
  // List all suppliers for the org (for dropdowns)
  app.get("/suppliers", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const data = await listSuppliers(orgId);
    return reply.send({ data });
  });

  // ─── POST /procurement/purchase-orders ─────────────
  // Create a new PO in DRAFT status
  app.post("/purchase-orders", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { userId, role } = request.user;

    const parsed = createPOSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ error: "Validation failed", details: parsed.error.flatten() });
    }

    try {
      const result = await createPO(parsed.data, orgId, userId, role);
      return reply.status(201).send(result);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // ─── GET /procurement/purchase-orders ──────────────
  // List POs with cursor-based pagination
  app.get("/purchase-orders", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { role } = request.user;
    assertProcurementRole(role);

    const parsed = paginationSchema.safeParse(request.query);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ error: "Validation failed", details: parsed.error.flatten() });
    }

    const result = await listPOs(orgId, parsed.data.cursor, parsed.data.limit);
    return reply.send(result);
  });

  // ─── GET /procurement/purchase-orders/by-number/:poNo ──
  // Resolve PO by public po_no (for deep-linking)
  app.get(
    "/purchase-orders/by-number/:poNo",
    async (request, reply) => {
      const { poNo } = request.params as { poNo: string };
      const { orgId } = request.storeContext!;
      const { role } = request.user;
      assertProcurementRole(role);

      const result = await getPOByNumber(poNo, orgId);
      if (!result) {
        return reply
          .status(404)
          .send({ error: "Purchase Order not found" });
      }
      return reply.send(result);
    },
  );

  // ─── GET /procurement/purchase-orders/:id ──────────
  // Get PO details with enriched lines + receipt events
  app.get("/purchase-orders/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;
    const { role } = request.user;
    assertProcurementRole(role);

    const result = await getPO(id, orgId);
    if (!result) {
      return reply
        .status(404)
        .send({ error: "Purchase Order not found" });
    }
    return reply.send(result);
  });

  // ─── POST /procurement/purchase-orders/:id/submit ──
  // Submit a DRAFT PO (DRAFT -> SUBMITTED)
  app.post("/purchase-orders/:id/submit", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;
    const { userId, role } = request.user;

    const parsed = submitPOSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ error: "Validation failed", details: parsed.error.flatten() });
    }

    try {
      const result = await submitPO(
        id,
        orgId,
        userId,
        role,
        parsed.data.idempotencyKey,
        parsed.data.notes,
      );
      return reply.send(result);
    } catch (err: any) {
      if (isIdempotencyError(err)) {
        return reply
          .status(409)
          .send({ error: "Duplicate request (idempotency key already used)" });
      }
      return reply.status(400).send({ error: err.message });
    }
  });

  // ─── POST /procurement/purchase-orders/:id/receive ─
  // THE CRITICAL PATH: Receive items against a PO
  // Creates receipt events, adds inventory, updates cost + mnemonic
  app.post("/purchase-orders/:id/receive", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;
    const { userId, role } = request.user;

    const parsed = receivePOSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ error: "Validation failed", details: parsed.error.flatten() });
    }

    try {
      const result = await receivePO(id, orgId, userId, role, parsed.data);
      return reply.send(result);
    } catch (err: any) {
      if (isIdempotencyError(err)) {
        return reply
          .status(409)
          .send({ error: "Duplicate request (idempotency key already used)" });
      }
      if (isContentionError(err)) {
        return reply
          .status(423)
          .send({ error: "Resource locked — retry in a moment" });
      }
      return reply.status(400).send({ error: err.message });
    }
  });

  // ─── POST /procurement/purchase-orders/:id/close-variance ──
  // Close a PO with variance (PARTIALLY_RECEIVED -> CLOSED_WITH_VARIANCE)
  app.post(
    "/purchase-orders/:id/close-variance",
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const { orgId } = request.storeContext!;
      const { userId, role } = request.user;

      const parsed = closeVariancePOSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: "Validation failed",
          details: parsed.error.flatten(),
        });
      }

      try {
        const result = await closeWithVariance(
          id,
          orgId,
          userId,
          role,
          parsed.data.idempotencyKey,
          parsed.data.notes,
        );
        return reply.send(result);
      } catch (err: any) {
        if (isIdempotencyError(err)) {
          return reply.status(409).send({
            error: "Duplicate request (idempotency key already used)",
          });
        }
        return reply.status(400).send({ error: err.message });
      }
    },
  );

  // ─── POST /procurement/purchase-orders/:id/cancel ──
  // Cancel a PO (DRAFT/SUBMITTED -> CANCELLED)
  app.post("/purchase-orders/:id/cancel", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;
    const { userId, role } = request.user;

    const parsed = cancelPOSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ error: "Validation failed", details: parsed.error.flatten() });
    }

    try {
      const result = await cancelPO(
        id,
        orgId,
        userId,
        role,
        parsed.data.idempotencyKey,
        parsed.data.notes,
      );
      return reply.send(result);
    } catch (err: any) {
      if (isIdempotencyError(err)) {
        return reply
          .status(409)
          .send({ error: "Duplicate request (idempotency key already used)" });
      }
      return reply.status(400).send({ error: err.message });
    }
  });

  // ─── GET /procurement/purchase-orders/:id/receipt-events ──
  // Get receipt events (append-only audit trail)
  app.get(
    "/purchase-orders/:id/receipt-events",
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const { orgId } = request.storeContext!;
      const { role } = request.user;
      assertProcurementRole(role);

      const events = await getPOReceiptEvents(id, orgId);
      return reply.send({ data: events });
    },
  );

  // ─── GET /procurement/purchase-orders/:id/receipts ──
  // Get receipt batch headers with nested line details
  app.get(
    "/purchase-orders/:id/receipts",
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const { orgId } = request.storeContext!;
      const { role } = request.user;
      assertProcurementRole(role);

      const receipts = await getPOReceipts(id, orgId);
      return reply.send({ data: receipts });
    },
  );

  // ─── GET /procurement/purchase-orders/:id/journal ──
  // Get RECEIVING journal entries for a PO
  app.get("/purchase-orders/:id/journal", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;
    const { role } = request.user;
    assertProcurementRole(role);

    const entries = await getPOJournal(id, orgId);
    return reply.send({ data: entries });
  });
};

// ── Error Classification Helpers ──

function isIdempotencyError(err: any): boolean {
  return (
    err.code === "23505" ||
    err.message?.includes("unique constraint") ||
    err.message?.includes("idempotency")
  );
}

function isContentionError(err: any): boolean {
  return (
    err.code === "55P03" || // lock_not_available
    err.message?.includes("could not obtain lock") ||
    err.message?.includes("deadlock detected")
  );
}
