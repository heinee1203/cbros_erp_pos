import type { FastifyInstance } from "fastify";
import {
  searchCatalog,
  type CatalogSearchQuery,
} from "./catalog-route-service";

export async function registerCatalogSearchRoutes(app: FastifyInstance) {
  // GET /search
  app.get("/search", async (request, reply) => {
    const orgId = (request as any).catalogOrgId as string;
    const q = request.query as CatalogSearchQuery;

    const searchTerm = q.q || "";
    if (searchTerm.length < 2) {
      return reply.status(400).send({ error: "Search term must be at least 2 characters" });
    }

    return reply.send(await searchCatalog(orgId, q));
  });
}
