import type { FastifyInstance, FastifyReply } from "fastify";
import {
  addPurchaseOrderLine,
  deletePurchaseOrderLine,
  PurchaseOrderEditError,
  updatePurchaseOrderHeader,
  updatePurchaseOrderLine,
} from "./purchase-order-edit-service";
import { assertProcurementRole } from "./route-support";

function sendEditError(reply: FastifyReply, err: unknown) {
  if (err instanceof PurchaseOrderEditError) {
    return reply.status(err.statusCode).send({ error: err.message });
  }

  throw err;
}

export function registerPurchaseOrderEditRoutes(app: FastifyInstance) {
  app.patch("/purchase-orders/:id", async (request, reply) => {
    const user = request.user as any;
    assertProcurementRole(user.role);

    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;
    const body = request.body as any;

    try {
      const updated = await updatePurchaseOrderHeader(id, orgId, body);
      return reply.send(updated);
    } catch (err) {
      return sendEditError(reply, err);
    }
  });

  app.post("/purchase-orders/:id/lines", async (request, reply) => {
    const user = request.user as any;
    assertProcurementRole(user.role);

    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;
    const body = request.body as any;

    try {
      const line = await addPurchaseOrderLine(id, orgId, body);
      return reply.status(201).send(line);
    } catch (err) {
      return sendEditError(reply, err);
    }
  });

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

      try {
        const updated = await updatePurchaseOrderLine(
          id,
          lineId,
          orgId,
          body,
        );
        return reply.send(updated);
      } catch (err) {
        return sendEditError(reply, err);
      }
    },
  );

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

      try {
        await deletePurchaseOrderLine(id, lineId, orgId);
        return reply.status(204).send();
      } catch (err) {
        return sendEditError(reply, err);
      }
    },
  );
}
