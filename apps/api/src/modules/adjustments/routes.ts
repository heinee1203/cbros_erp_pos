import type { FastifyPluginAsync } from "fastify";
import { registerAdjustmentReadRoutes } from "./adjustment-read-routes";
import { registerAdjustmentWriteRoutes } from "./adjustment-write-routes";

export const adjustmentRoutes: FastifyPluginAsync = async (app) => {
  await registerAdjustmentReadRoutes(app);
  await registerAdjustmentWriteRoutes(app);
};
