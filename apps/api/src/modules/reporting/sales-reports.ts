import { db } from "@apex/database";
import {
  sales,
  saleLines,
  products,
  users,
} from "@apex/database/schema";
import { eq, and, sql, type SQL } from "drizzle-orm";

interface DateRangeOpts {
  locationId?: string;
  from?: string;
  to?: string;
}

interface DashboardOpts extends DateRangeOpts {
  employeeId?: string;
}

function buildCompletedSaleConditions(orgId: string, opts: DateRangeOpts): SQL[] {
  const conditions: SQL[] = [
    eq(sales.orgId, orgId),
    sql`${sales.status} = 'COMPLETED'`,
  ];
  if (opts.locationId) {
    conditions.push(eq(sales.locationId, opts.locationId));
  }
  if (opts.from) {
    conditions.push(sql`${sales.completedAt} >= ${opts.from}`);
  }
  if (opts.to) {
    conditions.push(sql`${sales.completedAt} <= ${opts.to}`);
  }
  return conditions;
}

/**
 * Sales by Item — aggregate sale_lines grouped by product
 */
export async function getSalesByItem(orgId: string, opts: DateRangeOpts) {
  const conditions = buildCompletedSaleConditions(orgId, opts);

  const rows = await db.execute(sql`
    SELECT
      sl.product_id AS "productId",
      p.name AS "productName",
      p.sku,
      p.mnemonic_sku AS "mnemonicSku",
      p.category,
      SUM(sl.quantity)::int AS "unitsSold",
      SUM(sl.line_total::numeric)::text AS "totalRevenue",
      SUM(sl.quantity * p.cost_price::numeric)::text AS "totalCost",
      (SUM(sl.line_total::numeric) - SUM(sl.quantity * p.cost_price::numeric))::text AS "grossProfit",
      CASE WHEN SUM(sl.line_total::numeric) > 0
        THEN ROUND((SUM(sl.line_total::numeric) - SUM(sl.quantity * p.cost_price::numeric)) / SUM(sl.line_total::numeric) * 100, 1)::text
        ELSE '0'
      END AS "marginPct",
      COUNT(DISTINCT sl.sale_id)::int AS "transactionCount"
    FROM sale_lines sl
    JOIN sales s ON sl.sale_id = s.id
    JOIN products p ON sl.product_id = p.id
    WHERE s.org_id = ${orgId}
      AND s.status = 'COMPLETED'
      ${opts.locationId ? sql`AND s.location_id = ${opts.locationId}` : sql``}
      ${opts.from ? sql`AND s.completed_at >= ${opts.from}` : sql``}
      ${opts.to ? sql`AND s.completed_at <= ${opts.to}` : sql``}
    GROUP BY sl.product_id, p.name, p.sku, p.mnemonic_sku, p.category
    ORDER BY SUM(sl.line_total::numeric) DESC
    LIMIT 200
  `);

  return rows;
}

/**
 * Sales by Category — aggregate by product category
 */
export async function getSalesByCategory(orgId: string, opts: DateRangeOpts) {
  const rows = await db.execute(sql`
    SELECT
      p.category,
      SUM(sl.quantity)::int AS "unitsSold",
      SUM(sl.line_total::numeric)::text AS "totalRevenue",
      SUM(sl.quantity * p.cost_price::numeric)::text AS "totalCost",
      (SUM(sl.line_total::numeric) - SUM(sl.quantity * p.cost_price::numeric))::text AS "grossProfit",
      CASE WHEN SUM(sl.line_total::numeric) > 0
        THEN ROUND((SUM(sl.line_total::numeric) - SUM(sl.quantity * p.cost_price::numeric)) / SUM(sl.line_total::numeric) * 100, 1)::text
        ELSE '0'
      END AS "marginPct",
      COUNT(DISTINCT sl.product_id)::int AS "uniqueProducts",
      COUNT(DISTINCT sl.sale_id)::int AS "transactionCount"
    FROM sale_lines sl
    JOIN sales s ON sl.sale_id = s.id
    JOIN products p ON sl.product_id = p.id
    WHERE s.org_id = ${orgId}
      AND s.status = 'COMPLETED'
      ${opts.locationId ? sql`AND s.location_id = ${opts.locationId}` : sql``}
      ${opts.from ? sql`AND s.completed_at >= ${opts.from}` : sql``}
      ${opts.to ? sql`AND s.completed_at <= ${opts.to}` : sql``}
    GROUP BY p.category
    ORDER BY SUM(sl.line_total::numeric) DESC
  `);

  return rows;
}

