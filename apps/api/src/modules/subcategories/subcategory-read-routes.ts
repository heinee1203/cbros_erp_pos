import type { FastifyInstance } from "fastify";
import { listSubcategories } from "./subcategory-route-service";
import type { SubcategoryListQuery } from "./subcategory-route-helpers";

export async function registerSubcategoryReadRoutes(app: FastifyInstance) {
  app.get("/", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const query = request.query as SubcategoryListQuery;
    const rows = await listSubcategories({ orgId, categoryId: query.categoryId });
    return reply.send({ data: rows });
  });
}
