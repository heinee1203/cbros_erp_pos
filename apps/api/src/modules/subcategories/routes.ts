import type { FastifyPluginAsync } from "fastify";
import { createSubcategorySchema, updateSubcategorySchema } from "@apex/types";
import {
  listSubcategories,
  createSubcategory,
  updateSubcategory,
  deleteSubcategory,
} from "./service";

const MANAGE_ROLES = ["ADMIN", "MANAGER"];

export const subcategoryRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const q = request.query as Record<string, string | undefined>;
    const rows = await listSubcategories({ orgId, categoryId: q.categoryId });
    return reply.send({ data: rows });
  });

  app.post("/", async (request, reply) => {
    const userRole = (request.user as any)?.role;
    if (!MANAGE_ROLES.includes(userRole)) {
      return reply.status(403).send({ error: "Only ADMIN or MANAGER can create subcategories" });
    }

    const parsed = createSubcategorySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid input", details: parsed.error.flatten() });
    }

    const { orgId } = request.storeContext!;
    try {
      const row = await createSubcategory(parsed.data, orgId);
      return reply.status(201).send(row);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  app.patch<{ Params: { id: string } }>("/:id", async (request, reply) => {
    const userRole = (request.user as any)?.role;
    if (!MANAGE_ROLES.includes(userRole)) {
      return reply.status(403).send({ error: "Only ADMIN or MANAGER can update subcategories" });
    }

    const parsed = updateSubcategorySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid input", details: parsed.error.flatten() });
    }

    const { orgId } = request.storeContext!;
    try {
      const row = await updateSubcategory(request.params.id, parsed.data, orgId);
      return reply.send(row);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  app.delete<{ Params: { id: string } }>("/:id", async (request, reply) => {
    const userRole = (request.user as any)?.role;
    if (!MANAGE_ROLES.includes(userRole)) {
      return reply.status(403).send({ error: "Only ADMIN or MANAGER can delete subcategories" });
    }

    const { orgId } = request.storeContext!;
    try {
      await deleteSubcategory(request.params.id, orgId);
      return reply.send({ success: true });
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });
};
