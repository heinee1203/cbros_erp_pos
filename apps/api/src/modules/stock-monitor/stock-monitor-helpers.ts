export type StockMonitorParentInfo = {
  name: string;
  brandName: string | null;
  categoryName: string | null;
  subcategoryName: string | null;
  familyName: string | null;
};

export function buildStockMonitorSummary({
  statusRows,
  velocityRows,
  outOfStockCount,
  deadStockValue,
  untrackedCount,
  computedAt,
}: {
  statusRows: Array<{ status: string; count: number }>;
  velocityRows: Array<{ velocity_class: string; count: number }>;
  outOfStockCount: number;
  deadStockValue: string | number;
  untrackedCount: number;
  computedAt: Date | string | null | undefined;
}) {
  const summary = {
    critical: 0,
    low: 0,
    healthy: 0,
    overstock: 0,
    deadStock: 0,
    outOfStock: outOfStockCount,
    total: 0,
    fastMovers: 0,
    strategicStock: 0,
    watchList: 0,
    deadStockVelocity: 0,
    newItems: 0,
    deadStockValue: parseFloat(String(deadStockValue ?? "0")),
    untrackedCount,
    totalActiveProducts: 0,
    computedAt: normalizeIsoDate(computedAt),
  };

  for (const row of statusRows) {
    const count = row.count as number;
    summary.total += count;
    switch (row.status) {
      case "CRITICAL":
        summary.critical = count;
        break;
      case "LOW":
        summary.low = count;
        break;
      case "HEALTHY":
        summary.healthy = count;
        break;
      case "OVERSTOCK":
        summary.overstock = count;
        break;
      case "DEAD_STOCK":
        summary.deadStock = count;
        break;
    }
  }

  for (const row of velocityRows) {
    switch (row.velocity_class) {
      case "FAST_MOVER": summary.fastMovers = row.count; break;
      case "STRATEGIC_STOCK": summary.strategicStock = row.count; break;
      case "WATCH_LIST": summary.watchList = row.count; break;
      case "DEAD_STOCK": summary.deadStockVelocity = row.count; break;
      case "NEW_ITEM": summary.newItems = row.count; break;
    }
  }

  summary.totalActiveProducts =
    summary.fastMovers +
    summary.strategicStock +
    summary.watchList +
    summary.deadStockVelocity +
    summary.newItems +
    summary.untrackedCount;

  return summary;
}

export function mapStockMonitorMetricRow(
  row: Record<string, any>,
  parentInfoMap: Map<string, StockMonitorParentInfo>,
) {
  const parentInfo = row.parentProductId
    ? parentInfoMap.get(row.parentProductId)
    : null;
  const productName = parentInfo
    ? `${parentInfo.name} (${row.productName})`
    : row.productName;

  return {
    id: row.id,
    productId: row.productId,
    productName,
    productSku: row.productSku,
    brandName: row.brandName || parentInfo?.brandName || null,
    categoryName: row.categoryName || parentInfo?.categoryName || null,
    subcategoryName: row.subcategoryName || parentInfo?.subcategoryName || null,
    familyName: row.familyName || parentInfo?.familyName || null,
    totalStock: row.totalStock,
    specialOrder: row.specialOrder ?? false,
    discontinued: row.discontinued ?? false,
    avgDailySales30d: row.avgDailySales30d,
    avgDailySales60d: row.avgDailySales60d,
    avgDailySales90d: row.avgDailySales90d,
    avgDailySales180d: row.avgDailySales180d,
    avgDailySales365d: row.avgDailySales365d,
    avgDailySalesAll: row.avgDailySalesAll,
    trend: row.trend,
    trendRecent: row.trendRecent,
    trendPrior: row.trendPrior,
    daysOfStock: row.daysOfStock,
    stockoutDays90d: row.stockoutDays90d,
    lastPoDate: normalizeIsoDate(row.lastPoDate),
    lastPoSupplierName: row.lastPoSupplierName,
    lastLeadTimeDays: row.lastLeadTimeDays,
    lastSaleDate: normalizeIsoDate(row.lastSaleDate),
    saleDaysCount: row.saleDaysCount,
    totalQtySold: row.totalQtySold,
    daysSinceLastSale: row.daysSinceLastSale,
    velocityClass: row.velocityClass,
    sold12m: row.sold12m,
    sold6m: row.sold6m,
    sold3m: row.sold3m,
    sold1m: row.sold1m,
    avgMonth12m: row.avgMonth12m,
    avgMonth6m: row.avgMonth6m,
    avgMonth3m: row.avgMonth3m,
    avgMonth1m: row.avgMonth1m,
    monthsLeft12m: row.monthsLeft12m,
    monthsLeft6m: row.monthsLeft6m,
    monthsLeft3m: row.monthsLeft3m,
    monthsLeft1m: row.monthsLeft1m,
    velocityTrend: row.velocityTrend,
    avgSellingPrice: row.avgSellingPrice,
    stockAgeMonths: row.stockAgeMonths,
    suggestedSellPrice: row.suggestedSellPrice,
    appliedMarkupPct: row.appliedMarkupPct,
    inflationAdjustedCost: row.inflationAdjustedCost,
    costPrice: row.costPrice,
    sellingUnit: row.sellingUnit,
    purchaseUnit: row.purchaseUnit,
    conversionFactor: row.conversionFactor,
    status: row.status,
    computedAt: normalizeIsoDate(row.computedAt) ?? "",
  };
}

function normalizeIsoDate(value: Date | string | null | undefined) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : value;
}
