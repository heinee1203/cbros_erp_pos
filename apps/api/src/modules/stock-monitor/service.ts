import { db } from "@apex/database";
import {
  stockMetrics,
  supplierMetrics,
  products,
  brands,
  categories,
  productFamilies,
  suppliers,
} from "@apex/database/schema";
import {
  eq,
  and,
  gt,
  ilike,
  or,
  sql,
  asc,
  desc,
  inArray,
  type SQL,
} from "drizzle-orm";

/**
 * Recompute stock_metrics for every active product in the org.
 * Runs DELETE + INSERT inside a transaction so readers never see empty data.
 * Returns the number of product rows inserted.
 */
export async function refreshStockMetrics(orgId: string): Promise<number> {
  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`DELETE FROM stock_metrics WHERE org_id = ${orgId}`);

    const inserted = await tx.execute(sql`
      WITH velocity AS (
        SELECT
          product_id,
          COALESCE(SUM(CASE WHEN sale_date >= NOW() - INTERVAL '30 days' THEN qty ELSE 0 END)::numeric / 30, 0) AS avg_30d,
          COALESCE(SUM(CASE WHEN sale_date >= NOW() - INTERVAL '60 days' THEN qty ELSE 0 END)::numeric / 60, 0) AS avg_60d,
          COALESCE(SUM(qty)::numeric / 90, 0) AS avg_90d
        FROM (
          -- Live Apex sales
          SELECT sl.product_id, sl.quantity AS qty, s.created_at AS sale_date
          FROM sale_lines sl
          JOIN sales s ON sl.sale_id = s.id
          WHERE s.org_id = ${orgId}
            AND s.status = 'COMPLETED'
            AND s.created_at >= NOW() - INTERVAL '90 days'

          UNION ALL

          -- Historical Loyverse sales (SALE positive, REFUND negative)
          SELECT hs.product_id,
            CASE WHEN hs.reason_type = 'SALE' THEN hs.quantity
                 WHEN hs.reason_type = 'REFUND' THEN -hs.quantity
            END AS qty,
            hs.movement_date AS sale_date
          FROM historical_sales hs
          WHERE hs.org_id = ${orgId}
            AND hs.reason_type IN ('SALE', 'REFUND')
            AND hs.product_id IS NOT NULL
            AND hs.movement_date >= NOW() - INTERVAL '90 days'
        ) combined
        GROUP BY product_id
      ),
      stock AS (
        SELECT product_id, SUM(stock_level) AS total_stock
        FROM inventory
        WHERE org_id = ${orgId}
        GROUP BY product_id
      ),
      stockouts AS (
        SELECT product_id, COUNT(DISTINCT DATE(effective_at)) AS stockout_days
        FROM stock_journal
        WHERE org_id = ${orgId}
          AND reference_type = 'SALE'
          AND balance_after = 0
          AND effective_at >= NOW() - INTERVAL '90 days'
        GROUP BY product_id
      ),
      last_po AS (
        SELECT DISTINCT ON (pre.product_id)
          pre.product_id,
          pre.created_at AS last_receipt_date,
          po.submitted_at AS po_submitted_date,
          sup.name AS supplier_name,
          EXTRACT(DAY FROM pre.created_at - po.submitted_at)::integer AS lead_time_days
        FROM po_receipt_events pre
        JOIN purchase_orders po ON pre.purchase_order_id = po.id
        LEFT JOIN suppliers sup ON po.supplier_id = sup.id
        WHERE po.org_id = ${orgId}
        ORDER BY pre.product_id, pre.created_at DESC
      )
      INSERT INTO stock_metrics (
        org_id, product_id, total_stock,
        avg_daily_sales_30d, avg_daily_sales_60d, avg_daily_sales_90d,
        days_of_stock, stockout_days_90d,
        last_po_date, last_po_supplier_name, last_lead_time_days,
        status, computed_at
      )
      SELECT
        p.org_id,
        p.id AS product_id,
        COALESCE(st.total_stock, 0)::integer AS total_stock,
        COALESCE(v.avg_30d, 0),
        COALESCE(v.avg_60d, 0),
        COALESCE(v.avg_90d, 0),
        CASE
          WHEN COALESCE(v.avg_30d, 0) > 0
            THEN ROUND(COALESCE(st.total_stock, 0)::numeric / v.avg_30d, 1)
          ELSE NULL
        END AS days_of_stock,
        COALESCE(so.stockout_days, 0)::integer,
        lp.last_receipt_date,
        lp.supplier_name,
        lp.lead_time_days,
        CASE
          WHEN COALESCE(v.avg_90d, 0) = 0 AND COALESCE(st.total_stock, 0) > 0 THEN 'DEAD_STOCK'
          WHEN COALESCE(st.total_stock, 0) = 0 AND COALESCE(v.avg_90d, 0) > 0 THEN 'CRITICAL'
          WHEN COALESCE(v.avg_30d, 0) > 0 AND ROUND(COALESCE(st.total_stock, 0)::numeric / v.avg_30d, 1) <= 7 THEN 'CRITICAL'
          WHEN COALESCE(v.avg_30d, 0) > 0 AND ROUND(COALESCE(st.total_stock, 0)::numeric / v.avg_30d, 1) <= 14 THEN 'LOW'
          WHEN COALESCE(v.avg_30d, 0) > 0 AND ROUND(COALESCE(st.total_stock, 0)::numeric / v.avg_30d, 1) <= 60 THEN 'HEALTHY'
          WHEN COALESCE(v.avg_30d, 0) > 0 AND ROUND(COALESCE(st.total_stock, 0)::numeric / v.avg_30d, 1) > 60 THEN 'OVERSTOCK'
          ELSE 'HEALTHY'
        END::stock_monitor_status AS status,
        NOW() AS computed_at
      FROM products p
      LEFT JOIN velocity v ON p.id = v.product_id
      LEFT JOIN stock st ON p.id = st.product_id
      LEFT JOIN stockouts so ON p.id = so.product_id
      LEFT JOIN last_po lp ON p.id = lp.product_id
      WHERE p.org_id = ${orgId} AND p.is_active = true
    `);

    const [countRow] = await tx.execute(
      sql`SELECT COUNT(*)::integer AS cnt FROM stock_metrics WHERE org_id = ${orgId}`,
    );
    return (countRow as any).cnt as number;
  });

  return result;
}

