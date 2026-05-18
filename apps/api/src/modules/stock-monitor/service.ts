import { db } from "@apex/database";
import {
  stockMetrics,
  supplierMetrics,
  products,
  brands,
  categories,
  productFamilies,
  productSubcategories,
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
import {
  buildStockMonitorSummary,
  mapStockMonitorMetricRow,
  type StockMonitorParentInfo,
} from "./stock-monitor-helpers";

/**
 * Recompute stock_metrics for every active product in the org.
 * Runs DELETE + INSERT inside a transaction so readers never see empty data.
 * Returns the number of product rows inserted.
 */
export async function refreshStockMetrics(orgId: string): Promise<number> {
  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`DELETE FROM stock_metrics WHERE org_id = ${orgId}`);

    const inserted = await tx.execute(sql`
      WITH all_sales AS (
        -- Live Apex sales
        SELECT sl.product_id, sl.quantity AS qty, s.created_at AS sale_date
        FROM sale_lines sl
        JOIN sales s ON sl.sale_id = s.id
        WHERE s.org_id = ${orgId}
          AND s.status = 'COMPLETED'

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
      ),
      velocity AS (
        SELECT
          product_id,
          -- Window velocities (daily rates)
          COALESCE(SUM(CASE WHEN sale_date >= NOW() - INTERVAL '30 days' THEN qty ELSE 0 END)::numeric / 30, 0) AS avg_30d,
          COALESCE(SUM(CASE WHEN sale_date >= NOW() - INTERVAL '60 days' THEN qty ELSE 0 END)::numeric / 60, 0) AS avg_60d,
          COALESCE(SUM(CASE WHEN sale_date >= NOW() - INTERVAL '90 days' THEN qty ELSE 0 END)::numeric / 90, 0) AS avg_90d,
          COALESCE(SUM(CASE WHEN sale_date >= NOW() - INTERVAL '180 days' THEN qty ELSE 0 END)::numeric / 180, 0) AS avg_180d,
          COALESCE(SUM(CASE WHEN sale_date >= NOW() - INTERVAL '365 days' THEN qty ELSE 0 END)::numeric / 365, 0) AS avg_365d,
          COALESCE(SUM(qty)::numeric / GREATEST(EXTRACT(DAY FROM NOW() - MIN(sale_date)), 1), 0) AS avg_all,
          -- Trend: recent 3mo vs prior 3mo
          COALESCE(SUM(CASE WHEN sale_date >= NOW() - INTERVAL '90 days' THEN qty ELSE 0 END)::numeric / 90, 0) AS trend_recent,
          COALESCE(SUM(CASE WHEN sale_date >= NOW() - INTERVAL '180 days' AND sale_date < NOW() - INTERVAL '90 days' THEN qty ELSE 0 END)::numeric / 90, 0) AS trend_prior,
          -- Multi-window sales totals (units sold)
          COALESCE(SUM(CASE WHEN sale_date >= NOW() - INTERVAL '365 days' THEN qty ELSE 0 END), 0)::integer AS sold_12m,
          COALESCE(SUM(CASE WHEN sale_date >= NOW() - INTERVAL '182 days' THEN qty ELSE 0 END), 0)::integer AS sold_6m,
          COALESCE(SUM(CASE WHEN sale_date >= NOW() - INTERVAL '91 days' THEN qty ELSE 0 END), 0)::integer AS sold_3m,
          COALESCE(SUM(CASE WHEN sale_date >= NOW() - INTERVAL '30 days' THEN qty ELSE 0 END), 0)::integer AS sold_1m,
          -- Monthly averages
          ROUND(COALESCE(SUM(CASE WHEN sale_date >= NOW() - INTERVAL '365 days' THEN qty ELSE 0 END)::numeric / 12, 0), 2) AS avg_month_12m,
          ROUND(COALESCE(SUM(CASE WHEN sale_date >= NOW() - INTERVAL '182 days' THEN qty ELSE 0 END)::numeric / 6, 0), 2) AS avg_month_6m,
          ROUND(COALESCE(SUM(CASE WHEN sale_date >= NOW() - INTERVAL '91 days' THEN qty ELSE 0 END)::numeric / 3, 0), 2) AS avg_month_3m,
          COALESCE(SUM(CASE WHEN sale_date >= NOW() - INTERVAL '30 days' THEN qty ELSE 0 END), 0)::numeric AS avg_month_1m
        FROM all_sales
        GROUP BY product_id
      ),
      avg_price AS (
        SELECT product_id,
          CASE WHEN SUM(quantity) > 0
            THEN ROUND(SUM(CAST(COALESCE(net_sales, '0') AS numeric)) / SUM(quantity), 2)
            ELSE NULL
          END AS avg_selling_price
        FROM historical_sales
        WHERE org_id = ${orgId}
          AND reason_type = 'SALE'
          AND product_id IS NOT NULL
          AND CAST(COALESCE(net_sales, '0') AS numeric) > 0
          AND movement_date >= NOW() - INTERVAL '365 days'
        GROUP BY product_id
      ),
      stock AS (
        SELECT i.product_id, SUM(i.stock_level) AS total_stock
        FROM inventory i
        INNER JOIN locations loc ON loc.id = i.location_id AND loc.is_active = true
        WHERE i.org_id = ${orgId}
        GROUP BY i.product_id
      ),
      stockouts AS (
        SELECT product_id, COUNT(DISTINCT DATE(effective_at)) AS stockout_days
        FROM stock_journal
        WHERE org_id = ${orgId}
          AND reference_type = 'SALE'
          AND balance_after = 0
          AND effective_at >= NOW() - INTERVAL '365 days'
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
      ),
      last_sale AS (
        SELECT DISTINCT ON (combined.product_id)
          combined.product_id,
          combined.sale_date AS last_sale_date
        FROM (
          SELECT sl.product_id, s.created_at AS sale_date
          FROM sale_lines sl
          JOIN sales s ON sl.sale_id = s.id
          WHERE s.org_id = ${orgId} AND s.status = 'COMPLETED'
          UNION ALL
          SELECT hs.product_id, hs.movement_date AS sale_date
          FROM historical_sales hs
          WHERE hs.org_id = ${orgId} AND hs.reason_type = 'SALE' AND hs.product_id IS NOT NULL
        ) combined
        ORDER BY combined.product_id, combined.sale_date DESC
      ),
      demand_freq AS (
        SELECT
          product_id,
          COUNT(DISTINCT DATE(sale_date)) FILTER (WHERE sale_date >= NOW() - INTERVAL '180 days')::integer AS sale_days_count,
          SUM(qty)::integer AS total_qty_sold
        FROM all_sales
        GROUP BY product_id
      ),
      stock_age AS (
        -- Age from PO receipts (primary) or historical sales (fallback)
        SELECT product_id,
          GREATEST(0, EXTRACT(MONTH FROM AGE(NOW(), MIN(first_date))))::integer AS age_months
        FROM (
          SELECT product_id, MIN(created_at) AS first_date
          FROM po_receipt_events WHERE org_id = ${orgId} GROUP BY product_id
          UNION ALL
          SELECT product_id, MIN(movement_date) AS first_date
          FROM historical_sales WHERE org_id = ${orgId} AND product_id IS NOT NULL GROUP BY product_id
        ) sources
        GROUP BY product_id
      )
      INSERT INTO stock_metrics (
        org_id, product_id, total_stock,
        avg_daily_sales_30d, avg_daily_sales_60d, avg_daily_sales_90d,
        avg_daily_sales_180d, avg_daily_sales_365d, avg_daily_sales_all,
        trend, trend_recent, trend_prior,
        days_of_stock, stockout_days_90d,
        last_po_date, last_po_supplier_name, last_lead_time_days,
        last_sale_date,
        sale_days_count, total_qty_sold, days_since_last_sale,
        velocity_class,
        sold_12m, sold_6m, sold_3m, sold_1m,
        avg_month_12m, avg_month_6m, avg_month_3m, avg_month_1m,
        months_left_12m, months_left_6m, months_left_3m, months_left_1m,
        velocity_trend,
        avg_selling_price,
        stock_age_months,
        suggested_sell_price,
        applied_markup_pct,
        inflation_adjusted_cost,
        cost_price,
        status, computed_at
      )
      SELECT
        p.org_id,
        p.id AS product_id,
        COALESCE(st.total_stock, 0)::integer AS total_stock,
        COALESCE(v.avg_30d, 0),
        COALESCE(v.avg_60d, 0),
        COALESCE(v.avg_90d, 0),
        COALESCE(v.avg_180d, 0),
        COALESCE(v.avg_365d, 0),
        COALESCE(v.avg_all, 0),
        -- Trend classification
        CASE
          WHEN COALESCE(v.trend_prior, 0) < 0.01 AND COALESCE(v.trend_recent, 0) >= 0.01 THEN 'up'
          WHEN COALESCE(v.trend_prior, 0) < 0.01 AND COALESCE(v.trend_recent, 0) < 0.01 THEN 'stable'
          WHEN COALESCE(v.trend_recent, 0) / GREATEST(v.trend_prior, 0.001) >= 1.2 THEN 'up'
          WHEN COALESCE(v.trend_recent, 0) / GREATEST(v.trend_prior, 0.001) <= 0.8 THEN 'down'
          ELSE 'stable'
        END,
        COALESCE(v.trend_recent, 0),
        COALESCE(v.trend_prior, 0),
        CASE
          WHEN COALESCE(v.avg_30d, 0) > 0
            THEN ROUND(COALESCE(st.total_stock, 0)::numeric / v.avg_30d, 1)
          ELSE NULL
        END AS days_of_stock,
        COALESCE(so.stockout_days, 0)::integer,
        lp.last_receipt_date,
        lp.supplier_name,
        lp.lead_time_days,
        ls.last_sale_date,
        -- Demand frequency metrics
        COALESCE(df.sale_days_count, 0)::integer,
        COALESCE(df.total_qty_sold, 0)::integer,
        CASE WHEN ls.last_sale_date IS NOT NULL
          THEN EXTRACT(DAY FROM NOW() - ls.last_sale_date)::integer
          ELSE NULL
        END AS days_since_last_sale,
        -- Velocity classification (evaluated in priority order)
        CASE
          -- NEW_ITEM: no stock and no sales ever
          WHEN COALESCE(st.total_stock, 0) = 0 AND COALESCE(df.total_qty_sold, 0) = 0 AND ls.last_sale_date IS NULL THEN 'NEW_ITEM'
          -- DEAD_STOCK: no sale for 365+ days
          WHEN ls.last_sale_date IS NOT NULL AND EXTRACT(DAY FROM NOW() - ls.last_sale_date) >= 365 THEN 'DEAD_STOCK'
          -- DEAD_STOCK: has stock but no sales in lookback
          WHEN COALESCE(v.avg_180d, 0) < 0.01 AND COALESCE(st.total_stock, 0) > 0 THEN 'DEAD_STOCK'
          -- Frequent demand (sale_days >= 6 in 180d lookback)
          WHEN COALESCE(df.sale_days_count, 0) >= 6 THEN
            CASE
              WHEN COALESCE(v.avg_30d, 0) >= 0.01 AND ROUND(COALESCE(st.total_stock, 0)::numeric / v.avg_30d, 1) <= 60 THEN 'FAST_MOVER'
              WHEN COALESCE(v.avg_30d, 0) >= 0.01 AND ROUND(COALESCE(st.total_stock, 0)::numeric / v.avg_30d, 1) <= 180 THEN 'STRATEGIC_STOCK'
              ELSE 'WATCH_LIST'
            END
          -- Infrequent demand (sale_days < 6)
          WHEN COALESCE(df.sale_days_count, 0) < 6 THEN
            CASE
              WHEN COALESCE(v.avg_30d, 0) >= 0.01 AND ROUND(COALESCE(st.total_stock, 0)::numeric / v.avg_30d, 1) > 180 THEN 'DEAD_STOCK'
              ELSE 'WATCH_LIST'
            END
          ELSE 'UNCATEGORIZED'
        END AS velocity_class,
        -- Multi-window sales totals
        COALESCE(v.sold_12m, 0),
        COALESCE(v.sold_6m, 0),
        COALESCE(v.sold_3m, 0),
        COALESCE(v.sold_1m, 0),
        -- Monthly averages
        COALESCE(v.avg_month_12m, 0),
        COALESCE(v.avg_month_6m, 0),
        COALESCE(v.avg_month_3m, 0),
        COALESCE(v.avg_month_1m, 0),
        -- Months of stock remaining at each rate
        CASE WHEN COALESCE(v.avg_month_12m, 0) > 0 THEN ROUND(COALESCE(st.total_stock, 0)::numeric / v.avg_month_12m, 2) ELSE NULL END,
        CASE WHEN COALESCE(v.avg_month_6m, 0) > 0 THEN ROUND(COALESCE(st.total_stock, 0)::numeric / v.avg_month_6m, 2) ELSE NULL END,
        CASE WHEN COALESCE(v.avg_month_3m, 0) > 0 THEN ROUND(COALESCE(st.total_stock, 0)::numeric / v.avg_month_3m, 2) ELSE NULL END,
        CASE WHEN COALESCE(v.avg_month_1m, 0) > 0 THEN ROUND(COALESCE(st.total_stock, 0)::numeric / v.avg_month_1m, 2) ELSE NULL END,
        -- Velocity trend
        CASE
          WHEN COALESCE(v.avg_month_12m, 0) < 0.1 AND COALESCE(v.avg_month_1m, 0) < 0.1 THEN 'STALLED'
          WHEN COALESCE(v.avg_month_12m, 0) < 0.1 AND COALESCE(v.avg_month_1m, 0) >= 0.1 THEN 'ACCELERATING'
          WHEN COALESCE(v.avg_month_1m, 0) < 0.1 AND COALESCE(v.avg_month_12m, 0) >= 0.1 THEN 'DECELERATING'
          WHEN COALESCE(v.avg_month_3m, 0) / GREATEST(v.avg_month_12m, 0.001) >= 1.3 THEN 'ACCELERATING'
          WHEN COALESCE(v.avg_month_3m, 0) / GREATEST(v.avg_month_12m, 0.001) <= 0.7 THEN 'DECELERATING'
          ELSE 'STABLE'
        END,
        -- Average selling price: historical sales data, fallback to product's current unit_price
        COALESCE(ap.avg_selling_price, p.unit_price::numeric(12,2)),
        -- Stock age in months
        sa.age_months,
        -- Suggested sell price (inflation-adjusted cost × markup)
        CASE
          WHEN CAST(COALESCE(NULLIF(p.current_cost_price, '0.00'), NULLIF(p.cost_price, '0.00'), '0') AS numeric) > 0 THEN
            ROUND(
              CAST(COALESCE(NULLIF(p.current_cost_price, '0.00'), NULLIF(p.cost_price, '0.00')) AS numeric)
              * POWER(1 + COALESCE((
                SELECT CAST(pc.inflation_rate_annual AS numeric) FROM pricing_config pc
                WHERE pc.org_id = ${orgId}
                  AND pc.velocity_class = (
                    CASE
                      WHEN df.sale_days_count >= 6 AND COALESCE(v.avg_30d, 0) >= 0.01
                        AND COALESCE(st.total_stock, 0)::numeric / GREATEST(v.avg_30d, 0.001) <= 60
                      THEN 'FAST_MOVER'
                      WHEN df.sale_days_count >= 6 THEN 'STRATEGIC_STOCK'
                      WHEN COALESCE(v.avg_90d, 0) < 0.01 THEN 'DEAD_STOCK'
                      ELSE 'WATCH_LIST'
                    END
                  )
                  AND COALESCE(sa.age_months, 0) >= pc.age_bracket_min
                  AND (pc.age_bracket_max IS NULL OR COALESCE(sa.age_months, 0) < pc.age_bracket_max)
                LIMIT 1
              ), 5) / 100, COALESCE(sa.age_months, 0) / 12.0)
              * (1 + COALESCE((
                SELECT CAST(pc2.base_markup_pct AS numeric) FROM pricing_config pc2
                WHERE pc2.org_id = ${orgId}
                  AND pc2.velocity_class = (
                    CASE
                      WHEN df.sale_days_count >= 6 AND COALESCE(v.avg_30d, 0) >= 0.01
                        AND COALESCE(st.total_stock, 0)::numeric / GREATEST(v.avg_30d, 0.001) <= 60
                      THEN 'FAST_MOVER'
                      WHEN df.sale_days_count >= 6 THEN 'STRATEGIC_STOCK'
                      WHEN COALESCE(v.avg_90d, 0) < 0.01 THEN 'DEAD_STOCK'
                      ELSE 'WATCH_LIST'
                    END
                  )
                  AND COALESCE(sa.age_months, 0) >= pc2.age_bracket_min
                  AND (pc2.age_bracket_max IS NULL OR COALESCE(sa.age_months, 0) < pc2.age_bracket_max)
                LIMIT 1
              ), 25) / 100)
            , 2)
          ELSE NULL
        END,
        -- Applied markup %
        (SELECT CAST(pc3.base_markup_pct AS numeric) FROM pricing_config pc3
         WHERE pc3.org_id = ${orgId}
           AND pc3.velocity_class = (
             CASE
               WHEN df.sale_days_count >= 6 AND COALESCE(v.avg_30d, 0) >= 0.01
                 AND COALESCE(st.total_stock, 0)::numeric / GREATEST(v.avg_30d, 0.001) <= 60
               THEN 'FAST_MOVER'
               WHEN df.sale_days_count >= 6 THEN 'STRATEGIC_STOCK'
               WHEN COALESCE(v.avg_90d, 0) < 0.01 THEN 'DEAD_STOCK'
               ELSE 'WATCH_LIST'
             END
           )
           AND COALESCE(sa.age_months, 0) >= pc3.age_bracket_min
           AND (pc3.age_bracket_max IS NULL OR COALESCE(sa.age_months, 0) < pc3.age_bracket_max)
         LIMIT 1),
        -- Inflation-adjusted cost
        CASE
          WHEN CAST(COALESCE(NULLIF(p.current_cost_price, '0.00'), NULLIF(p.cost_price, '0.00'), '0') AS numeric) > 0 THEN
            ROUND(
              CAST(COALESCE(NULLIF(p.current_cost_price, '0.00'), NULLIF(p.cost_price, '0.00')) AS numeric)
              * POWER(1 + 5.0 / 100, COALESCE(sa.age_months, 0) / 12.0)
            , 2)
          ELSE NULL
        END,
        -- Cost price snapshot
        p.cost_price,
        -- Status classification
        CASE
          -- Special order items: zero stock with demand is intentional
          WHEN p.special_order = true AND COALESCE(st.total_stock, 0) = 0 AND COALESCE(v.avg_90d, 0) >= 0.01 THEN 'SPECIAL_ORDER'
          WHEN COALESCE(v.avg_90d, 0) < 0.01 AND COALESCE(st.total_stock, 0) > 0 THEN 'DEAD_STOCK'
          WHEN COALESCE(st.total_stock, 0) = 0 AND COALESCE(v.avg_90d, 0) < 0.01 THEN 'DEAD_STOCK'
          WHEN COALESCE(st.total_stock, 0) = 0 AND COALESCE(v.avg_90d, 0) >= 0.01 THEN 'CRITICAL'
          WHEN COALESCE(v.avg_30d, 0) >= 0.01 AND ROUND(COALESCE(st.total_stock, 0)::numeric / v.avg_30d, 1) <= 14 THEN 'CRITICAL'
          WHEN COALESCE(v.avg_30d, 0) >= 0.01 AND ROUND(COALESCE(st.total_stock, 0)::numeric / v.avg_30d, 1) <= 30 THEN 'LOW'
          WHEN COALESCE(v.avg_30d, 0) >= 0.01 AND ROUND(COALESCE(st.total_stock, 0)::numeric / v.avg_30d, 1) > 120 THEN 'OVERSTOCK'
          WHEN COALESCE(v.avg_30d, 0) >= 0.01 THEN 'HEALTHY'
          WHEN COALESCE(st.total_stock, 0) > 0 THEN 'DEAD_STOCK'
          ELSE 'DEAD_STOCK'
        END::stock_monitor_status AS status,
        NOW() AS computed_at
      FROM products p
      LEFT JOIN velocity v ON p.id = v.product_id
      LEFT JOIN stock st ON p.id = st.product_id
      LEFT JOIN stockouts so ON p.id = so.product_id
      LEFT JOIN last_po lp ON p.id = lp.product_id
      LEFT JOIN last_sale ls ON p.id = ls.product_id
      LEFT JOIN avg_price ap ON p.id = ap.product_id
      LEFT JOIN demand_freq df ON p.id = df.product_id
      LEFT JOIN stock_age sa ON p.id = sa.product_id
      WHERE p.org_id = ${orgId} AND p.is_active = true AND p.is_parent = false
        AND (COALESCE(st.total_stock, 0) > 0 OR COALESCE(v.avg_90d, 0) >= 0.01)
    `);

    const [countRow] = await tx.execute(
      sql`SELECT COUNT(*)::integer AS cnt FROM stock_metrics WHERE org_id = ${orgId}`,
    );
    return (countRow as any).cnt as number;
  });

  // Auto-disable reorder for dead stock items
  await db.execute(sql`
    UPDATE products p
    SET reorder_enabled = false
    FROM stock_metrics sm
    WHERE sm.product_id = p.id
      AND sm.org_id = ${orgId}
      AND sm.status = 'DEAD_STOCK'
      AND p.reorder_enabled = true
  `);

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
  subcategoryId?: string;
  familyId?: string;
  hideNegativeStock?: boolean;
  hideDiscontinued?: boolean;
  hideSpecialOrder?: boolean;
  urgency?: string;
  urgencyWindow?: string;
  velocityClass?: string;
  urgencyAll?: string;
  urgency12m?: string;
  urgency6m?: string;
  urgency3m?: string;
  urgency1m?: string;
  productId?: string;
  lastSoldAfter?: string;
  lastSoldBefore?: string;
  sortBy?: string;
  sortDir?: string;
  cursor?: string;
  limit?: number;
  /**
   * When true, include products with no stock_metrics row (or zero stock + zero
   * 90d velocity) at the tail of the grid. These 'untracked' / dormant SKUs are
   * filtered out of stock_metrics by refreshStockMetrics. Off by default.
   */
  includeUntracked?: boolean;
}

