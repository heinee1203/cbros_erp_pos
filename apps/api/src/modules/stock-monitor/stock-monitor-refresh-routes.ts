import type { FastifyInstance } from "fastify";
import {
  refreshStockMetrics,
  refreshSupplierMetrics,
} from "./stock-monitor-refresh-service";
import { isStockMonitorManager } from "./stock-monitor-route-helpers";

export async function registerStockMonitorRefreshRoutes(app: FastifyInstance) {
  app.post("/refresh", async (request, reply) => {
    const role = (request.user as any)?.role;
    if (!isStockMonitorManager(role)) {
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
}
