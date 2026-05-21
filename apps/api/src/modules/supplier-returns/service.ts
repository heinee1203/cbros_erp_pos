import { db, type DbOrTx } from "@apex/database";
import {
  supplierReturns,
  supplierReturnAttachments,
  supplierReturnLines,
  supplierReturnStatusHistory,
  inventory,
  stockJournal,
  brands,
  suppliers,
  locations,
  products,
  purchaseOrders,
  users,
} from "@apex/database/schema";
import { eq, and, sql, desc, inArray, type SQL } from "drizzle-orm";
import type {
  CreateSupplierReturnInput,
  UpdateSupplierReturnInput,
  ReceiveCreditInput,
  CancelSupplierReturnInput,
  CloseWithoutCreditInput,
} from "@apex/types";

// ── Helpers ──

/**
 * Generate an RTV number like RTV-000001, scoped per org.
 * Uses advisory lock to serialize number generation.
 */
async function generateRtvNumber(
  tx: DbOrTx,
  orgId: string,
): Promise<string> {
  // Advisory lock scoped to this org — offset by 2 billion to avoid collision
  const lockKey =
    Buffer.from(orgId.replace(/-/g, "").slice(0, 8), "hex").readInt32BE(0) +
    2_000_000;
  await tx.execute(sql`SELECT pg_advisory_xact_lock(${lockKey})`);

  // Use MAX to handle gaps from deletions
  const result = await tx.execute(
    sql`SELECT MAX(CAST(SUBSTRING(rtv_number FROM 5) AS integer)) AS max_seq
        FROM supplier_returns WHERE org_id = ${orgId}`,
  );
  const maxSeq = (result[0] as any)?.max_seq ?? 0;
  return `RTV-${String(maxSeq + 1).padStart(6, "0")}`;
}

/**
 * Lock an inventory row via SELECT ... FOR UPDATE.
 * Auto-creates if doesn't exist.
 */
async function lockInventoryRow(
  tx: DbOrTx,
  orgId: string,
  productId: string,
  locationId: string,
): Promise<{ id: string; stockLevel: number }> {
  const rows = await tx.execute(
    sql`SELECT id, stock_level
        FROM inventory
        WHERE org_id = ${orgId}
          AND product_id = ${productId}
          AND location_id = ${locationId}
        FOR UPDATE`,
  );

  if (rows.length > 0) {
    const row = rows[0] as any;
    return { id: row.id, stockLevel: row.stock_level };
  }

  const [newRow] = await tx
    .insert(inventory)
    .values({
      orgId,
      productId,
      locationId,
      stockLevel: 0,
      reservedLevel: 0,
    })
    .returning();

  return { id: newRow.id, stockLevel: 0 };
}

/**
 * Insert a stock_journal entry with idempotency key.
 */
async function insertJournalEntry(
  tx: DbOrTx,
  params: {
    orgId: string;
    productId: string;
    locationId: string;
    userId: string;
    actorType: "USER" | "SYSTEM";
    changeQuantity: number;
    balanceAfter: number;
    referenceType: "SUPPLIER_RETURN" | "SUPPLIER_RETURN_CANCEL";
    referenceId: string;
    referenceLineId?: string;
    idempotencyKey: string;
    notes?: string;
  },
) {
  const [entry] = await tx
    .insert(stockJournal)
    .values({
      orgId: params.orgId,
      productId: params.productId,
      locationId: params.locationId,
      userId: params.userId,
      actorType: params.actorType,
      changeQuantity: params.changeQuantity,
      balanceAfter: params.balanceAfter,
      referenceType: params.referenceType,
      referenceId: params.referenceId,
      referenceLineId: params.referenceLineId,
      idempotencyKey: params.idempotencyKey,
      notes: params.notes,
    })
    .returning();
  return entry;
}

/**
 * Insert a status history record.
 */
async function insertStatusHistory(
  tx: DbOrTx,
  params: {
    supplierReturnId: string;
    fromStatus: string | null;
    toStatus: string;
    changedBy: string;
    notes?: string;
  },
) {
  await tx.insert(supplierReturnStatusHistory).values({
    supplierReturnId: params.supplierReturnId,
    fromStatus: params.fromStatus,
    toStatus: params.toStatus,
    changedBy: params.changedBy,
    notes: params.notes ?? null,
  });
}

// ── Service Functions ──

/**
 * Create a supplier return in DRAFT status.
 * IDEMPOTENT: If already processed with same key, returns existing record.
 */
type ReturnablePoLineRow = {
  id: string;
  poNo: string;
  productId: string;
  productName: string;
  sku: string | null;
  receivedQty: number;
  alreadyReturnedQty: number;
  returnableQty: number;
  unitCost: string;
};

async function selectReturnablePoLines(
  tx: DbOrTx,
  orgId: string,
  poId: string,
  excludeRtvId?: string | null,
): Promise<ReturnablePoLineRow[]> {
  const excludeCurrentRtv = excludeRtvId
    ? sql`AND sr.id <> ${excludeRtvId}`
    : sql``;

  const rows = await tx.execute(sql`
    SELECT
      pol.id,
      po.po_no,
      pol.product_id,
      p.name AS product_name,
      p.sku,
      pol.received_accepted_qty,
      pol.unit_cost,
      COALESCE((
        SELECT SUM(srl.quantity)::int
        FROM supplier_return_lines srl
        JOIN supplier_returns sr ON sr.id = srl.supplier_return_id
        WHERE srl.source_po_line_id = pol.id
          AND sr.org_id = ${orgId}
          AND sr.status <> 'CANCELLED'
          ${excludeCurrentRtv}
      ), 0) AS already_returned_qty
    FROM po_lines pol
    JOIN purchase_orders po ON po.id = pol.purchase_order_id
    JOIN products p ON p.id = pol.product_id
    WHERE pol.org_id = ${orgId}
      AND po.org_id = ${orgId}
      AND po.id = ${poId}
      AND pol.received_accepted_qty > 0
    ORDER BY p.name ASC, pol.id ASC
  `);

  return (rows as any[]).map((row) => {
    const receivedQty = Number(row.received_accepted_qty ?? 0);
    const alreadyReturnedQty = Number(row.already_returned_qty ?? 0);
    return {
      id: row.id,
      poNo: row.po_no,
      productId: row.product_id,
      productName: row.product_name,
      sku: row.sku,
      receivedQty,
      alreadyReturnedQty,
      returnableQty: Math.max(receivedQty - alreadyReturnedQty, 0),
      unitCost: String(row.unit_cost ?? "0.00"),
    };
  });
}

