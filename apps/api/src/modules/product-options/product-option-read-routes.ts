import type { FastifyInstance } from "fastify";
import { listOptionTypes } from "./product-option-route-service";

export async function registerProductOptionReadRoutes(app: FastifyInstance) {
  // GET /product-options/:productId
  app.get<{ Params: { productId: string } }>(
    "/:productId",
    async (request, reply) => {
      const { orgId } = request.storeContext!;
      const types = await listOptionTypes(request.params.productId, orgId);
      return reply.send({ data: types });
    },
  );
}
