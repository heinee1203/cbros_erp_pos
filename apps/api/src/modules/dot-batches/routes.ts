import type { FastifyPluginAsync } from "fastify";
import { registerDotBatchEntryRoutes } from "./dot-batch-entry-routes";
import { registerDotBatchReadRoutes } from "./dot-batch-read-routes";

export const dotBatchRoutes: FastifyPluginAsync = async (app) => {
  await registerDotBatchReadRoutes(app);
  await registerDotBatchEntryRoutes(app);
};
