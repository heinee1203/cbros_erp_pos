import { db } from "@apex/database";
import {
  reorderSuggestions,
  reorderSettings,
  products,
  brands,
  categories,
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
  type SQL,
} from "drizzle-orm";
import {
  refreshStockMetrics,
  refreshSupplierMetrics,
} from "../stock-monitor/service";

// ── Z-scores for service levels ──

const Z_SCORES: Record<string, number> = {
  "0.90": 1.28,
  "0.95": 1.65,
  "0.98": 2.05,
  "0.99": 2.33,
};

// ── Settings ──

interface ReorderConfig {
  defaultServiceLevel: number;
  orderCycleDays: number;
  defaultLeadTimeDays: number;
  abcServiceLevels: { A: number; B: number; C: number };
}

export async function loadSettings(orgId: string): Promise<ReorderConfig> {
  const rows = await db
    .select({
      key: reorderSettings.settingKey,
      value: reorderSettings.settingValue,
    })
    .from(reorderSettings)
    .where(eq(reorderSettings.orgId, orgId));

  const map = new Map(rows.map((r) => [r.key, r.value]));

  return {
    defaultServiceLevel: parseFloat(
      map.get("default_service_level") ?? "0.95",
    ),
    orderCycleDays: parseInt(map.get("order_cycle_days") ?? "14", 10),
    defaultLeadTimeDays: parseInt(
      map.get("default_lead_time_days") ?? "7",
      10,
    ),
    abcServiceLevels: JSON.parse(
      map.get("abc_service_levels") ?? '{"A":0.98,"B":0.95,"C":0.90}',
    ),
  };
}

// ── Refresh: main computation engine ──

