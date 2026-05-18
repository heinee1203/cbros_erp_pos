export type StockMonitorQueryParams = Record<string, string | undefined>;

export function isStockMonitorManager(role: string | undefined) {
  return role === "ADMIN" || role === "MANAGER";
}

export function buildStockMonitorQuery(
  orgId: string,
  q: StockMonitorQueryParams,
  includePagination: boolean,
) {
  return {
    orgId,
    search: q.search,
    productId: q.productId,
    status: q.status,
    brandId: q.brandId,
    categoryId: q.categoryId,
    subcategoryId: q.subcategoryId,
    familyId: q.familyId,
    hideNegativeStock: q.hideNegativeStock === "true",
    hideDiscontinued: q.hideDiscontinued === "true",
    hideSpecialOrder: q.hideSpecialOrder === "true",
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
    ...(includePagination
      ? {
          cursor: q.cursor,
          limit: q.limit ? parseInt(q.limit, 10) : undefined,
        }
      : {}),
    includeUntracked: q.includeUntracked === "true",
  };
}

export function buildSupplierMetricsQuery(orgId: string, q: StockMonitorQueryParams) {
  return {
    orgId,
    search: q.search,
    sortBy: q.sortBy,
    sortDir: q.sortDir,
    cursor: q.cursor,
    limit: q.limit ? parseInt(q.limit, 10) : undefined,
  };
}

export function buildReorderSuggestionQuery(q: StockMonitorQueryParams) {
  return {
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
  };
}

export function buildStockMonitorCsv(rows: Array<Record<string, any>>) {
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
      r.lastPoDate ? new Date(r.lastPoDate).toISOString().slice(0, 10) : "",
      r.lastPoSupplierName || "",
      r.lastLeadTimeDays ?? "",
    ].join(","),
  );

  return headers + "\n" + csvRows.join("\n");
}
