import { db } from "@apex/database";
import { sql } from "drizzle-orm";
import { createPO } from "../procurement/service";

// ── List backorders (cursor-paginated, filterable) ──

export interface BackorderQueryParams {
  orgId: string;
  status?: string;
  supplierId?: string;
  priority?: string;
  search?: string;
  cursor?: string;
  limit?: number;
}

export async function listBackorders(params: BackorderQueryParams) {
  const limit = params.limit ?? 50;

  const searchFilter =
    params.search && params.search.length >= 2
      ? sql`AND (
          b.product_name ILIKE ${"%" + params.search + "%"}
          OR b.sku ILIKE ${"%" + params.search + "%"}
          OR b.original_po_number ILIKE ${"%" + params.search + "%"}
          OR b.supplier_name ILIKE ${"%" + params.search + "%"}
          OR p.name ILIKE ${"%" + params.search + "%"}
        )`
      : sql``;

  const rows = await db.execute(sql`
    SELECT
      b.id,
      b.product_id AS "productId",
      COALESCE(b.product_name,
        CASE WHEN p.parent_product_id IS NOT NULL THEN parent_p.name || ' (' || p.name || ')' ELSE p.name END
      ) AS "productName",
      COALESCE(b.sku, p.sku) AS sku,
      b.supplier_id AS "supplierId",
      COALESCE(b.supplier_name, s.name) AS "supplierName",
      b.quantity AS "qtyNeeded",
      b.quantity_ordered AS "quantityOrdered",
      b.quantity_received AS "quantityReceived",
      b.quantity_outstanding AS "quantityOutstanding",
      b.unit_cost AS "unitCost",
      b.original_po_id AS "sourcePo",
      b.original_po_number AS "sourcePONumber",
      b.original_po_line_id AS "originalPoLineId",
      b.reason,
      b.priority,
      b.status,
      b.wait_until AS "waitUntil",
      b.target_po_id AS "targetPoId",
      b.target_po_number AS "targetPoNumber",
      b.new_supplier_id AS "newSupplierId",
      b.new_supplier_name AS "newSupplierName",
      b.needed_by_date AS "neededBy",
      b.notes,
      b.resolved_at AS "resolvedAt",
      b.created_at AS "createdAt",
      b.updated_at AS "updatedAt",
      EXTRACT(DAY FROM NOW() - b.created_at)::integer AS "daysPending",
      CASE
        WHEN b.status = 'PENDING' AND b.wait_until IS NOT NULL AND b.wait_until < CURRENT_DATE
        THEN true ELSE false
      END AS "isOverdue"
    FROM backorders b
    JOIN products p ON b.product_id = p.id
    LEFT JOIN products parent_p ON p.parent_product_id = parent_p.id
    JOIN suppliers s ON b.supplier_id = s.id
    WHERE b.org_id = ${params.orgId}
      ${params.status && params.status !== "all" ? sql`AND b.status = ${params.status}` : sql``}
      ${params.supplierId ? sql`AND b.supplier_id = ${params.supplierId}` : sql``}
      ${params.priority ? sql`AND b.priority = ${params.priority}` : sql``}
      ${searchFilter}
      ${params.cursor ? sql`AND b.id > ${params.cursor}` : sql``}
    ORDER BY
      CASE WHEN b.status = 'PENDING' AND b.wait_until IS NOT NULL AND b.wait_until < CURRENT_DATE THEN 0 ELSE 1 END,
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
      COALESCE(b.supplier_name, s.name) AS "supplierName",
      COUNT(*)::integer AS "pendingCount",
      SUM(b.quantity)::integer AS "totalQty",
      EXTRACT(DAY FROM NOW() - MIN(b.created_at))::integer AS "oldestDays",
      json_agg(
        json_build_object(
          'id', b.id,
          'productId', b.product_id,
          'productName', COALESCE(b.product_name,
            CASE WHEN p.parent_product_id IS NOT NULL THEN parent_p.name || ' (' || p.name || ')' ELSE p.name END),
          'sku', COALESCE(b.sku, p.sku),
          'supplierId', b.supplier_id,
          'supplierName', COALESCE(b.supplier_name, s.name),
          'qtyNeeded', b.quantity,
          'sourcePo', b.original_po_id,
          'sourcePONumber', b.original_po_number,
          'priority', b.priority,
          'status', b.status,
          'waitUntil', b.wait_until,
          'neededBy', b.needed_by_date,
          'daysPending', EXTRACT(DAY FROM NOW() - b.created_at)::integer,
          'isOverdue', CASE WHEN b.wait_until IS NOT NULL AND b.wait_until < CURRENT_DATE THEN true ELSE false END,
          'createdAt', b.created_at,
          'reason', COALESCE(b.reason, ''),
          'notes', b.notes
        ) ORDER BY
          CASE b.priority WHEN 'HIGH' THEN 1 WHEN 'NORMAL' THEN 2 WHEN 'LOW' THEN 3 END,
          b.created_at ASC
      ) AS items
    FROM backorders b
    JOIN products p ON b.product_id = p.id
    LEFT JOIN products parent_p ON p.parent_product_id = parent_p.id
    JOIN suppliers s ON b.supplier_id = s.id
    WHERE b.org_id = ${orgId} AND b.status = 'PENDING'
    GROUP BY b.supplier_id, COALESCE(b.supplier_name, s.name)
    ORDER BY COUNT(*) DESC
  `);

  return { data: rows as any[] };
}

