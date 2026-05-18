import type { FastifyPluginAsync } from "fastify";
import { registerHealthReadRoutes } from "./health-read-routes";

export const healthRoutes: FastifyPluginAsync = async (app) => {
  await registerHealthReadRoutes(app);
};
