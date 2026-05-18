import type { FastifyPluginAsync } from "fastify";
import {
  registerBackorderListRoute,
  registerBackorderReadRoutes,
} from "./backorder-read-routes";
import { registerBackorderWorkflowRoutes } from "./backorder-workflow-routes";

export const backorderRoutes: FastifyPluginAsync = async (app) => {
  await registerBackorderReadRoutes(app);
  await registerBackorderWorkflowRoutes(app);
  await registerBackorderListRoute(app);
};
