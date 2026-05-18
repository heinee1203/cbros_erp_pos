import type { FastifyInstance } from "fastify";
import { getVehicleProducts } from "./vehicle-route-service";

export async function registerVehicleProductRoutes(app: FastifyInstance) {
  app.get("/:id/products", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;
    const products = await getVehicleProducts(id, orgId);
    return reply.send({ data: products });
  });
}
