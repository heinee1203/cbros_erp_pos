import type { FastifyPluginAsync } from "fastify";
import { registerReturnReadRoutes } from "./return-read-routes";
import { registerReturnWorkflowRoutes } from "./return-workflow-routes";

export const returnsRoutes: FastifyPluginAsync = async (app) => {
  await registerReturnReadRoutes(app);
  await registerReturnWorkflowRoutes(app);
};
