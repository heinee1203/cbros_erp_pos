import type { FastifyInstance } from "fastify";
import { removeEmptyCategories } from "./category-route-service";

export async function registerCategoryMaintenanceRoutes(app: FastifyInstance) {
  /**
   * POST /categories/remove-empty
   * Remove all empty categories and subcategories (0 items assigned). ADMIN only.
   */
  app.post("/remove-empty", async (request, reply) => {
    const { orgId } = request.storeContext!;
    if (request.user.role !== "ADMIN") {
      return reply.status(403).send({ error: "Admin only" });
    }
    const result = await removeEmptyCategories(orgId);
    return reply.send(result);
  });
}
