import type { FastifyInstance } from "fastify";
import { createCategorySchema, updateCategorySchema } from "@apex/types";
import {
  createCategory,
  deleteCategory,
  updateCategory,
} from "./category-route-service";
import {
  canManageCategories,
  CATEGORY_PERMISSION_ERROR,
  getCategoryMutationErrorStatus,
  getCategoryRouteErrorMessage,
  getCategoryUserRole,
} from "./category-route-helpers";

export async function registerCategoryMutationRoutes(app: FastifyInstance) {
  /**
   * POST /categories
   * Create a new category (ADMIN/MANAGER only)
   */
  app.post("/", async (request, reply) => {
    const userRole = getCategoryUserRole(request.user);
    if (!canManageCategories(userRole)) {
      return reply.status(403).send({
        error: CATEGORY_PERMISSION_ERROR,
      });
    }

    const parsed = createCategorySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "Invalid input",
        details: parsed.error.flatten(),
      });
    }

    const { orgId } = request.storeContext!;

    try {
      const result = await createCategory(parsed.data, orgId);
      return reply.status(201).send(result);
    } catch (err: unknown) {
      return reply.status(400).send({ error: getCategoryRouteErrorMessage(err) });
    }
  });

  /**
   * PATCH /categories/:categoryId
   * Update a category (ADMIN/MANAGER only)
   */
  app.patch<{ Params: { categoryId: string } }>(
    "/:categoryId",
    async (request, reply) => {
      const userRole = getCategoryUserRole(request.user);
      if (!canManageCategories(userRole)) {
        return reply.status(403).send({
          error: CATEGORY_PERMISSION_ERROR,
        });
      }

      const { categoryId } = request.params;
      const parsed = updateCategorySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: "Invalid input",
          details: parsed.error.flatten(),
        });
      }

      const { orgId } = request.storeContext!;

      try {
        const result = await updateCategory(categoryId, parsed.data, orgId);
        return reply.send(result);
      } catch (err: unknown) {
        const message = getCategoryRouteErrorMessage(err);
        const status = getCategoryMutationErrorStatus(message);
        return reply.status(status).send({ error: message });
      }
    },
  );

  /**
   * DELETE /categories/:categoryId
   * Delete a category (ADMIN/MANAGER only, only if no products assigned)
   */
  app.delete<{ Params: { categoryId: string } }>(
    "/:categoryId",
    async (request, reply) => {
      const userRole = getCategoryUserRole(request.user);
      if (!canManageCategories(userRole)) {
        return reply.status(403).send({
          error: CATEGORY_PERMISSION_ERROR,
        });
      }

      const { categoryId } = request.params;
      const { orgId } = request.storeContext!;

      try {
        await deleteCategory(categoryId, orgId);
        return reply.status(204).send();
      } catch (err: unknown) {
        const message = getCategoryRouteErrorMessage(err);
        const status = getCategoryMutationErrorStatus(message);
        return reply.status(status).send({ error: message });
      }
    },
  );
}
