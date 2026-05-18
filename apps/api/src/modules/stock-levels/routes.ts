import type { FastifyPluginAsync } from "fastify";
import { registerStockLevelMutationRoutes } from "./stock-level-mutation-routes";
import { registerStockLevelReadRoutes } from "./stock-level-read-routes";

export const stockLevelsRoutes: FastifyPluginAsync = async (app) => {
  await registerStockLevelReadRoutes(app);
  await registerStockLevelMutationRoutes(app);
};