/**
 * Recompute supplier_metrics for all suppliers with received POs in the last 6 months.
 * Returns the number of supplier rows inserted.
 */
export async function refreshSupplierMetrics(orgId: string): Promise<number> {
  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`DELETE FROM supplier_metrics WHERE org_id = ${orgId}`);

    const inserted = await tx.execute(sql`
      WITH po_lead AS (
        SELECT
          po.org_id,
          po.supplier_id,
          po.id AS po_id,
          po.submitted_at,
          MIN(pre.created_at) AS first_receipt_date,
          EXTRACT(DAY FROM MIN(pre.created_at) - po.submitted_at) AS lead_days
        FROM purchase_orders po
        JOIN po_receipt_events pre ON pre.purchase_order_id = po.id
        WHERE po.org_id = ${orgId}
          AND po.submitted_at >= NOW() - INTERVAL '6 months'
          AND po.status IN ('FULLY_RECEIVED', 'CLOSED_WITH_VARIANCE', 'PARTIALLY_RECEIVED')
        GROUP BY po.org_id, po.supplier_id, po.id, po.submitted_at
      ),
      agg AS (
        SELECT
          org_id,
          supplier_id,
          COUNT(*) AS po_count,
          ROUND(AVG(lead_days)::numeric, 1) AS avg_lead,
          MIN(lead_days)::integer AS min_lead,
          MAX(lead_days)::integer AS max_lead,
          MAX(submitted_at) AS last_po
        FROM po_lead
        GROUP BY org_id, supplier_id
      )
      INSERT INTO supplier_metrics (
        org_id, supplier_id, po_count_6m,
        avg_lead_time_days, min_lead_time_days, max_lead_time_days,
        reliability_pct, last_po_date, computed_at
      )
      SELECT
        a.org_id,
        a.supplier_id,
        a.po_count::integer,
        a.avg_lead,
        a.min_lead,
        a.max_lead,
        ROUND(
          COUNT(*) FILTER (WHERE pl.lead_days <= a.avg_lead + 2)::numeric * 100
            / NULLIF(a.po_count, 0),
          2
        ) AS reliability_pct,
        a.last_po,
        NOW()
      FROM agg a
      JOIN po_lead pl ON pl.supplier_id = a.supplier_id AND pl.org_id = a.org_id
      GROUP BY a.org_id, a.supplier_id, a.po_count, a.avg_lead, a.min_lead, a.max_lead, a.last_po
    `);

    const [countRow] = await tx.execute(
      sql`SELECT COUNT(*)::integer AS cnt FROM supplier_metrics WHERE org_id = ${orgId}`,
    );
    return (countRow as any).cnt as number;
  });

  return result;
}

