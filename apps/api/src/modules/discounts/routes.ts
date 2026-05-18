import type { FastifyPluginAsync } from "fastify";
import { registerDiscountCalculationRoutes } from "./discount-calculation-routes";
import { registerDiscountRuleRoutes } from "./discount-rule-routes";
import { registerDiscountTierRoutes } from "./discount-tier-routes";

const discountRoutes: FastifyPluginAsync = async (app) => {
  await registerDiscountTierRoutes(app);
  await registerDiscountRuleRoutes(app);
  await registerDiscountCalculationRoutes(app);
};

export default discountRoutes;
