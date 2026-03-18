import { db } from "@apex/database";
import { sql } from "drizzle-orm";

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
          sl.product_id,
          COALESCE(SUM(CASE WHEN s.created_at >= NOW() - INTERVAL '30 days' THEN sl.quantity ELSE 0 END)::numeric / 30, 0) AS avg_30d,
          COALESCE(SUM(CASE WHEN s.created_at >= NOW() - INTERVAL '60 days' THEN sl.quantity ELSE 0 END)::numeric / 60, 0) AS avg_60d,
          COALESCE(SUM(sl.quantity)::numeric / 90, 0) AS avg_90d
        FROM sale_lines sl
        JOIN sales s ON sl.sale_id = s.id
        WHERE s.org_id = ${orgId}
          AND s.status = 'COMPLETED'
          AND s.created_at >= NOW() - INTERVAL '90 days'
        GROUP BY sl.product_id
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
