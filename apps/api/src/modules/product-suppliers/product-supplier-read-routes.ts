import type { FastifyInstance } from "fastify";
import { listProductSuppliers } from "./product-supplier-route-service";

export async function registerProductSupplierReadRoutes(app: FastifyInstance) {
  app.get("/:productId/suppliers", async (request, reply) => {
    const { productId } = request.params as { productId: string };
    const { orgId } = request.storeContext!;

    const data = await listProductSuppliers(orgId, productId);
    return reply.send({ data });
  });
}
