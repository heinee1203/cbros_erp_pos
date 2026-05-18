import type { FastifyInstance } from "fastify";
import {
  cancelSupplierReturnSchema,
  closeWithoutCreditSchema,
  createSupplierReturnSchema,
  receiveCreditSchema,
  supplierReturnNotesSchema,
  SUPPLIER_RETURN_ROLES,
  updateSupplierReturnSchema,
} from "@apex/types";
import {
  acknowledgeSupplierReturn,
  cancelSupplierReturn,
  closeSupplierReturn,
  closeWithoutCreditSupplierReturn,
  createSupplierReturn,
  deleteSupplierReturn,
  receiveCreditSupplierReturn,
  submitSupplierReturn,
  updateSupplierReturn,
} from "./supplier-return-workflow-service";

export async function registerSupplierReturnWorkflowRoutes(app: FastifyInstance) {
  // POST / - create a new supplier return in DRAFT status
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

  // PATCH /:id - update a DRAFT supplier return
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

  // DELETE /:id - delete a DRAFT supplier return
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

  // POST /:id/submit - DRAFT -> SUBMITTED (deducts inventory)
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

  // POST /:id/acknowledge - SUBMITTED -> ACKNOWLEDGED
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

  // POST /:id/receive-credit - ACKNOWLEDGED -> CREDIT_RECEIVED
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

  // POST /:id/close - CREDIT_RECEIVED -> CLOSED
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

  // POST /:id/close-without-credit - SUBMITTED/ACKNOWLEDGED -> CLOSED_WITHOUT_CREDIT
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

  // POST /:id/cancel - DRAFT/SUBMITTED -> CANCELLED
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
}
