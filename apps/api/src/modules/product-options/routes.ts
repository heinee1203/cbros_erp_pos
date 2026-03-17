import type { FastifyPluginAsync } from "fastify";
import { createOptionTypeSchema, updateOptionTypeSchema } from "@apex/types";
import {
  listOptionTypes,
  createOptionType,
  updateOptionType,
  deleteOptionType,
  addOptionValue,
  updateOptionValue,
  deleteOptionValue,
} from "./service";

const MANAGE_ROLES = ["ADMIN", "MANAGER"];

export const productOptionsRoutes: FastifyPluginAsync = async (app) => {
  // GET /product-options/:productId
  app.get<{ Params: { productId: string } }>("/:productId", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const types = await listOptionTypes(request.params.productId, orgId);
    return reply.send({ data: types });
  });

  // POST /product-options/:productId — create option type with initial values
  app.post<{ Params: { productId: string } }>("/:productId", async (request, reply) => {
    const userRole = (request.user as any)?.role;
    if (!MANAGE_ROLES.includes(userRole)) {
      return reply.status(403).send({ error: "Only ADMIN or MANAGER can manage options" });
    }

    const parsed = createOptionTypeSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid input", details: parsed.error.flatten() });
    }

    const { orgId } = request.storeContext!;
    try {
      const type = await createOptionType(
        request.params.productId,
        orgId,
        parsed.data.name,
        parsed.data.values,
      );
      return reply.status(201).send(type);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // PATCH /product-options/:productId/types/:typeId — rename type
  app.patch<{ Params: { productId: string; typeId: string } }>(
    "/:productId/types/:typeId",
    async (request, reply) => {
      const userRole = (request.user as any)?.role;
      if (!MANAGE_ROLES.includes(userRole)) {
        return reply.status(403).send({ error: "Only ADMIN or MANAGER can manage options" });
      }

      const parsed = updateOptionTypeSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "Invalid input", details: parsed.error.flatten() });
      }

      const { orgId } = request.storeContext!;
      try {
        if (parsed.data.name) {
          await updateOptionType(request.params.typeId, orgId, parsed.data.name);
        }
        return reply.send({ success: true });
      } catch (err: any) {
        return reply.status(400).send({ error: err.message });
      }
    },
  );

  // DELETE /product-options/:productId/types/:typeId
  app.delete<{ Params: { productId: string; typeId: string } }>(
    "/:productId/types/:typeId",
    async (request, reply) => {
      const userRole = (request.user as any)?.role;
      if (!MANAGE_ROLES.includes(userRole)) {
        return reply.status(403).send({ error: "Only ADMIN or MANAGER can manage options" });
      }

      const { orgId } = request.storeContext!;
      try {
        await deleteOptionType(request.params.typeId, orgId);
        return reply.send({ success: true });
      } catch (err: any) {
        return reply.status(400).send({ error: err.message });
      }
    },
  );

  // POST /product-options/:productId/types/:typeId/values — add value
  app.post<{ Params: { productId: string; typeId: string } }>(
    "/:productId/types/:typeId/values",
    async (request, reply) => {
      const userRole = (request.user as any)?.role;
      if (!MANAGE_ROLES.includes(userRole)) {
        return reply.status(403).send({ error: "Only ADMIN or MANAGER can manage options" });
      }

      const body = request.body as { value?: string };
      if (!body.value || body.value.length === 0) {
        return reply.status(400).send({ error: "value is required" });
      }

      const { orgId } = request.storeContext!;
      try {
        const val = await addOptionValue(request.params.typeId, orgId, body.value);
        return reply.status(201).send(val);
      } catch (err: any) {
        return reply.status(400).send({ error: err.message });
      }
    },
  );

  // PATCH /product-options/:productId/types/:typeId/values/:valueId — rename value
  app.patch<{ Params: { productId: string; typeId: string; valueId: string } }>(
    "/:productId/types/:typeId/values/:valueId",
    async (request, reply) => {
      const userRole = (request.user as any)?.role;
      if (!MANAGE_ROLES.includes(userRole)) {
        return reply.status(403).send({ error: "Only ADMIN or MANAGER can manage options" });
      }

      const body = request.body as { value?: string };
      if (!body.value) {
        return reply.status(400).send({ error: "value is required" });
      }

      const { orgId } = request.storeContext!;
      try {
        await updateOptionValue(request.params.valueId, orgId, body.value);
        return reply.send({ success: true });
      } catch (err: any) {
        return reply.status(400).send({ error: err.message });
      }
    },
  );

  // DELETE /product-options/:productId/types/:typeId/values/:valueId
  app.delete<{ Params: { productId: string; typeId: string; valueId: string } }>(
    "/:productId/types/:typeId/values/:valueId",
    async (request, reply) => {
      const userRole = (request.user as any)?.role;
      if (!MANAGE_ROLES.includes(userRole)) {
        return reply.status(403).send({ error: "Only ADMIN or MANAGER can manage options" });
      }

      const { orgId } = request.storeContext!;
      try {
        await deleteOptionValue(request.params.valueId, orgId);
        return reply.send({ success: true });
      } catch (err: any) {
        return reply.status(400).send({ error: err.message });
      }
    },
  );
};
