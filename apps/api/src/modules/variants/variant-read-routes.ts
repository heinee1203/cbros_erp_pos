import type { FastifyInstance } from "fastify";
import { listVariants } from "./variant-route-service";
import type { VariantProductParams } from "./variant-route-helpers";

export async function registerVariantReadRoutes(app: FastifyInstance) {
  app.get<{ Params: VariantProductParams }>("/:productId", async (request, reply) => {
    const { orgId, locationId } = request.storeContext!;
    const variants = await listVariants(request.params.productId, orgId, locationId || undefined);
    return reply.send({ data: variants });
  });
}