async function assertPoReturnQuantities(
  tx: DbOrTx,
  params: {
    orgId: string;
    supplierId: string;
    sourcePoId?: string | null;
    lines: Array<{ productId: string; quantity: number; sourcePoLineId?: string | null }>;
    excludeRtvId?: string | null;
  },
) {
  const linkedLines = params.lines.filter((line) => line.sourcePoLineId);
  if (linkedLines.length === 0) return;

  if (!params.sourcePoId) {
    throw new Error("Source PO is required when return lines are linked to PO lines");
  }

  const [po] = await tx
    .select({ id: purchaseOrders.id, supplierId: purchaseOrders.supplierId })
    .from(purchaseOrders)
    .where(
      and(
        eq(purchaseOrders.id, params.sourcePoId),
        eq(purchaseOrders.orgId, params.orgId),
        eq(purchaseOrders.supplierId, params.supplierId),
      ),
    )
    .limit(1);
  if (!po) throw new Error("Source PO not found or does not match supplier");

  const returnableRows = await selectReturnablePoLines(
    tx,
    params.orgId,
    params.sourcePoId,
    params.excludeRtvId,
  );
  const returnableByLine = new Map(returnableRows.map((row) => [row.id, row]));
  const requestedByPoLine = new Map<string, number>();

  for (const line of linkedLines) {
    const row = returnableByLine.get(line.sourcePoLineId!);
    if (!row) {
      throw new Error("Source PO line not found or has no received quantity");
    }
    if (row.productId !== line.productId) {
      throw new Error("Source PO line does not match the selected product");
    }
    requestedByPoLine.set(
      row.id,
      (requestedByPoLine.get(row.id) ?? 0) + line.quantity,
    );
  }

  for (const [poLineId, requestedQty] of requestedByPoLine) {
    const row = returnableByLine.get(poLineId)!;
    if (requestedQty > row.returnableQty) {
      throw new Error(
        `Cannot return ${requestedQty} unit(s) for ${row.productName}; only ${row.returnableQty} remain returnable from ${row.poNo}`,
      );
    }
  }
}

export async function createSupplierReturn(
  orgId: string,
  locationId: string,
  userId: string,
  input: CreateSupplierReturnInput,
) {
  return db.transaction(async (tx) => {
    // Idempotency check
    const [existing] = await tx
      .select()
      .from(supplierReturns)
      .where(
        and(
          eq(supplierReturns.orgId, orgId),
          eq(supplierReturns.idempotencyKey, input.idempotencyKey),
        ),
      )
      .limit(1);

    if (existing) {
      const lines = await tx
        .select()
        .from(supplierReturnLines)
        .where(eq(supplierReturnLines.supplierReturnId, existing.id));
      return { ...existing, lines };
    }

    // Validate supplier belongs to org
    const [supplier] = await tx
      .select({ id: suppliers.id })
      .from(suppliers)
      .where(and(eq(suppliers.id, input.supplierId), eq(suppliers.orgId, orgId)))
      .limit(1);
    if (!supplier) throw new Error("Supplier not found");

    // Validate location belongs to org
    const [location] = await tx
      .select({ id: locations.id })
      .from(locations)
      .where(and(eq(locations.id, input.locationId), eq(locations.orgId, orgId)))
      .limit(1);
    if (!location) throw new Error("Location not found");

    // Validate products belong to org
    const productIds = input.lines.map((l) => l.productId);
    const productRows = await tx
      .select({ id: products.id, name: products.name, sku: products.sku })
      .from(products)
      .where(
        and(
          inArray(products.id, productIds),
          eq(products.orgId, orgId),
        ),
      );
    const productMap = new Map(productRows.map((p) => [p.id, p]));

    for (const line of input.lines) {
      if (!productMap.has(line.productId)) {
        throw new Error(`Product ${line.productId} not found`);
      }
    }

    // If sourcePoId, verify it belongs to supplier and org
    if (input.sourcePoId) {
      const [po] = await tx
        .select({ id: purchaseOrders.id })
        .from(purchaseOrders)
        .where(
          and(
            eq(purchaseOrders.id, input.sourcePoId),
            eq(purchaseOrders.orgId, orgId),
            eq(purchaseOrders.supplierId, input.supplierId),
          ),
        )
        .limit(1);
      if (!po) throw new Error("Source PO not found or does not match supplier");
    }

    await assertPoReturnQuantities(tx, {
      orgId,
      supplierId: input.supplierId,
      sourcePoId: input.sourcePoId,
      lines: input.lines,
    });

    // Calculate line totals and total cost
    let totalCost = 0;
    const lineInserts = input.lines.map((line) => {
      const cost = parseFloat(line.costPrice);
      const lineTotal = cost * line.quantity;
      totalCost += lineTotal;
      const prod = productMap.get(line.productId)!;
      return {
        productId: line.productId,
        productName: prod.name,
        sku: prod.sku,
        quantity: line.quantity,
        costPrice: line.costPrice,
        lineTotal: lineTotal.toFixed(2),
        condition: line.condition as any,
        sourcePoLineId: line.sourcePoLineId ?? null,
        sourceCustomerReturnLineId: line.sourceCustomerReturnLineId ?? null,
        notes: line.notes ?? null,
        supplierReturnId: "", // placeholder, set below
      };
    });

    // Generate RTV number
    const rtvNumber = await generateRtvNumber(tx, orgId);

    // Insert supplier_return header
    const [rtv] = await tx
      .insert(supplierReturns)
      .values({
        orgId,
        locationId: input.locationId,
        rtvNumber,
        supplierId: input.supplierId,
        status: "DRAFT",
        reason: input.reason as any,
        reasonNotes: input.reasonNotes ?? null,
        totalCost: totalCost.toFixed(2),
        sourcePoId: input.sourcePoId ?? null,
        sourceCustomerReturnId: input.sourceCustomerReturnId ?? null,
        createdBy: userId,
        notes: input.notes ?? null,
        idempotencyKey: input.idempotencyKey,
      })
      .returning();

    // Insert lines
    for (const li of lineInserts) {
      li.supplierReturnId = rtv.id;
    }
    await tx.insert(supplierReturnLines).values(lineInserts);

    // Insert status history: NULL → DRAFT
    await insertStatusHistory(tx, {
      supplierReturnId: rtv.id,
      fromStatus: null,
      toStatus: "DRAFT",
      changedBy: userId,
      notes: "Created",
    });

    const insertedLines = await tx
      .select()
      .from(supplierReturnLines)
      .where(eq(supplierReturnLines.supplierReturnId, rtv.id));

    return { ...rtv, lines: insertedLines };
  });
}