// ── For a specific supplier ──

export async function getBackordersForSupplier(
  orgId: string,
  supplierId: string,
) {
  const rows = await db.execute(sql`
    SELECT
      b.id,
      b.product_id,
      COALESCE(b.product_name,
        CASE WHEN p.parent_product_id IS NOT NULL THEN parent_p.name || ' (' || p.name || ')' ELSE p.name END
      ) AS product_name,
      COALESCE(b.sku, p.sku) AS sku,
      b.quantity,
      b.quantity_outstanding,
      b.unit_cost,
      b.original_po_id,
      b.original_po_number,
      b.reason,
      b.priority,
      b.wait_until,
      b.needed_by_date,
      b.notes,
      b.created_at,
      EXTRACT(DAY FROM NOW() - b.created_at)::integer AS days_pending
    FROM backorders b
    JOIN products p ON b.product_id = p.id
    LEFT JOIN products parent_p ON p.parent_product_id = parent_p.id
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
    quantityOrdered?: number;
    quantityReceived?: number;
    quantityOutstanding?: number;
    productName?: string;
    sku?: string;
    supplierName?: string;
    unitCost?: string;
    originalPoId?: string;
    originalPoNumber?: string;
    originalPoLineId?: string;
    reason?: string;
    priority?: string;
    waitUntil?: string;
    neededByDate?: string;
    notes?: string;
  },
) {
  // Skip dedup — always create a new backorder row for traceability
  // Each PO close creates distinct backorder entries

  const [row] = (await db.execute(sql`
    INSERT INTO backorders (
      org_id, product_id, product_name, sku,
      supplier_id, supplier_name,
      quantity, quantity_ordered, quantity_received, quantity_outstanding,
      unit_cost,
      original_po_id, original_po_number, original_po_line_id,
      reason, priority, wait_until,
      requested_by, needed_by_date, notes
    ) VALUES (
      ${orgId}, ${data.productId}, ${data.productName ?? null}, ${data.sku ?? null},
      ${data.supplierId}, ${data.supplierName ?? null},
      ${data.quantity},
      ${data.quantityOrdered ?? null},
      ${data.quantityReceived ?? null},
      ${data.quantityOutstanding ?? data.quantity},
      ${data.unitCost ?? null},
      ${data.originalPoId ?? null}, ${data.originalPoNumber ?? null},
      ${data.originalPoLineId ?? null},
      ${data.reason ?? null},
      ${data.priority ?? "NORMAL"}, ${data.waitUntil ?? null},
      ${userId}, ${data.neededByDate ?? null}, ${data.notes ?? null}
    )
    RETURNING *
  `)) as any[];

  return { id: row.id, merged: false };
}

// ── Bulk create (from PO partial receipt flow) ──

export async function createBackordersBulk(
  orgId: string,
  userId: string,
  items: Array<{
    productId: string;
    supplierId: string;
    quantity: number;
    quantityOrdered?: number;
    quantityReceived?: number;
    quantityOutstanding?: number;
    productName?: string;
    sku?: string;
    supplierName?: string;
    unitCost?: string;
    originalPoId?: string;
    originalPoNumber?: string;
    originalPoLineId?: string;
    reason?: string;
    priority?: string;
    waitUntil?: string;
    neededByDate?: string;
    decision?: "backorder" | "resource" | "cancel";
    newSupplierId?: string;
  }>,
) {
  const results: Array<{
    productId: string;
    backorderId: string;
    merged: boolean;
    decision: string;
    newPoId?: string;
    newPoNo?: string;
  }> = [];

  for (const item of items) {
    const decision = item.decision ?? "backorder";

    if (decision === "cancel") {
      // Insert as CANCELLED for audit trail
      const [row] = (await db.execute(sql`
        INSERT INTO backorders (
          org_id, product_id, product_name, sku,
          supplier_id, supplier_name,
          quantity, quantity_ordered, quantity_received, quantity_outstanding,
          unit_cost,
          original_po_id, original_po_number, original_po_line_id,
          status, resolved_at, resolved_by, requested_by,
          reason, notes
        ) VALUES (
          ${orgId}, ${item.productId}, ${item.productName ?? null}, ${item.sku ?? null},
          ${item.supplierId}, ${item.supplierName ?? null},
          ${item.quantity},
          ${item.quantityOrdered ?? null},
          ${item.quantityReceived ?? null},
          ${item.quantityOutstanding ?? item.quantity},
          ${item.unitCost ?? null},
          ${item.originalPoId ?? null}, ${item.originalPoNumber ?? null},
          ${item.originalPoLineId ?? null},
          'CANCELLED', NOW(), ${userId}, ${userId},
          ${item.reason ?? "Remainder cancelled"}, 'Cancelled on receipt'
        )
        RETURNING id
      `)) as any[];

      results.push({
        productId: item.productId,
        backorderId: row.id,
        merged: false,
        decision: "cancel",
      });
    } else if (decision === "resource" && item.newSupplierId) {
      // Create backorder as INCLUDED_IN_PO and create a draft PO to new supplier
      const result = await createBackorder(orgId, userId, {
        ...item,
        waitUntil: undefined,
      });

      // Resolve destination from original PO or fall back to first location
      let destLocationId: string | undefined;
      if (item.originalPoId) {
        const [origPo] = (await db.execute(sql`
          SELECT destination_location_id FROM purchase_orders WHERE id = ${item.originalPoId}
        `)) as any[];
        destLocationId = origPo?.destination_location_id;
      }
      if (!destLocationId) {
        const [loc] = (await db.execute(sql`
          SELECT id FROM locations WHERE org_id = ${orgId} LIMIT 1
        `)) as any[];
        destLocationId = loc?.id;
      }
      if (!destLocationId) throw new Error("No location found for new PO");

      // Create a new draft PO to the new supplier
      const poResult = await createPO(
        {
          supplierId: item.newSupplierId,
          destinationLocationId: destLocationId,
          lines: [
            {
              productId: item.productId,
              orderedQty: item.quantity,
              unitCost: item.unitCost ?? "0",
            },
          ],
        },
        orgId,
        userId,
        "ADMIN",
      );

      // Mark backorder as included in PO
      await db.execute(sql`
        UPDATE backorders
        SET status = 'INCLUDED_IN_PO',
            target_po_id = ${poResult.po.id},
            target_po_number = ${poResult.po.poNo},
            new_supplier_id = ${item.newSupplierId},
            resolved_at = NOW(),
            resolved_by = ${userId},
            updated_at = NOW()
        WHERE id = ${result.id}
      `);

      results.push({
        productId: item.productId,
        backorderId: result.id,
        merged: result.merged,
        decision: "resource",
        newPoId: poResult.po.id,
        newPoNo: poResult.po.poNo,
      });
    } else {
      // Default: backorder (wait on supplier)
      const result = await createBackorder(orgId, userId, item);
      results.push({
        productId: item.productId,
        backorderId: result.id,
        merged: result.merged,
        decision: "backorder",
      });
    }
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
    waitUntil?: string | null;
    notes?: string | null;
    quantity?: number;
  },
) {
  await db.execute(sql`
    UPDATE backorders
    SET
      priority = COALESCE(${data.priority ?? null}, priority),
      needed_by_date = CASE
        WHEN ${data.neededByDate !== undefined ? "yes" : "no"} = 'yes' THEN ${data.neededByDate ?? null}::date
        ELSE needed_by_date
      END,
      wait_until = CASE
        WHEN ${data.waitUntil !== undefined ? "yes" : "no"} = 'yes' THEN ${data.waitUntil ?? null}::date
        ELSE wait_until
      END,
      notes = CASE
        WHEN ${data.notes !== undefined ? "yes" : "no"} = 'yes' THEN ${data.notes ?? null}
        ELSE notes
      END,
      quantity = COALESCE(${data.quantity ?? null}, quantity),
      quantity_outstanding = COALESCE(${data.quantity ?? null}, quantity_outstanding),
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
  const cancelNote = reason
    ? `Cancelled: ${reason}`
    : null;

  if (cancelNote) {
    await db.execute(sql`
      UPDATE backorders
      SET status = 'CANCELLED',
          resolved_at = NOW(),
          resolved_by = ${userId},
          notes = COALESCE(notes || chr(10), '') || ${cancelNote},
          updated_at = NOW()
      WHERE id = ${backorderId} AND org_id = ${orgId} AND status = 'PENDING'
    `);
  } else {
    await db.execute(sql`
      UPDATE backorders
      SET status = 'CANCELLED',
          resolved_at = NOW(),
          resolved_by = ${userId},
          updated_at = NOW()
      WHERE id = ${backorderId} AND org_id = ${orgId} AND status = 'PENDING'
    `);
  }
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

  await db.execute(sql`
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

// ── Create PO from backorder (same supplier) ──

export async function createPOFromBackorder(
  orgId: string,
  userId: string,
  backorderId: string,
) {
  // Fetch the backorder
  const [bo] = (await db.execute(sql`
    SELECT b.*, po.destination_location_id
    FROM backorders b
    LEFT JOIN purchase_orders po ON b.original_po_id = po.id
    WHERE b.id = ${backorderId} AND b.org_id = ${orgId} AND b.status = 'PENDING'
    FOR UPDATE
  `)) as any[];

  if (!bo) throw new Error("Backorder not found or not pending");

  // Get the destination from original PO or fall back to first location
  let destinationLocationId = bo.destination_location_id;
  if (!destinationLocationId) {
    const [loc] = (await db.execute(sql`
      SELECT id FROM locations WHERE org_id = ${orgId} LIMIT 1
    `)) as any[];
    destinationLocationId = loc?.id;
    if (!destinationLocationId) throw new Error("No locations found");
  }

  // Create a new draft PO to the SAME supplier
  const poResult = await createPO(
    {
      supplierId: bo.supplier_id,
      destinationLocationId,
      notes: `Backorder from ${bo.original_po_number || "N/A"}`,
      lines: [
        {
          productId: bo.product_id,
          orderedQty: bo.quantity_outstanding ?? bo.quantity,
          unitCost: bo.unit_cost ?? "0",
        },
      ],
    },
    orgId,
    userId,
    "ADMIN",
  );

  // Update backorder status
  await db.execute(sql`
    UPDATE backorders
    SET status = 'INCLUDED_IN_PO',
        target_po_id = ${poResult.po.id},
        target_po_number = ${poResult.po.poNo},
        resolved_at = NOW(),
        resolved_by = ${userId},
        updated_at = NOW()
    WHERE id = ${backorderId}
  `);

  return {
    backorderId,
    newPoId: poResult.po.id,
    newPoNo: poResult.po.poNo,
  };
}

// ── Re-source to different supplier ──

export async function resourceBackorder(
  orgId: string,
  userId: string,
  backorderId: string,
  newSupplierId: string,
) {
  // Fetch the backorder
  const [bo] = (await db.execute(sql`
    SELECT b.*, po.destination_location_id,
           ns.name AS new_supplier_name
    FROM backorders b
    LEFT JOIN purchase_orders po ON b.original_po_id = po.id
    LEFT JOIN suppliers ns ON ns.id = ${newSupplierId} AND ns.org_id = ${orgId}
    WHERE b.id = ${backorderId} AND b.org_id = ${orgId} AND b.status = 'PENDING'
    FOR UPDATE
  `)) as any[];

  if (!bo) throw new Error("Backorder not found or not pending");

  let destinationLocationId = bo.destination_location_id;
  if (!destinationLocationId) {
    const [loc] = (await db.execute(sql`
      SELECT id FROM locations WHERE org_id = ${orgId} LIMIT 1
    `)) as any[];
    destinationLocationId = loc?.id;
    if (!destinationLocationId) throw new Error("No locations found");
  }

  // Create a new draft PO to the NEW supplier
  const poResult = await createPO(
    {
      supplierId: newSupplierId,
      destinationLocationId,
      notes: `Re-sourced backorder from ${bo.original_po_number || "N/A"}`,
      lines: [
        {
          productId: bo.product_id,
          orderedQty: bo.quantity_outstanding ?? bo.quantity,
          unitCost: bo.unit_cost ?? "0",
        },
      ],
    },
    orgId,
    userId,
    "ADMIN",
  );

  // Update backorder status
  await db.execute(sql`
    UPDATE backorders
    SET status = 'INCLUDED_IN_PO',
        target_po_id = ${poResult.po.id},
        target_po_number = ${poResult.po.poNo},
        new_supplier_id = ${newSupplierId},
        new_supplier_name = ${bo.new_supplier_name ?? null},
        resolved_at = NOW(),
        resolved_by = ${userId},
        updated_at = NOW()
    WHERE id = ${backorderId}
  `);

  return {
    backorderId,
    newPoId: poResult.po.id,
    newPoNo: poResult.po.poNo,
    newSupplierName: bo.new_supplier_name,
  };
}

// ── Fulfill backorder ──

export async function fulfillBackorder(
  orgId: string,
  userId: string,
  backorderId: string,
) {
  await db.execute(sql`
    UPDATE backorders
    SET status = 'FULFILLED',
        resolved_at = NOW(),
        resolved_by = ${userId},
        updated_at = NOW()
    WHERE id = ${backorderId}
      AND org_id = ${orgId}
      AND status IN ('PENDING', 'INCLUDED_IN_PO')
  `);
  return { success: true };
}

// ── Auto-fulfill: when a PO is received, fulfill its linked backorders ──

export async function autoFulfillBackordersForPO(orgId: string, poId: string) {
  const result = await db.execute(sql`
    UPDATE backorders
    SET status = 'FULFILLED',
        resolved_at = NOW(),
        updated_at = NOW()
    WHERE org_id = ${orgId}
      AND target_po_id = ${poId}
      AND status = 'INCLUDED_IN_PO'
    RETURNING id
  `);
  return { fulfilled: (result as any[]).length };
}

// ── Summary counts ──

export async function getBackorderSummary(orgId: string) {
  const rows = await db.execute(sql`
    SELECT
      COUNT(*) FILTER (WHERE status = 'PENDING')::integer AS pending_total,
      COUNT(DISTINCT supplier_id) FILTER (WHERE status = 'PENDING')::integer AS suppliers_with_pending,
      EXTRACT(DAY FROM NOW() - MIN(created_at) FILTER (WHERE status = 'PENDING'))::integer AS oldest_pending_days,
      COUNT(*) FILTER (WHERE status = 'PENDING' AND wait_until IS NOT NULL AND wait_until <= CURRENT_DATE + INTERVAL '7 days')::integer AS needed_this_week,
      COUNT(*) FILTER (WHERE status = 'PENDING' AND wait_until IS NOT NULL AND wait_until < CURRENT_DATE)::integer AS overdue_count
    FROM backorders
    WHERE org_id = ${orgId}
  `);

  const r = (rows as any[])[0] ?? {};
  return {
    pendingTotal: r.pending_total ?? 0,
    suppliersWithPending: r.suppliers_with_pending ?? 0,
    oldestPendingDays: r.oldest_pending_days ?? 0,
    neededThisWeek: r.needed_this_week ?? 0,
    overdueCount: r.overdue_count ?? 0,
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

export async function getPendingBackorderCount(
  orgId: string,
): Promise<number> {
  const [row] = (await db.execute(sql`
    SELECT COUNT(*)::integer AS cnt
    FROM backorders
    WHERE org_id = ${orgId} AND status = 'PENDING'
  `)) as any[];
  return row?.cnt ?? 0;
}
