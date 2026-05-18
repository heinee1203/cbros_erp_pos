import assert from "node:assert/strict";
import test from "node:test";

import {
  buildStockMonitorSummary,
  mapStockMonitorMetricRow,
} from "./stock-monitor-helpers";

test("buildStockMonitorSummary preserves status, velocity, total, and timestamp behavior", () => {
  assert.deepEqual(
    buildStockMonitorSummary({
      statusRows: [
        { status: "CRITICAL", count: 2 },
        { status: "LOW", count: 3 },
        { status: "HEALTHY", count: 5 },
        { status: "OVERSTOCK", count: 7 },
        { status: "DEAD_STOCK", count: 11 },
      ],
      velocityRows: [
        { velocity_class: "FAST_MOVER", count: 13 },
        { velocity_class: "STRATEGIC_STOCK", count: 17 },
        { velocity_class: "WATCH_LIST", count: 19 },
        { velocity_class: "DEAD_STOCK", count: 23 },
        { velocity_class: "NEW_ITEM", count: 29 },
      ],
      outOfStockCount: 31,
      deadStockValue: "123.45",
      untrackedCount: 37,
      computedAt: new Date("2026-05-15T01:02:03.000Z"),
    }),
    {
      critical: 2,
      low: 3,
      healthy: 5,
      overstock: 7,
      deadStock: 11,
      outOfStock: 31,
      total: 28,
      fastMovers: 13,
      strategicStock: 17,
      watchList: 19,
      deadStockVelocity: 23,
      newItems: 29,
      deadStockValue: 123.45,
      untrackedCount: 37,
      totalActiveProducts: 138,
      computedAt: "2026-05-15T01:02:03.000Z",
    },
  );
});

test("mapStockMonitorMetricRow preserves parent inheritance and ISO date formatting", () => {
  const parentInfoMap = new Map([
    ["parent-1", {
      name: "Premium Brake Pad",
      brandName: "Acme",
      categoryName: "Brakes",
      subcategoryName: "Pads",
      familyName: "Parts",
    }],
  ]);

  const row = mapStockMonitorMetricRow({
    id: "metric-1",
    productId: "variant-1",
    productName: "Left",
    productSku: "BRK-L",
    parentProductId: "parent-1",
    brandName: null,
    categoryName: null,
    subcategoryName: null,
    familyName: null,
    totalStock: 4,
    specialOrder: null,
    discontinued: null,
    avgDailySales30d: "1.1",
    avgDailySales60d: "1.2",
    avgDailySales90d: "1.3",
    avgDailySales180d: "1.4",
    avgDailySales365d: "1.5",
    avgDailySalesAll: "1.6",
    trend: "UP",
    trendRecent: "2",
    trendPrior: "1",
    daysOfStock: "8.5",
    stockoutDays90d: 2,
    lastPoDate: new Date("2026-05-01T00:00:00.000Z"),
    lastPoSupplierName: "Supplier A",
    lastLeadTimeDays: 7,
    lastSaleDate: new Date("2026-05-10T00:00:00.000Z"),
    saleDaysCount: 9,
    totalQtySold: 12,
    daysSinceLastSale: 5,
    velocityClass: "FAST_MOVER",
    sold12m: 120,
    sold6m: 60,
    sold3m: 30,
    sold1m: 10,
    avgMonth12m: "10",
    avgMonth6m: "10",
    avgMonth3m: "10",
    avgMonth1m: "10",
    monthsLeft12m: "1.2",
    monthsLeft6m: "1.3",
    monthsLeft3m: "1.4",
    monthsLeft1m: "1.5",
    velocityTrend: "RISING",
    avgSellingPrice: "99.99",
    stockAgeMonths: 3,
    suggestedSellPrice: "88.88",
    appliedMarkupPct: "20",
    inflationAdjustedCost: "70.00",
    costPrice: "60.00",
    sellingUnit: "piece",
    purchaseUnit: "case",
    conversionFactor: "4",
    status: "HEALTHY",
    computedAt: new Date("2026-05-15T00:00:00.000Z"),
  }, parentInfoMap);

  assert.equal(row.productName, "Premium Brake Pad (Left)");
  assert.equal(row.brandName, "Acme");
  assert.equal(row.categoryName, "Brakes");
  assert.equal(row.subcategoryName, "Pads");
  assert.equal(row.familyName, "Parts");
  assert.equal(row.specialOrder, false);
  assert.equal(row.discontinued, false);
  assert.equal(row.lastPoDate, "2026-05-01T00:00:00.000Z");
  assert.equal(row.lastSaleDate, "2026-05-10T00:00:00.000Z");
  assert.equal(row.computedAt, "2026-05-15T00:00:00.000Z");
});
