import type { FastifyInstance } from "fastify";
import {
  createRedirectPOs,
  getRedirectPlan,
  getSupplierProducts,
} from "./procurement-product-supplier-service";
import { assertProcurementRole } from "./route-support";
import {
  getPOJournal,
  getPOReceiptEvents,
  getPOReceipts,
  getReceiptsSummary,
  listPOsReceivedAt,
} from "./purchase-order-read-service";

export function registerProcurementAuxiliaryRoutes(app: FastifyInstance) {
  app.get(
    "/purchase-orders/received-at/:locationId",
    async (request, reply) => {
      const { locationId } = request.params as { locationId: string };
      const { orgId } = request.storeContext!;
      const { role } = request.user;
      assertProcurementRole(role);

      const { search, limit } = (request.query ?? {}) as {
        search?: string;
        limit?: string;
      };

      const result = await listPOsReceivedAt(
        orgId,
        locationId,
        search,
        limit ? parseInt(limit) : undefined,
      );
      return reply.send(result);
    },
  );

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

  app.get("/purchase-orders/:id/receipts", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;
    const { role } = request.user;
    assertProcurementRole(role);

    const receipts = await getPOReceipts(id, orgId);
    return reply.send({ data: receipts });
  });

  app.get(
    "/purchase-orders/:id/receipts-summary",
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const { orgId } = request.storeContext!;
      const { role } = request.user;
      assertProcurementRole(role);

      const receipts = await getReceiptsSummary(id, orgId);
      return reply.send({ data: receipts });
    },
  );

  app.get("/purchase-orders/:id/journal", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;
    const { role } = request.user;
    assertProcurementRole(role);

    const entries = await getPOJournal(id, orgId);
    return reply.send({ data: entries });
  });

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

      if (
        !body.redirects ||
        !Array.isArray(body.redirects) ||
        body.redirects.length === 0
      ) {
        return reply.status(400).send({ error: "redirects array is required" });
      }

      try {
        const result = await createRedirectPOs(
          orgId,
          userId,
          id,
          body.redirects,
        );
        return reply.status(201).send(result);
      } catch (err: any) {
        return reply.status(400).send({ error: err.message });
      }
    },
  );

  app.get("/suppliers/:supplierId/products", async (request, reply) => {
    const { supplierId } = request.params as { supplierId: string };
    const { orgId } = request.storeContext!;
    const query = request.query as { cursor?: string; limit?: string };

    const limit = Math.min(parseInt(query.limit ?? "50", 10) || 50, 100);
    const result = await getSupplierProducts(
      orgId,
      supplierId,
      query.cursor,
      limit,
    );
    return reply.send(result);
  });
}
