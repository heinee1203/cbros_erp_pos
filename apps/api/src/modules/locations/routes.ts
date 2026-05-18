import type { FastifyPluginAsync } from "fastify";
import { registerLocationMutationRoutes } from "./location-mutation-routes";
import { registerLocationReadRoutes } from "./location-read-routes";

export const locationRoutes: FastifyPluginAsync = async (app) => {
  await registerLocationReadRoutes(app);
  await registerLocationMutationRoutes(app);
};