/**
 * Update a DRAFT supplier return (header fields and/or lines).
 */
export async function updateSupplierReturn(
  rtvId: string,
  orgId: string,
  userId: string,
  input: UpdateSupplierReturnInput,
) {
  return db.transaction(async (tx) => {
    // Lock row, verify DRAFT
    const rows = await tx.execute(
      sql`SELECT * FROM supplier_returns WHERE id = ${rtvId} AND org_id = ${orgId} FOR UPDATE`,
    );
    if (rows.length === 0) throw new Error("Supplier return not found");
    const rtv = rows[0] as any;
    if (rtv.status !== "DRAFT") {
      throw new Error(`Cannot update supplier return in ${rtv.status} status`);
    }

    // Update header fields
    const updates: Record<string, any> = {};
    if (input.reason !== undefined) updates.reason = input.reason;
    if (input.reasonNotes !== undefined) updates.reasonNotes = input.reasonNotes;
    if (input.notes !== undefined) updates.notes = input.notes;

    // If lines provided, replace all lines
    if (input.lines && input.lines.length > 0) {
      // Validate products
      const productIds = input.lines.map((l) => l.productId);
      const productRows = await tx
        .select({ id: products.id, name: products.name, sku: products.sku })
        .from(products)
        .where(
          and(
            inArray(products.id, productIds),
            eq(products.orgId, orgId),
          ),
        );
      const productMap = new Map(productRows.map((p) => [p.id, p]));

      for (const line of input.lines) {
        if (!productMap.has(line.productId)) {
          throw new Error(`Product ${line.productId} not found`);
        }
      }

      await assertPoReturnQuantities(tx, {
        orgId,
        supplierId: rtv.supplier_id,
        sourcePoId: rtv.source_po_id,
        lines: input.lines,
        excludeRtvId: rtvId,
      });

      // Delete old lines
      await tx
        .delete(supplierReturnLines)
        .where(eq(supplierReturnLines.supplierReturnId, rtvId));

      // Insert new lines
      let totalCost = 0;
      const lineInserts = input.lines.map((line) => {
        const cost = parseFloat(line.costPrice);
        const lineTotal = cost * line.quantity;
        totalCost += lineTotal;
        const prod = productMap.get(line.productId)!;
        return {
          supplierReturnId: rtvId,
          productId: line.productId,
          productName: prod.name,
          sku: prod.sku,
          quantity: line.quantity,
          costPrice: line.costPrice,
          lineTotal: lineTotal.toFixed(2),
          condition: line.condition as any,
          sourcePoLineId: line.sourcePoLineId ?? null,
          sourceCustomerReturnLineId: line.sourceCustomerReturnLineId ?? null,
          notes: line.notes ?? null,
        };
      });
      await tx.insert(supplierReturnLines).values(lineInserts);
      updates.totalCost = totalCost.toFixed(2);
    }

    if (Object.keys(updates).length > 0) {
      await tx
        .update(supplierReturns)
        .set(updates)
        .where(eq(supplierReturns.id, rtvId));

      await insertStatusHistory(tx, {
        supplierReturnId: rtvId,
        fromStatus: "DRAFT",
        toStatus: "DRAFT",
        changedBy: userId,
        notes: "Draft updated",
      });
    }

    // Return updated record
    const [updated] = await tx
      .select()
      .from(supplierReturns)
      .where(eq(supplierReturns.id, rtvId));
    const lines = await tx
      .select()
      .from(supplierReturnLines)
      .where(eq(supplierReturnLines.supplierReturnId, rtvId));

    return { ...updated, lines };
  });
}

/**
 * Find an existing DRAFT RTV for a supplier at a location.
 */
export async function findDraftRTV(orgId: string, supplierId: string, locationId: string) {
  const [draft] = await db
    .select({
      id: supplierReturns.id,
      rtvNumber: supplierReturns.rtvNumber,
      lineCount: sql<number>`(SELECT COUNT(*)::int FROM supplier_return_lines srl WHERE srl.supplier_return_id = ${supplierReturns.id})`,
    })
    .from(supplierReturns)
    .where(
      and(
        eq(supplierReturns.orgId, orgId),
        eq(supplierReturns.supplierId, supplierId),
        eq(supplierReturns.locationId, locationId),
        eq(supplierReturns.status, "DRAFT"),
      ),
    )
    .orderBy(desc(supplierReturns.createdAt))
    .limit(1);

  return draft ?? null;
}

/**
 * Add a line item to an existing DRAFT RTV.
 */
