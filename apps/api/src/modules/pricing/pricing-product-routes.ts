import type { FastifyInstance } from "fastify";
import { updateSingleProductPrice } from "./pricing-route-service";

export async function registerPricingProductRoutes(app: FastifyInstance) {
  app.patch("/:productId", async (request, reply) => {
    const role = (request.user as any)?.role;
    if (role !== "ADMIN" && role !== "MANAGER") {
      return reply.status(403).send({ error: "Admin or Manager role required" });
    }

    const { orgId } = request.storeContext!;
    const userId = (request.user as any)?.id;
    const { productId } = request.params as { productId: string };
    const body = request.body as {
      newCost?: string;
      newSell?: string;
      reason?: string;
    };

    if (!body.newCost && !body.newSell) {
      return reply.status(400).send({
        error: "At least one of newCost or newSell is required",
      });
    }

    try {
      const result = await updateSingleProductPrice(
        orgId,
        userId,
        productId,
        body,
      );
      return reply.send(result);
    } catch (err: any) {
      if (err.message === "Product not found") {
        return reply.status(404).send({ error: err.message });
      }
      throw err;
    }
  });
}
