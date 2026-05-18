import type { FastifyInstance } from "fastify";
import {
  evaluatePromos,
  recordPromoUsage,
  type CartLineInput,
} from "./promo-route-service";
import type { PromoApplyBody } from "./promo-route-helpers";

export async function registerPromoWorkflowRoutes(app: FastifyInstance) {
  app.post("/evaluate", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { cartLines } = request.body as { cartLines: CartLineInput[] };
    if (!cartLines || !Array.isArray(cartLines)) {
      return reply.status(400).send({ error: "cartLines array is required" });
    }
    const applicable = await evaluatePromos(orgId, cartLines);
    return reply.send({ applicablePromos: applicable });
  });

  app.post("/apply", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { userId } = request.user;
    const { promoRuleId, saleId, discountAmount, freeItems } = request.body as PromoApplyBody;
    await recordPromoUsage(orgId, promoRuleId, saleId, discountAmount, freeItems, userId);
    return reply.send({ success: true });
  });
}
