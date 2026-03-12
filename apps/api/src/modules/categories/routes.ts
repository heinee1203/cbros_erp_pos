import type { FastifyPluginAsync } from "fastify";
import { createCategorySchema, updateCategorySchema } from "@apex/types";
import {
  listCategories,
  getCategoryById,
  createCategory,
  updateCategory,
  deleteCategory,
} from "./service";

const MANAGE_ROLES = ["ADMIN", "MANAGER"];

export const categoryRoutes: FastifyPluginAsync = async (app) => {
  /**
   * GET /categories
   * List all categories (with product counts)
   */
  app.get("/", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const q = request.query as Record<string, string | undefined>;

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
  app.get("/:categoryId", async (request, reply) => {
    const { categoryId } = request.params as { categoryId: string };
    const { orgId } = request.storeContext!;

    const result = await getCategoryById(categoryId, orgId);
    if (!result) {
      return reply.status(404).send({ error: "Category not found" });
    }

    return reply.send(result);
  });

  /**
   * POST /categories
   * Create a new category (ADMIN/MANAGER only)
   */
  app.post("/", async (request, reply) => {
    const userRole = (request.user as any)?.role;
    if (!MANAGE_ROLES.includes(userRole)) {
      return reply.status(403).send({
        error: "Only ADMIN or MANAGER can manage categories",
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
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  /**
   * PATCH /categories/:categoryId
   * Update a category (ADMIN/MANAGER only)
   */
  app.patch("/:categoryId", async (request, reply) => {
    const userRole = (request.user as any)?.role;
    if (!MANAGE_ROLES.includes(userRole)) {
      return reply.status(403).send({
        error: "Only ADMIN or MANAGER can manage categories",
      });
    }

    const { categoryId } = request.params as { categoryId: string };
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
    } catch (err: any) {
      const status = err.message.includes("not found") ? 404 : 400;
      return reply.status(status).send({ error: err.message });
    }
  });

  /**
   * DELETE /categories/:categoryId
   * Delete a category (ADMIN/MANAGER only, only if no products assigned)
   */
  app.delete("/:categoryId", async (request, reply) => {
    const userRole = (request.user as any)?.role;
    if (!MANAGE_ROLES.includes(userRole)) {
      return reply.status(403).send({
        error: "Only ADMIN or MANAGER can manage categories",
      });
    }

    const { categoryId } = request.params as { categoryId: string };
    const { orgId } = request.storeContext!;

    try {
      await deleteCategory(categoryId, orgId);
      return reply.status(204).send();
    } catch (err: any) {
      const status = err.message.includes("not found") ? 404 : 400;
      return reply.status(status).send({ error: err.message });
    }
  });
};
