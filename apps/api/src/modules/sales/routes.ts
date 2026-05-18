import type { FastifyPluginAsync } from "fastify";
import { registerSalesReadRoutes } from "./sales-read-routes";
import { registerSalesWorkflowRoutes } from "./sales-workflow-routes";

export const salesRoutes: FastifyPluginAsync = async (app) => {
  await registerSalesWorkflowRoutes(app);
  await registerSalesReadRoutes(app);
};