export interface StockMonitorRow {
  id: string;
  productId: string;
  productName: string;
  productSku: string;
  brandName: string | null;
  categoryName: string | null;
  subcategoryName: string | null;
  familyName: string | null;
  totalStock: number;
  specialOrder: boolean;
  discontinued: boolean;
  avgDailySales30d: string;
  avgDailySales60d: string;
  avgDailySales90d: string;
  avgDailySales180d: string;
  avgDailySales365d: string;
  avgDailySalesAll: string;
  trend: string;
  trendRecent: string;
  trendPrior: string;
  daysOfStock: string | null;
  stockoutDays90d: number;
  lastPoDate: string | null;
  lastPoSupplierName: string | null;
  lastLeadTimeDays: number | null;
  lastSaleDate: string | null;
  saleDaysCount: number;
  totalQtySold: number;
  daysSinceLastSale: number | null;
  velocityClass: string;
  avgSellingPrice: string | null;
  stockAgeMonths: number | null;
  suggestedSellPrice: string | null;
  appliedMarkupPct: string | null;
  inflationAdjustedCost: string | null;
  costPrice: string | null;
  sold12m: number;
  sold6m: number;
  sold3m: number;
  sold1m: number;
  avgMonth12m: string;
  avgMonth6m: string;
  avgMonth3m: string;
  avgMonth1m: string;
  monthsLeft12m: string | null;
  monthsLeft6m: string | null;
  monthsLeft3m: string | null;
  monthsLeft1m: string | null;
  velocityTrend: string | null;
  sellingUnit: string;
  purchaseUnit: string | null;
  conversionFactor: string;
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
  // Velocity classification counts
  fastMovers: number;
  strategicStock: number;
  watchList: number;
  deadStockVelocity: number;
  newItems: number;
  deadStockValue: number;
  /**
   * Count of active, non-parent products filtered out of stock_metrics:
   * zero stock AND zero 90-day velocity (no sales history, no inventory).
   * These are 'dormant' catalog entries, surfaced via the Untracked card.
   */
  untrackedCount: number;
  /**
   * Count of all active, non-parent products for this org. Equals the sum
   * of the 5 velocity-class counts + untrackedCount. Used for the
   * 'X% of active SKUs' subtitle on classification/untracked cards.
   */
  totalActiveProducts: number;
  computedAt: string | null;
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
  lastSaleDate: stockMetrics.lastSaleDate,
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
  // Non-items exclusion filter (joined via products + product_families + categories)
  const excludeFilter = sql`
    AND NOT EXISTS (SELECT 1 FROM product_families pf WHERE pf.id = p.family_id AND pf.slug = 'non-items')
    AND NOT EXISTS (
      SELECT 1 FROM categories exc_cat
      WHERE exc_cat.name IN ('Count', 'Price Add', 'Labor')
        AND (exc_cat.id = p.category_id OR exc_cat.id = (SELECT pp.category_id FROM products pp WHERE pp.id = p.parent_product_id))
    )
  `;