export async function refreshReorderSuggestions(
  orgId: string,
): Promise<number> {
  // 1. Check if Layer 1 stock_metrics is stale (> 1 hour), refresh if needed
  const staleRows = await db.execute(
    sql`SELECT computed_at FROM stock_metrics WHERE org_id = ${orgId} ORDER BY computed_at DESC LIMIT 1`,
  );
  const staleCheck = (staleRows as any[])[0];
  const computedAt = staleCheck?.computed_at;
  if (!computedAt || Date.now() - new Date(computedAt).getTime() > 3600000) {
    await refreshStockMetrics(orgId);
    await refreshSupplierMetrics(orgId);
  }

  const config = await loadSettings(orgId);

  // Resolve Z-scores per ABC class
  const zA = Z_SCORES[String(config.abcServiceLevels.A)] ?? 1.65;
  const zB = Z_SCORES[String(config.abcServiceLevels.B)] ?? 1.65;
  const zC = Z_SCORES[String(config.abcServiceLevels.C)] ?? 1.28;

  const result = await db.transaction(async (tx) => {
    // Delete old PENDING suggestions (preserve ORDERED/DISMISSED)
    await tx.execute(
      sql`DELETE FROM reorder_suggestions WHERE org_id = ${orgId} AND status = 'PENDING'`,
    );

    // Main computation: ABC + demand std dev + pending inbound + ROP + SOQ
    await tx.execute(sql`
      WITH date_series AS (
        SELECT d::date AS sale_date
        FROM generate_series(NOW() - INTERVAL '30 days', NOW(), '1 day') AS d
      ),
      -- ABC classification from 90-day revenue
      revenue AS (
        SELECT
          sl.product_id,
          SUM(sl.line_total)::numeric AS total_rev
        FROM sale_lines sl
        JOIN sales s ON sl.sale_id = s.id
        WHERE s.org_id = ${orgId}
          AND s.status = 'COMPLETED'
          AND s.created_at >= NOW() - INTERVAL '90 days'
        GROUP BY sl.product_id
      ),
      ranked_rev AS (
        SELECT
          product_id,
          total_rev,
          SUM(total_rev) OVER (ORDER BY total_rev DESC) AS cumulative_rev,
          SUM(total_rev) OVER () AS grand_total
        FROM revenue
      ),
      abc AS (
        SELECT
          product_id,
          CASE
            WHEN grand_total > 0 AND cumulative_rev <= grand_total * 0.20 THEN 'A'
            WHEN grand_total > 0 AND cumulative_rev <= grand_total * 0.50 THEN 'B'
            ELSE 'C'
          END AS abc_class
        FROM ranked_rev
      ),
      -- Demand std dev: cross join products x dates, left join actual daily sales
      daily_sales AS (
        SELECT
          sl.product_id,
          s.created_at::date AS sale_date,
          SUM(sl.quantity) AS daily_qty
        FROM sale_lines sl
        JOIN sales s ON sl.sale_id = s.id
        WHERE s.org_id = ${orgId}
          AND s.status = 'COMPLETED'
          AND s.created_at >= NOW() - INTERVAL '30 days'
        GROUP BY sl.product_id, s.created_at::date
      ),
      product_dates AS (
        SELECT p.id AS product_id, ds.sale_date
        FROM products p
        CROSS JOIN date_series ds
        WHERE p.org_id = ${orgId} AND p.is_active = true AND p.reorder_enabled = true
      ),
      filled_daily AS (
        SELECT
          pd.product_id,
          pd.sale_date,
          COALESCE(d.daily_qty, 0) AS qty
        FROM product_dates pd
        LEFT JOIN daily_sales d ON pd.product_id = d.product_id AND pd.sale_date = d.sale_date
      ),
      demand_stats AS (
        SELECT
          product_id,
          COALESCE(STDDEV_POP(qty), 0) AS std_dev
        FROM filled_daily
        GROUP BY product_id
      ),
      -- Pending inbound from open POs
      pending AS (
        SELECT
          pl.product_id,
          SUM(pl.ordered_qty - COALESCE(pl.received_accepted_qty, 0))::integer AS pending_qty
        FROM po_lines pl
        JOIN purchase_orders po ON pl.purchase_order_id = po.id
        WHERE po.org_id = ${orgId}
          AND po.status IN ('SUBMITTED', 'PARTIALLY_RECEIVED')
        GROUP BY pl.product_id
      ),
      -- Supplier resolution: primary_supplier_id or most recent PO supplier
      last_po_supplier AS (
        SELECT DISTINCT ON (pl.product_id)
          pl.product_id,
          po.supplier_id,
          sup.name AS supplier_name
        FROM po_lines pl
        JOIN purchase_orders po ON pl.purchase_order_id = po.id
        JOIN suppliers sup ON po.supplier_id = sup.id
        WHERE po.org_id = ${orgId}
        ORDER BY pl.product_id, po.created_at DESC
      ),
      -- Combine everything
      computed AS (
        SELECT
          p.id AS product_id,
          p.sku,
          p.name AS product_name,
          COALESCE(p.primary_supplier_id, lps.supplier_id) AS supplier_id,
          COALESCE(psup.name, lps.supplier_name) AS supplier_name,
          sm.total_stock AS current_stock,
          COALESCE(pnd.pending_qty, 0) AS pending_inbound,
          COALESCE(sm.avg_daily_sales_30d::numeric, 0) AS avg_daily_demand,
          COALESCE(ds.std_dev, 0) AS demand_std_dev,
          COALESCE(
            supm.avg_lead_time_days::numeric,
            ${config.defaultLeadTimeDays}
          ) AS avg_lead_time,
          COALESCE(abc.abc_class, 'C') AS abc_class,
          p.custom_reorder_point
        FROM products p
        JOIN stock_metrics sm ON p.id = sm.product_id AND sm.org_id = ${orgId}
        LEFT JOIN demand_stats ds ON p.id = ds.product_id
        LEFT JOIN pending pnd ON p.id = pnd.product_id
        LEFT JOIN abc ON p.id = abc.product_id
        LEFT JOIN last_po_supplier lps ON p.id = lps.product_id
        LEFT JOIN suppliers psup ON p.primary_supplier_id = psup.id
        LEFT JOIN supplier_metrics supm ON (
          supm.supplier_id = COALESCE(p.primary_supplier_id, lps.supplier_id)
          AND supm.org_id = ${orgId}
        )
        WHERE p.org_id = ${orgId}
          AND p.is_active = true
          AND p.reorder_enabled = true
          AND p.track_inventory = true
          AND NOT EXISTS (
            SELECT 1 FROM product_families pf
            WHERE pf.id = p.family_id AND pf.slug = 'non-items'
          )
          AND NOT EXISTS (
            SELECT 1 FROM categories exc_cat
            WHERE exc_cat.id = p.category_id
              AND exc_cat.name IN ('Count', 'Price Add', 'Labor', 'Payment')
          )
      ),
      with_rop AS (
        SELECT
          c.*,
          -- Service level Z-score by ABC class
          CASE c.abc_class
            WHEN 'A' THEN ${zA}
            WHEN 'B' THEN ${zB}
            ELSE ${zC}
          END AS z_score,
          -- Safety stock = Z * sigma * sqrt(lead_time)
          CASE c.abc_class
            WHEN 'A' THEN ${zA}
            WHEN 'B' THEN ${zB}
            ELSE ${zC}
          END * c.demand_std_dev * SQRT(c.avg_lead_time) AS safety_stock,
          -- ROP = (demand * lead_time) + safety_stock
          CASE
            WHEN c.custom_reorder_point IS NOT NULL THEN c.custom_reorder_point::numeric
            ELSE (c.avg_daily_demand * c.avg_lead_time) +
              (CASE c.abc_class
                WHEN 'A' THEN ${zA}
                WHEN 'B' THEN ${zB}
                ELSE ${zC}
              END * c.demand_std_dev * SQRT(c.avg_lead_time))
          END AS rop,
          -- Target stock = ROP + (demand * order_cycle_days)
          CASE
            WHEN c.custom_reorder_point IS NOT NULL THEN c.custom_reorder_point + (c.avg_daily_demand * ${config.orderCycleDays})
            ELSE (c.avg_daily_demand * c.avg_lead_time) +
              (CASE c.abc_class
                WHEN 'A' THEN ${zA}
                WHEN 'B' THEN ${zB}
                ELSE ${zC}
              END * c.demand_std_dev * SQRT(c.avg_lead_time))
              + (c.avg_daily_demand * ${config.orderCycleDays})
          END AS target_stock
        FROM computed c
      ),
      final AS (
        SELECT
          r.*,
          -- SOQ = target - current - pending_inbound (min 1)
          GREATEST(CEIL(r.target_stock - r.current_stock - r.pending_inbound), 1)::integer AS suggested_qty,
          -- Priority
          CASE
            WHEN r.current_stock = 0 AND r.avg_daily_demand > 0 THEN 'CRITICAL'
            WHEN r.current_stock <= r.rop AND r.avg_daily_demand > 0
              AND (r.current_stock::numeric / NULLIF(r.avg_daily_demand, 0)) <= 7 THEN 'URGENT'
            WHEN r.current_stock <= r.rop THEN 'NORMAL'
          END AS priority
        FROM with_rop r
        WHERE r.current_stock <= r.rop
          AND r.avg_daily_demand > 0
      )
      INSERT INTO reorder_suggestions (
        org_id, product_id, sku, product_name, supplier_id, supplier_name,
        current_stock, pending_inbound, avg_daily_demand, demand_std_dev,
        avg_lead_time, service_level_z, safety_stock, reorder_point,
        suggested_qty, target_stock, abc_class, priority, status, computed_at
      )
      SELECT
        ${orgId}, f.product_id, f.sku, f.product_name, f.supplier_id, f.supplier_name,
        f.current_stock, f.pending_inbound, f.avg_daily_demand, f.demand_std_dev,
        f.avg_lead_time, f.z_score, ROUND(f.safety_stock, 1), ROUND(f.rop, 1),
        f.suggested_qty, CEIL(f.target_stock)::integer, f.abc_class,
        f.priority::reorder_priority, 'PENDING', NOW()
      FROM final f
      WHERE f.priority IS NOT NULL
    `);

    // ── Backorder Integration ──
    // 1. Boost suggestions that have pending backorders: increase qty + add note
    await tx.execute(sql`
      UPDATE reorder_suggestions rs
      SET
        suggested_qty = rs.suggested_qty + bo.backorder_qty,
        notes = COALESCE(rs.notes || E'\n', '') ||
          'Includes backorder of ' || bo.backorder_qty || ' units from ' || bo.po_numbers
      FROM (
        SELECT
          b.product_id,
          SUM(b.quantity)::integer AS backorder_qty,
          STRING_AGG(DISTINCT b.original_po_number, ', ') AS po_numbers
        FROM backorders b
        WHERE b.org_id = ${orgId} AND b.status = 'PENDING'
        GROUP BY b.product_id
      ) bo
      WHERE rs.org_id = ${orgId}
        AND rs.status = 'PENDING'
        AND rs.product_id = bo.product_id
    `);

    // 2. Create URGENT suggestions for backordered products NOT already in suggestions
    await tx.execute(sql`
      INSERT INTO reorder_suggestions (
        org_id, product_id, sku, product_name, supplier_id, supplier_name,
        current_stock, pending_inbound, avg_daily_demand, demand_std_dev,
        avg_lead_time, service_level_z, safety_stock, reorder_point,
        suggested_qty, target_stock, abc_class, priority, status, notes, computed_at
      )
      SELECT
        ${orgId},
        p.id,
        p.sku,
        p.name,
        b.supplier_id,
        s.name,
        COALESCE(sm.total_stock, 0),
        0,
        COALESCE(sm.avg_daily_sales_30d, 0),
        0,
        ${config.defaultLeadTimeDays},
        1.65,
        0,
        0,
        b.total_qty,
        b.total_qty,
        'C',
        'URGENT'::reorder_priority,
        'PENDING',
        'Backorder — ' || b.total_qty || ' units unfulfilled from ' || b.po_numbers || ' on ' || TO_CHAR(b.oldest_date, 'Mon DD'),
        NOW()
      FROM (
        SELECT
          bo.product_id,
          bo.supplier_id,
          SUM(bo.quantity)::integer AS total_qty,
          STRING_AGG(DISTINCT bo.original_po_number, ', ') AS po_numbers,
          MIN(bo.created_at) AS oldest_date
        FROM backorders bo
        WHERE bo.org_id = ${orgId} AND bo.status = 'PENDING'
        GROUP BY bo.product_id, bo.supplier_id
      ) b
      JOIN products p ON p.id = b.product_id
      JOIN suppliers s ON s.id = b.supplier_id
      LEFT JOIN stock_metrics sm ON sm.product_id = b.product_id AND sm.org_id = ${orgId}
      WHERE NOT EXISTS (
        SELECT 1 FROM reorder_suggestions rs
        WHERE rs.org_id = ${orgId} AND rs.status = 'PENDING' AND rs.product_id = b.product_id
      )
    `);

    // 3. Auto-escalate aging backorders (>14 days → HIGH)
    await tx.execute(sql`
      UPDATE backorders
      SET priority = 'HIGH', updated_at = NOW()
      WHERE org_id = ${orgId}
        AND status = 'PENDING'
        AND priority != 'HIGH'
        AND created_at < NOW() - INTERVAL '14 days'
    `);

    const countRows = await tx.execute(
      sql`SELECT COUNT(*)::integer AS cnt FROM reorder_suggestions WHERE org_id = ${orgId} AND status = 'PENDING'`,
    );
    return ((countRows as any[])[0] as any).cnt as number;
  });

  return result;
}