export async function addLineToRTV(
  rtvId: string,
  orgId: string,
  input: {
    productId: string;
    quantity: number;
    costPrice: string;
    condition: string;
    notes?: string | null;
    sourcePoLineId?: string | null;
  },
) {
  return db.transaction(async (tx) => {
    // Lock and verify DRAFT status
    const rows = await tx.execute(
      sql`SELECT * FROM supplier_returns WHERE id = ${rtvId} AND org_id = ${orgId} FOR UPDATE`,
    );
    if (rows.length === 0) throw new Error("Supplier return not found");
    const rtv = rows[0] as any;
    if (rtv.status !== "DRAFT") throw new Error("Can only add lines to DRAFT RTVs");

    // Fetch product info
    const [product] = await tx
      .select({ name: products.name, sku: products.sku })
      .from(products)
      .where(eq(products.id, input.productId))
      .limit(1);
    if (!product) throw new Error("Product not found");

    await assertPoReturnQuantities(tx, {
      orgId,
      supplierId: rtv.supplier_id,
      sourcePoId: rtv.source_po_id,
      lines: [input],
    });

    const lineTotal = (input.quantity * parseFloat(input.costPrice)).toFixed(2);

    // Insert line
    const [line] = await tx
      .insert(supplierReturnLines)
      .values({
        supplierReturnId: rtvId,
        productId: input.productId,
        productName: product.name,
        sku: product.sku,
        quantity: input.quantity,
        costPrice: input.costPrice,
        lineTotal,
        condition: input.condition as any,
        sourcePoLineId: input.sourcePoLineId ?? null,
        notes: input.notes ?? null,
      })
      .returning();

    // Update total cost
    const oldTotal = parseFloat(rtv.total_cost || "0");
    const newTotal = (oldTotal + parseFloat(lineTotal)).toFixed(2);
    await tx
      .update(supplierReturns)
      .set({ totalCost: newTotal })
      .where(eq(supplierReturns.id, rtvId));

    return { line, rtvNumber: rtv.rtv_number, newTotal };
  });
}

/**
 * Delete a DRAFT supplier return.
 */
export async function deleteSupplierReturn(
  rtvId: string,
  orgId: string,
) {
  return db.transaction(async (tx) => {
    const rows = await tx.execute(
      sql`SELECT * FROM supplier_returns WHERE id = ${rtvId} AND org_id = ${orgId} FOR UPDATE`,
    );
    if (rows.length === 0) throw new Error("Supplier return not found");
    const rtv = rows[0] as any;
    if (rtv.status !== "DRAFT") {
      throw new Error(`Cannot delete supplier return in ${rtv.status} status`);
    }

    await tx.delete(supplierReturns).where(eq(supplierReturns.id, rtvId));
    return { deleted: true };
  });
}

/**
 * Submit a supplier return: DRAFT → SUBMITTED.
 * Deducts inventory for each line and creates stock journal entries.
 */
export async function submitSupplierReturn(
  rtvId: string,
  orgId: string,
  userId: string,
  notes?: string,
) {
  return db.transaction(async (tx) => {
    // Lock RTV row, verify DRAFT
    const rows = await tx.execute(
      sql`SELECT * FROM supplier_returns WHERE id = ${rtvId} AND org_id = ${orgId} FOR UPDATE`,
    );
    if (rows.length === 0) throw new Error("Supplier return not found");
    const rtv = rows[0] as any;

    if (rtv.status !== "DRAFT") {
      throw new Error(`Cannot submit supplier return in ${rtv.status} status`);
    }

    // Fetch lines
    const lines = await tx
      .select()
      .from(supplierReturnLines)
      .where(eq(supplierReturnLines.supplierReturnId, rtvId));

    // Deduct inventory for each line (allow negative — items may already be set aside)
    for (const line of lines) {
      const inv = await lockInventoryRow(
        tx,
        orgId,
        line.productId,
        rtv.location_id,
      );

      const newBalance = inv.stockLevel - line.quantity;

      await tx
        .update(inventory)
        .set({ stockLevel: newBalance })
        .where(eq(inventory.id, inv.id));

      await insertJournalEntry(tx, {
        orgId,
        productId: line.productId,
        locationId: rtv.location_id,
        userId,
        actorType: "USER",
        changeQuantity: -line.quantity,
        balanceAfter: newBalance,
        referenceType: "SUPPLIER_RETURN",
        referenceId: rtvId,
        referenceLineId: line.id,
        idempotencyKey: `${rtv.idempotency_key}:SUBMIT:${line.id}`,
        notes: `[Supplier Return] ${rtv.rtv_number}`,
      });
    }

    // Update status
    const [updated] = await tx
      .update(supplierReturns)
      .set({
        status: "SUBMITTED",
        submittedAt: new Date(),
      })
      .where(eq(supplierReturns.id, rtvId))
      .returning();

    await insertStatusHistory(tx, {
      supplierReturnId: rtvId,
      fromStatus: "DRAFT",
      toStatus: "SUBMITTED",
      changedBy: userId,
      notes,
    });

    const updatedLines = await tx
      .select()
      .from(supplierReturnLines)
      .where(eq(supplierReturnLines.supplierReturnId, rtvId));

    return { ...updated, lines: updatedLines };
  });
}

/**
 * Acknowledge a supplier return: SUBMITTED → ACKNOWLEDGED.
 */
export async function acknowledgeSupplierReturn(
  rtvId: string,
  orgId: string,
  userId: string,
  notes?: string,
) {
  return db.transaction(async (tx) => {
    const rows = await tx.execute(
      sql`SELECT * FROM supplier_returns WHERE id = ${rtvId} AND org_id = ${orgId} FOR UPDATE`,
    );
    if (rows.length === 0) throw new Error("Supplier return not found");
    const rtv = rows[0] as any;

    if (rtv.status !== "SUBMITTED") {
      throw new Error(
        `Cannot acknowledge supplier return in ${rtv.status} status`,
      );
    }

    const [updated] = await tx
      .update(supplierReturns)
      .set({
        status: "ACKNOWLEDGED",
        acknowledgedAt: new Date(),
      })
      .where(eq(supplierReturns.id, rtvId))
      .returning();

    await insertStatusHistory(tx, {
      supplierReturnId: rtvId,
      fromStatus: "SUBMITTED",
      toStatus: "ACKNOWLEDGED",
      changedBy: userId,
      notes,
    });

    return updated;
  });
}

