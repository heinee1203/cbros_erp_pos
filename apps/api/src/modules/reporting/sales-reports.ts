import { db } from "@apex/database";
import {
  sales,
  saleLines,
  products,
  users,
  historicalSales,
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
 * Sales by Item — aggregate sale_lines + historical_sales grouped by product
 */
export async function getSalesByItem(orgId: string, opts: DateRangeOpts) {
  const rows = await db.execute(sql`
    WITH combined AS (
      -- POS sales
      SELECT
        sl.product_id,
        sl.quantity,
        sl.line_total::numeric AS revenue,
        (sl.quantity * p.cost_price::numeric) AS cost,
        sl.sale_id
      FROM sale_lines sl
      JOIN sales s ON sl.sale_id = s.id
      JOIN products p ON sl.product_id = p.id
      WHERE s.org_id = ${orgId}
        AND s.status = 'COMPLETED'
        ${opts.locationId ? sql`AND s.location_id = ${opts.locationId}` : sql``}
        ${opts.from ? sql`AND s.completed_at >= ${opts.from}` : sql``}
        ${opts.to ? sql`AND s.completed_at <= ${opts.to}` : sql``}

      UNION ALL

      -- Historical imported sales
      SELECT
        hs.product_id,
        hs.quantity,
        COALESCE(hs.net_sales::numeric, 0) AS revenue,
        COALESCE(hs.cost_amount::numeric, 0) AS cost,
        NULL::uuid AS sale_id
      FROM historical_sales hs
      WHERE hs.org_id = ${orgId}
        AND hs.reason_type = 'SALE'
        AND hs.product_id IS NOT NULL
        ${opts.locationId ? sql`AND hs.location_id = ${opts.locationId}` : sql``}
        ${opts.from ? sql`AND hs.movement_date >= ${opts.from}` : sql``}
        ${opts.to ? sql`AND hs.movement_date <= ${opts.to}` : sql``}
    )
    SELECT
      c.product_id AS "productId",
      CASE
        WHEN p.parent_product_id IS NOT NULL
          THEN (SELECT pp.name FROM products pp WHERE pp.id = p.parent_product_id) || ' (' || p.name || ')'
        ELSE p.name
      END AS "productName",
      p.sku,
      p.mnemonic_sku AS "mnemonicSku",
      COALESCE(cat.name, 'Uncategorized') AS "categoryName",
      SUM(c.quantity)::int AS "unitsSold",
      SUM(c.revenue)::text AS "totalRevenue",
      SUM(c.cost)::text AS "totalCost",
      (SUM(c.revenue) - SUM(c.cost))::text AS "grossProfit",
      CASE WHEN SUM(c.revenue) > 0
        THEN ROUND((SUM(c.revenue) - SUM(c.cost)) / SUM(c.revenue) * 100, 1)::text
        ELSE '0'
      END AS "marginPct",
      COUNT(DISTINCT c.sale_id)::int AS "transactionCount"
    FROM combined c
    JOIN products p ON c.product_id = p.id
    LEFT JOIN categories cat ON p.category_id = cat.id
    LEFT JOIN product_families fam ON p.family_id = fam.id
    WHERE (fam.slug IS NULL OR fam.slug != 'non-items')
      AND NOT EXISTS (
        SELECT 1 FROM categories exc_cat
        WHERE exc_cat.name IN ('Count', 'Price Add', 'Labor', 'Payment')
          AND (exc_cat.id = p.category_id
            OR exc_cat.id = (SELECT pp.category_id FROM products pp WHERE pp.id = p.parent_product_id))
      )
    GROUP BY c.product_id, p.name, p.sku, p.mnemonic_sku, cat.name, p.parent_product_id
    ORDER BY SUM(c.revenue) DESC
    LIMIT 500
  `);

  return rows;
}

/**
 * Sales by Category — aggregate by product category
 */
export async function getSalesByCategory(orgId: string, opts: DateRangeOpts) {
  const rows = await db.execute(sql`
    WITH combined AS (
      -- POS sales
      SELECT
        sl.product_id,
        sl.quantity,
        sl.line_total::numeric AS revenue,
        (sl.quantity * p.cost_price::numeric) AS cost,
        sl.sale_id
      FROM sale_lines sl
      JOIN sales s ON sl.sale_id = s.id
      JOIN products p ON sl.product_id = p.id
      WHERE s.org_id = ${orgId}
        AND s.status = 'COMPLETED'
        ${opts.locationId ? sql`AND s.location_id = ${opts.locationId}` : sql``}
        ${opts.from ? sql`AND s.completed_at >= ${opts.from}` : sql``}
        ${opts.to ? sql`AND s.completed_at <= ${opts.to}` : sql``}
      UNION ALL
      -- Historical imported sales
      SELECT
        hs.product_id,
        hs.quantity,
        COALESCE(hs.net_sales::numeric, 0) AS revenue,
        COALESCE(hs.cost_amount::numeric, 0) AS cost,
        NULL::uuid AS sale_id
      FROM historical_sales hs
      WHERE hs.org_id = ${orgId}
        AND hs.reason_type = 'SALE'
        AND hs.product_id IS NOT NULL
        ${opts.locationId ? sql`AND hs.location_id = ${opts.locationId}` : sql``}
        ${opts.from ? sql`AND hs.movement_date >= ${opts.from}` : sql``}
        ${opts.to ? sql`AND hs.movement_date <= ${opts.to}` : sql``}
    )
    SELECT
      COALESCE(cat.name, 'Uncategorized') AS "categoryName",
      SUM(c.quantity)::int AS "unitsSold",
      SUM(c.revenue)::text AS "totalRevenue",
      SUM(c.cost)::text AS "totalCost",
      (SUM(c.revenue) - SUM(c.cost))::text AS "grossProfit",
      CASE WHEN SUM(c.revenue) > 0
        THEN ROUND((SUM(c.revenue) - SUM(c.cost)) / SUM(c.revenue) * 100, 1)::text
        ELSE '0'
      END AS "marginPct",
      COUNT(DISTINCT c.product_id)::int AS "uniqueProducts",
      COUNT(DISTINCT c.sale_id)::int AS "transactionCount"
    FROM combined c
    JOIN products p ON c.product_id = p.id
    LEFT JOIN categories cat ON p.category_id = cat.id
    GROUP BY cat.name
    ORDER BY SUM(c.revenue) DESC
  `);

  return rows;
}

/**
 * Sales by Employee — aggregate by created_by_user_id
 */
export async function getSalesByEmployee(orgId: string, opts: DateRangeOpts) {
  const rows = await db.execute(sql`
    WITH combined AS (
      -- POS sales
      SELECT
        u.full_name AS employee_name,
        s.grand_total::numeric AS amount,
        s.discount_total::numeric AS discount,
        s.status::text AS sale_status
      FROM sales s
      JOIN users u ON s.created_by_user_id = u.id
      WHERE s.org_id = ${orgId}
        AND s.status IN ('COMPLETED', 'REFUNDED')
        ${opts.locationId ? sql`AND s.location_id = ${opts.locationId}` : sql``}
        ${opts.from ? sql`AND s.completed_at >= ${opts.from}` : sql``}
        ${opts.to ? sql`AND s.completed_at <= ${opts.to}` : sql``}
      UNION ALL
      -- Historical imported sales
      SELECT
        COALESCE(hs.employee_name, 'Imported') AS employee_name,
        COALESCE(hs.net_sales::numeric, 0) AS amount,
        COALESCE(hs.discount_amount::numeric, 0) AS discount,
        CASE WHEN hs.reason_type = 'REFUND' THEN 'REFUNDED' ELSE 'COMPLETED' END AS sale_status
      FROM historical_sales hs
      WHERE hs.org_id = ${orgId}
        AND hs.reason_type IN ('SALE', 'REFUND')
        AND hs.product_id IS NOT NULL
        ${opts.locationId ? sql`AND hs.location_id = ${opts.locationId}` : sql``}
        ${opts.from ? sql`AND hs.movement_date >= ${opts.from}` : sql``}
        ${opts.to ? sql`AND hs.movement_date <= ${opts.to}` : sql``}
    )
    SELECT
      employee_name AS "employeeName",
      COUNT(*) FILTER (WHERE sale_status = 'COMPLETED')::int AS "totalSales",
      COALESCE(SUM(amount) FILTER (WHERE sale_status = 'COMPLETED'), 0)::text AS "totalRevenue",
      COALESCE(SUM(discount) FILTER (WHERE sale_status = 'COMPLETED'), 0)::text AS "totalDiscounts",
      CASE WHEN COUNT(*) FILTER (WHERE sale_status = 'COMPLETED') > 0
        THEN ROUND(SUM(amount) FILTER (WHERE sale_status = 'COMPLETED') / COUNT(*) FILTER (WHERE sale_status = 'COMPLETED'), 2)::text
        ELSE '0'
      END AS "avgSaleValue",
      COALESCE(MAX(amount) FILTER (WHERE sale_status = 'COMPLETED'), 0)::text AS "maxSaleValue",
      COUNT(*) FILTER (WHERE sale_status = 'REFUNDED')::int AS "refundCount"
    FROM combined
    GROUP BY employee_name
    ORDER BY SUM(amount) FILTER (WHERE sale_status = 'COMPLETED') DESC
  `);

  return rows;
}

/**
 * Sales Summary — aggregate totals
 */
export async function getSalesSummary(orgId: string, opts: DateRangeOpts) {
  const rows = await db.execute(sql`
    WITH combined AS (
      SELECT s.grand_total::numeric AS amount, s.discount_total::numeric AS discount,
        CASE WHEN s.status = 'COMPLETED' THEN 'sale' ELSE 'refund' END AS txn_type
      FROM sales s
      WHERE s.org_id = ${orgId} AND s.status IN ('COMPLETED', 'REFUNDED')
        ${opts.locationId ? sql`AND s.location_id = ${opts.locationId}` : sql``}
        ${opts.from ? sql`AND s.completed_at >= ${opts.from}` : sql``}
        ${opts.to ? sql`AND s.completed_at <= ${opts.to}` : sql``}
      UNION ALL
      SELECT COALESCE(hs.net_sales::numeric, 0) AS amount,
        COALESCE(hs.discount_amount::numeric, 0) AS discount,
        CASE WHEN hs.reason_type = 'SALE' THEN 'sale' ELSE 'refund' END AS txn_type
      FROM historical_sales hs
      WHERE hs.org_id = ${orgId} AND hs.reason_type IN ('SALE', 'REFUND') AND hs.product_id IS NOT NULL
        ${opts.locationId ? sql`AND hs.location_id = ${opts.locationId}` : sql``}
        ${opts.from ? sql`AND hs.movement_date >= ${opts.from}` : sql``}
        ${opts.to ? sql`AND hs.movement_date <= ${opts.to}` : sql``}
    )
    SELECT
      COUNT(*) FILTER (WHERE txn_type = 'sale')::int AS "totalTransactions",
      COALESCE(SUM(amount) FILTER (WHERE txn_type = 'sale'), 0)::text AS "totalRevenue",
      COALESCE(SUM(discount) FILTER (WHERE txn_type = 'sale'), 0)::text AS "totalDiscounts",
      COUNT(*) FILTER (WHERE txn_type = 'refund')::int AS "totalRefunds",
      CASE WHEN COUNT(*) FILTER (WHERE txn_type = 'sale') > 0
        THEN ROUND(SUM(amount) FILTER (WHERE txn_type = 'sale') / COUNT(*) FILTER (WHERE txn_type = 'sale'), 2)::text
        ELSE '0'
      END AS "avgTransactionValue"
    FROM combined
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
  // Pass 1 — Sales aggregation grouped by date (POS + imported historical)
  const salesRows = await db.execute(sql`
    WITH combined_sales AS (
      -- POS transactions
      SELECT
        DATE(s.completed_at AT TIME ZONE 'UTC') AS sale_date,
        s.grand_total::numeric AS amount,
        s.discount_total::numeric AS discount,
        s.status::text AS sale_status,
        'pos' AS source
      FROM sales s
      WHERE s.org_id = ${orgId}
        AND s.status IN ('COMPLETED', 'REFUNDED')
        ${opts.from ? sql`AND s.completed_at >= ${opts.from}` : sql``}
        ${opts.to ? sql`AND s.completed_at <= ${opts.to}` : sql``}
        ${opts.locationId ? sql`AND s.location_id = ${opts.locationId}` : sql``}
        ${opts.employeeId ? sql`AND s.created_by_user_id = ${opts.employeeId}` : sql``}
      UNION ALL
      -- Imported Loyverse receipts (grouped by receipt to avoid double-counting lines)
      SELECT
        DATE(hs.movement_date AT TIME ZONE 'UTC') AS sale_date,
        COALESCE(hs.net_sales::numeric, 0) AS amount,
        COALESCE(hs.discount_amount::numeric, 0) AS discount,
        CASE WHEN hs.reason_type = 'REFUND' THEN 'REFUNDED' ELSE 'COMPLETED' END AS sale_status,
        'imported' AS source
      FROM historical_sales hs
      WHERE hs.org_id = ${orgId}
        AND hs.reason_type IN ('SALE', 'REFUND')
        AND hs.product_id IS NOT NULL
        ${opts.from ? sql`AND hs.movement_date >= ${opts.from}` : sql``}
        ${opts.to ? sql`AND hs.movement_date <= ${opts.to}` : sql``}
        ${opts.locationId ? sql`AND hs.location_id = ${opts.locationId}` : sql``}
    )
    SELECT
      sale_date AS "date",
      COUNT(*) FILTER (WHERE sale_status = 'COMPLETED')::int AS "salesCount",
      COALESCE(SUM(amount) FILTER (WHERE sale_status = 'COMPLETED'), 0)::text AS "grossSales",
      COALESCE(SUM(amount) FILTER (WHERE sale_status = 'REFUNDED'), 0)::text AS "refunds",
      COALESCE(SUM(discount) FILTER (WHERE sale_status = 'COMPLETED'), 0)::text AS "discounts"
    FROM combined_sales
    GROUP BY sale_date
    ORDER BY sale_date ASC
  `);

  // Pass 2 — COGS aggregation grouped by date (POS + historical)
  const cogsRows = await db.execute(sql`
    WITH combined_cogs AS (
      SELECT
        DATE(s.completed_at AT TIME ZONE 'UTC') AS cogs_date,
        (sl.quantity * p.cost_price::numeric) AS cost
      FROM sale_lines sl
      JOIN sales s ON sl.sale_id = s.id
      JOIN products p ON sl.product_id = p.id
      WHERE s.org_id = ${orgId}
        AND s.status = 'COMPLETED'
        ${opts.from ? sql`AND s.completed_at >= ${opts.from}` : sql``}
        ${opts.to ? sql`AND s.completed_at <= ${opts.to}` : sql``}
        ${opts.locationId ? sql`AND s.location_id = ${opts.locationId}` : sql``}
        ${opts.employeeId ? sql`AND s.created_by_user_id = ${opts.employeeId}` : sql``}
      UNION ALL
      SELECT
        DATE(hs.movement_date AT TIME ZONE 'UTC') AS cogs_date,
        COALESCE(hs.cost_amount::numeric, hs.quantity * COALESCE(p.cost_price::numeric, 0)) AS cost
      FROM historical_sales hs
      LEFT JOIN products p ON hs.product_id = p.id
      WHERE hs.org_id = ${orgId}
        AND hs.reason_type = 'SALE'
        AND hs.product_id IS NOT NULL
        ${opts.from ? sql`AND hs.movement_date >= ${opts.from}` : sql``}
        ${opts.to ? sql`AND hs.movement_date <= ${opts.to}` : sql``}
        ${opts.locationId ? sql`AND hs.location_id = ${opts.locationId}` : sql``}
    )
    SELECT
      cogs_date AS "date",
      COALESCE(SUM(cost), 0)::text AS "costOfGoods"
    FROM combined_cogs
    GROUP BY cogs_date
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
    // Sales aggregation (POS + imported historical)
    const salesRows = await db.execute(sql`
      WITH combined AS (
        SELECT s.grand_total::numeric AS amount, s.discount_total::numeric AS discount,
          CASE WHEN s.status = 'COMPLETED' THEN 'sale' ELSE 'refund' END AS txn_type
        FROM sales s
        WHERE s.org_id = ${orgId} AND s.status IN ('COMPLETED', 'REFUNDED')
          ${periodFrom ? sql`AND s.completed_at >= ${periodFrom}` : sql``}
          ${periodTo ? sql`AND s.completed_at <= ${periodTo}` : sql``}
          ${opts.locationId ? sql`AND s.location_id = ${opts.locationId}` : sql``}
          ${opts.employeeId ? sql`AND s.created_by_user_id = ${opts.employeeId}` : sql``}
        UNION ALL
        SELECT COALESCE(hs.net_sales::numeric, 0) AS amount,
          COALESCE(hs.discount_amount::numeric, 0) AS discount,
          CASE WHEN hs.reason_type = 'SALE' THEN 'sale' ELSE 'refund' END AS txn_type
        FROM historical_sales hs
        WHERE hs.org_id = ${orgId} AND hs.reason_type IN ('SALE', 'REFUND') AND hs.product_id IS NOT NULL
          ${periodFrom ? sql`AND hs.movement_date >= ${periodFrom}` : sql``}
          ${periodTo ? sql`AND hs.movement_date <= ${periodTo}` : sql``}
          ${opts.locationId ? sql`AND hs.location_id = ${opts.locationId}` : sql``}
      )
      SELECT
        COUNT(*) FILTER (WHERE txn_type = 'sale')::int AS "totalTransactions",
        COALESCE(SUM(amount) FILTER (WHERE txn_type = 'sale'), 0)::text AS "grossSales",
        COALESCE(SUM(amount) FILTER (WHERE txn_type = 'refund'), 0)::text AS "refunds",
        COALESCE(SUM(discount) FILTER (WHERE txn_type = 'sale'), 0)::text AS "discounts"
      FROM combined
    `);

    // COGS aggregation (POS + historical)
    const cogsRows = await db.execute(sql`
      WITH combined_cogs AS (
        SELECT (sl.quantity * p.cost_price::numeric) AS cost
        FROM sale_lines sl
        JOIN sales s ON sl.sale_id = s.id
        JOIN products p ON sl.product_id = p.id
        WHERE s.org_id = ${orgId}
          AND s.status = 'COMPLETED'
          ${periodFrom ? sql`AND s.completed_at >= ${periodFrom}` : sql``}
          ${periodTo ? sql`AND s.completed_at <= ${periodTo}` : sql``}
          ${opts.locationId ? sql`AND s.location_id = ${opts.locationId}` : sql``}
          ${opts.employeeId ? sql`AND s.created_by_user_id = ${opts.employeeId}` : sql``}
        UNION ALL
        SELECT COALESCE(hs.cost_amount::numeric, hs.quantity * COALESCE(p.cost_price::numeric, 0)) AS cost
        FROM historical_sales hs
        LEFT JOIN products p ON hs.product_id = p.id
        WHERE hs.org_id = ${orgId}
          AND hs.reason_type = 'SALE'
          AND hs.product_id IS NOT NULL
          ${periodFrom ? sql`AND hs.movement_date >= ${periodFrom}` : sql``}
          ${periodTo ? sql`AND hs.movement_date <= ${periodTo}` : sql``}
          ${opts.locationId ? sql`AND hs.location_id = ${opts.locationId}` : sql``}
      )
      SELECT COALESCE(SUM(cost), 0)::text AS "costOfGoods" FROM combined_cogs
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

/**
 * Sales by Payment Method — aggregate sale_payments grouped by method
 */
export async function getSalesByPaymentMethod(orgId: string, opts: DateRangeOpts) {
  const locationFilter = opts.locationId ? sql`AND s.location_id = ${opts.locationId}` : sql``;
  const fromFilter = opts.from ? sql`AND s.completed_at >= ${opts.from}` : sql``;
  const toFilter = opts.to ? sql`AND s.completed_at <= ${opts.to}` : sql``;

  const rows = await db.execute(sql`
    SELECT
      sp.method,
      COUNT(DISTINCT sp.sale_id)::int AS transaction_count,
      SUM(sp.amount::numeric)::numeric(14,2) AS total_amount
    FROM sale_payments sp
    INNER JOIN sales s ON s.id = sp.sale_id
    WHERE s.org_id = ${orgId}
      AND s.status IN ('COMPLETED', 'PARTIALLY_REFUNDED', 'REFUNDED')
      ${locationFilter}
      ${fromFilter}
      ${toFilter}
    GROUP BY sp.method
    ORDER BY SUM(sp.amount::numeric) DESC
  `);

  const data = (rows as any[]).map((r: any) => ({
    method: r.method,
    transactionCount: r.transaction_count,
    totalAmount: parseFloat(r.total_amount) || 0,
  }));

  const grandTotal = data.reduce((sum, d) => sum + d.totalAmount, 0);
  const enriched = data.map(d => ({
    ...d,
    percentage: grandTotal > 0 ? Math.round((d.totalAmount / grandTotal) * 10000) / 100 : 0,
  }));

  return { data: enriched, grandTotal };
}

/**
 * Discount Analysis — aggregate discounts by employee, product, and category
 */
export async function getDiscountAnalysis(orgId: string, opts: DateRangeOpts) {
  const locationFilter = opts.locationId ? sql`AND s.location_id = ${opts.locationId}` : sql``;
  const fromFilter = opts.from ? sql`AND s.completed_at >= ${opts.from}` : sql``;
  const toFilter = opts.to ? sql`AND s.completed_at <= ${opts.to}` : sql``;

  // Summary
  const summaryRows = await db.execute(sql`
    SELECT
      COUNT(DISTINCT s.id)::int AS total_sales,
      COUNT(DISTINCT s.id) FILTER (WHERE s.discount_total > 0)::int AS sales_with_discount,
      COALESCE(SUM(s.discount_total::numeric), 0)::numeric(14,2) AS total_discount,
      COALESCE(SUM(s.grand_total::numeric), 0)::numeric(14,2) AS total_revenue
    FROM sales s
    WHERE s.org_id = ${orgId}
      AND s.status IN ('COMPLETED', 'PARTIALLY_REFUNDED', 'REFUNDED')
      ${locationFilter} ${fromFilter} ${toFilter}
  `);
  const sr = (summaryRows as any[])[0] || {};

  // By Employee
  const byEmployeeRows = await db.execute(sql`
    SELECT
      u.id AS user_id,
      u.name AS employee_name,
      COUNT(DISTINCT s.id)::int AS transaction_count,
      COALESCE(SUM(s.discount_total::numeric), 0)::numeric(14,2) AS total_discount,
      COALESCE(SUM(sl.discount_amount::numeric), 0)::numeric(14,2) AS line_discount_total
    FROM sales s
    INNER JOIN users u ON u.id = s.completed_by_user_id
    LEFT JOIN sale_lines sl ON sl.sale_id = s.id AND sl.discount_amount > 0
    WHERE s.org_id = ${orgId}
      AND s.status IN ('COMPLETED', 'PARTIALLY_REFUNDED', 'REFUNDED')
      AND s.discount_total > 0
      ${locationFilter} ${fromFilter} ${toFilter}
    GROUP BY u.id, u.name
    ORDER BY SUM(s.discount_total::numeric) DESC
    LIMIT 50
  `);

  // By Product (top 50 most-discounted products)
  const byProductRows = await db.execute(sql`
    SELECT
      p.id AS product_id,
      p.name AS product_name,
      p.sku,
      COUNT(DISTINCT sl.sale_id)::int AS transaction_count,
      SUM(sl.quantity)::int AS total_qty,
      COALESCE(SUM(sl.discount_amount::numeric), 0)::numeric(14,2) AS total_discount
    FROM sale_lines sl
    INNER JOIN sales s ON s.id = sl.sale_id
    INNER JOIN products p ON p.id = sl.product_id
    WHERE s.org_id = ${orgId}
      AND s.status IN ('COMPLETED', 'PARTIALLY_REFUNDED', 'REFUNDED')
      AND sl.discount_amount > 0
      ${locationFilter} ${fromFilter} ${toFilter}
    GROUP BY p.id, p.name, p.sku
    ORDER BY SUM(sl.discount_amount::numeric) DESC
    LIMIT 50
  `);

  // By Category (top 20)
  const byCategoryRows = await db.execute(sql`
    SELECT
      COALESCE(c.name, 'Uncategorized') AS category_name,
      COUNT(DISTINCT sl.sale_id)::int AS transaction_count,
      SUM(sl.quantity)::int AS total_qty,
      COALESCE(SUM(sl.discount_amount::numeric), 0)::numeric(14,2) AS total_discount
    FROM sale_lines sl
    INNER JOIN sales s ON s.id = sl.sale_id
    INNER JOIN products p ON p.id = sl.product_id
    LEFT JOIN categories c ON c.id = p.category_id
    WHERE s.org_id = ${orgId}
      AND s.status IN ('COMPLETED', 'PARTIALLY_REFUNDED', 'REFUNDED')
      AND sl.discount_amount > 0
      ${locationFilter} ${fromFilter} ${toFilter}
    GROUP BY c.name
    ORDER BY SUM(sl.discount_amount::numeric) DESC
    LIMIT 20
  `);

  return {
    summary: {
      totalSales: sr.total_sales ?? 0,
      salesWithDiscount: sr.sales_with_discount ?? 0,
      totalDiscount: parseFloat(sr.total_discount) || 0,
      totalRevenue: parseFloat(sr.total_revenue) || 0,
      avgDiscountPct: parseFloat(sr.total_revenue) > 0
        ? Math.round((parseFloat(sr.total_discount) / parseFloat(sr.total_revenue)) * 10000) / 100
        : 0,
    },
    byEmployee: (byEmployeeRows as any[]).map((r: any) => ({
      userId: r.user_id,
      employeeName: r.employee_name,
      transactionCount: r.transaction_count,
      totalDiscount: parseFloat(r.total_discount) || 0,
    })),
    byProduct: (byProductRows as any[]).map((r: any) => ({
      productId: r.product_id,
      productName: r.product_name,
      sku: r.sku,
      transactionCount: r.transaction_count,
      totalQty: r.total_qty,
      totalDiscount: parseFloat(r.total_discount) || 0,
    })),
    byCategory: (byCategoryRows as any[]).map((r: any) => ({
      categoryName: r.category_name,
      transactionCount: r.transaction_count,
      totalQty: r.total_qty,
      totalDiscount: parseFloat(r.total_discount) || 0,
    })),
  };
}
