import type { FastifyPluginAsync } from "fastify";
import { refreshStockMetrics, refreshSupplierMetrics } from "./service";

export const stockMonitorRoutes: FastifyPluginAsync = async (app) => {
  /**
   * POST /inventory/stock-monitor/refresh
   *
   * Recompute stock_metrics and supplier_metrics for the current org.
   * Requires ADMIN or MANAGER role.
   */
  app.post("/refresh", async (request, reply) => {
    const role = (request.user as any)?.role;
    if (role !== "ADMIN" && role !== "MANAGER") {
      return reply.status(403).send({ error: "Admin or Manager role required" });
    }

    const { orgId } = request.storeContext!;

    const productCount = await refreshStockMetrics(orgId);
    const supplierCount = await refreshSupplierMetrics(orgId);

    return reply.send({
      success: true,
      computedAt: new Date().toISOString(),
      productCount,
      supplierCount,
    });
  });
};