  const statusRows = await db.execute(
    sql`SELECT sm.status, COUNT(*)::integer AS count FROM stock_metrics sm JOIN products p ON sm.product_id = p.id WHERE sm.org_id = ${orgId} ${excludeFilter} GROUP BY sm.status`,
  );

  const [oosRow] = await db.execute(
    sql`SELECT COUNT(*)::integer AS count FROM stock_metrics sm JOIN products p ON sm.product_id = p.id WHERE sm.org_id = ${orgId} AND sm.total_stock = 0 AND sm.avg_daily_sales_90d::numeric > 0 ${excludeFilter}`,
  );

  // Velocity class counts
  const velocityRows = await db.execute(
    sql`SELECT sm.velocity_class, COUNT(*)::integer AS count FROM stock_metrics sm JOIN products p ON sm.product_id = p.id WHERE sm.org_id = ${orgId} ${excludeFilter} GROUP BY sm.velocity_class`,
  );

  // Dead stock value
  const [deadValueRow] = await db.execute(
    sql`SELECT COALESCE(SUM(sm.total_stock * COALESCE(sm.cost_price::numeric, 0)), 0)::numeric(14,2) AS value FROM stock_metrics sm JOIN products p ON sm.product_id = p.id WHERE sm.org_id = ${orgId} AND sm.velocity_class = 'DEAD_STOCK' AND sm.total_stock > 0 ${excludeFilter}`,
  );

