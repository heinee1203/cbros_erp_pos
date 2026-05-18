import type { FastifyPluginAsync } from "fastify";
import { registerDashboardSummaryRoutes } from "./dashboard-summary-routes";

export const dashboardRoutes: FastifyPluginAsync = async (app) => {
  await registerDashboardSummaryRoutes(app);
};
