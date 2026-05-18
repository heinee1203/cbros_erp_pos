import type { FastifyInstance } from "fastify";
import {
  getCatalogItem,
  getCatalogItemStock,
} from "./catalog-route-service";

export async function registerCatalogItemRoutes(app: FastifyInstance) {
  // GET /items/:id
  app.get("/items/:id", async (request, reply) => {
    const orgId = (request as any).catalogOrgId as string;
    const { id } = request.params as { id: string };

    const item = await getCatalogItem(orgId, id);
    if (!item) {
      return reply.status(404).send({ error: "Product not found" });
    }

    return reply.send(item);
  });

  // GET /items/:id/stock
  app.get("/items/:id/stock", async (request, reply) => {
    const orgId = (request as any).catalogOrgId as string;
    const { id } = request.params as { id: string };

    const stock = await getCatalogItemStock(orgId, id);
    if (!stock) {
      return reply.status(404).send({ error: "Product not found" });
    }

    return reply.send(stock);
  });
}
