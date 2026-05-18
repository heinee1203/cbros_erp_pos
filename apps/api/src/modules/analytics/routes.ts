/**
 * Analytics routes - strictly admin-only. Powers the Daily Sales Dashboard
 * and monthly sales views.
 */
import type { FastifyPluginAsync } from "fastify";
import {
  registerAnalyticsDailySalesRowsRoute,
  registerAnalyticsDailySalesRoutes,
} from "./analytics-daily-sales-routes";
import { registerAnalyticsDailySalesWriteRoutes } from "./analytics-daily-sales-write-routes";
import { registerAnalyticsMonthlySalesRoutes } from "./analytics-monthly-sales-routes";

export const analyticsRoutes: FastifyPluginAsync = async (app) => {
  await registerAnalyticsDailySalesRoutes(app);
  await registerAnalyticsDailySalesWriteRoutes(app);
  await registerAnalyticsDailySalesRowsRoute(app);
  await registerAnalyticsMonthlySalesRoutes(app);
};