/**
 * Receive credit: ACKNOWLEDGED → CREDIT_RECEIVED.
 */
export async function receiveCreditSupplierReturn(
  rtvId: string,
  orgId: string,
  userId: string,
  input: ReceiveCreditInput,
) {
  return db.transaction(async (tx) => {
    const rows = await tx.execute(
      sql`SELECT * FROM supplier_returns WHERE id = ${rtvId} AND org_id = ${orgId} FOR UPDATE`,
    );
    if (rows.length === 0) throw new Error("Supplier return not found");
    const rtv = rows[0] as any;

    if (rtv.status !== "ACKNOWLEDGED") {
      throw new Error(
        `Cannot receive credit for supplier return in ${rtv.status} status`,
      );
    }

    const [updated] = await tx
      .update(supplierReturns)
      .set({
        status: "CREDIT_RECEIVED",
        creditAmount: input.creditAmount,
        creditType: input.creditType as any,
        creditReference: input.creditReference ?? null,
        creditReceivedAt: new Date(),
      })
      .where(eq(supplierReturns.id, rtvId))
      .returning();

    await insertStatusHistory(tx, {
      supplierReturnId: rtvId,
      fromStatus: "ACKNOWLEDGED",
      toStatus: "CREDIT_RECEIVED",
      changedBy: userId,
      notes: input.notes,
    });

    return updated;
  });
}

/**
 * Close a supplier return: CREDIT_RECEIVED → CLOSED.
 */
export async function closeSupplierReturn(
  rtvId: string,
  orgId: string,
  userId: string,
  notes?: string,
) {
  return db.transaction(async (tx) => {
    const rows = await tx.execute(
      sql`SELECT * FROM supplier_returns WHERE id = ${rtvId} AND org_id = ${orgId} FOR UPDATE`,
    );
    if (rows.length === 0) throw new Error("Supplier return not found");
    const rtv = rows[0] as any;

    if (rtv.status !== "CREDIT_RECEIVED") {
      throw new Error(
        `Cannot close supplier return in ${rtv.status} status`,
      );
    }

    const [updated] = await tx
      .update(supplierReturns)
      .set({
        status: "CLOSED",
        closedAt: new Date(),
      })
      .where(eq(supplierReturns.id, rtvId))
      .returning();

    await insertStatusHistory(tx, {
      supplierReturnId: rtvId,
      fromStatus: "CREDIT_RECEIVED",
      toStatus: "CLOSED",
      changedBy: userId,
      notes,
    });

    return updated;
  });
}

/**
 * Close without credit: SUBMITTED or ACKNOWLEDGED → CLOSED_WITHOUT_CREDIT.
 */
export async function closeWithoutCreditSupplierReturn(
  rtvId: string,
  orgId: string,
  userId: string,
  input: CloseWithoutCreditInput,
) {
  return db.transaction(async (tx) => {
    const rows = await tx.execute(
      sql`SELECT * FROM supplier_returns WHERE id = ${rtvId} AND org_id = ${orgId} FOR UPDATE`,
    );
    if (rows.length === 0) throw new Error("Supplier return not found");
    const rtv = rows[0] as any;

    if (rtv.status !== "SUBMITTED" && rtv.status !== "ACKNOWLEDGED") {
      throw new Error(
        `Cannot close without credit in ${rtv.status} status (must be SUBMITTED or ACKNOWLEDGED)`,
      );
    }

    const [updated] = await tx
      .update(supplierReturns)
      .set({
        status: "CLOSED_WITHOUT_CREDIT",
        closedAt: new Date(),
        cancelReason: input.reason, // reuse cancel_reason column for the reason
      })
      .where(eq(supplierReturns.id, rtvId))
      .returning();

    await insertStatusHistory(tx, {
      supplierReturnId: rtvId,
      fromStatus: rtv.status,
      toStatus: "CLOSED_WITHOUT_CREDIT",
      changedBy: userId,
      notes: input.reason,
    });

    return updated;
  });
}

/**
 * Cancel a supplier return: DRAFT or SUBMITTED → CANCELLED.
 * If SUBMITTED, restores inventory for each line.
 */
export async function cancelSupplierReturn(
  rtvId: string,
  orgId: string,
  userId: string,
  input: CancelSupplierReturnInput,
) {
  return db.transaction(async (tx) => {
    const rows = await tx.execute(
      sql`SELECT * FROM supplier_returns WHERE id = ${rtvId} AND org_id = ${orgId} FOR UPDATE`,
    );
    if (rows.length === 0) throw new Error("Supplier return not found");
    const rtv = rows[0] as any;

    if (rtv.status !== "DRAFT" && rtv.status !== "SUBMITTED") {
      throw new Error(
        `Cannot cancel supplier return in ${rtv.status} status (must be DRAFT or SUBMITTED)`,
      );
    }

    // If SUBMITTED, restore inventory
    if (rtv.status === "SUBMITTED") {
      const lines = await tx
        .select()
        .from(supplierReturnLines)
        .where(eq(supplierReturnLines.supplierReturnId, rtvId));

      for (const line of lines) {
        const inv = await lockInventoryRow(
          tx,
          orgId,
          line.productId,
          rtv.location_id,
        );

        const newBalance = inv.stockLevel + line.quantity;

        await tx
          .update(inventory)
          .set({ stockLevel: newBalance })
          .where(eq(inventory.id, inv.id));

        await insertJournalEntry(tx, {
          orgId,
          productId: line.productId,
          locationId: rtv.location_id,
          userId,
          actorType: "USER",
          changeQuantity: line.quantity,
          balanceAfter: newBalance,
          referenceType: "SUPPLIER_RETURN_CANCEL",
          referenceId: rtvId,
          referenceLineId: line.id,
          idempotencyKey: `${rtv.idempotency_key}:CANCEL:${line.id}`,
          notes: `[Cancel Supplier Return] ${rtv.rtv_number} — ${input.reason}`,
        });
      }
    }

    const [updated] = await tx
      .update(supplierReturns)
      .set({
        status: "CANCELLED",
        cancelledAt: new Date(),
        cancelledBy: userId,
        cancelReason: input.reason,
      })
      .where(eq(supplierReturns.id, rtvId))
      .returning();

    await insertStatusHistory(tx, {
      supplierReturnId: rtvId,
      fromStatus: rtv.status,
      toStatus: "CANCELLED",
      changedBy: userId,
      notes: input.reason,
    });

    return updated;
  });
}