/**
 * Sales by Employee — aggregate by created_by_user_id
 */
export async function getSalesByEmployee(orgId: string, opts: DateRangeOpts) {
  const rows = await db.execute(sql`
    SELECT
      s.created_by_user_id AS "employeeId",
      u.full_name AS "employeeName",
      u.role AS "employeeRole",
      COUNT(*)::int AS "totalSales",
      SUM(s.grand_total::numeric)::text AS "totalRevenue",
      SUM(s.discount_total::numeric)::text AS "totalDiscounts",
      ROUND(AVG(s.grand_total::numeric), 2)::text AS "avgSaleValue",
      MAX(s.grand_total::numeric)::text AS "maxSaleValue",
      COUNT(*) FILTER (WHERE s.status = 'REFUNDED')::int AS "refundCount"
    FROM sales s
    JOIN users u ON s.created_by_user_id = u.id
    WHERE s.org_id = ${orgId}
      AND s.status IN ('COMPLETED', 'REFUNDED')
      ${opts.locationId ? sql`AND s.location_id = ${opts.locationId}` : sql``}
      ${opts.from ? sql`AND s.completed_at >= ${opts.from}` : sql``}
      ${opts.to ? sql`AND s.completed_at <= ${opts.to}` : sql``}
    GROUP BY s.created_by_user_id, u.full_name, u.role
    ORDER BY SUM(s.grand_total::numeric) DESC
  `);

  return rows;
}

/**
 * Sales Summary — aggregate totals
 */
export async function getSalesSummary(orgId: string, opts: DateRangeOpts) {
  const rows = await db.execute(sql`
    SELECT
      COUNT(*) FILTER (WHERE s.status = 'COMPLETED')::int AS "totalTransactions",
      COALESCE(SUM(s.grand_total::numeric) FILTER (WHERE s.status = 'COMPLETED'), 0)::text AS "totalRevenue",
      COALESCE(SUM(s.discount_total::numeric) FILTER (WHERE s.status = 'COMPLETED'), 0)::text AS "totalDiscounts",
      COUNT(*) FILTER (WHERE s.status = 'REFUNDED')::int AS "totalRefunds",
      CASE WHEN COUNT(*) FILTER (WHERE s.status = 'COMPLETED') > 0
        THEN ROUND(SUM(s.grand_total::numeric) FILTER (WHERE s.status = 'COMPLETED') / COUNT(*) FILTER (WHERE s.status = 'COMPLETED'), 2)::text
        ELSE '0'
      END AS "avgTransactionValue"
    FROM sales s
    WHERE s.org_id = ${orgId}
      AND s.status IN ('COMPLETED', 'REFUNDED')
      ${opts.locationId ? sql`AND s.location_id = ${opts.locationId}` : sql``}
      ${opts.from ? sql`AND s.completed_at >= ${opts.from}` : sql``}
      ${opts.to ? sql`AND s.completed_at <= ${opts.to}` : sql``}
  `);

  return rows[0] ?? {
    totalTransactions: 0,
    totalRevenue: "0",
    totalDiscounts: "0",
    totalRefunds: 0,
    avgTransactionValue: "0",
  };
}

/**
 * Daily Sales Summary — two-pass aggregation: sales then COGS, merged in JS
 */
