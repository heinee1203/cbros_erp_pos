import type { FastifyPluginAsync } from "fastify";
import { registerBrandMutationRoutes } from "./brand-mutation-routes";
import { registerBrandReadRoutes } from "./brand-read-routes";

export const brandRoutes: FastifyPluginAsync = async (app) => {
  await registerBrandReadRoutes(app);
  await registerBrandMutationRoutes(app);
};
