import type { FastifyPluginAsync } from "fastify";
import {
  previewBulkPriceUpdate,
  applyBulkPriceUpdate,
  getMarginAlerts,
  getPriceHistory,
  getProductPriceHistory,
  updateSingleProductPrice,
} from "./service";

export const pricingRoutes: FastifyPluginAsync = async (app) => {
  /**
   * GET /inventory/pricing/history
   *
   * Paginated price change audit trail with filters.
   * Query params: productId, dateFrom, dateTo, field, batchId, cursor, limit
   */
  app.get("/history", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const q = request.query as Record<string, string>;

    const result = await getPriceHistory(orgId, {
      productId: q.productId,
      dateFrom: q.dateFrom,
      dateTo: q.dateTo,
      field: q.field as "SELL_PRICE" | "COST_PRICE" | undefined,
      batchId: q.batchId,
      cursor: q.cursor,
      limit: q.limit ? parseInt(q.limit, 10) : undefined,
    });

    return reply.send(result);
  });

  /**
   * GET /inventory/pricing/history/:productId
   *
   * Price history for a single product.
   */
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

  /**
   * GET /inventory/pricing/margin-alerts
   *
   * Products below a margin threshold.
   * Query params: threshold (default 15), cursor, limit
   */
  app.get("/margin-alerts", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const q = request.query as Record<string, string>;

    const threshold = q.threshold ? parseFloat(q.threshold) : 15;
    const result = await getMarginAlerts(
      orgId,
      threshold,
      q.cursor,
      q.limit ? parseInt(q.limit, 10) : undefined,
    );

    return reply.send(result);
  });

  /**
   * POST /inventory/pricing/bulk-preview
   *
   * Preview bulk price update impact.
   * Body: { rows: Array<{ sku: string; newCost?: string; newSell?: string }> }
   */
  app.post("/bulk-preview", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const body = request.body as {
      rows: Array<{ sku: string; newCost?: string; newSell?: string }>;
    };

    if (!body.rows || !Array.isArray(body.rows) || body.rows.length === 0) {
      return reply.status(400).send({ error: "rows array is required and must not be empty" });
    }

    const result = await previewBulkPriceUpdate(orgId, body.rows);
    return reply.send(result);
  });

  /**
   * POST /inventory/pricing/bulk-apply
   *
   * Apply a previously previewed bulk price update.
   * Requires ADMIN or MANAGER role.
   * Body: { previewToken, overrides?, autoAdjustSell?, reason? }
   */
  app.post("/bulk-apply", async (request, reply) => {
    const role = (request.user as any)?.role;
    if (role !== "ADMIN" && role !== "MANAGER") {
      return reply.status(403).send({ error: "Admin or Manager role required" });
    }

    const { orgId } = request.storeContext!;
    const userId = (request.user as any)?.id;
    const body = request.body as {
      previewToken: string;
      overrides?: Record<string, { newCost?: string; newSell?: string }>;
      autoAdjustSell?: boolean;
      reason?: string;
    };

    if (!body.previewToken) {
      return reply.status(400).send({ error: "previewToken is required" });
    }

    try {
      const result = await applyBulkPriceUpdate(
        orgId,
        userId,
        body.previewToken,
        body.overrides,
        body.autoAdjustSell,
        body.reason,
      );
      return reply.send(result);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  /**
   * PATCH /inventory/pricing/:productId
   *
   * Update a single product's price with audit trail.
   * Requires ADMIN or MANAGER role.
   * Body: { newCost?, newSell?, reason? }
   */
  app.patch("/:productId", async (request, reply) => {
    const role = (request.user as any)?.role;
    if (role !== "ADMIN" && role !== "MANAGER") {
      return reply.status(403).send({ error: "Admin or Manager role required" });
    }

    const { orgId } = request.storeContext!;
    const userId = (request.user as any)?.id;
    const { productId } = request.params as { productId: string };
    const body = request.body as {
      newCost?: string;
      newSell?: string;
      reason?: string;
    };

    if (!body.newCost && !body.newSell) {
      return reply.status(400).send({ error: "At least one of newCost or newSell is required" });
    }

    try {
      const result = await updateSingleProductPrice(orgId, userId, productId, body);
      return reply.send(result);
    } catch (err: any) {
      if (err.message === "Product not found") {
        return reply.status(404).send({ error: err.message });
      }
      throw err;
    }
  });
};
