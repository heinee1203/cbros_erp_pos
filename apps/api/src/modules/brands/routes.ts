import type { FastifyPluginAsync } from "fastify";
import { createBrandSchema, updateBrandSchema } from "@apex/types";
import {
  listBrands,
  createBrand,
  updateBrand,
  deleteBrand,
} from "./service";

const MANAGE_ROLES = ["ADMIN", "MANAGER"];

export const brandRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const q = request.query as Record<string, string | undefined>;

    const result = await listBrands({
      orgId,
      search: q.search,
    });

    return reply.send({ data: result });
  });

  app.post("/", async (request, reply) => {
    const userRole = (request.user as any)?.role;
    if (!MANAGE_ROLES.includes(userRole)) {
      return reply.status(403).send({
        error: "Only ADMIN or MANAGER can manage brands",
      });
    }

    const parsed = createBrandSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "Invalid input",
        details: parsed.error.flatten(),
      });
    }

    const { orgId } = request.storeContext!;

    try {
      const result = await createBrand(parsed.data, orgId);
      return reply.status(201).send(result);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  app.patch("/:id", async (request, reply) => {
    const userRole = (request.user as any)?.role;
    if (!MANAGE_ROLES.includes(userRole)) {
      return reply.status(403).send({
        error: "Only ADMIN or MANAGER can manage brands",
      });
    }

    const { id } = request.params as { id: string };
    const parsed = updateBrandSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "Invalid input",
        details: parsed.error.flatten(),
      });
    }

    const { orgId } = request.storeContext!;

    try {
      const result = await updateBrand(id, parsed.data, orgId);
      return reply.send(result);
    } catch (err: any) {
      const status = err.message.includes("not found") ? 404 : 400;
      return reply.status(status).send({ error: err.message });
    }
  });

  app.delete("/:id", async (request, reply) => {
    const userRole = (request.user as any)?.role;
    if (!MANAGE_ROLES.includes(userRole)) {
      return reply.status(403).send({
        error: "Only ADMIN or MANAGER can manage brands",
      });
    }

    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;

    try {
      await deleteBrand(id, orgId);
      return reply.status(204).send();
    } catch (err: any) {
      const status = err.message.includes("not found") ? 404 : 400;
      return reply.status(status).send({ error: err.message });
    }
  });
};