export async function getDailySalesSummary(orgId: string, opts: DashboardOpts) {
  // Pass 1 — Sales aggregation grouped by date
  const salesRows = await db.execute(sql`
    SELECT
      DATE(s.completed_at AT TIME ZONE 'UTC') AS "date",
      COUNT(*) FILTER (WHERE s.status = 'COMPLETED')::int AS "salesCount",
      COALESCE(SUM(s.grand_total::numeric) FILTER (WHERE s.status = 'COMPLETED'), 0)::text AS "grossSales",
      COALESCE(SUM(s.grand_total::numeric) FILTER (WHERE s.status = 'REFUNDED'), 0)::text AS "refunds",
      COALESCE(SUM(s.discount_total::numeric) FILTER (WHERE s.status = 'COMPLETED'), 0)::text AS "discounts"
    FROM sales s
    WHERE s.org_id = ${orgId}
      AND s.status IN ('COMPLETED', 'REFUNDED')
      ${opts.from ? sql`AND s.completed_at >= ${opts.from}` : sql``}
      ${opts.to ? sql`AND s.completed_at <= ${opts.to}` : sql``}
      ${opts.locationId ? sql`AND s.location_id = ${opts.locationId}` : sql``}
      ${opts.employeeId ? sql`AND s.created_by_user_id = ${opts.employeeId}` : sql``}
    GROUP BY DATE(s.completed_at AT TIME ZONE 'UTC')
    ORDER BY "date" ASC
  `);

  // Pass 2 — COGS aggregation grouped by date
  const cogsRows = await db.execute(sql`
    SELECT
      DATE(s.completed_at AT TIME ZONE 'UTC') AS "date",
      COALESCE(SUM(sl.quantity * p.cost_price::numeric), 0)::text AS "costOfGoods"
    FROM sale_lines sl
    JOIN sales s ON sl.sale_id = s.id
    JOIN products p ON sl.product_id = p.id
    WHERE s.org_id = ${orgId}
      AND s.status = 'COMPLETED'
      ${opts.from ? sql`AND s.completed_at >= ${opts.from}` : sql``}
      ${opts.to ? sql`AND s.completed_at <= ${opts.to}` : sql``}
      ${opts.locationId ? sql`AND s.location_id = ${opts.locationId}` : sql``}
      ${opts.employeeId ? sql`AND s.created_by_user_id = ${opts.employeeId}` : sql``}
    GROUP BY DATE(s.completed_at AT TIME ZONE 'UTC')
  `);

  // Build COGS lookup by date string
  const cogsMap = new Map<string, string>();
  for (const row of cogsRows as any[]) {
    const dateStr = typeof row.date === "string" ? row.date : new Date(row.date).toISOString().slice(0, 10);
    cogsMap.set(dateStr, row.costOfGoods);
  }

  // Merge and compute derived fields
  return (salesRows as any[]).map((row) => {
    const dateStr = typeof row.date === "string" ? row.date : new Date(row.date).toISOString().slice(0, 10);
    const grossSales = parseFloat(row.grossSales);
    const refunds = parseFloat(row.refunds);
    const discounts = parseFloat(row.discounts);
    const costOfGoods = parseFloat(cogsMap.get(dateStr) ?? "0");
    const netSales = grossSales - refunds - discounts;
    const grossProfit = netSales - costOfGoods;
    const margin = grossSales > 0 ? (grossProfit / grossSales) * 100 : 0;

    return {
      date: dateStr,
      salesCount: row.salesCount,
      grossSales: grossSales.toFixed(2),
      refunds: refunds.toFixed(2),
      discounts: discounts.toFixed(2),
      netSales: netSales.toFixed(2),
      costOfGoods: costOfGoods.toFixed(2),
      grossProfit: grossProfit.toFixed(2),
      margin: margin.toFixed(1),
    };
  });
}

/**
 * Sales KPIs — current period vs prior period comparison
 */
