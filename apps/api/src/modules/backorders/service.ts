import { db } from "@apex/database";
import { sql } from "drizzle-orm";

// ── List backorders (cursor-paginated, filterable) ──

export interface BackorderQueryParams {
  orgId: string;
  status?: string;
  supplierId?: string;
  priority?: string;
  cursor?: string;
  limit?: number;
}

export async function listBackorders(params: BackorderQueryParams) {
  const limit = params.limit ?? 50;

  const rows = await db.execute(sql`
    SELECT
      b.id,
      b.product_id AS "productId",
      p.name AS "productName",
      p.sku,
      b.supplier_id AS "supplierId",
      s.name AS "supplierName",
      b.quantity AS "qtyNeeded",
      b.original_po_id AS "sourcePo",
      b.original_po_number AS "sourcePONumber",
      b.reason,
      b.priority,
      b.status,
      b.target_po_id AS "targetPoId",
      b.target_po_number AS "targetPoNumber",
      b.needed_by_date AS "neededBy",
      b.notes,
      b.resolved_at AS "resolvedAt",
      b.created_at AS "createdAt",
      b.updated_at AS "updatedAt",
      EXTRACT(DAY FROM NOW() - b.created_at)::integer AS "daysPending"
    FROM backorders b
    JOIN products p ON b.product_id = p.id
    JOIN suppliers s ON b.supplier_id = s.id
    WHERE b.org_id = ${params.orgId}
      ${params.status ? sql`AND b.status = ${params.status}` : sql``}
      ${params.supplierId ? sql`AND b.supplier_id = ${params.supplierId}` : sql``}
      ${params.priority ? sql`AND b.priority = ${params.priority}` : sql``}
      ${params.cursor ? sql`AND b.id > ${params.cursor}` : sql``}
    ORDER BY
      CASE b.priority WHEN 'HIGH' THEN 1 WHEN 'NORMAL' THEN 2 WHEN 'LOW' THEN 3 END,
      b.created_at ASC,
      b.id ASC
    LIMIT ${limit + 1}
  `);

  const data = rows as any[];
  const hasMore = data.length > limit;
  const items = hasMore ? data.slice(0, limit) : data;
  const nextCursor = hasMore ? items[items.length - 1]?.id : null;

  return { data: items, nextCursor, hasMore };
}

// ── Group by supplier ──

export async function getBackordersBySupplier(orgId: string) {
  const rows = await db.execute(sql`
    SELECT
      b.supplier_id AS "supplierId",
      s.name AS "supplierName",
      COUNT(*)::integer AS "pendingCount",
      SUM(b.quantity)::integer AS "totalQty",
      EXTRACT(DAY FROM NOW() - MIN(b.created_at))::integer AS "oldestDays",
      json_agg(
        json_build_object(
          'id', b.id,
          'productId', b.product_id,
          'productName', p.name,
          'sku', p.sku,
          'supplierId', b.supplier_id,
          'supplierName', s.name,
          'qtyNeeded', b.quantity,
          'sourcePo', b.original_po_id,
          'sourcePONumber', b.original_po_number,
          'priority', b.priority,
          'status', b.status,
          'neededBy', b.needed_by_date,
          'daysPending', EXTRACT(DAY FROM NOW() - b.created_at)::integer,
          'createdAt', b.created_at,
          'reason', COALESCE(b.reason, ''),
          'notes', b.notes
        ) ORDER BY
          CASE b.priority WHEN 'HIGH' THEN 1 WHEN 'NORMAL' THEN 2 WHEN 'LOW' THEN 3 END,
          b.created_at ASC
      ) AS items
    FROM backorders b
    JOIN products p ON b.product_id = p.id
    JOIN suppliers s ON b.supplier_id = s.id
    WHERE b.org_id = ${orgId} AND b.status = 'PENDING'
    GROUP BY b.supplier_id, s.name
    ORDER BY COUNT(*) DESC
  `);

  return { data: rows as any[] };
}