/**
 * Supplier rejected an acknowledged RTV; bring the dispatched items back to stock.
 */
export async function rejectSupplierReturn(
  rtvId: string,
  orgId: string,
  userId: string,
  input: CancelSupplierReturnInput,
) {
  return db.transaction(async (tx) => {
    const rows = await tx.execute(
      sql`SELECT * FROM supplier_returns WHERE id = ${rtvId} AND org_id = ${orgId} FOR UPDATE`,
    );
    if (rows.length === 0) throw new Error("Supplier return not found");
    const rtv = rows[0] as any;

    if (rtv.status !== "ACKNOWLEDGED") {
      throw new Error(
        `Cannot mark supplier return rejected in ${rtv.status} status (must be ACKNOWLEDGED)`,
      );
    }

    const lines = await tx
      .select()
      .from(supplierReturnLines)
      .where(eq(supplierReturnLines.supplierReturnId, rtvId));

    for (const line of lines) {
      const inv = await lockInventoryRow(
        tx,
        orgId,
        line.productId,
        rtv.location_id,
      );

      const newBalance = inv.stockLevel + line.quantity;

      await tx
        .update(inventory)
        .set({ stockLevel: newBalance })
        .where(eq(inventory.id, inv.id));

      await insertJournalEntry(tx, {
        orgId,
        productId: line.productId,
        locationId: rtv.location_id,
        userId,
        actorType: "USER",
        changeQuantity: line.quantity,
        balanceAfter: newBalance,
        referenceType: "SUPPLIER_RETURN_CANCEL",
        referenceId: rtvId,
        referenceLineId: line.id,
        idempotencyKey: `${rtv.idempotency_key}:REJECT:${line.id}`,
        notes: `[Supplier Rejected Return] ${rtv.rtv_number} — ${input.reason}`,
      });
    }

    const [updated] = await tx
      .update(supplierReturns)
      .set({
        status: "CANCELLED",
        cancelledAt: new Date(),
        cancelledBy: userId,
        cancelReason: `Supplier rejected: ${input.reason}`,
      })
      .where(eq(supplierReturns.id, rtvId))
      .returning();

    await insertStatusHistory(tx, {
      supplierReturnId: rtvId,
      fromStatus: "ACKNOWLEDGED",
      toStatus: "CANCELLED",
      changedBy: userId,
      notes: `Supplier rejected: ${input.reason}`,
    });

    return updated;
  });
}

// ── Query Functions ──

/**
 * Get a single supplier return with lines and status history.
 */
export async function getReturnablePoLines(
  orgId: string,
  poId: string,
  excludeRtvId?: string | null,
) {
  return {
    data: await selectReturnablePoLines(db, orgId, poId, excludeRtvId),
  };
}

export async function getSupplierReturn(rtvId: string, orgId: string) {
  const [rtv] = await db
    .select()
    .from(supplierReturns)
    .where(and(eq(supplierReturns.id, rtvId), eq(supplierReturns.orgId, orgId)))
    .limit(1);

  if (!rtv) return null;

  // Resolve createdBy user name
  let createdByName: string | null = null;
  if (rtv.createdBy) {
    const [creator] = await db
      .select({ fullName: users.fullName })
      .from(users)
      .where(eq(users.id, rtv.createdBy))
      .limit(1);
    createdByName = creator?.fullName ?? null;
  }

  const lines = await db
    .select({
      id: supplierReturnLines.id,
      supplierReturnId: supplierReturnLines.supplierReturnId,
      productId: supplierReturnLines.productId,
      productName: supplierReturnLines.productName,
      sku: supplierReturnLines.sku,
      quantity: supplierReturnLines.quantity,
      costPrice: supplierReturnLines.costPrice,
      lineTotal: supplierReturnLines.lineTotal,
      condition: supplierReturnLines.condition,
      sourcePoLineId: supplierReturnLines.sourcePoLineId,
      sourceCustomerReturnLineId: supplierReturnLines.sourceCustomerReturnLineId,
      notes: supplierReturnLines.notes,
      createdAt: supplierReturnLines.createdAt,
      brandName: brands.name,
      currentSku: products.sku,
      oemNumber: products.oemNumber,
      currentStockLevel: inventory.stockLevel,
    })
    .from(supplierReturnLines)
    .leftJoin(products, eq(supplierReturnLines.productId, products.id))
    .leftJoin(brands, eq(products.brandId, brands.id))
    .leftJoin(
      inventory,
      and(
        eq(inventory.orgId, orgId),
        eq(inventory.productId, supplierReturnLines.productId),
        eq(inventory.locationId, rtv.locationId),
      ),
    )
    .where(eq(supplierReturnLines.supplierReturnId, rtv.id));

  const historyRows = await db
    .select({
      id: supplierReturnStatusHistory.id,
      fromStatus: supplierReturnStatusHistory.fromStatus,
      toStatus: supplierReturnStatusHistory.toStatus,
      changedByUserId: supplierReturnStatusHistory.changedBy,
      changedByName: users.fullName,
      notes: supplierReturnStatusHistory.notes,
      createdAt: supplierReturnStatusHistory.changedAt,
    })
    .from(supplierReturnStatusHistory)
    .leftJoin(users, eq(supplierReturnStatusHistory.changedBy, users.id))
    .where(eq(supplierReturnStatusHistory.supplierReturnId, rtv.id))
    .orderBy(desc(supplierReturnStatusHistory.changedAt));
  const history = historyRows.map((h) => ({
    ...h,
    changedByName: h.changedByName ?? null,
    createdAt: h.createdAt?.toISOString() ?? null,
  }));

  // Fetch supplier info
  const [supplier] = await db
    .select({
      id: suppliers.id,
      name: suppliers.name,
    })
    .from(suppliers)
    .where(eq(suppliers.id, rtv.supplierId))
    .limit(1);

  // Fetch location info
  const [location] = await db
    .select({
      id: locations.id,
      name: locations.name,
      code: locations.code,
    })
    .from(locations)
    .where(eq(locations.id, rtv.locationId))
    .limit(1);

  const [sourcePo] = rtv.sourcePoId
    ? await db
        .select({
          id: purchaseOrders.id,
          poNo: purchaseOrders.poNo,
        })
        .from(purchaseOrders)
        .where(eq(purchaseOrders.id, rtv.sourcePoId))
        .limit(1)
    : [];

  return {
    ...rtv,
    rtvNo: rtv.rtvNumber,
    sourcePONo: sourcePo?.poNo ?? null,
    createdByName,
    lineCount: lines.length,
    lines,
    statusHistory: history,
    supplier: supplier ?? null,
    location: location ?? null,
  };
}

