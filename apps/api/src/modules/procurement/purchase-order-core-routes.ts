import type { FastifyInstance } from "fastify";
import { createPOSchema } from "@apex/types";
import { logAction } from "./procurement-audit-service";
import { assertProcurementRole } from "./route-support";
import { createPO } from "./purchase-order-create-service";
import { getPO, getPOByNumber, listPOs } from "./purchase-order-read-service";

export function registerPurchaseOrderCoreRoutes(app: FastifyInstance) {
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
      logAction({
        orgId,
        userId,
        action: "PO_CREATE",
        entityType: "PO",
        entityId: result.po?.id,
        details: { poNo: result.po?.poNo },
        ipAddress: request.ip,
      });
      return reply.status(201).send(result);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  app.get("/purchase-orders", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { role } = request.user;
    assertProcurementRole(role);

    const q = request.query as Record<string, string | undefined>;
    const limit = q.limit ? parseInt(q.limit, 10) : 50;

    const result = await listPOs(orgId, {
      cursor: q.cursor,
      limit,
      status: q.status,
      supplierId: q.supplierId,
      destinationLocationId: q.destinationLocationId,
      createdAfter: q.createdAfter,
      createdBefore: q.createdBefore,
    });
    return reply.send(result);
  });

  app.get("/purchase-orders/by-number/:poNo", async (request, reply) => {
    const { poNo } = request.params as { poNo: string };
    const { orgId } = request.storeContext!;
    const { role } = request.user;
    assertProcurementRole(role);

    const result = await getPOByNumber(poNo, orgId);
    if (!result) {
      return reply.status(404).send({ error: "Purchase Order not found" });
    }
    return reply.send(result);
  });

  app.get("/purchase-orders/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;
    const { role } = request.user;
    assertProcurementRole(role);

    const result = await getPO(id, orgId);
    if (!result) {
      return reply.status(404).send({ error: "Purchase Order not found" });
    }
    return reply.send(result);
  });
}