// ── For a specific supplier ──

export async function getBackordersForSupplier(orgId: string, supplierId: string) {
  const rows = await db.execute(sql`
    SELECT
      b.id,
      b.product_id,
      p.name AS product_name,
      p.sku,
      b.quantity,
      b.original_po_id,
      b.original_po_number,
      b.reason,
      b.priority,
      b.needed_by_date,
      b.notes,
      b.created_at,
      EXTRACT(DAY FROM NOW() - b.created_at)::integer AS days_pending
    FROM backorders b
    JOIN products p ON b.product_id = p.id
    WHERE b.org_id = ${orgId}
      AND b.supplier_id = ${supplierId}
      AND b.status = 'PENDING'
    ORDER BY
      CASE b.priority WHEN 'HIGH' THEN 1 WHEN 'NORMAL' THEN 2 WHEN 'LOW' THEN 3 END,
      b.created_at ASC
  `);
  return rows as any[];
}

// ── Create single backorder (with dedup) ──

export async function createBackorder(
  orgId: string,
  userId: string,
  data: {
    productId: string;
    supplierId: string;
    quantity: number;
    originalPoId?: string;
    originalPoNumber?: string;
    reason?: string;
    priority?: string;
    neededByDate?: string;
    notes?: string;
  },
) {
  // Deduplication: check if PENDING backorder exists for same product+supplier
  const existing = await db.execute(sql`
    SELECT id, quantity FROM backorders
    WHERE org_id = ${orgId}
      AND product_id = ${data.productId}
      AND supplier_id = ${data.supplierId}
      AND status = 'PENDING'
    LIMIT 1
  `);

  if ((existing as any[]).length > 0) {
    const ex = (existing as any[])[0];
    // Merge: add quantity
    const newQty = ex.quantity + data.quantity;
    await db.execute(sql`
      UPDATE backorders
      SET quantity = ${newQty},
          updated_at = NOW(),
          notes = CASE
            WHEN ${data.notes ?? null} IS NOT NULL THEN COALESCE(notes || E'\n', '') || ${data.notes ?? ''}
            ELSE notes
          END
      WHERE id = ${ex.id}
    `);
    return { id: ex.id, merged: true, newQuantity: newQty };
  }

  const [row] = await db.execute(sql`
    INSERT INTO backorders (
      org_id, product_id, supplier_id, quantity,
      original_po_id, original_po_number, reason,
      priority, requested_by, needed_by_date, notes
    ) VALUES (
      ${orgId}, ${data.productId}, ${data.supplierId}, ${data.quantity},
      ${data.originalPoId ?? null}, ${data.originalPoNumber ?? null},
      ${data.reason ?? null},
      ${data.priority ?? 'NORMAL'}, ${userId},
      ${data.neededByDate ?? null}, ${data.notes ?? null}
    )
    RETURNING *
  `) as any[];

  return { id: row.id, merged: false };
}

// ── Bulk create (from PO redirect flow) ──

export async function createBackordersBulk(
  orgId: string,
  userId: string,
  items: Array<{
    productId: string;
    supplierId: string;
    quantity: number;
    originalPoId?: string;
    originalPoNumber?: string;
    reason?: string;
    priority?: string;
    neededByDate?: string;
  }>,
) {
  const results: Array<{ productId: string; backorderId: string; merged: boolean }> = [];

  for (const item of items) {
    const result = await createBackorder(orgId, userId, item);
    results.push({
      productId: item.productId,
      backorderId: result.id,
      merged: result.merged,
    });
  }

  return results;
}

// ── Update backorder ──

