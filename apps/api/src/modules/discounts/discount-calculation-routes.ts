import type { FastifyInstance } from "fastify";
import { calculateDiscounts } from "./discount-route-service";
import type { DiscountCalculationBody } from "./discount-route-helpers";

export async function registerDiscountCalculationRoutes(app: FastifyInstance) {
  app.post("/calculate", async (request, reply) => {
    const { orgId, locationId } = request.storeContext!;
    const body = request.body as DiscountCalculationBody;
    const result = await calculateDiscounts(orgId, body.items, body.customerId ?? null, locationId as string);
    return reply.send(result);
  });
}