  // Count of products excluded from stock_metrics by refreshStockMetrics's
  // (total_stock > 0 OR avg_90d >= 0.01) filter — the 'untracked' dormant SKUs.
  const [untrackedRow] = await db.execute(sql`
    SELECT COUNT(*)::integer AS cnt
    FROM products p
    LEFT JOIN stock_metrics sm ON sm.product_id = p.id AND sm.org_id = p.org_id
    WHERE p.is_active = true
      AND p.is_parent = false
      AND p.org_id = ${orgId}
      AND (sm.id IS NULL OR (COALESCE(sm.total_stock, 0) = 0 AND COALESCE(sm.avg_daily_sales_90d, 0) < 0.01))
      ${excludeFilter}
  `);
  // Get the last computed timestamp
  const [tsRow] = await db.execute(sql`SELECT MAX(sm.computed_at) AS ts FROM stock_metrics sm WHERE sm.org_id = ${orgId}`);
  return buildStockMonitorSummary({
    statusRows: statusRows as any[],
    velocityRows: velocityRows as any[],
    outOfStockCount: (oosRow as any).count ?? 0,
    deadStockValue: (deadValueRow as any).value ?? "0",
    untrackedCount: (untrackedRow as any)?.cnt ?? 0,
    computedAt: (tsRow as any)?.ts,
  }) satisfies StockMonitorSummary;
}

// ── Paginated stock monitor query ──

/**
 * Fetch the 'untracked' / dormant products (active, non-parent, zero stock,
 * zero 90d velocity — so no stock_metrics row OR a stock_metrics row with all
 * zeros). Returns StockMonitorRow shapes with metric fields zeroed/nulled so
 * the grid can render them uniformly alongside tracked rows.
 *
 * Paginated via keyset on products.id (ascending) when cursor is supplied.
 */
