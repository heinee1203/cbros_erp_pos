import type { FastifyPluginAsync } from "fastify";
import { registerReportingEmployeeRoutes } from "./reporting-employee-routes";
import { registerReportingInventoryValuationRoutes } from "./reporting-inventory-valuation-routes";
import { registerReportingJobMarginRoutes } from "./reporting-job-margin-routes";
import { registerReportingSalesBreakdownRoutes } from "./reporting-sales-breakdown-routes";
import { registerReportingSalesDashboardRoutes } from "./reporting-sales-dashboard-routes";
import { registerReportingServiceKpiRoutes } from "./reporting-service-kpi-routes";

export const reportingRoutes: FastifyPluginAsync = async (app) => {
  await registerReportingJobMarginRoutes(app);
  await registerReportingServiceKpiRoutes(app);
  await registerReportingSalesBreakdownRoutes(app);
  await registerReportingSalesDashboardRoutes(app);
  await registerReportingInventoryValuationRoutes(app);
  await registerReportingEmployeeRoutes(app);
};
