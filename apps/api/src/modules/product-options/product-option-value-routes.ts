import type { FastifyInstance } from "fastify";
import {
  addOptionValue,
  deleteOptionValue,
  updateOptionValue,
} from "./product-option-route-service";
import {
  canManageProductOptions,
  getProductOptionErrorMessage,
  getProductOptionUserRole,
  hasProductOptionValue,
  PRODUCT_OPTION_PERMISSION_ERROR,
  type ProductOptionValueBody,
} from "./product-option-route-helpers";

export async function registerProductOptionValueRoutes(app: FastifyInstance) {
  // POST /product-options/:productId/types/:typeId/values - add value
  app.post<{ Params: { productId: string; typeId: string } }>(
    "/:productId/types/:typeId/values",
    async (request, reply) => {
      const userRole = getProductOptionUserRole(request.user);
      if (!canManageProductOptions(userRole)) {
        return reply.status(403).send({ error: PRODUCT_OPTION_PERMISSION_ERROR });
      }

      const body = request.body as ProductOptionValueBody;
      if (!hasProductOptionValue(body)) {
        return reply.status(400).send({ error: "value is required" });
      }

      const { orgId } = request.storeContext!;
      try {
        const val = await addOptionValue(
          request.params.typeId,
          orgId,
          body.value,
        );
        return reply.status(201).send(val);
      } catch (err: unknown) {
        return reply
          .status(400)
          .send({ error: getProductOptionErrorMessage(err) });
      }
    },
  );

  // PATCH /product-options/:productId/types/:typeId/values/:valueId - rename value
  app.patch<{
    Params: { productId: string; typeId: string; valueId: string };
  }>(
    "/:productId/types/:typeId/values/:valueId",
    async (request, reply) => {
      const userRole = getProductOptionUserRole(request.user);
      if (!canManageProductOptions(userRole)) {
        return reply.status(403).send({ error: PRODUCT_OPTION_PERMISSION_ERROR });
      }

      const body = request.body as ProductOptionValueBody;
      if (!body.value) {
        return reply.status(400).send({ error: "value is required" });
      }

      const { orgId } = request.storeContext!;
      try {
        await updateOptionValue(request.params.valueId, orgId, body.value);
        return reply.send({ success: true });
      } catch (err: unknown) {
        return reply
          .status(400)
          .send({ error: getProductOptionErrorMessage(err) });
      }
    },
  );

  // DELETE /product-options/:productId/types/:typeId/values/:valueId
  app.delete<{
    Params: { productId: string; typeId: string; valueId: string };
  }>(
    "/:productId/types/:typeId/values/:valueId",
    async (request, reply) => {
      const userRole = getProductOptionUserRole(request.user);
      if (!canManageProductOptions(userRole)) {
        return reply.status(403).send({ error: PRODUCT_OPTION_PERMISSION_ERROR });
      }

      const { orgId } = request.storeContext!;
      try {
        await deleteOptionValue(request.params.valueId, orgId);
        return reply.send({ success: true });
      } catch (err: unknown) {
        return reply
          .status(400)
          .send({ error: getProductOptionErrorMessage(err) });
      }
    },
  );
}