export async function getSalesKPIs(orgId: string, opts: DashboardOpts) {
  async function fetchPeriodKPIs(
    periodFrom: string | undefined,
    periodTo: string | undefined,
  ) {
    // Sales aggregation
    const salesRows = await db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE s.status = 'COMPLETED')::int AS "totalTransactions",
        COALESCE(SUM(s.grand_total::numeric) FILTER (WHERE s.status = 'COMPLETED'), 0)::text AS "grossSales",
        COALESCE(SUM(s.grand_total::numeric) FILTER (WHERE s.status = 'REFUNDED'), 0)::text AS "refunds",
        COALESCE(SUM(s.discount_total::numeric) FILTER (WHERE s.status = 'COMPLETED'), 0)::text AS "discounts"
      FROM sales s
      WHERE s.org_id = ${orgId}
        AND s.status IN ('COMPLETED', 'REFUNDED')
        ${periodFrom ? sql`AND s.completed_at >= ${periodFrom}` : sql``}
        ${periodTo ? sql`AND s.completed_at <= ${periodTo}` : sql``}
        ${opts.locationId ? sql`AND s.location_id = ${opts.locationId}` : sql``}
        ${opts.employeeId ? sql`AND s.created_by_user_id = ${opts.employeeId}` : sql``}
    `);

    // COGS aggregation
    const cogsRows = await db.execute(sql`
      SELECT
        COALESCE(SUM(sl.quantity * p.cost_price::numeric), 0)::text AS "costOfGoods"
      FROM sale_lines sl
      JOIN sales s ON sl.sale_id = s.id
      JOIN products p ON sl.product_id = p.id
      WHERE s.org_id = ${orgId}
        AND s.status = 'COMPLETED'
        ${periodFrom ? sql`AND s.completed_at >= ${periodFrom}` : sql``}
        ${periodTo ? sql`AND s.completed_at <= ${periodTo}` : sql``}
        ${opts.locationId ? sql`AND s.location_id = ${opts.locationId}` : sql``}
        ${opts.employeeId ? sql`AND s.created_by_user_id = ${opts.employeeId}` : sql``}
    `);

    const salesRow = (salesRows as any[])[0] ?? {
      totalTransactions: 0,
      grossSales: "0",
      refunds: "0",
      discounts: "0",
    };
    const cogsRow = (cogsRows as any[])[0] ?? { costOfGoods: "0" };

    const grossSales = parseFloat(salesRow.grossSales);
    const refunds = parseFloat(salesRow.refunds);
    const discounts = parseFloat(salesRow.discounts);
    const costOfGoods = parseFloat(cogsRow.costOfGoods);
    const netSales = grossSales - refunds - discounts;
    const grossProfit = netSales - costOfGoods;
    const margin = grossSales > 0 ? (grossProfit / grossSales) * 100 : 0;

    return {
      totalTransactions: salesRow.totalTransactions,
      grossSales: grossSales.toFixed(2),
      refunds: refunds.toFixed(2),
      discounts: discounts.toFixed(2),
      netSales: netSales.toFixed(2),
      costOfGoods: costOfGoods.toFixed(2),
      grossProfit: grossProfit.toFixed(2),
      margin: margin.toFixed(1),
    };
  }

  // Compute prior period dates
  let priorFrom: string | undefined;
  let priorTo: string | undefined;

  if (opts.from && opts.to) {
    const fromDate = new Date(opts.from);
    const toDate = new Date(opts.to);
    const durationMs = toDate.getTime() - fromDate.getTime();
    const priorToDate = new Date(fromDate.getTime() - 1);
    const priorFromDate = new Date(priorToDate.getTime() - durationMs);
    priorFrom = priorFromDate.toISOString().slice(0, 10);
    priorTo = priorToDate.toISOString().slice(0, 10);
  }

  const [current, prior] = await Promise.all([
    fetchPeriodKPIs(opts.from, opts.to),
    fetchPeriodKPIs(priorFrom, priorTo),
  ]);

  return { current, prior };
}
