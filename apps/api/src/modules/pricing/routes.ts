import type { FastifyPluginAsync } from "fastify";
import { registerPricingBulkRoutes } from "./pricing-bulk-routes";
import { registerPricingHistoryRoutes } from "./pricing-history-routes";
import { registerPricingProductRoutes } from "./pricing-product-routes";

export const pricingRoutes: FastifyPluginAsync = async (app) => {
  await registerPricingHistoryRoutes(app);
  await registerPricingBulkRoutes(app);
  await registerPricingProductRoutes(app);
};
