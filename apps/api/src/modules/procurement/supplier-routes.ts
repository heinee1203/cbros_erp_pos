import type { FastifyInstance } from "fastify";
import { logAction } from "./procurement-audit-service";
import { assertProcurementRole } from "./route-support";
import {
  createSupplier,
  deleteSupplier,
  listSuppliers,
  mergeSuppliers,
  updateSupplier,
} from "./supplier-service";

export function registerProcurementSupplierRoutes(app: FastifyInstance) {
  app.get("/suppliers", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const data = await listSuppliers(orgId);
    return reply.send({ data });
  });

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
      paymentTermsDays?: number;
      isActive?: boolean;
    };

    if (!body.name || body.name.trim().length === 0) {
      return reply.status(400).send({ error: "Supplier name is required" });
    }

    if (body.mnemonicCode && body.mnemonicCode.length > 2) {
      return reply
        .status(400)
        .send({ error: "Mnemonic code must be at most 2 characters" });
    }

    if (
      body.avgLeadTimeDays !== undefined &&
      (!Number.isFinite(body.avgLeadTimeDays) || body.avgLeadTimeDays < 0)
    ) {
      return reply.status(400).send({ error: "Lead time must be zero or more days" });
    }

    if (
      body.paymentTermsDays !== undefined &&
      (!Number.isFinite(body.paymentTermsDays) || body.paymentTermsDays < 0)
    ) {
      return reply.status(400).send({ error: "Payment terms must be zero or more days" });
    }

    try {
      const supplier = await createSupplier(orgId, {
        ...body,
        name: body.name.trim(),
      });
      return reply.status(201).send(supplier);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

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
      paymentTermsDays?: number;
      isActive?: boolean;
    };

    if (body.mnemonicCode && body.mnemonicCode.length > 2) {
      return reply
        .status(400)
        .send({ error: "Mnemonic code must be at most 2 characters" });
    }

    if (
      body.avgLeadTimeDays !== undefined &&
      (!Number.isFinite(body.avgLeadTimeDays) || body.avgLeadTimeDays < 0)
    ) {
      return reply.status(400).send({ error: "Lead time must be zero or more days" });
    }

    if (
      body.paymentTermsDays !== undefined &&
      (!Number.isFinite(body.paymentTermsDays) || body.paymentTermsDays < 0)
    ) {
      return reply.status(400).send({ error: "Payment terms must be zero or more days" });
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

  app.post("/suppliers/merge", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { userId, role } = request.user;
    assertProcurementRole(role);

    const body = request.body as {
      sourceId?: string;
      targetId?: string;
    };

    if (!body.sourceId || !body.targetId) {
      return reply
        .status(400)
        .send({ error: "sourceId and targetId are both required" });
    }

    try {
      const result = await mergeSuppliers(orgId, body.sourceId, body.targetId);
      logAction({
        orgId,
        userId,
        action: "SUPPLIER_MERGE",
        entityType: "SUPPLIER",
        entityId: result.mergedInto.id,
        details: {
          sourceId: result.removed.id,
          sourceName: result.removed.name,
          targetId: result.mergedInto.id,
          targetName: result.mergedInto.name,
          counts: result.counts,
        },
        ipAddress: request.ip,
      });
      return reply.send(result);
    } catch (err: any) {
      if (
        err.message?.includes("not found") ||
        err.message?.includes("must be different")
      ) {
        return reply.status(400).send({ error: err.message });
      }
      if (err.message?.includes("duplicate invoice numbers")) {
        return reply.status(409).send({ error: err.message });
      }
      return reply.status(500).send({ error: err.message });
    }
  });
}
