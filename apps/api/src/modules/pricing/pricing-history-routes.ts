import type { FastifyInstance } from "fastify";
import {
  getMarginAlerts,
  getPriceHistory,
  getProductPriceHistory,
} from "./pricing-route-service";

export async function registerPricingHistoryRoutes(app: FastifyInstance) {
  app.get("/history", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const q = request.query as Record<string, string>;

    const result = await getPriceHistory(orgId, {
      productId: q.productId,
      dateFrom: q.dateFrom,
      dateTo: q.dateTo,
      field: q.field as "SELL_PRICE" | "COST_PRICE" | undefined,
      source: q.source,
      search: q.search,
      batchId: q.batchId,
      cursor: q.cursor,
      limit: q.limit ? parseInt(q.limit, 10) : undefined,
    });

    return reply.send(result);
  });

  app.get("/history/:productId", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { productId } = request.params as { productId: string };
    const q = request.query as Record<string, string>;

    const result = await getProductPriceHistory(
      orgId,
      productId,
      q.cursor,
      q.limit ? parseInt(q.limit, 10) : undefined,
    );

    return reply.send(result);
  });

  app.get("/margin-alerts", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const q = request.query as Record<string, string>;

    const threshold = q.threshold ? parseFloat(q.threshold) : 15;
    const inStockOnly = q.inStockOnly !== "false";
    const result = await getMarginAlerts(
      orgId,
      threshold,
      inStockOnly,
      q.cursor,
      q.limit ? parseInt(q.limit, 10) : undefined,
    );

    return reply.send(result);
  });
}
