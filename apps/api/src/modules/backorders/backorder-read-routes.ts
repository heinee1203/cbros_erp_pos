import type { FastifyInstance } from "fastify";
import {
  getBackordersBySupplier,
  getBackordersForSupplier,
  getBackorderSummary,
  getPendingBackorderCount,
  listBackorders,
} from "./backorder-read-service";

export async function registerBackorderReadRoutes(app: FastifyInstance) {
  // GET /summary - counts for dashboard cards
  app.get("/summary", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const summary = await getBackorderSummary(orgId);
    return reply.send(summary);
  });

  // GET /count - pending count for sidebar badge
  app.get("/count", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const count = await getPendingBackorderCount(orgId);
    return reply.send({ count });
  });

  // GET /by-supplier - group pending by supplier
  app.get("/by-supplier", async (request, reply) => {
    const { orgId } = request.storeContext!;
    return reply.send(await getBackordersBySupplier(orgId));
  });

  // GET /for-supplier/:supplierId - pending for a supplier
  app.get("/for-supplier/:supplierId", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { supplierId } = request.params as { supplierId: string };
    const items = await getBackordersForSupplier(orgId, supplierId);
    return reply.send({ data: items });
  });
}

export async function registerBackorderListRoute(app: FastifyInstance) {
  // GET / - list backorders (register LAST)
  app.get("/", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const q = request.query as Record<string, string>;
    const result = await listBackorders({
      orgId,
      status: q.status,
      supplierId: q.supplierId,
      priority: q.priority,
      search: q.search,
      cursor: q.cursor,
      limit: q.limit ? parseInt(q.limit, 10) : undefined,
    });
    const summary = await getBackorderSummary(orgId);
    return reply.send({ ...result, summary });
  });
}
