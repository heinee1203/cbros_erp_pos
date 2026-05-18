import type { FastifyPluginAsync } from "fastify";
import { registerVariantMutationRoutes } from "./variant-mutation-routes";
import { registerVariantReadRoutes } from "./variant-read-routes";

export const variantRoutes: FastifyPluginAsync = async (app) => {
  await registerVariantReadRoutes(app);
  await registerVariantMutationRoutes(app);
};
