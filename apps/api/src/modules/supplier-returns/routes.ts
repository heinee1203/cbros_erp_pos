import type { FastifyPluginAsync } from "fastify";
import {
  createSupplierReturnSchema,
  updateSupplierReturnSchema,
  receiveCreditSchema,
  cancelSupplierReturnSchema,
  supplierReturnNotesSchema,
  closeWithoutCreditSchema,
} from "@apex/types";
import { SUPPLIER_RETURN_ROLES } from "@apex/types";
import {
  createSupplierReturn,
  updateSupplierReturn,
  deleteSupplierReturn,
  submitSupplierReturn,
  acknowledgeSupplierReturn,
  receiveCreditSupplierReturn,
  closeSupplierReturn,
  closeWithoutCreditSupplierReturn,
  cancelSupplierReturn,
  getSupplierReturn,
  listSupplierReturns,
  findDraftRTV,
  addLineToRTV,
} from "./service";
import { parseQuery } from "../../lib/validate-query";
import { z } from "zod";

const supplierReturnsQuerySchema = z.object({
  dateFrom: z.string().datetime({ offset: true }).optional(),
  dateTo: z.string().datetime({ offset: true }).optional(),
  status: z.string().optional(),
  supplierId: z.string().uuid().optional(),
  search: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().uuid().optional(),
  allLocations: z.enum(["true", "false"]).optional(),
});