async function queryUntrackedStockMonitor(
  params: StockMonitorQueryParams,
  limit: number,
): Promise<{ data: StockMonitorRow[]; nextCursor: string | null; hasMore: boolean }> {
  const conditions: SQL[] = [
    eq(products.orgId, params.orgId),
    eq(products.isActive, true),
    eq(products.isParent, false),
    sql`NOT EXISTS (SELECT 1 FROM product_families pf WHERE pf.id = ${products.familyId} AND pf.slug = 'non-items')`,
    sql`NOT EXISTS (
      SELECT 1 FROM categories exc_cat
      WHERE exc_cat.name IN ('Count', 'Price Add', 'Labor')
        AND (exc_cat.id = ${products.categoryId}
          OR exc_cat.id = (SELECT pp.category_id FROM products pp WHERE pp.id = ${products.parentProductId}))
    )`,
    // The key predicate — no metrics row OR a dormant metrics row
    sql`NOT EXISTS (
      SELECT 1 FROM stock_metrics sm
      WHERE sm.product_id = ${products.id}
        AND sm.org_id = ${products.orgId}
        AND (COALESCE(sm.total_stock, 0) > 0 OR COALESCE(sm.avg_daily_sales_90d, 0) >= 0.01)
    )`,
  ];

  if (params.search && params.search.length >= 2) {
    conditions.push(or(
      ilike(products.name, `%${params.search}%`),
      ilike(products.sku, `%${params.search}%`),
    )!);
  }
  if (params.brandId) conditions.push(eq(products.brandId, params.brandId));
  if (params.categoryId) conditions.push(eq(products.categoryId, params.categoryId));
  if (params.subcategoryId) conditions.push(eq(products.subcategoryId, params.subcategoryId));
  if (params.familyId) conditions.push(eq(products.familyId, params.familyId));
  if (params.hideDiscontinued) conditions.push(eq(products.discontinued, false));
  if (params.hideSpecialOrder) conditions.push(eq(products.specialOrder, false));
  // Cursor for untracked uses a 'u:' prefix to distinguish from tracked cursors
  if (params.cursor && params.cursor.startsWith("u:")) {
    conditions.push(gt(products.id, params.cursor.slice(2)));
  }

  const rows = await db
    .select({
      id: products.id,
      productId: products.id,
      productName: products.name,
      productSku: products.sku,
      specialOrder: products.specialOrder,
      discontinued: products.discontinued,
      parentProductId: products.parentProductId,
      brandName: brands.name,
      categoryName: categories.name,
      subcategoryName: productSubcategories.name,
      familyName: productFamilies.name,
      costPrice: products.costPrice,
      sellingUnit: products.sellingUnit,
      purchaseUnit: products.purchaseUnit,
      conversionFactor: products.conversionFactor,
    })
    .from(products)
    .leftJoin(brands, eq(products.brandId, brands.id))
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .leftJoin(productSubcategories, eq(products.subcategoryId, productSubcategories.id))
    .leftJoin(productFamilies, eq(products.familyId, productFamilies.id))
    .where(and(...conditions))
    .orderBy(asc(products.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? `u:${pageRows[pageRows.length - 1]!.id}` : null;

  const nowIso = new Date().toISOString();
  const data: StockMonitorRow[] = pageRows.map((r) => ({
    id: r.id,
    productId: r.productId,
    productName: r.productName,
    productSku: r.productSku,
    brandName: r.brandName,
    categoryName: r.categoryName,
    subcategoryName: r.subcategoryName,
    familyName: r.familyName,
    totalStock: 0,
    specialOrder: r.specialOrder ?? false,
    discontinued: r.discontinued ?? false,
    avgDailySales30d: "0",
    avgDailySales60d: "0",
    avgDailySales90d: "0",
    avgDailySales180d: "0",
    avgDailySales365d: "0",
    avgDailySalesAll: "0",
    trend: "STALLED",
    trendRecent: "0",
    trendPrior: "0",
    daysOfStock: null,
    stockoutDays90d: 0,
    lastPoDate: null,
    lastPoSupplierName: null,
    lastLeadTimeDays: null,
    lastSaleDate: null,
    saleDaysCount: 0,
    totalQtySold: 0,
    daysSinceLastSale: null,
    velocityClass: "UNTRACKED",
    avgSellingPrice: null,
    stockAgeMonths: null,
    suggestedSellPrice: null,
    appliedMarkupPct: null,
    inflationAdjustedCost: null,
    costPrice: r.costPrice,
    sold12m: 0,
    sold6m: 0,
    sold3m: 0,
    sold1m: 0,
    avgMonth12m: "0",
    avgMonth6m: "0",
    avgMonth3m: "0",
    avgMonth1m: "0",
    monthsLeft12m: null,
    monthsLeft6m: null,
    monthsLeft3m: null,
    monthsLeft1m: null,
    velocityTrend: null,
    sellingUnit: r.sellingUnit,
    purchaseUnit: r.purchaseUnit,
    conversionFactor: r.conversionFactor,
    status: "DEAD_STOCK",
    computedAt: nowIso,
  }));

  return { data, nextCursor, hasMore };
}

export async function queryStockMonitor(
  params: StockMonitorQueryParams,
): Promise<StockMonitorPage> {
  const limit = params.limit ?? 50;

  // Short-circuit: when the user explicitly filters by the UNTRACKED sentinel,
  // fetch from products directly (no stock_metrics join).
  if (params.velocityClass === "UNTRACKED") {
    const untracked = await queryUntrackedStockMonitor(params, limit);
    const summary = await queryStockMonitorSummary(params.orgId);
    return {
      data: untracked.data,
      summary,
      nextCursor: untracked.nextCursor,
      hasMore: untracked.hasMore,
    };
  }

  const conditions: SQL[] = [
    eq(stockMetrics.orgId, params.orgId),
    // Exclude non-inventory items (Non-Items family + Count/Price Add/Labor categories)
    sql`(${productFamilies.slug} IS NULL OR ${productFamilies.slug} != 'non-items')`,
    sql`NOT EXISTS (
      SELECT 1 FROM categories exc_cat
      WHERE exc_cat.name IN ('Count', 'Price Add', 'Labor')
        AND (exc_cat.id = ${products.categoryId}
          OR exc_cat.id = (SELECT pp.category_id FROM products pp WHERE pp.id = ${products.parentProductId}))
    )`,
  ];

  if (params.search && params.search.length >= 2) {
    // Split multi-word search into individual terms for segment matching
    const terms = params.search.trim().split(/\s+/).filter(Boolean);
    if (terms.length === 1) {
      const term = terms[0];
      conditions.push(
        or(
          ilike(products.name, `%${term}%`),
          ilike(products.sku, `%${term}%`),
          // Also search parent product name (for variants like "1FT" whose parent is "BATTERY CABLE")
          sql`EXISTS (SELECT 1 FROM products parent WHERE parent.id = ${products.parentProductId} AND parent.name ILIKE ${"%" + term + "%"})`,
        )!,
      );
    } else {
      // Multi-term: each term must match somewhere in product name, parent name, or SKU
      const termConditions = terms.map(term =>
        or(
          ilike(products.name, `%${term}%`),
          ilike(products.sku, `%${term}%`),
          sql`EXISTS (SELECT 1 FROM products parent WHERE parent.id = ${products.parentProductId} AND parent.name ILIKE ${"%" + term + "%"})`,
        )!,
      );
      conditions.push(and(...termConditions)!);
    }
  }

  if (params.productId) {
    conditions.push(eq(stockMetrics.productId, params.productId));
  }

  if (params.status) {
    conditions.push(eq(stockMetrics.status, params.status as any));
  }

  if (params.velocityClass) {
    conditions.push(eq(stockMetrics.velocityClass, params.velocityClass));
  }

  // Per-window urgency filters (server-side LEFT column filtering)
  const windowUrgencyFilters: Array<[string | undefined, any]> = [
    [params.urgencyAll, stockMetrics.avgDailySalesAll],
    [params.urgency12m, stockMetrics.avgDailySales365d],
    [params.urgency6m, stockMetrics.avgDailySales180d],
    [params.urgency3m, stockMetrics.avgDailySales90d],
    [params.urgency1m, stockMetrics.avgDailySales30d],
  ];
  for (const [urg, velCol] of windowUrgencyFilters) {
    if (!urg) continue;
    const mlExpr = sql`CASE WHEN CAST(COALESCE(${velCol}, '0') AS numeric) * 30 > 0 THEN ${stockMetrics.totalStock}::numeric / (CAST(${velCol} AS numeric) * 30) ELSE NULL END`;
    if (urg === "critical") {
      conditions.push(sql`(CAST(COALESCE(${velCol}, '0') AS numeric) > 0 AND (${mlExpr}) < 0.5)`);
    } else if (urg === "warning") {
      conditions.push(sql`(CAST(COALESCE(${velCol}, '0') AS numeric) > 0 AND (${mlExpr}) >= 0.5 AND (${mlExpr}) < 1.5)`);
    } else if (urg === "ok") {
      conditions.push(sql`(CAST(COALESCE(${velCol}, '0') AS numeric) > 0 AND (${mlExpr}) >= 1.5)`);
    } else if (urg === "nosales") {
      conditions.push(sql`(CAST(COALESCE(${velCol}, '0') AS numeric) < 0.001)`);
    }
  }

  if (params.brandId) {
    conditions.push(eq(products.brandId, params.brandId));
  }

  if (params.categoryId) {
    conditions.push(eq(products.categoryId, params.categoryId));
  }

  if (params.subcategoryId) {
    conditions.push(eq(products.subcategoryId, params.subcategoryId));
  }

  if (params.hideNegativeStock) {
    conditions.push(sql`${stockMetrics.totalStock} >= 0`);
  }
  if (params.hideDiscontinued) {
    conditions.push(eq(products.discontinued, false));
  }
  if (params.hideSpecialOrder) {
    conditions.push(eq(products.specialOrder, false));
  }

  if (params.urgency) {
    // Urgency ranges: critical = [0, 0.5), warning = [0.5, 1.5), monitor = [1.5, 3.0)
    const ranges: Record<string, { min: number; max: number }> = {
      critical: { min: 0, max: 0.5 },
      warning: { min: 0.5, max: 1.5 },
      monitor: { min: 1.5, max: 3.0 },
    };
    const range = ranges[params.urgency];
    if (range) {
      const w = params.urgencyWindow;
      const buildCondition = (col: any) => {
        return sql`COALESCE(${col}, 9999) >= ${range.min} AND COALESCE(${col}, 9999) < ${range.max}`;
      };
      const buildLeastCondition = () => {
        return sql`LEAST(
          COALESCE(${stockMetrics.monthsLeft12m}, 9999),
          COALESCE(${stockMetrics.monthsLeft6m}, 9999),
          COALESCE(${stockMetrics.monthsLeft3m}, 9999),
          COALESCE(${stockMetrics.monthsLeft1m}, 9999)
        ) >= ${range.min} AND LEAST(
          COALESCE(${stockMetrics.monthsLeft12m}, 9999),
          COALESCE(${stockMetrics.monthsLeft6m}, 9999),
          COALESCE(${stockMetrics.monthsLeft3m}, 9999),
          COALESCE(${stockMetrics.monthsLeft1m}, 9999)
        ) < ${range.max}`;
      };

      if (w === "12m") {
        conditions.push(buildCondition(stockMetrics.monthsLeft12m));
      } else if (w === "6m") {
        conditions.push(buildCondition(stockMetrics.monthsLeft6m));
      } else if (w === "3m") {
        conditions.push(buildCondition(stockMetrics.monthsLeft3m));
      } else if (w === "1m") {
        conditions.push(buildCondition(stockMetrics.monthsLeft1m));
      } else {
        conditions.push(buildLeastCondition());
      }
    }
  }

  if (params.familyId) {
    conditions.push(eq(products.familyId, params.familyId));
  }

  if (params.lastSoldAfter) {
    conditions.push(sql`${stockMetrics.lastSaleDate} >= ${params.lastSoldAfter}::date`);
  }
  if (params.lastSoldBefore) {
    conditions.push(sql`${stockMetrics.lastSaleDate} < (${params.lastSoldBefore}::date + INTERVAL '1 day')`);
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
      specialOrder: products.specialOrder,
      discontinued: products.discontinued,
      parentProductId: products.parentProductId,
      brandName: brands.name,
      categoryName: categories.name,
      subcategoryName: productSubcategories.name,
      familyName: productFamilies.name,
      totalStock: stockMetrics.totalStock,
      avgDailySales30d: stockMetrics.avgDailySales30d,
      avgDailySales60d: stockMetrics.avgDailySales60d,
      avgDailySales90d: stockMetrics.avgDailySales90d,
      avgDailySales180d: stockMetrics.avgDailySales180d,
      avgDailySales365d: stockMetrics.avgDailySales365d,
      avgDailySalesAll: stockMetrics.avgDailySalesAll,
      trend: stockMetrics.trend,
      trendRecent: stockMetrics.trendRecent,
      trendPrior: stockMetrics.trendPrior,
      daysOfStock: stockMetrics.daysOfStock,
      stockoutDays90d: stockMetrics.stockoutDays90d,
      lastPoDate: stockMetrics.lastPoDate,
      lastPoSupplierName: stockMetrics.lastPoSupplierName,
      lastLeadTimeDays: stockMetrics.lastLeadTimeDays,
      lastSaleDate: stockMetrics.lastSaleDate,
      saleDaysCount: stockMetrics.saleDaysCount,
      totalQtySold: stockMetrics.totalQtySold,
      daysSinceLastSale: stockMetrics.daysSinceLastSale,
      velocityClass: stockMetrics.velocityClass,
      avgSellingPrice: stockMetrics.avgSellingPrice,
      stockAgeMonths: stockMetrics.stockAgeMonths,
      suggestedSellPrice: stockMetrics.suggestedSellPrice,
      appliedMarkupPct: stockMetrics.appliedMarkupPct,
      inflationAdjustedCost: stockMetrics.inflationAdjustedCost,
      costPrice: stockMetrics.costPrice,
      sold12m: stockMetrics.sold12m,
      sold6m: stockMetrics.sold6m,
      sold3m: stockMetrics.sold3m,
      sold1m: stockMetrics.sold1m,
      avgMonth12m: stockMetrics.avgMonth12m,
      avgMonth6m: stockMetrics.avgMonth6m,
      avgMonth3m: stockMetrics.avgMonth3m,
      avgMonth1m: stockMetrics.avgMonth1m,
      monthsLeft12m: stockMetrics.monthsLeft12m,
      monthsLeft6m: stockMetrics.monthsLeft6m,
      monthsLeft3m: stockMetrics.monthsLeft3m,
      monthsLeft1m: stockMetrics.monthsLeft1m,
      velocityTrend: stockMetrics.velocityTrend,
      sellingUnit: products.sellingUnit,
      purchaseUnit: products.purchaseUnit,
      conversionFactor: products.conversionFactor,
      status: stockMetrics.status,
      computedAt: stockMetrics.computedAt,
    })
    .from(stockMetrics)
    .innerJoin(products, eq(stockMetrics.productId, products.id))
    .leftJoin(brands, eq(products.brandId, brands.id))
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .leftJoin(productSubcategories, eq(products.subcategoryId, productSubcategories.id))
    .leftJoin(productFamilies, eq(products.familyId, productFamilies.id))
    .where(and(...conditions))
    .orderBy(...orderCols, asc(stockMetrics.id))
    .limit(limit + 1);

  // Batch-fetch parent info for variants (name, brand, category, family)
  const parentIds = [...new Set(rows.filter(r => r.parentProductId).map(r => r.parentProductId!))];
  const parentInfoMap = new Map<string, StockMonitorParentInfo>();
  if (parentIds.length > 0) {
    const parentRows = await db
      .select({ id: products.id, name: products.name, brandName: brands.name, categoryName: categories.name, subcategoryName: productSubcategories.name, familyName: productFamilies.name })
      .from(products)
      .leftJoin(brands, eq(products.brandId, brands.id))
      .leftJoin(categories, eq(products.categoryId, categories.id))
      .leftJoin(productSubcategories, eq(products.subcategoryId, productSubcategories.id))
      .leftJoin(productFamilies, eq(products.familyId, productFamilies.id))
      .where(inArray(products.id, parentIds));
    for (const p of parentRows) {
      parentInfoMap.set(p.id, { name: p.name, brandName: p.brandName, categoryName: p.categoryName, subcategoryName: p.subcategoryName, familyName: p.familyName });
    }
  }

  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? data[data.length - 1]!.id : null;

  const enriched: StockMonitorRow[] = data.map((r) =>
    mapStockMonitorMetricRow(r, parentInfoMap) as StockMonitorRow,
  );

  const summary = await queryStockMonitorSummary(params.orgId);

  return { data: enriched, summary, nextCursor, hasMore };
}

// ── CSV export (all matching rows, no pagination) ──

export async function exportStockMonitorCSV(
  params: Omit<StockMonitorQueryParams, "cursor" | "limit">,
): Promise<StockMonitorRow[]> {
  // Short-circuit: UNTRACKED sentinel uses the products-only path.
  if (params.velocityClass === "UNTRACKED") {
    // Fetch all untracked rows (no pagination limit for CSV).
    const all: StockMonitorRow[] = [];
    let cursor: string | null = null;
    for (let safety = 0; safety < 200; safety++) {
      const chunk = await queryUntrackedStockMonitor(
        { ...params, cursor: cursor ?? undefined } as StockMonitorQueryParams,
        500,
      );
      all.push(...chunk.data);
      if (!chunk.hasMore) break;
      cursor = chunk.nextCursor;
    }
    return all;
  }

  const conditions: SQL[] = [eq(stockMetrics.orgId, params.orgId)];

  if (params.search && params.search.length >= 2) {
    // Split multi-word search into individual terms for segment matching
    const terms = params.search.trim().split(/\s+/).filter(Boolean);
    if (terms.length === 1) {
      const term = terms[0];
      conditions.push(
        or(
          ilike(products.name, `%${term}%`),
          ilike(products.sku, `%${term}%`),
          // Also search parent product name (for variants like "1FT" whose parent is "BATTERY CABLE")
          sql`EXISTS (SELECT 1 FROM products parent WHERE parent.id = ${products.parentProductId} AND parent.name ILIKE ${"%" + term + "%"})`,
        )!,
      );
    } else {
      // Multi-term: each term must match somewhere in product name, parent name, or SKU
      const termConditions = terms.map(term =>
        or(
          ilike(products.name, `%${term}%`),
          ilike(products.sku, `%${term}%`),
          sql`EXISTS (SELECT 1 FROM products parent WHERE parent.id = ${products.parentProductId} AND parent.name ILIKE ${"%" + term + "%"})`,
        )!,
      );
      conditions.push(and(...termConditions)!);
    }
  }

  if (params.productId) {
    conditions.push(eq(stockMetrics.productId, params.productId));
  }

  if (params.status) {
    conditions.push(eq(stockMetrics.status, params.status as any));
  }

  if (params.velocityClass) {
    conditions.push(eq(stockMetrics.velocityClass, params.velocityClass));
  }

  // Per-window urgency filters (server-side LEFT column filtering)
  const windowUrgencyFilters: Array<[string | undefined, any]> = [
    [params.urgencyAll, stockMetrics.avgDailySalesAll],
    [params.urgency12m, stockMetrics.avgDailySales365d],
    [params.urgency6m, stockMetrics.avgDailySales180d],
    [params.urgency3m, stockMetrics.avgDailySales90d],
    [params.urgency1m, stockMetrics.avgDailySales30d],
  ];
  for (const [urg, velCol] of windowUrgencyFilters) {
    if (!urg) continue;
    const mlExpr = sql`CASE WHEN CAST(COALESCE(${velCol}, '0') AS numeric) * 30 > 0 THEN ${stockMetrics.totalStock}::numeric / (CAST(${velCol} AS numeric) * 30) ELSE NULL END`;
    if (urg === "critical") {
      conditions.push(sql`(CAST(COALESCE(${velCol}, '0') AS numeric) > 0 AND (${mlExpr}) < 0.5)`);
    } else if (urg === "warning") {
      conditions.push(sql`(CAST(COALESCE(${velCol}, '0') AS numeric) > 0 AND (${mlExpr}) >= 0.5 AND (${mlExpr}) < 1.5)`);
    } else if (urg === "ok") {
      conditions.push(sql`(CAST(COALESCE(${velCol}, '0') AS numeric) > 0 AND (${mlExpr}) >= 1.5)`);
    } else if (urg === "nosales") {
      conditions.push(sql`(CAST(COALESCE(${velCol}, '0') AS numeric) < 0.001)`);
    }
  }

  if (params.brandId) {
    conditions.push(eq(products.brandId, params.brandId));
  }

  if (params.categoryId) {
    conditions.push(eq(products.categoryId, params.categoryId));
  }

  if (params.subcategoryId) {
    conditions.push(eq(products.subcategoryId, params.subcategoryId));
  }

  if (params.hideNegativeStock) {
    conditions.push(sql`${stockMetrics.totalStock} >= 0`);
  }
  if (params.hideDiscontinued) {
    conditions.push(eq(products.discontinued, false));
  }
  if (params.hideSpecialOrder) {
    conditions.push(eq(products.specialOrder, false));
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
      specialOrder: products.specialOrder,
      discontinued: products.discontinued,
      parentProductId: products.parentProductId,
      brandName: brands.name,
      categoryName: categories.name,
      subcategoryName: productSubcategories.name,
      familyName: productFamilies.name,
      totalStock: stockMetrics.totalStock,
      avgDailySales30d: stockMetrics.avgDailySales30d,
      avgDailySales60d: stockMetrics.avgDailySales60d,
      avgDailySales90d: stockMetrics.avgDailySales90d,
      avgDailySales180d: stockMetrics.avgDailySales180d,
      avgDailySales365d: stockMetrics.avgDailySales365d,
      avgDailySalesAll: stockMetrics.avgDailySalesAll,
      trend: stockMetrics.trend,
      trendRecent: stockMetrics.trendRecent,
      trendPrior: stockMetrics.trendPrior,
      daysOfStock: stockMetrics.daysOfStock,
      stockoutDays90d: stockMetrics.stockoutDays90d,
      lastPoDate: stockMetrics.lastPoDate,
      lastPoSupplierName: stockMetrics.lastPoSupplierName,
      lastLeadTimeDays: stockMetrics.lastLeadTimeDays,
      lastSaleDate: stockMetrics.lastSaleDate,
      saleDaysCount: stockMetrics.saleDaysCount,
      totalQtySold: stockMetrics.totalQtySold,
      daysSinceLastSale: stockMetrics.daysSinceLastSale,
      velocityClass: stockMetrics.velocityClass,
      avgSellingPrice: stockMetrics.avgSellingPrice,
      stockAgeMonths: stockMetrics.stockAgeMonths,
      suggestedSellPrice: stockMetrics.suggestedSellPrice,
      appliedMarkupPct: stockMetrics.appliedMarkupPct,
      inflationAdjustedCost: stockMetrics.inflationAdjustedCost,
      costPrice: stockMetrics.costPrice,
      sold12m: stockMetrics.sold12m,
      sold6m: stockMetrics.sold6m,
      sold3m: stockMetrics.sold3m,
      sold1m: stockMetrics.sold1m,
      avgMonth12m: stockMetrics.avgMonth12m,
      avgMonth6m: stockMetrics.avgMonth6m,
      avgMonth3m: stockMetrics.avgMonth3m,
      avgMonth1m: stockMetrics.avgMonth1m,
      monthsLeft12m: stockMetrics.monthsLeft12m,
      monthsLeft6m: stockMetrics.monthsLeft6m,
      monthsLeft3m: stockMetrics.monthsLeft3m,
      monthsLeft1m: stockMetrics.monthsLeft1m,
      velocityTrend: stockMetrics.velocityTrend,
      sellingUnit: products.sellingUnit,
      purchaseUnit: products.purchaseUnit,
      conversionFactor: products.conversionFactor,
      status: stockMetrics.status,
      computedAt: stockMetrics.computedAt,
    })
    .from(stockMetrics)
    .innerJoin(products, eq(stockMetrics.productId, products.id))
    .leftJoin(brands, eq(products.brandId, brands.id))
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .leftJoin(productSubcategories, eq(products.subcategoryId, productSubcategories.id))
    .leftJoin(productFamilies, eq(products.familyId, productFamilies.id))
    .where(and(...conditions))
    .orderBy(...orderCols, asc(stockMetrics.id));

  // Batch-fetch parent info for variants (name, brand, category, family)
  const csvParentIds = [...new Set(rows.filter(r => r.parentProductId).map(r => r.parentProductId!))];
  const csvParentInfoMap = new Map<string, StockMonitorParentInfo>();
  if (csvParentIds.length > 0) {
    const parents = await db
      .select({ id: products.id, name: products.name, brandName: brands.name, categoryName: categories.name, subcategoryName: productSubcategories.name, familyName: productFamilies.name })
      .from(products)
      .leftJoin(brands, eq(products.brandId, brands.id))
      .leftJoin(categories, eq(products.categoryId, categories.id))
      .leftJoin(productSubcategories, eq(products.subcategoryId, productSubcategories.id))
      .leftJoin(productFamilies, eq(products.familyId, productFamilies.id))
      .where(inArray(products.id, csvParentIds));
    for (const p of parents) csvParentInfoMap.set(p.id, { name: p.name, brandName: p.brandName, categoryName: p.categoryName, subcategoryName: p.subcategoryName, familyName: p.familyName });
  }

  return rows.map((r) =>
    mapStockMonitorMetricRow(r, csvParentInfoMap) as StockMonitorRow,
  );
}

