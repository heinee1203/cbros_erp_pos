import type { FastifyPluginAsync } from "fastify";
import { registerShiftReadRoutes } from "./shift-read-routes";
import { registerShiftWorkflowRoutes } from "./shift-workflow-routes";

export const shiftRoutes: FastifyPluginAsync = async (app) => {
  await registerShiftReadRoutes(app);
  await registerShiftWorkflowRoutes(app);
};
