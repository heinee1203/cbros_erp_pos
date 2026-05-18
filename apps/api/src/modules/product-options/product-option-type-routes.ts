import type { FastifyInstance } from "fastify";
import { createOptionTypeSchema, updateOptionTypeSchema } from "@apex/types";
import {
  createOptionType,
  deleteOptionType,
  updateOptionType,
} from "./product-option-route-service";
import {
  canManageProductOptions,
  getProductOptionErrorMessage,
  getProductOptionUserRole,
  PRODUCT_OPTION_PERMISSION_ERROR,
} from "./product-option-route-helpers";

export async function registerProductOptionTypeRoutes(app: FastifyInstance) {
  // POST /product-options/:productId - create option type with initial values
  app.post<{ Params: { productId: string } }>(
    "/:productId",
    async (request, reply) => {
      const userRole = getProductOptionUserRole(request.user);
      if (!canManageProductOptions(userRole)) {
        return reply.status(403).send({ error: PRODUCT_OPTION_PERMISSION_ERROR });
      }

      const parsed = createOptionTypeSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply
          .status(400)
          .send({ error: "Invalid input", details: parsed.error.flatten() });
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
      } catch (err: unknown) {
        return reply
          .status(400)
          .send({ error: getProductOptionErrorMessage(err) });
      }
    },
  );

  // PATCH /product-options/:productId/types/:typeId - rename type
  app.patch<{ Params: { productId: string; typeId: string } }>(
    "/:productId/types/:typeId",
    async (request, reply) => {
      const userRole = getProductOptionUserRole(request.user);
      if (!canManageProductOptions(userRole)) {
        return reply.status(403).send({ error: PRODUCT_OPTION_PERMISSION_ERROR });
      }

      const parsed = updateOptionTypeSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply
          .status(400)
          .send({ error: "Invalid input", details: parsed.error.flatten() });
      }

      const { orgId } = request.storeContext!;
      try {
        if (parsed.data.name) {
          await updateOptionType(request.params.typeId, orgId, parsed.data.name);
        }
        return reply.send({ success: true });
      } catch (err: unknown) {
        return reply
          .status(400)
          .send({ error: getProductOptionErrorMessage(err) });
      }
    },
  );

  // DELETE /product-options/:productId/types/:typeId
  app.delete<{ Params: { productId: string; typeId: string } }>(
    "/:productId/types/:typeId",
    async (request, reply) => {
      const userRole = getProductOptionUserRole(request.user);
      if (!canManageProductOptions(userRole)) {
        return reply.status(403).send({ error: PRODUCT_OPTION_PERMISSION_ERROR });
      }

      const { orgId } = request.storeContext!;
      try {
        await deleteOptionType(request.params.typeId, orgId);
        return reply.send({ success: true });
      } catch (err: unknown) {
        return reply
          .status(400)
          .send({ error: getProductOptionErrorMessage(err) });
      }
    },
  );
}