export const supplierReturnsRoutes: FastifyPluginAsync = async (app) => {
  // ─── GET / ──────────────────────────────────────
  // List supplier returns with filters + cursor pagination
  app.get("/", async (request, reply) => {
    const q = parseQuery(supplierReturnsQuerySchema, request.query, reply);
    if (!q) return;

    const { orgId, locationId } = request.storeContext!;
    const { role } = request.user;

    const allLocations = q.allLocations === "true" || !locationId;
    if (allLocations && !["ADMIN", "MANAGER"].includes(role)) {
      return reply
        .status(403)
        .send({ error: "Cross-location access requires ADMIN or MANAGER" });
    }

    const result = await listSupplierReturns(orgId, {
      locationId: allLocations ? undefined : locationId,
      status: q.status?.split(",").filter(Boolean),
      supplierId: q.supplierId,
      search: q.search,
      dateFrom: q.dateFrom,
      dateTo: q.dateTo,
      cursor: q.cursor,
      limit: q.limit,
    });

    return reply.send(result);
  });

  // ─── GET /:id ───────────────────────────────────
  // Supplier return detail with lines + status history
  app.get("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;

    const result = await getSupplierReturn(id, orgId);
    if (!result) {
      return reply.status(404).send({ error: "Supplier return not found" });
    }
    return reply.send(result);
  });

  // ─── POST / ─────────────────────────────────────
  // Create a new supplier return in DRAFT status
  app.post("/", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { userId, role } = request.user;

    if (!SUPPLIER_RETURN_ROLES.includes(role as any)) {
      return reply
        .status(403)
        .send({ error: "Only ADMIN or MANAGER can create supplier returns" });
    }

    const parsed = createSupplierReturnSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ error: "Validation failed", details: parsed.error.flatten() });
    }

    try {
      const result = await createSupplierReturn(
        orgId,
        parsed.data.locationId,
        userId,
        parsed.data,
      );
      return reply.status(201).send(result);
    } catch (err: any) {
      if (
        err.code === "23505" ||
        err.message?.includes("unique constraint")
      ) {
        return reply
          .status(409)
          .send({ error: "Duplicate request (idempotency key already used)" });
      }
      return reply.status(400).send({ error: err.message });
    }
  });

  // ─── PATCH /:id ─────────────────────────────────
  // Update a DRAFT supplier return
  app.patch("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;
    const { userId, role } = request.user;

    if (!SUPPLIER_RETURN_ROLES.includes(role as any)) {
      return reply
        .status(403)
        .send({ error: "Only ADMIN or MANAGER can update supplier returns" });
    }

    const parsed = updateSupplierReturnSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ error: "Validation failed", details: parsed.error.flatten() });
    }

    try {
      const result = await updateSupplierReturn(id, orgId, userId, parsed.data);
      return reply.send(result);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // ─── DELETE /:id ────────────────────────────────
  // Delete a DRAFT supplier return
  app.delete("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;
    const { role } = request.user;

    if (!SUPPLIER_RETURN_ROLES.includes(role as any)) {
      return reply
        .status(403)
        .send({ error: "Only ADMIN or MANAGER can delete supplier returns" });
    }

    try {
      await deleteSupplierReturn(id, orgId);
      return reply.status(204).send();
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // ─── POST /:id/submit ──────────────────────────
  // DRAFT → SUBMITTED (deducts inventory)
  app.post("/:id/submit", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;
    const { userId, role } = request.user;

    if (!SUPPLIER_RETURN_ROLES.includes(role as any)) {
      return reply
        .status(403)
        .send({ error: "Only ADMIN or MANAGER can submit supplier returns" });
    }

    const parsed = supplierReturnNotesSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ error: "Validation failed", details: parsed.error.flatten() });
    }

    try {
      const result = await submitSupplierReturn(
        id,
        orgId,
        userId,
        parsed.data.notes,
      );
      return reply.send(result);
    } catch (err: any) {
      if (err.statusCode === 409) {
        return reply.status(409).send({
          error: err.message,
          details: err.details,
        });
      }
      return reply.status(400).send({ error: err.message });
    }
  });

  // ─── POST /:id/acknowledge ─────────────────────
  // SUBMITTED → ACKNOWLEDGED
  app.post("/:id/acknowledge", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;
    const { userId, role } = request.user;

    if (!SUPPLIER_RETURN_ROLES.includes(role as any)) {
      return reply
        .status(403)
        .send({ error: "Only ADMIN or MANAGER can acknowledge supplier returns" });
    }

    const parsed = supplierReturnNotesSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ error: "Validation failed", details: parsed.error.flatten() });
    }

    try {
      const result = await acknowledgeSupplierReturn(
        id,
        orgId,
        userId,
        parsed.data.notes,
      );
      return reply.send(result);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // ─── POST /:id/receive-credit ──────────────────
  // ACKNOWLEDGED → CREDIT_RECEIVED
  app.post("/:id/receive-credit", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;
    const { userId, role } = request.user;

    if (!SUPPLIER_RETURN_ROLES.includes(role as any)) {
      return reply
        .status(403)
        .send({ error: "Only ADMIN or MANAGER can record credit" });
    }

    const parsed = receiveCreditSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ error: "Validation failed", details: parsed.error.flatten() });
    }

    try {
      const result = await receiveCreditSupplierReturn(
        id,
        orgId,
        userId,
        parsed.data,
      );
      return reply.send(result);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // ─── POST /:id/close ──────────────────────────
  // CREDIT_RECEIVED → CLOSED
  app.post("/:id/close", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;
    const { userId, role } = request.user;

    if (!SUPPLIER_RETURN_ROLES.includes(role as any)) {
      return reply
        .status(403)
        .send({ error: "Only ADMIN or MANAGER can close supplier returns" });
    }

    const parsed = supplierReturnNotesSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ error: "Validation failed", details: parsed.error.flatten() });
    }

    try {
      const result = await closeSupplierReturn(
        id,
        orgId,
        userId,
        parsed.data.notes,
      );
      return reply.send(result);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // ─── POST /:id/close-without-credit ────────────
  // SUBMITTED/ACKNOWLEDGED → CLOSED_WITHOUT_CREDIT (ADMIN only)
  app.post("/:id/close-without-credit", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;
    const { userId, role } = request.user;

    if (role !== "ADMIN") {
      return reply
        .status(403)
        .send({ error: "Only ADMIN can close supplier returns without credit" });
    }

    const parsed = closeWithoutCreditSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ error: "Validation failed", details: parsed.error.flatten() });
    }

    try {
      const result = await closeWithoutCreditSupplierReturn(
        id,
        orgId,
        userId,
        parsed.data,
      );
      return reply.send(result);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // ─── POST /:id/cancel ─────────────────────────
  // DRAFT/SUBMITTED → CANCELLED
  app.post("/:id/cancel", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;
    const { userId, role } = request.user;

    if (!SUPPLIER_RETURN_ROLES.includes(role as any)) {
      return reply
        .status(403)
        .send({ error: "Only ADMIN or MANAGER can cancel supplier returns" });
    }

    const parsed = cancelSupplierReturnSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ error: "Validation failed", details: parsed.error.flatten() });
    }

    try {
      const result = await cancelSupplierReturn(
        id,
        orgId,
        userId,
        parsed.data,
      );
      return reply.send(result);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // ─── GET /draft-for-supplier — Find existing DRAFT RTV for a supplier ──
  app.get("/draft-for-supplier", async (request, reply) => {
    const { orgId, locationId } = request.storeContext!;
    const { role } = request.user;
    if (!SUPPLIER_RETURN_ROLES.includes(role as any)) {
      return reply.status(403).send({ error: "Insufficient role" });
    }
    const q = request.query as { supplierId: string };
    if (!q.supplierId) return reply.status(400).send({ error: "supplierId required" });
    const draft = await findDraftRTV(orgId, q.supplierId, locationId);
    return reply.send({ draft });
  });

  // ─── POST /:id/add-line — Add a line to an existing DRAFT RTV ──
  app.post("/:id/add-line", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;
    const { role } = request.user;
    if (!SUPPLIER_RETURN_ROLES.includes(role as any)) {
      return reply.status(403).send({ error: "Insufficient role" });
    }
    const body = request.body as any;
    if (!body.productId || !body.quantity || !body.costPrice || !body.condition) {
      return reply.status(400).send({ error: "productId, quantity, costPrice, and condition are required" });
    }
    try {
      const result = await addLineToRTV(id, orgId, body);
      return reply.status(201).send(result);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });
};