export async function updateBackorder(
  orgId: string,
  backorderId: string,
  data: {
    priority?: string;
    neededByDate?: string | null;
    notes?: string | null;
    quantity?: number;
  },
) {
  await db.execute(sql`
    UPDATE backorders
    SET
      priority = COALESCE(${data.priority ?? null}, priority),
      needed_by_date = CASE
        WHEN ${data.neededByDate !== undefined ? 'yes' : 'no'} = 'yes' THEN ${data.neededByDate ?? null}::date
        ELSE needed_by_date
      END,
      notes = CASE
        WHEN ${data.notes !== undefined ? 'yes' : 'no'} = 'yes' THEN ${data.notes ?? null}
        ELSE notes
      END,
      quantity = COALESCE(${data.quantity ?? null}, quantity),
      updated_at = NOW()
    WHERE id = ${backorderId} AND org_id = ${orgId} AND status = 'PENDING'
  `);

  return { success: true };
}

// ── Cancel backorder ──

export async function cancelBackorder(
  orgId: string,
  userId: string,
  backorderId: string,
  reason?: string,
) {
  await db.execute(sql`
    UPDATE backorders
    SET status = 'CANCELLED',
        resolved_at = NOW(),
        resolved_by = ${userId},
        notes = CASE
          WHEN ${reason ?? null} IS NOT NULL THEN COALESCE(notes || E'\n', '') || 'Cancelled: ' || ${reason ?? ''}
          ELSE notes
        END,
        updated_at = NOW()
    WHERE id = ${backorderId} AND org_id = ${orgId} AND status = 'PENDING'
  `);
  return { success: true };
}

// ── Include in PO ──

export async function includeInPO(
  orgId: string,
  userId: string,
  backorderIds: string[],
  targetPoId: string,
  targetPoNumber: string,
) {
  if (backorderIds.length === 0) return { updated: 0 };

  const result = await db.execute(sql`
    UPDATE backorders
    SET status = 'INCLUDED_IN_PO',
        target_po_id = ${targetPoId},
        target_po_number = ${targetPoNumber},
        resolved_at = NOW(),
        resolved_by = ${userId},
        updated_at = NOW()
    WHERE org_id = ${orgId}
      AND status = 'PENDING'
      AND id = ANY(${backorderIds}::uuid[])
  `);

  return { updated: backorderIds.length };
}

// ── Summary counts ──

export async function getBackorderSummary(orgId: string) {
  const rows = await db.execute(sql`
    SELECT
      COUNT(*) FILTER (WHERE status = 'PENDING')::integer AS pending_total,
      COUNT(DISTINCT supplier_id) FILTER (WHERE status = 'PENDING')::integer AS suppliers_with_pending,
      EXTRACT(DAY FROM NOW() - MIN(created_at) FILTER (WHERE status = 'PENDING'))::integer AS oldest_pending_days,
      COUNT(*) FILTER (WHERE status = 'PENDING' AND needed_by_date IS NOT NULL AND needed_by_date <= CURRENT_DATE + INTERVAL '7 days')::integer AS needed_this_week
    FROM backorders
    WHERE org_id = ${orgId}
  `);

  const r = (rows as any[])[0] ?? {};
  return {
    pendingTotal: r.pending_total ?? 0,
    suppliersWithPending: r.suppliers_with_pending ?? 0,
    oldestPendingDays: r.oldest_pending_days ?? 0,
    neededThisWeek: r.needed_this_week ?? 0,
  };
}

// ── Auto-escalate priority for aging backorders ──

export async function escalateAgingBackorders(orgId: string) {
  // Backorders older than 14 days → escalate to HIGH
  const result = await db.execute(sql`
    UPDATE backorders
    SET priority = 'HIGH', updated_at = NOW()
    WHERE org_id = ${orgId}
      AND status = 'PENDING'
      AND priority != 'HIGH'
      AND created_at < NOW() - INTERVAL '14 days'
  `);
  return result;
}

// ── Pending count (for sidebar badge) ──

export async function getPendingBackorderCount(orgId: string): Promise<number> {
  const [row] = await db.execute(sql`
    SELECT COUNT(*)::integer AS cnt
    FROM backorders
    WHERE org_id = ${orgId} AND status = 'PENDING'
  `) as any[];
  return row?.cnt ?? 0;
}
