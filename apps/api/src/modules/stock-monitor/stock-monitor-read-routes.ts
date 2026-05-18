import type { FastifyInstance } from "fastify";
import {
  exportStockMonitorCSV,
  queryStockMonitor,
  querySupplierMetrics,
} from "./stock-monitor-query-service";
import {
  buildStockMonitorCsv,
  buildStockMonitorQuery,
  buildSupplierMetricsQuery,
} from "./stock-monitor-route-helpers";

export async function registerStockMonitorReadRoutes(app: FastifyInstance) {
  app.get("/", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const q = request.query as Record<string, string | undefined>;

    const result = await queryStockMonitor(
      buildStockMonitorQuery(orgId, q, true),
    );

    return reply.send(result);
  });

  app.get("/export", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const q = request.query as Record<string, string | undefined>;

    const rows = await exportStockMonitorCSV(
      buildStockMonitorQuery(orgId, q, false),
    );

    reply.header("Content-Type", "text/csv");
    reply.header(
      "Content-Disposition",
      'attachment; filename="stock-monitor.csv"',
    );
    return reply.send(buildStockMonitorCsv(rows));
  });

  app.get("/suppliers", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const q = request.query as Record<string, string | undefined>;

    const result = await querySupplierMetrics(buildSupplierMetricsQuery(orgId, q));

    return reply.send(result);
  });
}