// ── Counts for sidebar badge ──

export async function getReorderCounts(orgId: string) {
  const rows = await db.execute(
    sql`SELECT priority, COUNT(*)::integer AS count
        FROM reorder_suggestions
        WHERE org_id = ${orgId} AND status = 'PENDING'
        GROUP BY priority`,
  );
  let critical = 0,
    urgent = 0,
    normal = 0;
  for (const row of rows as any[]) {
    if (row.priority === "CRITICAL") critical = row.count;
    if (row.priority === "URGENT") urgent = row.count;
    if (row.priority === "NORMAL") normal = row.count;
  }
  return { critical, urgent, normal, total: critical + urgent + normal };
}

// ── Query types ──

export interface ReorderQueryParams {
  orgId: string;
  search?: string;
  priority?: string;
  supplierId?: string;
  brandId?: string;
  categoryId?: string;
  sortBy?: string;
  sortDir?: string;
  cursor?: string;
  limit?: number;
}

export interface ReorderRow {
  id: string;
  productId: string;
  sku: string;
  productName: string;
  supplierId: string | null;
  supplierName: string | null;
  brandName: string | null;
  categoryName: string | null;
  currentStock: number;
  pendingInbound: number;
  avgDailyDemand: string;
  demandStdDev: string;
  avgLeadTime: string;
  serviceLevelZ: string;
  safetyStock: string;
  reorderPoint: string;
  suggestedQty: number;
  targetStock: number;
  abcClass: string;
  priority: string;
  status: string;
  notes: string | null;
  computedAt: string;
}

