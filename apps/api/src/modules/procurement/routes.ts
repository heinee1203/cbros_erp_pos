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
import { db } from "@apex/database";
import { purchaseOrders, poLines } from "@apex/database/schema";
import { eq, and, sql } from "drizzle-orm";
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
  createSupplier,
  updateSupplier,
  deleteSupplier,
} from "./service";
import {
  getRedirectPlan,
  createRedirectPOs,
  getSupplierProducts,
} from "../product-suppliers/service";

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

  // ─── POST /procurement/suppliers ──────────────────
  // Create a new supplier
  app.post("/suppliers", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { role } = request.user;
    assertProcurementRole(role);

    const body = request.body as {
      name?: string;
      contactEmail?: string;
      contactPhone?: string;
      address?: string;
      mnemonicCode?: string;
      avgLeadTimeDays?: number;
    };

    if (!body.name || body.name.trim().length === 0) {
      return reply.status(400).send({ error: "Supplier name is required" });
    }

    if (body.mnemonicCode && body.mnemonicCode.length > 2) {
      return reply.status(400).send({ error: "Mnemonic code must be at most 2 characters" });
    }

    try {
      const supplier = await createSupplier(orgId, body);
      return reply.status(201).send(supplier);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // ─── PATCH /procurement/suppliers/:id ─────────────
  // Update an existing supplier
  app.patch("/suppliers/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;
    const { role } = request.user;
    assertProcurementRole(role);

    const body = request.body as {
      name?: string;
      contactEmail?: string | null;
      contactPhone?: string | null;
      address?: string | null;
      mnemonicCode?: string | null;
      avgLeadTimeDays?: number;
    };

    if (body.mnemonicCode && body.mnemonicCode.length > 2) {
      return reply.status(400).send({ error: "Mnemonic code must be at most 2 characters" });
    }

    try {
      const supplier = await updateSupplier(orgId, id, body);
      return reply.send(supplier);
    } catch (err: any) {
      if (err.message === "Supplier not found") {
        return reply.status(404).send({ error: err.message });
      }
      return reply.status(400).send({ error: err.message });
    }
  });

  // ─── DELETE /procurement/suppliers/:id ─────────────
  // Delete a supplier (fails if has purchase orders)
  app.delete("/suppliers/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;
    const { role } = request.user;
    assertProcurementRole(role);

    try {
      await deleteSupplier(orgId, id);
      return reply.send({ success: true });
    } catch (err: any) {
      if (err.message === "Supplier not found") {
        return reply.status(404).send({ error: err.message });
      }
      return reply.status(400).send({ error: err.message });
    }
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

  // ─── PATCH /procurement/purchase-orders/:id ──────────
  // Update PO header fields (DRAFT / SUBMITTED / PARTIALLY_RECEIVED)
  app.patch("/purchase-orders/:id", async (request, reply) => {
    const user = request.user as any;
    assertProcurementRole(user.role);

    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;
    const body = request.body as any;

    const [po] = await db
      .select()
      .from(purchaseOrders)
      .where(and(eq(purchaseOrders.id, id), eq(purchaseOrders.orgId, orgId)))
      .limit(1);

    if (!po) return reply.status(404).send({ error: "PO not found" });

    const editableStatuses = ["DRAFT", "SUBMITTED", "PARTIALLY_RECEIVED"];
    if (!editableStatuses.includes(po.status)) {
      return reply
        .status(400)
        .send({ error: `Cannot edit PO in ${po.status} status` });
    }

    const updates: Record<string, any> = {};

    // Supplier + destination only editable in DRAFT/SUBMITTED
    if (body.supplierId !== undefined && po.status !== "PARTIALLY_RECEIVED") {
      updates.supplierId = body.supplierId;
    }
    if (
      body.destinationLocationId !== undefined &&
      po.status !== "PARTIALLY_RECEIVED"
    ) {
      updates.destinationLocationId = body.destinationLocationId;
    }
    // Notes + expected date always editable
    if (body.expectedDeliveryDate !== undefined) {
      updates.expectedDeliveryDate = body.expectedDeliveryDate
        ? new Date(body.expectedDeliveryDate)
        : null;
    }
    if (body.notes !== undefined) {
      updates.notes = body.notes;
    }

    if (Object.keys(updates).length > 0) {
      await db
        .update(purchaseOrders)
        .set(updates)
        .where(eq(purchaseOrders.id, id));
    }

    const updated = await getPOByNumber(po.poNo, orgId);
    return reply.send(updated);
  });

  // ─── POST /procurement/purchase-orders/:id/lines ────
  // Add a new line to an existing PO (DRAFT / SUBMITTED only)
  app.post("/purchase-orders/:id/lines", async (request, reply) => {
    const user = request.user as any;
    assertProcurementRole(user.role);

    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;
    const body = request.body as any;

    const [po] = await db
      .select()
      .from(purchaseOrders)
      .where(and(eq(purchaseOrders.id, id), eq(purchaseOrders.orgId, orgId)))
      .limit(1);

    if (!po) return reply.status(404).send({ error: "PO not found" });
    if (!["DRAFT", "SUBMITTED"].includes(po.status)) {
      return reply
        .status(400)
        .send({ error: `Cannot add lines to PO in ${po.status} status` });
    }

    if (!body.productId || !body.orderedQty || !body.unitCost) {
      return reply
        .status(400)
        .send({ error: "productId, orderedQty, and unitCost are required" });
    }

    const [line] = await db
      .insert(poLines)
      .values({
        purchaseOrderId: id,
        orgId,
        productId: body.productId,
        orderedQty: body.orderedQty,
        unitCost: body.unitCost,
        listPrice: body.listPrice ?? null,
        discountChain: body.discountChain ?? null,
      })
      .returning();

    return reply.status(201).send(line);
  });

  // ─── PATCH /procurement/purchase-orders/:id/lines/:lineId ──
  // Update a PO line (qty, cost, product)
  app.patch(
    "/purchase-orders/:id/lines/:lineId",
    async (request, reply) => {
      const user = request.user as any;
      assertProcurementRole(user.role);

      const { id, lineId } = request.params as {
        id: string;
        lineId: string;
      };
      const { orgId } = request.storeContext!;
      const body = request.body as any;

      const [po] = await db
        .select()
        .from(purchaseOrders)
        .where(
          and(eq(purchaseOrders.id, id), eq(purchaseOrders.orgId, orgId)),
        )
        .limit(1);

      if (!po) return reply.status(404).send({ error: "PO not found" });

      if (
        !["DRAFT", "SUBMITTED", "PARTIALLY_RECEIVED"].includes(po.status)
      ) {
        return reply
          .status(400)
          .send({ error: `Cannot edit lines on PO in ${po.status} status` });
      }

      const [line] = await db
        .select()
        .from(poLines)
        .where(
          and(eq(poLines.id, lineId), eq(poLines.purchaseOrderId, id)),
        )
        .limit(1);

      if (!line)
        return reply.status(404).send({ error: "PO line not found" });

      // PARTIALLY_RECEIVED: can only edit unreceived lines
      if (po.status === "PARTIALLY_RECEIVED") {
        if (line.receivedAcceptedQty > 0 || line.rejectedQty > 0) {
          return reply.status(400).send({
            error: "Cannot edit a line that has already been received",
          });
        }
      }

      const updates: Record<string, any> = {};
      if (body.orderedQty !== undefined) updates.orderedQty = body.orderedQty;
      if (body.unitCost !== undefined) updates.unitCost = body.unitCost;
      if (body.productId !== undefined) updates.productId = body.productId;
      if (body.listPrice !== undefined) updates.listPrice = body.listPrice;
      if (body.discountChain !== undefined) updates.discountChain = body.discountChain;

      if (Object.keys(updates).length === 0) {
        return reply.send(line);
      }

      const [updated] = await db
        .update(poLines)
        .set(updates)
        .where(eq(poLines.id, lineId))
        .returning();

      return reply.send(updated);
    },
  );

  // ─── DELETE /procurement/purchase-orders/:id/lines/:lineId ──
  // Remove a line from a PO (DRAFT / SUBMITTED only, not received)
  app.delete(
    "/purchase-orders/:id/lines/:lineId",
    async (request, reply) => {
      const user = request.user as any;
      assertProcurementRole(user.role);

      const { id, lineId } = request.params as {
        id: string;
        lineId: string;
      };
      const { orgId } = request.storeContext!;

      const [po] = await db
        .select()
        .from(purchaseOrders)
        .where(
          and(eq(purchaseOrders.id, id), eq(purchaseOrders.orgId, orgId)),
        )
        .limit(1);

      if (!po) return reply.status(404).send({ error: "PO not found" });

      if (!["DRAFT", "SUBMITTED"].includes(po.status)) {
        return reply.status(400).send({
          error: `Cannot remove lines from PO in ${po.status} status`,
        });
      }

      const [line] = await db
        .select()
        .from(poLines)
        .where(
          and(eq(poLines.id, lineId), eq(poLines.purchaseOrderId, id)),
        )
        .limit(1);

      if (!line)
        return reply.status(404).send({ error: "PO line not found" });

      if (line.receivedAcceptedQty > 0 || line.rejectedQty > 0) {
        return reply.status(400).send({
          error:
            "Cannot delete a line that has been partially received",
        });
      }

      await db.delete(poLines).where(eq(poLines.id, lineId));

      return reply.status(204).send();
    },
  );

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

  // ─── POST /procurement/purchase-orders/:id/redirect-plan ──
  // Get redirect suggestions for unfulfilled PO items
  app.post("/purchase-orders/:id/redirect-plan", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;
    const { role } = request.user;
    assertProcurementRole(role);

    try {
      const plan = await getRedirectPlan(orgId, id);
      return reply.send(plan);
    } catch (err: any) {
      if (err.message === "Purchase order not found") {
        return reply.status(404).send({ error: err.message });
      }
      return reply.status(400).send({ error: err.message });
    }
  });

  // ─── POST /procurement/purchase-orders/:id/create-redirect-pos ──
  // Create redirect POs from a redirect plan
  app.post(
    "/purchase-orders/:id/create-redirect-pos",
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const { orgId } = request.storeContext!;
      const { userId, role } = request.user;
      assertProcurementRole(role);

      const body = request.body as {
        redirects: Array<{
          supplierId: string;
          destinationLocationId: string;
          lines: Array<{
            productId: string;
            qty: number;
            unitCost: string;
          }>;
        }>;
      };

      if (!body.redirects || !Array.isArray(body.redirects) || body.redirects.length === 0) {
        return reply.status(400).send({ error: "redirects array is required" });
      }

      try {
        const result = await createRedirectPOs(orgId, userId, id, body.redirects);
        return reply.status(201).send(result);
      } catch (err: any) {
        return reply.status(400).send({ error: err.message });
      }
    },
  );

  // ─── GET /procurement/suppliers/:supplierId/products ──
  // List all products a supplier provides (cursor-paginated)
  app.get("/suppliers/:supplierId/products", async (request, reply) => {
    const { supplierId } = request.params as { supplierId: string };
    const { orgId } = request.storeContext!;
    const query = request.query as { cursor?: string; limit?: string };

    const limit = Math.min(parseInt(query.limit ?? "50", 10) || 50, 100);
    const result = await getSupplierProducts(orgId, supplierId, query.cursor, limit);
    return reply.send(result);
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