// ── Stock Monitor Query Types ──

export interface StockMonitorQueryParams {
  orgId: string;
  search?: string;
  status?: string;
  brandId?: string;
  categoryId?: string;
  familyId?: string;
  sortBy?: string;
  sortDir?: string;
  cursor?: string;
  limit?: number;
}

export interface StockMonitorRow {
  id: string;
  productId: string;
  productName: string;
  productSku: string;
  brandName: string | null;
  categoryName: string | null;
  familyName: string | null;
  totalStock: number;
  avgDailySales30d: string;
  avgDailySales60d: string;
  avgDailySales90d: string;
  daysOfStock: string | null;
  stockoutDays90d: number;
  lastPoDate: string | null;
  lastPoSupplierName: string | null;
  lastLeadTimeDays: number | null;
  status: string;
  computedAt: string;
}

export interface StockMonitorSummary {
  critical: number;
  low: number;
  healthy: number;
  overstock: number;
  deadStock: number;
  outOfStock: number;
  total: number;
}

export interface StockMonitorPage {
  data: StockMonitorRow[];
  summary: StockMonitorSummary;
  nextCursor: string | null;
  hasMore: boolean;
}

// ── Sort helper ──

const SORT_COLUMNS: Record<string, any> = {
  status: stockMetrics.status,
  name: products.name,
  productName: products.name,
  totalStock: stockMetrics.totalStock,
  avgDailySales30d: stockMetrics.avgDailySales30d,
  daysOfStock: stockMetrics.daysOfStock,
  stockoutDays90d: stockMetrics.stockoutDays90d,
  lastPoDate: stockMetrics.lastPoDate,
  lastLeadTimeDays: stockMetrics.lastLeadTimeDays,
  brand: brands.name,
  brandName: brands.name,
  category: categories.name,
  categoryName: categories.name,
};

const STATUS_ORDER = sql`CASE ${stockMetrics.status}
  WHEN 'CRITICAL' THEN 1
  WHEN 'LOW' THEN 2
  WHEN 'HEALTHY' THEN 3
  WHEN 'OVERSTOCK' THEN 4
  WHEN 'DEAD_STOCK' THEN 5
  ELSE 6
END`;

// ── Summary query ──