export interface ReorderSummary {
  critical: number;
  urgent: number;
  normal: number;
  totalValue: string;
}

export interface ReorderPage {
  data: ReorderRow[];
  nextCursor: string | null;
  hasMore: boolean;
}

// ── Sort helper ──

const PRIORITY_ORDER = sql`CASE priority
  WHEN 'CRITICAL' THEN 1
  WHEN 'URGENT' THEN 2
  WHEN 'NORMAL' THEN 3
  ELSE 4
END`;

const SORT_COLUMNS: Record<string, any> = {
  priority: PRIORITY_ORDER,
  productName: products.name,
  sku: reorderSuggestions.sku,
  currentStock: reorderSuggestions.currentStock,
  avgDailyDemand: reorderSuggestions.avgDailyDemand,
  reorderPoint: reorderSuggestions.reorderPoint,
  suggestedQty: reorderSuggestions.suggestedQty,
  abcClass: reorderSuggestions.abcClass,
  supplierName: reorderSuggestions.supplierName,
};

// ── Summary query ──

export async function queryReorderSummary(
  orgId: string,
): Promise<ReorderSummary> {
  const statusRows = await db.execute(
    sql`SELECT priority, COUNT(*)::integer AS count
        FROM reorder_suggestions
        WHERE org_id = ${orgId} AND status = 'PENDING'
        GROUP BY priority`,
  );

  const [valueRow] = await db.execute(
    sql`SELECT COALESCE(SUM(rs.suggested_qty * p.cost_price::numeric), 0)::text AS total_value
        FROM reorder_suggestions rs
        JOIN products p ON rs.product_id = p.id
        WHERE rs.org_id = ${orgId} AND rs.status = 'PENDING'`,
  );

  const summary: ReorderSummary = {
    critical: 0,
    urgent: 0,
    normal: 0,
    totalValue: (valueRow as any)?.total_value ?? "0",
  };

  for (const row of statusRows as any[]) {
    const count = row.count as number;
    switch (row.priority) {
      case "CRITICAL":
        summary.critical = count;
        break;
      case "URGENT":
        summary.urgent = count;
        break;
      case "NORMAL":
        summary.normal = count;
        break;
    }
  }

  return summary;
}