/**
 * List supplier returns with filters and keyset cursor pagination.
 */
export async function listSupplierReturns(
  orgId: string,
  opts: {
    locationId?: string | null;
    status?: string[];
    supplierId?: string;
    search?: string;
    dateFrom?: string;
    dateTo?: string;
    cursor?: string;
    limit: number;
  },
) {
  const conditions: SQL[] = [eq(supplierReturns.orgId, orgId)];

  if (opts.locationId) {
    conditions.push(eq(supplierReturns.locationId, opts.locationId));
  }

  if (opts.status && opts.status.length > 0) {
    conditions.push(
      inArray(supplierReturns.status, opts.status as any),
    );
  }

  if (opts.supplierId) {
    conditions.push(eq(supplierReturns.supplierId, opts.supplierId));
  }

  if (opts.search) {
    const pattern = "%" + opts.search + "%";
    conditions.push(
      sql`(${supplierReturns.rtvNumber} ILIKE ${pattern} OR ${suppliers.name} ILIKE ${pattern})`,
    );
  }

  if (opts.dateFrom) {
    conditions.push(sql`${supplierReturns.createdAt} >= ${opts.dateFrom}`);
  }
  if (opts.dateTo) {
    conditions.push(sql`${supplierReturns.createdAt} <= ${opts.dateTo}`);
  }

  // Keyset cursor pagination
  if (opts.cursor) {
    const [cursorRow] = await db
      .select({
        createdAt: supplierReturns.createdAt,
        id: supplierReturns.id,
      })
      .from(supplierReturns)
      .where(eq(supplierReturns.id, opts.cursor))
      .limit(1);

    if (cursorRow) {
      conditions.push(
        sql`(${supplierReturns.createdAt}, ${supplierReturns.id}) < (${cursorRow.createdAt}, ${opts.cursor})`,
      );
    }
  }

  const limit = opts.limit;
  const rows = await db
    .select({
      id: supplierReturns.id,
      orgId: supplierReturns.orgId,
      locationId: supplierReturns.locationId,
      rtvNo: supplierReturns.rtvNumber,
      supplierId: supplierReturns.supplierId,
      status: supplierReturns.status,
      reason: supplierReturns.reason,
      totalCost: supplierReturns.totalCost,
      creditAmount: supplierReturns.creditAmount,
      creditType: supplierReturns.creditType,
      sourcePOId: supplierReturns.sourcePoId,
      sourcePONo: purchaseOrders.poNo,
      submittedAt: supplierReturns.submittedAt,
      createdAt: supplierReturns.createdAt,
      updatedAt: supplierReturns.updatedAt,
      // Joined fields
      supplierName: suppliers.name,
      locationName: locations.name,
      lineCount: sql<number>`(
        SELECT count(*)::int FROM supplier_return_lines srl
        WHERE srl.supplier_return_id = ${supplierReturns.id}
      )`.as("line_count"),
    })
    .from(supplierReturns)
    .leftJoin(suppliers, eq(suppliers.id, supplierReturns.supplierId))
    .leftJoin(locations, eq(locations.id, supplierReturns.locationId))
    .leftJoin(purchaseOrders, eq(purchaseOrders.id, supplierReturns.sourcePoId))
    .where(and(...conditions))
    .orderBy(desc(supplierReturns.createdAt), desc(supplierReturns.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? data[data.length - 1].id : null;

  return { data, nextCursor, hasMore };
}

export async function getSupplierReturnAnalytics(
  orgId: string,
  opts: { locationId?: string | null } = {},
) {
  const locationSql = opts.locationId
    ? sql`AND sr.location_id = ${opts.locationId}`
    : sql``;

  const pendingRows = await db.execute(sql`
    SELECT
      sr.id,
      sr.total_cost,
      COALESCE(sr.submitted_at, sr.created_at) AS pending_since
    FROM supplier_returns sr
    WHERE sr.org_id = ${orgId}
      AND sr.status IN ('SUBMITTED', 'ACKNOWLEDGED')
      ${locationSql}
  `);

  const pendingBuckets = [
    { key: "0-7", label: "0-7 days", min: 0, max: 7, count: 0, totalValue: 0 },
    { key: "8-14", label: "8-14 days", min: 8, max: 14, count: 0, totalValue: 0 },
    { key: "15-30", label: "15-30 days", min: 15, max: 30, count: 0, totalValue: 0 },
    { key: "30+", label: "30+ days", min: 31, max: Number.POSITIVE_INFINITY, count: 0, totalValue: 0 },
  ];
  const now = Date.now();
  for (const row of pendingRows as any[]) {
    const pendingSince = row.pending_since ? new Date(row.pending_since).getTime() : now;
    const ageDays = Math.max(0, Math.floor((now - pendingSince) / 86_400_000));
    const bucket = pendingBuckets.find((b) => ageDays >= b.min && ageDays <= b.max) ?? pendingBuckets[pendingBuckets.length - 1];
    bucket.count += 1;
    bucket.totalValue += Number(row.total_cost ?? 0);
  }

  const topSuppliers = await db.execute(sql`
    SELECT
      s.id AS supplier_id,
      s.name AS supplier_name,
      COUNT(sr.id)::int AS return_count,
      COALESCE(SUM(sr.total_cost), 0)::numeric AS total_value
    FROM supplier_returns sr
    JOIN suppliers s ON s.id = sr.supplier_id
    WHERE sr.org_id = ${orgId}
      ${locationSql}
    GROUP BY s.id, s.name
    ORDER BY total_value DESC, return_count DESC
    LIMIT 5
  `);

  const topItems = await db.execute(sql`
    SELECT
      srl.product_id,
      srl.product_name,
      COUNT(DISTINCT sr.id)::int AS return_count,
      COALESCE(SUM(srl.quantity), 0)::int AS total_qty,
      COALESCE(SUM(srl.line_total), 0)::numeric AS total_value
    FROM supplier_return_lines srl
    JOIN supplier_returns sr ON sr.id = srl.supplier_return_id
    WHERE sr.org_id = ${orgId}
      ${locationSql}
    GROUP BY srl.product_id, srl.product_name
    ORDER BY total_qty DESC, total_value DESC
    LIMIT 5
  `);

  const reasonBreakdown = await db.execute(sql`
    SELECT
      sr.reason,
      COUNT(sr.id)::int AS return_count,
      COALESCE(SUM(sr.total_cost), 0)::numeric AS total_value
    FROM supplier_returns sr
    WHERE sr.org_id = ${orgId}
      ${locationSql}
    GROUP BY sr.reason
    ORDER BY return_count DESC
  `);

  const monthlyTotals = await db.execute(sql`
    SELECT
      to_char(date_trunc('month', sr.created_at), 'YYYY-MM') AS month,
      COUNT(sr.id)::int AS return_count,
      COALESCE(SUM(sr.total_cost), 0)::numeric AS total_value
    FROM supplier_returns sr
    WHERE sr.org_id = ${orgId}
      ${locationSql}
      AND sr.created_at >= now() - interval '12 months'
    GROUP BY date_trunc('month', sr.created_at)
    ORDER BY month DESC
  `);

  const pendingTotalValue = pendingBuckets.reduce((sum, bucket) => sum + bucket.totalValue, 0);
  const pendingTotalCount = pendingBuckets.reduce((sum, bucket) => sum + bucket.count, 0);

  return {
    pendingAging: {
      totalCount: pendingTotalCount,
      totalValue: pendingTotalValue,
      buckets: pendingBuckets.map(({ min: _min, max: _max, ...bucket }) => bucket),
    },
    topSuppliers,
    topItems,
    reasonBreakdown,
    monthlyTotals,
  };
}

export async function listSupplierReturnAttachments(
  rtvId: string,
  orgId: string,
) {
  const data = await db
    .select()
    .from(supplierReturnAttachments)
    .where(
      and(
        eq(supplierReturnAttachments.supplierReturnId, rtvId),
        eq(supplierReturnAttachments.orgId, orgId),
      ),
    )
    .orderBy(desc(supplierReturnAttachments.createdAt));

  return { data };
}

export async function addSupplierReturnAttachment(
  rtvId: string,
  orgId: string,
  userId: string,
  input: {
    fileName: string;
    mimeType: string;
    sizeBytes?: number;
    attachmentType?: string;
    dataUrl: string;
  },
) {
  return db.transaction(async (tx) => {
    const rows = await tx.execute(
      sql`SELECT id, status FROM supplier_returns WHERE id = ${rtvId} AND org_id = ${orgId} FOR UPDATE`,
    );
    if (rows.length === 0) throw new Error("Supplier return not found");
    const rtv = rows[0] as any;

    const [attachment] = await tx
      .insert(supplierReturnAttachments)
      .values({
        supplierReturnId: rtvId,
        orgId,
        fileName: input.fileName,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes ?? 0,
        attachmentType: input.attachmentType ?? "OTHER",
        dataUrl: input.dataUrl,
        uploadedBy: userId,
      })
      .returning();

    await insertStatusHistory(tx, {
      supplierReturnId: rtvId,
      fromStatus: rtv.status,
      toStatus: rtv.status,
      changedBy: userId,
      notes: `Attachment added: ${input.fileName}`,
    });

    return attachment;
  });
}

export async function deleteSupplierReturnAttachment(
  rtvId: string,
  attachmentId: string,
  orgId: string,
  userId: string,
) {
  return db.transaction(async (tx) => {
    const rows = await tx.execute(
      sql`SELECT id, status FROM supplier_returns WHERE id = ${rtvId} AND org_id = ${orgId} FOR UPDATE`,
    );
    if (rows.length === 0) throw new Error("Supplier return not found");
    const rtv = rows[0] as any;

    const deleted = await tx
      .delete(supplierReturnAttachments)
      .where(
        and(
          eq(supplierReturnAttachments.id, attachmentId),
          eq(supplierReturnAttachments.supplierReturnId, rtvId),
          eq(supplierReturnAttachments.orgId, orgId),
        ),
      )
      .returning({ fileName: supplierReturnAttachments.fileName });

    if (deleted.length === 0) throw new Error("Attachment not found");

    await insertStatusHistory(tx, {
      supplierReturnId: rtvId,
      fromStatus: rtv.status,
      toStatus: rtv.status,
      changedBy: userId,
      notes: `Attachment removed: ${deleted[0].fileName}`,
    });

    return { deleted: true };
  });
}
