import type { FastifyInstance } from "fastify";
import { createSubcategorySchema, updateSubcategorySchema } from "@apex/types";
import {
  canManageSubcategories,
  sendSubcategoryManageRequired,
  type SubcategoryIdParams,
} from "./subcategory-route-helpers";
import { createSubcategory, deleteSubcategory, updateSubcategory } from "./subcategory-route-service";

export async function registerSubcategoryMutationRoutes(app: FastifyInstance) {
  app.post("/", async (request, reply) => {
    const userRole = (request.user as any)?.role;
    if (!canManageSubcategories(userRole)) {
      return sendSubcategoryManageRequired(reply, "create");
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

  app.patch<{ Params: SubcategoryIdParams }>("/:id", async (request, reply) => {
    const userRole = (request.user as any)?.role;
    if (!canManageSubcategories(userRole)) {
      return sendSubcategoryManageRequired(reply, "update");
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

  app.delete<{ Params: SubcategoryIdParams }>("/:id", async (request, reply) => {
    const userRole = (request.user as any)?.role;
    if (!canManageSubcategories(userRole)) {
      return sendSubcategoryManageRequired(reply, "delete");
    }

    const { orgId } = request.storeContext!;
    try {
      await deleteSubcategory(request.params.id, orgId);
      return reply.send({ success: true });
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });
}
