import type { FastifyPluginAsync } from "fastify";
import { registerPromoMutationRoutes } from "./promo-mutation-routes";
import { registerPromoReadRoutes } from "./promo-read-routes";
import { registerPromoWorkflowRoutes } from "./promo-workflow-routes";

export const promoRoutes: FastifyPluginAsync = async (app) => {
  await registerPromoReadRoutes(app);
  await registerPromoMutationRoutes(app);
  await registerPromoWorkflowRoutes(app);
};