// ── Dead Stock Tier Intelligence ──

export {
  getDeadStockTier,
  suggestClearancePrice,
  type DeadStockTier,
} from "./dead-stock-pricing";

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

// ══════════════════════════════════════════════════════
// REORDER SUGGESTIONS
// ══════════════════════════════════════════════════════

export interface ReorderSuggestion {
  productId: string;
  productName: string;
  productSku: string;
  brandName: string | null;
  categoryName: string | null;
  totalStock: number;
  avgMonth3m: number;
  avgMonth6m: number;
  minMonthsLeft: number | null;
  suggestedQty: number;
  costPrice: string | null;
  avgSellingPrice: string | null;
  lastSaleDate: string | null;
  primarySupplierId: string | null;
  primarySupplierName: string | null;
}

export async function getReorderSuggestions(
  orgId: string,
  opts: {
    reorderThreshold?: number;
    targetMonths?: number;
    categoryId?: string;
    brandId?: string;
    urgency?: string;
    urgencyWindow?: string;
    velocityClass?: string;
    urgencyAll?: string;
    urgency12m?: string;
    urgency6m?: string;
    urgency3m?: string;
    urgency1m?: string;
    lastSoldAfter?: string;
    lastSoldBefore?: string;
    hideNegativeStock?: boolean;
    hideDiscontinued?: boolean;
    hideSpecialOrder?: boolean;
    limit?: number;
  } = {},
): Promise<ReorderSuggestion[]> {
  const threshold = opts.reorderThreshold ?? 2.0;
  const targetMonths = opts.targetMonths ?? 3;
  const limit = opts.limit ?? 200;

  const conditions: SQL[] = [
    eq(stockMetrics.orgId, orgId),
    sql`"stock_metrics"."velocity_class" IN ('FAST_MOVER', 'STRATEGIC_STOCK', 'WATCH_LIST')`,
    sql`LEAST(
      COALESCE("stock_metrics"."months_left_12m"::numeric, 9999),
      COALESCE("stock_metrics"."months_left_6m"::numeric, 9999),
      COALESCE("stock_metrics"."months_left_3m"::numeric, 9999),
      COALESCE("stock_metrics"."months_left_1m"::numeric, 9999)
    ) < ${threshold}`,
  ];

  if (opts.hideNegativeStock !== false) {
    // Default: hide negative stock in reorder suggestions
    conditions.push(sql`${stockMetrics.totalStock} >= 0`);
  }
  if (opts.hideDiscontinued !== false) conditions.push(eq(products.discontinued, false));
  if (opts.hideSpecialOrder !== false) conditions.push(eq(products.specialOrder, false));
  if (opts.categoryId) conditions.push(eq(products.categoryId, opts.categoryId));
  if (opts.brandId) conditions.push(eq(products.brandId, opts.brandId));
  if (opts.lastSoldAfter) conditions.push(sql`${stockMetrics.lastSaleDate} >= ${opts.lastSoldAfter}::date`);
  if (opts.lastSoldBefore) conditions.push(sql`${stockMetrics.lastSaleDate} < (${opts.lastSoldBefore}::date + INTERVAL '1 day')`);

  if (opts.urgency === "critical") {
    conditions.push(sql`LEAST(COALESCE(${stockMetrics.monthsLeft12m},9999),COALESCE(${stockMetrics.monthsLeft6m},9999),COALESCE(${stockMetrics.monthsLeft3m},9999),COALESCE(${stockMetrics.monthsLeft1m},9999)) < 0.5`);
  } else if (opts.urgency === "warning") {
    conditions.push(sql`LEAST(COALESCE(${stockMetrics.monthsLeft12m},9999),COALESCE(${stockMetrics.monthsLeft6m},9999),COALESCE(${stockMetrics.monthsLeft3m},9999),COALESCE(${stockMetrics.monthsLeft1m},9999)) < 1.5`);
  }

  // Velocity class filter
  if (opts.velocityClass) {
    conditions.push(sql`"stock_metrics"."velocity_class" = ${opts.velocityClass}`);
  }

  // Per-window urgency filters (from LEFT column dropdowns)
  const applyWindowUrgency = (col: any, dailyCol: any, value?: string) => {
    if (!value || value === "all") return;
    const ranges: Record<string, { min: number; max: number }> = {
      critical: { min: 0, max: 0.5 },
      warning: { min: 0.5, max: 1.5 },
      ok: { min: 1.5, max: 9999 },
    };
    if (value === "no_sales") {
      conditions.push(sql`(${dailyCol} IS NULL OR CAST(${dailyCol} AS numeric) < 0.01)`);
    } else if (ranges[value]) {
      const r = ranges[value];
      conditions.push(sql`CAST(${dailyCol} AS numeric) >= 0.01`);
      conditions.push(sql`COALESCE(${col}::numeric, 9999) >= ${r.min}`);
      conditions.push(sql`COALESCE(${col}::numeric, 9999) < ${r.max}`);
    }
  };

  applyWindowUrgency(stockMetrics.monthsLeft12m, stockMetrics.avgDailySales365d, opts.urgency12m);
  applyWindowUrgency(stockMetrics.monthsLeft6m, stockMetrics.avgDailySales180d, opts.urgency6m);
  applyWindowUrgency(stockMetrics.monthsLeft3m, stockMetrics.avgDailySales90d, opts.urgency3m);
  applyWindowUrgency(stockMetrics.monthsLeft1m, stockMetrics.avgDailySales30d, opts.urgency1m);
  // For "all" window — use the total qty sold / all-time velocity
  if (opts.urgencyAll && opts.urgencyAll !== "all") {
    applyWindowUrgency(
      sql`CASE WHEN CAST(${stockMetrics.avgDailySalesAll} AS numeric) >= 0.01
        THEN ROUND(${stockMetrics.totalStock}::numeric / (CAST(${stockMetrics.avgDailySalesAll} AS numeric) * 30), 2)
        ELSE NULL END`,
      stockMetrics.avgDailySalesAll,
      opts.urgencyAll,
    );
  }

  const rows = await db
    .select({
      productId: stockMetrics.productId,
      productName: sql<string>`CASE WHEN ${products.parentProductId} IS NOT NULL
        THEN COALESCE((SELECT pp.name FROM products pp WHERE pp.id = ${products.parentProductId}), '') || ' (' || ${products.name} || ')'
        ELSE ${products.name}
      END`.as("product_display_name"),
      productSku: products.sku,
      specialOrder: products.specialOrder,
      discontinued: products.discontinued,
      brandName: brands.name,
      categoryName: categories.name,
      totalStock: stockMetrics.totalStock,
      avgMonth3m: stockMetrics.avgMonth3m,
      avgMonth6m: stockMetrics.avgMonth6m,
      monthsLeft12m: stockMetrics.monthsLeft12m,
      monthsLeft6m: stockMetrics.monthsLeft6m,
      monthsLeft3m: stockMetrics.monthsLeft3m,
      monthsLeft1m: stockMetrics.monthsLeft1m,
      costPrice: stockMetrics.costPrice,
      avgSellingPrice: stockMetrics.avgSellingPrice,
      lastSaleDate: stockMetrics.lastSaleDate,
      primarySupplierId: products.primarySupplierId,
    })
    .from(stockMetrics)
    .innerJoin(products, eq(stockMetrics.productId, products.id))
    .leftJoin(brands, eq(products.brandId, brands.id))
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .where(and(...conditions))
    .orderBy(sql`LEAST(COALESCE(${stockMetrics.monthsLeft12m},9999),COALESCE(${stockMetrics.monthsLeft6m},9999),COALESCE(${stockMetrics.monthsLeft3m},9999),COALESCE(${stockMetrics.monthsLeft1m},9999)) ASC`)
    .limit(limit);

  // Look up supplier names for products that have primary_supplier_id
  const supplierIds = [...new Set(rows.filter(r => r.primarySupplierId).map(r => r.primarySupplierId!))];
  const supplierMap = new Map<string, string>();
  if (supplierIds.length > 0) {
    const sups = await db
      .select({ id: suppliers.id, name: suppliers.name })
      .from(suppliers)
      .where(inArray(suppliers.id, supplierIds));
    for (const s of sups) supplierMap.set(s.id, s.name);
  }

  return rows.map((r) => {
    const monthsArr = [r.monthsLeft12m, r.monthsLeft6m, r.monthsLeft3m, r.monthsLeft1m]
      .map(v => v ? parseFloat(v) : null)
      .filter((v): v is number => v !== null);
    const minMonthsLeft = monthsArr.length > 0 ? Math.min(...monthsArr) : null;

    // Suggested qty = ceil((monthly_rate × target_months) - current_stock)
    const monthlyRate = parseFloat(r.avgMonth3m as any) || parseFloat(r.avgMonth6m as any) || 0;
    const suggested = Math.max(0, Math.ceil(monthlyRate * targetMonths - r.totalStock));

    return {
      productId: r.productId,
      productName: r.productName,
      productSku: r.productSku,
      brandName: r.brandName,
      categoryName: r.categoryName,
      totalStock: r.totalStock,
    specialOrder: r.specialOrder ?? false,
    discontinued: r.discontinued ?? false,
      avgMonth3m: parseFloat(r.avgMonth3m as any) || 0,
      avgMonth6m: parseFloat(r.avgMonth6m as any) || 0,
      minMonthsLeft,
      suggestedQty: suggested,
      costPrice: r.costPrice,
      avgSellingPrice: r.avgSellingPrice,
      lastSaleDate: r.lastSaleDate ? r.lastSaleDate.toISOString() : null,
      primarySupplierId: r.primarySupplierId,
      primarySupplierName: r.primarySupplierId ? supplierMap.get(r.primarySupplierId) || null : null,
    };
  });
}
