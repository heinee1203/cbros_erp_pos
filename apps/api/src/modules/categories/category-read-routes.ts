import type { FastifyInstance } from "fastify";
import {
  getCategoryById,
  listCategories,
} from "./category-route-service";
import type { CategoryListQuery } from "./category-route-helpers";

export async function registerCategoryReadRoutes(app: FastifyInstance) {
  /**
   * GET /categories
   * List all categories (with product counts)
   */
  app.get("/", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const q = request.query as CategoryListQuery;

    const result = await listCategories({
      orgId,
      search: q.search,
      activeOnly: q.activeOnly === "true",
    });

    return reply.send({ data: result });
  });

  /**
   * GET /categories/:categoryId
   * Get single category detail
   */
  app.get<{ Params: { categoryId: string } }>(
    "/:categoryId",
    async (request, reply) => {
      const { categoryId } = request.params;
      const { orgId } = request.storeContext!;

      const result = await getCategoryById(categoryId, orgId);
      if (!result) {
        return reply.status(404).send({ error: "Category not found" });
      }

      return reply.send(result);
    },
  );
}