// ── Paginated query ──

export async function queryReorderSuggestions(
  params: ReorderQueryParams,
): Promise<ReorderPage> {
  const limit = params.limit ?? 50;

  const conditions: SQL[] = [
    eq(reorderSuggestions.orgId, params.orgId),
    eq(reorderSuggestions.status, "PENDING"),
  ];

  if (params.search && params.search.length >= 2) {
    conditions.push(
      or(
        ilike(products.name, `%${params.search}%`),
        eq(products.sku, params.search),
      )!,
    );
  }

  if (params.priority) {
    conditions.push(
      eq(reorderSuggestions.priority, params.priority as any),
    );
  }

  if (params.supplierId) {
    conditions.push(eq(reorderSuggestions.supplierId, params.supplierId));
  }

  if (params.brandId) {
    conditions.push(eq(products.brandId, params.brandId));
  }

  if (params.categoryId) {
    conditions.push(eq(products.categoryId, params.categoryId));
  }

  if (params.cursor) {
    conditions.push(gt(reorderSuggestions.id, params.cursor));
  }

  // Determine sort
  let orderCols: SQL[];
  if (params.sortBy === "priority" || !params.sortBy) {
    const dir = params.sortDir === "desc" ? desc : asc;
    orderCols = [
      dir(PRIORITY_ORDER),
      desc(reorderSuggestions.reorderPoint),
    ];
  } else {
    const col =
      SORT_COLUMNS[params.sortBy] ?? reorderSuggestions.reorderPoint;
    const dir = params.sortDir === "desc" ? desc : asc;
    orderCols = [dir(col)];
  }

  const rows = await db
    .select({
      id: reorderSuggestions.id,
      productId: reorderSuggestions.productId,
      sku: reorderSuggestions.sku,
      productName: reorderSuggestions.productName,
      supplierId: reorderSuggestions.supplierId,
      supplierName: reorderSuggestions.supplierName,
      brandName: brands.name,
      categoryName: categories.name,
      currentStock: reorderSuggestions.currentStock,
      pendingInbound: reorderSuggestions.pendingInbound,
      avgDailyDemand: reorderSuggestions.avgDailyDemand,
      demandStdDev: reorderSuggestions.demandStdDev,
      avgLeadTime: reorderSuggestions.avgLeadTime,
      serviceLevelZ: reorderSuggestions.serviceLevelZ,
      safetyStock: reorderSuggestions.safetyStock,
      reorderPoint: reorderSuggestions.reorderPoint,
      suggestedQty: reorderSuggestions.suggestedQty,
      targetStock: reorderSuggestions.targetStock,
      abcClass: reorderSuggestions.abcClass,
      priority: reorderSuggestions.priority,
      status: reorderSuggestions.status,
      notes: reorderSuggestions.notes,
      computedAt: reorderSuggestions.computedAt,
    })
    .from(reorderSuggestions)
    .innerJoin(products, eq(reorderSuggestions.productId, products.id))
    .leftJoin(brands, eq(products.brandId, brands.id))
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .where(and(...conditions))
    .orderBy(...orderCols, asc(reorderSuggestions.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? data[data.length - 1]!.id : null;

  const enriched: ReorderRow[] = data.map((r) => ({
    id: r.id,
    productId: r.productId,
    sku: r.sku,
    productName: r.productName,
    supplierId: r.supplierId,
    supplierName: r.supplierName,
    brandName: r.brandName,
    categoryName: r.categoryName,
    currentStock: r.currentStock,
    pendingInbound: r.pendingInbound,
    avgDailyDemand: r.avgDailyDemand,
    demandStdDev: r.demandStdDev,
    avgLeadTime: r.avgLeadTime,
    serviceLevelZ: r.serviceLevelZ,
    safetyStock: r.safetyStock,
    reorderPoint: r.reorderPoint,
    suggestedQty: r.suggestedQty,
    targetStock: r.targetStock,
    abcClass: r.abcClass,
    priority: r.priority,
    status: r.status,
    notes: r.notes,
    computedAt: r.computedAt.toISOString(),
  }));

  return { data: enriched, nextCursor, hasMore };
}

// ── CSV export (all matching rows, no pagination) ──

export async function exportReorderCSV(
  params: Omit<ReorderQueryParams, "cursor" | "limit">,
): Promise<ReorderRow[]> {
  const conditions: SQL[] = [
    eq(reorderSuggestions.orgId, params.orgId),
    eq(reorderSuggestions.status, "PENDING"),
  ];

  if (params.search && params.search.length >= 2) {
    conditions.push(
      or(
        ilike(products.name, `%${params.search}%`),
        eq(products.sku, params.search),
      )!,
    );
  }

  if (params.priority) {
    conditions.push(
      eq(reorderSuggestions.priority, params.priority as any),
    );
  }

  if (params.supplierId) {
    conditions.push(eq(reorderSuggestions.supplierId, params.supplierId));
  }

  if (params.brandId) {
    conditions.push(eq(products.brandId, params.brandId));
  }

  if (params.categoryId) {
    conditions.push(eq(products.categoryId, params.categoryId));
  }

  // Sort
  let orderCols: SQL[];
  if (params.sortBy === "priority" || !params.sortBy) {
    const dir = params.sortDir === "desc" ? desc : asc;
    orderCols = [
      dir(PRIORITY_ORDER),
      desc(reorderSuggestions.reorderPoint),
    ];
  } else {
    const col =
      SORT_COLUMNS[params.sortBy] ?? reorderSuggestions.reorderPoint;
    const dir = params.sortDir === "desc" ? desc : asc;
    orderCols = [dir(col)];
  }

  const rows = await db
    .select({
      id: reorderSuggestions.id,
      productId: reorderSuggestions.productId,
      sku: reorderSuggestions.sku,
      productName: reorderSuggestions.productName,
      supplierId: reorderSuggestions.supplierId,
      supplierName: reorderSuggestions.supplierName,
      brandName: brands.name,
      categoryName: categories.name,
      currentStock: reorderSuggestions.currentStock,
      pendingInbound: reorderSuggestions.pendingInbound,
      avgDailyDemand: reorderSuggestions.avgDailyDemand,
      demandStdDev: reorderSuggestions.demandStdDev,
      avgLeadTime: reorderSuggestions.avgLeadTime,
      serviceLevelZ: reorderSuggestions.serviceLevelZ,
      safetyStock: reorderSuggestions.safetyStock,
      reorderPoint: reorderSuggestions.reorderPoint,
      suggestedQty: reorderSuggestions.suggestedQty,
      targetStock: reorderSuggestions.targetStock,
      abcClass: reorderSuggestions.abcClass,
      priority: reorderSuggestions.priority,
      status: reorderSuggestions.status,
      notes: reorderSuggestions.notes,
      computedAt: reorderSuggestions.computedAt,
    })
    .from(reorderSuggestions)
    .innerJoin(products, eq(reorderSuggestions.productId, products.id))
    .leftJoin(brands, eq(products.brandId, brands.id))
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .where(and(...conditions))
    .orderBy(...orderCols, asc(reorderSuggestions.id));

  return rows.map((r) => ({
    id: r.id,
    productId: r.productId,
    sku: r.sku,
    productName: r.productName,
    supplierId: r.supplierId,
    supplierName: r.supplierName,
    brandName: r.brandName,
    categoryName: r.categoryName,
    currentStock: r.currentStock,
    pendingInbound: r.pendingInbound,
    avgDailyDemand: r.avgDailyDemand,
    demandStdDev: r.demandStdDev,
    avgLeadTime: r.avgLeadTime,
    serviceLevelZ: r.serviceLevelZ,
    safetyStock: r.safetyStock,
    reorderPoint: r.reorderPoint,
    suggestedQty: r.suggestedQty,
    targetStock: r.targetStock,
    abcClass: r.abcClass,
    priority: r.priority,
    status: r.status,
    notes: r.notes,
    computedAt: r.computedAt.toISOString(),
  }));
}