async function queryStockMonitorSummary(orgId: string): Promise<StockMonitorSummary> {
  const statusRows = await db.execute(
    sql`SELECT status, COUNT(*)::integer AS count FROM stock_metrics WHERE org_id = ${orgId} GROUP BY status`,
  );

  const [oosRow] = await db.execute(
    sql`SELECT COUNT(*)::integer AS count FROM stock_metrics WHERE org_id = ${orgId} AND total_stock = 0 AND avg_daily_sales_90d::numeric > 0`,
  );

  const summary: StockMonitorSummary = {
    critical: 0,
    low: 0,
    healthy: 0,
    overstock: 0,
    deadStock: 0,
    outOfStock: (oosRow as any).count ?? 0,
    total: 0,
  };

  for (const row of statusRows as any[]) {
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

  return summary;
}

// ── Paginated stock monitor query ──

export async function queryStockMonitor(
  params: StockMonitorQueryParams,
): Promise<StockMonitorPage> {
  const limit = params.limit ?? 50;

  const conditions: SQL[] = [eq(stockMetrics.orgId, params.orgId)];

  if (params.search && params.search.length >= 2) {
    conditions.push(
      or(
        ilike(products.name, `%${params.search}%`),
        eq(products.sku, params.search),
      )!,
    );
  }

  if (params.status) {
    conditions.push(eq(stockMetrics.status, params.status as any));
  }

  if (params.brandId) {
    conditions.push(eq(products.brandId, params.brandId));
  }

  if (params.categoryId) {
    conditions.push(eq(products.categoryId, params.categoryId));
  }

  if (params.familyId) {
    conditions.push(eq(products.familyId, params.familyId));
  }

  if (params.cursor) {
    conditions.push(gt(stockMetrics.id, params.cursor));
  }

  // Determine sort
  let orderCols: SQL[];
  if (params.sortBy === "status" || !params.sortBy) {
    const dir = params.sortDir === "desc" ? desc : asc;
    orderCols = [
      dir(STATUS_ORDER),
      sql`${stockMetrics.daysOfStock} ASC NULLS LAST`,
    ];
  } else {
    const col = SORT_COLUMNS[params.sortBy] ?? products.name;
    const dir = params.sortDir === "desc" ? desc : asc;
    orderCols = [dir(col)];
  }

  const rows = await db
    .select({
      id: stockMetrics.id,
      productId: stockMetrics.productId,
      productName: products.name,
      productSku: products.sku,
      parentProductId: products.parentProductId,
      brandName: brands.name,
      categoryName: categories.name,
      familyName: productFamilies.name,
      totalStock: stockMetrics.totalStock,
      avgDailySales30d: stockMetrics.avgDailySales30d,
      avgDailySales60d: stockMetrics.avgDailySales60d,
      avgDailySales90d: stockMetrics.avgDailySales90d,
      daysOfStock: stockMetrics.daysOfStock,
      stockoutDays90d: stockMetrics.stockoutDays90d,
      lastPoDate: stockMetrics.lastPoDate,
      lastPoSupplierName: stockMetrics.lastPoSupplierName,
      lastLeadTimeDays: stockMetrics.lastLeadTimeDays,
      status: stockMetrics.status,
      computedAt: stockMetrics.computedAt,
    })
    .from(stockMetrics)
    .innerJoin(products, eq(stockMetrics.productId, products.id))
    .leftJoin(brands, eq(products.brandId, brands.id))
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .leftJoin(productFamilies, eq(products.familyId, productFamilies.id))
    .where(and(...conditions))
    .orderBy(...orderCols, asc(stockMetrics.id))
    .limit(limit + 1);

  // Batch-fetch parent names for variants
  const parentIds = [...new Set(rows.filter(r => r.parentProductId).map(r => r.parentProductId!))];
  const parentNameMap = new Map<string, string>();
  if (parentIds.length > 0) {
    const parentRows = await db
      .select({ id: products.id, name: products.name })
      .from(products)
      .where(inArray(products.id, parentIds));
    for (const p of parentRows) {
      parentNameMap.set(p.id, p.name);
    }
  }

  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? data[data.length - 1]!.id : null;

  const enriched: StockMonitorRow[] = data.map((r) => {
    // Build display name: "Parent Name (Variant)" for variants, plain name for standalone
    let displayName = r.productName;
    if (r.parentProductId) {
      const parentName = parentNameMap.get(r.parentProductId);
      if (parentName) {
        displayName = `${parentName} (${r.productName})`;
      }
    }
    return {
    id: r.id,
    productId: r.productId,
    productName: displayName,
    productSku: r.productSku,
    brandName: r.brandName,
    categoryName: r.categoryName,
    familyName: r.familyName,
    totalStock: r.totalStock,
    avgDailySales30d: r.avgDailySales30d,
    avgDailySales60d: r.avgDailySales60d,
    avgDailySales90d: r.avgDailySales90d,
    daysOfStock: r.daysOfStock,
    stockoutDays90d: r.stockoutDays90d,
    lastPoDate: r.lastPoDate ? r.lastPoDate.toISOString() : null,
    lastPoSupplierName: r.lastPoSupplierName,
    lastLeadTimeDays: r.lastLeadTimeDays,
    status: r.status,
    computedAt: r.computedAt.toISOString(),
  };
  });

  const summary = await queryStockMonitorSummary(params.orgId);

  return { data: enriched, summary, nextCursor, hasMore };
}

// ── CSV export (all matching rows, no pagination) ──

export async function exportStockMonitorCSV(
  params: Omit<StockMonitorQueryParams, "cursor" | "limit">,
): Promise<StockMonitorRow[]> {
  const conditions: SQL[] = [eq(stockMetrics.orgId, params.orgId)];

  if (params.search && params.search.length >= 2) {
    conditions.push(
      or(
        ilike(products.name, `%${params.search}%`),
        eq(products.sku, params.search),
      )!,
    );
  }

  if (params.status) {
    conditions.push(eq(stockMetrics.status, params.status as any));
  }

  if (params.brandId) {
    conditions.push(eq(products.brandId, params.brandId));
  }

  if (params.categoryId) {
    conditions.push(eq(products.categoryId, params.categoryId));
  }

  if (params.familyId) {
    conditions.push(eq(products.familyId, params.familyId));
  }

  // Sort
  let orderCols: SQL[];
  if (params.sortBy === "status" || !params.sortBy) {
    const dir = params.sortDir === "desc" ? desc : asc;
    orderCols = [
      dir(STATUS_ORDER),
      sql`${stockMetrics.daysOfStock} ASC NULLS LAST`,
    ];
  } else {
    const col = SORT_COLUMNS[params.sortBy] ?? products.name;
    const dir = params.sortDir === "desc" ? desc : asc;
    orderCols = [dir(col)];
  }

  const rows = await db
    .select({
      id: stockMetrics.id,
      productId: stockMetrics.productId,
      productName: products.name,
      productSku: products.sku,
      parentProductId: products.parentProductId,
      brandName: brands.name,
      categoryName: categories.name,
      familyName: productFamilies.name,
      totalStock: stockMetrics.totalStock,
      avgDailySales30d: stockMetrics.avgDailySales30d,
      avgDailySales60d: stockMetrics.avgDailySales60d,
      avgDailySales90d: stockMetrics.avgDailySales90d,
      daysOfStock: stockMetrics.daysOfStock,
      stockoutDays90d: stockMetrics.stockoutDays90d,
      lastPoDate: stockMetrics.lastPoDate,
      lastPoSupplierName: stockMetrics.lastPoSupplierName,
      lastLeadTimeDays: stockMetrics.lastLeadTimeDays,
      status: stockMetrics.status,
      computedAt: stockMetrics.computedAt,
    })
    .from(stockMetrics)
    .innerJoin(products, eq(stockMetrics.productId, products.id))
    .leftJoin(brands, eq(products.brandId, brands.id))
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .leftJoin(productFamilies, eq(products.familyId, productFamilies.id))
    .where(and(...conditions))
    .orderBy(...orderCols, asc(stockMetrics.id));

  // Batch-fetch parent names for variants
  const csvParentIds = [...new Set(rows.filter(r => r.parentProductId).map(r => r.parentProductId!))];
  const csvParentMap = new Map<string, string>();
  if (csvParentIds.length > 0) {
    const parents = await db.select({ id: products.id, name: products.name }).from(products).where(inArray(products.id, csvParentIds));
    for (const p of parents) csvParentMap.set(p.id, p.name);
  }

  return rows.map((r) => {
    let displayName = r.productName;
    if (r.parentProductId) {
      const parentName = csvParentMap.get(r.parentProductId);
      if (parentName) displayName = `${parentName} (${r.productName})`;
    }
    return {
    id: r.id,
    productId: r.productId,
    productName: displayName,
    productSku: r.productSku,
    brandName: r.brandName,
    categoryName: r.categoryName,
    familyName: r.familyName,
    totalStock: r.totalStock,
    avgDailySales30d: r.avgDailySales30d,
    avgDailySales60d: r.avgDailySales60d,
    avgDailySales90d: r.avgDailySales90d,
    daysOfStock: r.daysOfStock,
    stockoutDays90d: r.stockoutDays90d,
    lastPoDate: r.lastPoDate ? r.lastPoDate.toISOString() : null,
    lastPoSupplierName: r.lastPoSupplierName,
    lastLeadTimeDays: r.lastLeadTimeDays,
    status: r.status,
    computedAt: r.computedAt.toISOString(),
  };
  });
}

// ── Supplier Metrics Query ──

export interface SupplierMetricsQueryParams {
  orgId: string;
  search?: string;
  sortBy?: string;
  sortDir?: string;
  cursor?: string;
  limit?: number;
}

export interface SupplierMetricsRow {
  id: string;
  supplierId: string;
  supplierName: string;
  poCount6m: number;
  avgLeadTimeDays: string | null;
  minLeadTimeDays: number | null;
  maxLeadTimeDays: number | null;
  reliabilityPct: string | null;
  lastPoDate: string | null;
  computedAt: string;
}

const SUPPLIER_SORT_COLUMNS: Record<string, any> = {
  name: suppliers.name,
  poCount6m: supplierMetrics.poCount6m,
  avgLeadTimeDays: supplierMetrics.avgLeadTimeDays,
  reliabilityPct: supplierMetrics.reliabilityPct,
  lastPoDate: supplierMetrics.lastPoDate,
};

export async function querySupplierMetrics(
  params: SupplierMetricsQueryParams,
): Promise<{
  data: SupplierMetricsRow[];
  nextCursor: string | null;
  hasMore: boolean;
}> {
  const limit = params.limit ?? 50;

  const conditions: SQL[] = [eq(supplierMetrics.orgId, params.orgId)];

  if (params.search && params.search.length >= 2) {
    conditions.push(ilike(suppliers.name, `%${params.search}%`));
  }

  if (params.cursor) {
    conditions.push(gt(supplierMetrics.id, params.cursor));
  }

  const col = SUPPLIER_SORT_COLUMNS[params.sortBy ?? "name"] ?? suppliers.name;
  const dir = params.sortDir === "desc" ? desc : asc;

  const rows = await db
    .select({
      id: supplierMetrics.id,
      supplierId: supplierMetrics.supplierId,
      supplierName: suppliers.name,
      poCount6m: supplierMetrics.poCount6m,
      avgLeadTimeDays: supplierMetrics.avgLeadTimeDays,
      minLeadTimeDays: supplierMetrics.minLeadTimeDays,
      maxLeadTimeDays: supplierMetrics.maxLeadTimeDays,
      reliabilityPct: supplierMetrics.reliabilityPct,
      lastPoDate: supplierMetrics.lastPoDate,
      computedAt: supplierMetrics.computedAt,
    })
    .from(supplierMetrics)
    .innerJoin(suppliers, eq(supplierMetrics.supplierId, suppliers.id))
    .where(and(...conditions))
    .orderBy(dir(col), asc(supplierMetrics.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? data[data.length - 1]!.id : null;

  const enriched: SupplierMetricsRow[] = data.map((r) => ({
    id: r.id,
    supplierId: r.supplierId,
    supplierName: r.supplierName,
    poCount6m: r.poCount6m,
    avgLeadTimeDays: r.avgLeadTimeDays,
    minLeadTimeDays: r.minLeadTimeDays,
    maxLeadTimeDays: r.maxLeadTimeDays,
    reliabilityPct: r.reliabilityPct,
    lastPoDate: r.lastPoDate ? r.lastPoDate.toISOString() : null,
    computedAt: r.computedAt.toISOString(),
  }));

  return { data: enriched, nextCursor, hasMore };
}
