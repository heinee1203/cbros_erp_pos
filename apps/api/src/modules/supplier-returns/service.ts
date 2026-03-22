import { db, type DbOrTx } from "@apex/database";
import {
  supplierReturns,
  supplierReturnLines,
  supplierReturnStatusHistory,
  inventory,
  stockJournal,
  suppliers,
  locations,
  products,
  purchaseOrders,
} from "@apex/database/schema";
import { eq, and, sql, desc, type SQL } from "drizzle-orm";
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

  const result = await tx
    .select({ count: sql<string>`count(*)` })
    .from(supplierReturns)
    .where(eq(supplierReturns.orgId, orgId));

  const seq = parseInt(result[0]?.count ?? "0", 10) + 1;
  return `RTV-${String(seq).padStart(6, "0")}`;
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
          sql`${products.id} = ANY(${productIds})`,
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
            sql`${products.id} = ANY(${productIds})`,
            eq(products.orgId, orgId),
          ),
        );
      const productMap = new Map(productRows.map((p) => [p.id, p]));

      for (const line of input.lines) {
        if (!productMap.has(line.productId)) {
          throw new Error(`Product ${line.productId} not found`);
        }
      }

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

    // For each line: check stock >= quantity, deduct inventory, create journal
    const insufficientStock: Array<{
      productId: string;
      productName: string;
      required: number;
      available: number;
    }> = [];

    for (const line of lines) {
      const inv = await lockInventoryRow(
        tx,
        orgId,
        line.productId,
        rtv.location_id,
      );

      if (inv.stockLevel < line.quantity) {
        insufficientStock.push({
          productId: line.productId,
          productName: line.productName,
          required: line.quantity,
          available: inv.stockLevel,
        });
        continue;
      }
    }

    if (insufficientStock.length > 0) {
      const err = new Error("Insufficient stock for supplier return") as any;
      err.statusCode = 409;
      err.details = insufficientStock;
      throw err;
    }

    // All stock checks passed — now deduct
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

// ── Query Functions ──

/**
 * Get a single supplier return with lines and status history.
 */
export async function getSupplierReturn(rtvId: string, orgId: string) {
  const [rtv] = await db
    .select()
    .from(supplierReturns)
    .where(and(eq(supplierReturns.id, rtvId), eq(supplierReturns.orgId, orgId)))
    .limit(1);

  if (!rtv) return null;

  const lines = await db
    .select()
    .from(supplierReturnLines)
    .where(eq(supplierReturnLines.supplierReturnId, rtv.id));

  const history = await db
    .select()
    .from(supplierReturnStatusHistory)
    .where(eq(supplierReturnStatusHistory.supplierReturnId, rtv.id))
    .orderBy(desc(supplierReturnStatusHistory.changedAt));

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

  return {
    ...rtv,
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
      sql`${supplierReturns.status} = ANY(${opts.status})`,
    );
  }

  if (opts.supplierId) {
    conditions.push(eq(supplierReturns.supplierId, opts.supplierId));
  }

  if (opts.search) {
    conditions.push(
      sql`${supplierReturns.rtvNumber} ILIKE ${"%" + opts.search + "%"}`,
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
      rtvNumber: supplierReturns.rtvNumber,
      supplierId: supplierReturns.supplierId,
      status: supplierReturns.status,
      reason: supplierReturns.reason,
      totalCost: supplierReturns.totalCost,
      creditAmount: supplierReturns.creditAmount,
      creditType: supplierReturns.creditType,
      submittedAt: supplierReturns.submittedAt,
      createdAt: supplierReturns.createdAt,
      // Joined fields
      supplierName: suppliers.name,
      locationName: locations.name,
    })
    .from(supplierReturns)
    .leftJoin(suppliers, eq(suppliers.id, supplierReturns.supplierId))
    .leftJoin(locations, eq(locations.id, supplierReturns.locationId))
    .where(and(...conditions))
    .orderBy(desc(supplierReturns.createdAt), desc(supplierReturns.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? data[data.length - 1].id : null;

  return { data, nextCursor, hasMore };
}
