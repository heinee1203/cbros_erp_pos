import type { FastifyPluginAsync } from "fastify";
import { registerStockMonitorReadRoutes } from "./stock-monitor-read-routes";
import { registerStockMonitorRefreshRoutes } from "./stock-monitor-refresh-routes";
import { registerStockMonitorReorderRoutes } from "./stock-monitor-reorder-routes";

export const stockMonitorRoutes: FastifyPluginAsync = async (app) => {
  await registerStockMonitorReadRoutes(app);
  await registerStockMonitorRefreshRoutes(app);
  await registerStockMonitorReorderRoutes(app);
};
