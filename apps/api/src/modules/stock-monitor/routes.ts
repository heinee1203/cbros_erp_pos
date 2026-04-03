import type { FastifyPluginAsync } from "fastify";
import {
  refreshStockMetrics,
  refreshSupplierMetrics,
  queryStockMonitor,
  exportStockMonitorCSV,
  querySupplierMetrics,
  getReorderSuggestions,
} from "./service";

export const stockMonitorRoutes: FastifyPluginAsync = async (app) => {
  /**
   * GET /inventory/stock-monitor
   *
   * Paginated stock monitor list with filters, sorting, and summary.
   */
  app.get("/", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const q = request.query as Record<string, string>;

    const result = await queryStockMonitor({
      orgId,
      search: q.search,
      productId: q.productId,
      status: q.status,
      brandId: q.brandId,
      categoryId: q.categoryId,
      subcategoryId: q.subcategoryId,
      familyId: q.familyId,
      hideNegativeStock: q.hideNegativeStock === "true",
      urgency: q.urgency,
      urgencyWindow: q.urgencyWindow,
      velocityClass: q.velocityClass,
      urgencyAll: q.urgencyAll,
      urgency12m: q.urgency12M || q.urgency12m,
      urgency6m: q.urgency6M || q.urgency6m,
      urgency3m: q.urgency3M || q.urgency3m,
      urgency1m: q.urgency1M || q.urgency1m,
      lastSoldAfter: q.lastSoldAfter,
      lastSoldBefore: q.lastSoldBefore,
      sortBy: q.sortBy,
      sortDir: q.sortDir,
      cursor: q.cursor,
      limit: q.limit ? parseInt(q.limit, 10) : undefined,
    });

    return reply.send(result);
  });

  /**
   * GET /inventory/stock-monitor/export
   *
   * CSV download of all matching stock monitor rows (no pagination).
   */
  app.get("/export", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const q = request.query as Record<string, string>;

    const rows = await exportStockMonitorCSV({
      orgId,
      search: q.search,
      productId: q.productId,
      status: q.status,
      brandId: q.brandId,
      categoryId: q.categoryId,
      subcategoryId: q.subcategoryId,
      familyId: q.familyId,
      hideNegativeStock: q.hideNegativeStock === "true",
      urgency: q.urgency,
      urgencyWindow: q.urgencyWindow,
      velocityClass: q.velocityClass,
      urgencyAll: q.urgencyAll,
      urgency12m: q.urgency12M || q.urgency12m,
      urgency6m: q.urgency6M || q.urgency6m,
      urgency3m: q.urgency3M || q.urgency3m,
      urgency1m: q.urgency1M || q.urgency1m,
      lastSoldAfter: q.lastSoldAfter,
      lastSoldBefore: q.lastSoldBefore,
      sortBy: q.sortBy,
      sortDir: q.sortDir,
    });

    const headers =
      "Status,Item Name,SKU,Brand,Category,Total Stock,Avg Daily Sales (30d),Days of Stock,Stockout Days (90d),Last PO Date,Last PO Supplier,Lead Time (days)";
    const csvRows = rows.map((r) =>
      [
        r.status,
        `"${(r.productName || "").replace(/"/g, '""')}"`,
        r.productSku,
        r.brandName || "",
        r.categoryName || "",
        r.totalStock,
        r.avgDailySales30d,
        r.daysOfStock ?? "",
        r.stockoutDays90d,
        r.lastPoDate
          ? new Date(r.lastPoDate).toISOString().slice(0, 10)
          : "",
        r.lastPoSupplierName || "",
        r.lastLeadTimeDays ?? "",
      ].join(","),
    );

    reply.header("Content-Type", "text/csv");
    reply.header(
      "Content-Disposition",
      'attachment; filename="stock-monitor.csv"',
    );
    return reply.send(headers + "\n" + csvRows.join("\n"));
  });

  /**
   * GET /inventory/stock-monitor/suppliers
   *
   * Paginated supplier metrics list.
   */
  app.get("/suppliers", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const q = request.query as Record<string, string>;

    const result = await querySupplierMetrics({
      orgId,
      search: q.search,
      sortBy: q.sortBy,
      sortDir: q.sortDir,
      cursor: q.cursor,
      limit: q.limit ? parseInt(q.limit, 10) : undefined,
    });

    return reply.send(result);
  });

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

  // ── GET /reorder-suggestions ──
  app.get("/reorder-suggestions", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const q = request.query as Record<string, string | undefined>;
    const suggestions = await getReorderSuggestions(orgId, {
      reorderThreshold: q.threshold ? parseFloat(q.threshold) : undefined,
      targetMonths: q.targetMonths ? parseFloat(q.targetMonths) : undefined,
      categoryId: q.categoryId,
      brandId: q.brandId,
      urgency: q.urgency,
      urgencyWindow: q.urgencyWindow,
      velocityClass: q.velocityClass,
      urgencyAll: q.urgencyAll,
      urgency12m: q.urgency12M || q.urgency12m,
      urgency6m: q.urgency6M || q.urgency6m,
      urgency3m: q.urgency3M || q.urgency3m,
      urgency1m: q.urgency1M || q.urgency1m,
      lastSoldAfter: q.lastSoldAfter,
      lastSoldBefore: q.lastSoldBefore,
      limit: q.limit ? parseInt(q.limit, 10) : undefined,
    });
    return reply.send({ data: suggestions });
  });
};
