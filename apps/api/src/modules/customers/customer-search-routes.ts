import type { FastifyInstance } from "fastify";
import { searchCustomers } from "./customer-search-service";

export function registerCustomerSearchRoutes(app: FastifyInstance) {
  app.get("/search", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { q } = request.query as { q?: string };

    const results = await searchCustomers(orgId, q);

    return reply.send({ data: results });
  });
}
