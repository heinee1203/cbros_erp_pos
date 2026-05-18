import type { FastifyPluginAsync } from "fastify";
import { registerProductOptionReadRoutes } from "./product-option-read-routes";
import { registerProductOptionTypeRoutes } from "./product-option-type-routes";
import { registerProductOptionValueRoutes } from "./product-option-value-routes";

export const productOptionsRoutes: FastifyPluginAsync = async (app) => {
  await registerProductOptionReadRoutes(app);
  await registerProductOptionTypeRoutes(app);
  await registerProductOptionValueRoutes(app);
};
