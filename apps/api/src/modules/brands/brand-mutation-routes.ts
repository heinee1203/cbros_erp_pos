import type { FastifyInstance } from "fastify";
import { createBrandSchema, updateBrandSchema } from "@apex/types";
import {
  createBrand,
  deleteBrand,
  updateBrand,
} from "./brand-route-service";
import {
  canManageBrands,
  getBrandErrorMessage,
  getBrandErrorStatus,
  getBrandUserRole,
  sendBrandManageRequired,
} from "./brand-route-helpers";

export async function registerBrandMutationRoutes(app: FastifyInstance) {
  app.post("/", async (request, reply) => {
    const userRole = getBrandUserRole(request.user);
    if (!canManageBrands(userRole)) {
      return sendBrandManageRequired(reply);
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
    } catch (err: unknown) {
      return reply.status(400).send({ error: getBrandErrorMessage(err) });
    }
  });

  app.patch("/:id", async (request, reply) => {
    const userRole = getBrandUserRole(request.user);
    if (!canManageBrands(userRole)) {
      return sendBrandManageRequired(reply);
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
    } catch (err: unknown) {
      return reply
        .status(getBrandErrorStatus(err))
        .send({ error: getBrandErrorMessage(err) });
    }
  });

  app.delete("/:id", async (request, reply) => {
    const userRole = getBrandUserRole(request.user);
    if (!canManageBrands(userRole)) {
      return sendBrandManageRequired(reply);
    }

    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;

    try {
      await deleteBrand(id, orgId);
      return reply.status(204).send();
    } catch (err: unknown) {
      return reply
        .status(getBrandErrorStatus(err))
        .send({ error: getBrandErrorMessage(err) });
    }
  });
}
