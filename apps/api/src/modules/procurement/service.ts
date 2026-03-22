import { db, type DbOrTx } from "@apex/database";
import {
  purchaseOrders,
  poLines,
  poReceiptEvents,
  poReceipts,
  inventory,
  stockJournal,
  locations,
  products,
  suppliers,
  users,
} from "@apex/database/schema";
import { eq, and, sql, asc, desc, inArray } from "drizzle-orm";
import type { CreatePOInput, ReceivePOInput } from "@apex/types";
import {
  PurchaseOrderStatus,
  isValidPOTransition,
  PROCUREMENT_ROLES,
  generateCostCode,
} from "@apex/types";

// ── Helpers ──

async function generatePoNo(tx: DbOrTx, orgId: string): Promise<string> {
  const result = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(purchaseOrders)
    .where(eq(purchaseOrders.orgId, orgId));
  const seq = (result[0]?.count ?? 0) + 1;
  return `PO-${String(seq).padStart(6, "0")}`;
}

/**
 * Assert user role is in PROCUREMENT_ROLES.
 */
function assertProcurementRole(userRole: string) {
  if (!PROCUREMENT_ROLES.includes(userRole as any)) {
    throw new Error(
      "Access denied: requires ADMIN, MANAGER, or WAREHOUSE_STAFF role",
    );
  }
}

/**
 * Race-safe inventory row creation + lock.
 *
 * 1. Try INSERT ... ON CONFLICT DO NOTHING (creates if missing)
 * 2. SELECT ... FOR UPDATE (locks the existing or newly-created row)
 *
 * This avoids the race where two concurrent transactions both see
 * "no row" and try to INSERT, with one failing on the unique constraint.
 */
async function lockInventoryRow(
  tx: DbOrTx,
  orgId: string,
  productId: string,
  locationId: string,
): Promise<{ id: string; stockLevel: number; reservedLevel: number }> {
  // Step 1: race-safe create-if-missing
  await tx.execute(
    sql`INSERT INTO inventory (id, org_id, product_id, location_id, stock_level, reserved_level, reorder_point, lead_time_days, created_at, updated_at)
        VALUES (gen_random_uuid(), ${orgId}, ${productId}, ${locationId}, 0, 0, 10, 7, NOW(), NOW())
        ON CONFLICT (product_id, location_id) DO NOTHING`,
  );

  // Step 2: lock the row
  const rows = await tx.execute(
    sql`SELECT id, stock_level, reserved_level
        FROM inventory
        WHERE org_id = ${orgId}
          AND product_id = ${productId}
          AND location_id = ${locationId}
        FOR UPDATE`,
  );

  const row = rows[0] as any;
  return {
    id: row.id,
    stockLevel: row.stock_level,
    reservedLevel: row.reserved_level,
  };
}

/**
 * Lock a product row for cost price update.
 */
async function lockProductRow(
  tx: DbOrTx,
  productId: string,
  orgId: string,
): Promise<{
  id: string;
  currentCostPrice: string;
  mnemonicCostCode: string | null;
}> {
  const rows = await tx.execute(
    sql`SELECT id, current_cost_price, mnemonic_cost_code
        FROM products
        WHERE id = ${productId}
          AND org_id = ${orgId}
        FOR UPDATE`,
  );

  if (rows.length === 0) {
    throw new Error(`Product ${productId} not found`);
  }

  const row = rows[0] as any;
  return {
    id: row.id,
    currentCostPrice: row.current_cost_price,
    mnemonicCostCode: row.mnemonic_cost_code,
  };
}

// ── Service Functions ──

/**
 * Create a new Purchase Order in DRAFT status.
 * No inventory effect — just records the order.
 */
export async function createPO(
  input: CreatePOInput,
  orgId: string,
  userId: string,
  userRole: string,
) {
  assertProcurementRole(userRole);

  if (!input.lines || input.lines.length === 0) {
    throw new Error("Purchase Order must have at least one line item");
  }

  return db.transaction(async (tx) => {
    // Validate supplier belongs to org
    const [supplier] = await tx
      .select()
      .from(suppliers)
      .where(and(eq(suppliers.id, input.supplierId), eq(suppliers.orgId, orgId)))
      .limit(1);
    if (!supplier) throw new Error("Supplier not found");

    // Validate destination location belongs to org
    const [destLocation] = await tx
      .select()
      .from(locations)
      .where(
        and(
          eq(locations.id, input.destinationLocationId),
          eq(locations.orgId, orgId),
        ),
      )
      .limit(1);
    if (!destLocation) throw new Error("Destination location not found");
    if (destLocation.type === "TRANSIT_BUFFER") {
      throw new Error("Cannot receive into a TRANSIT_BUFFER location");
    }

    // Validate all products belong to org and fetch UOM data
    const productUomMap = new Map<string, { sellingUnit: string; purchaseUnit: string | null; conversionFactor: string }>();
    for (const line of input.lines) {
      const [product] = await tx
        .select({
          id: products.id,
          sellingUnit: products.sellingUnit,
          purchaseUnit: products.purchaseUnit,
          conversionFactor: products.conversionFactor,
        })
        .from(products)
        .where(and(eq(products.id, line.productId), eq(products.orgId, orgId)))
        .limit(1);
      if (!product) throw new Error(`Product ${line.productId} not found`);
      productUomMap.set(product.id, {
        sellingUnit: product.sellingUnit,
        purchaseUnit: product.purchaseUnit,
        conversionFactor: product.conversionFactor,
      });
    }

    const poNo = await generatePoNo(tx, orgId);

    // Insert PO header
    const [po] = await tx
      .insert(purchaseOrders)
      .values({
        orgId,
        poNo,
        supplierId: input.supplierId,
        destinationLocationId: input.destinationLocationId,
        status: "DRAFT",
        expectedDeliveryDate: input.expectedDeliveryDate
          ? new Date(input.expectedDeliveryDate)
          : null,
        notes: input.notes ?? null,
        createdByUserId: userId,
      })
      .returning();

    // Insert PO lines with UOM snapshot
    const lineValues = input.lines.map((line) => {
      const uom = productUomMap.get(line.productId)!;
      return {
        purchaseOrderId: po.id,
        orgId,
        productId: line.productId,
        orderedQty: line.orderedQty,
        unitCost: line.unitCost,
        listPrice: line.listPrice ?? null,
        discountChain: line.discountChain ?? null,
        // Snapshot UOM at PO creation time
        unit: line.unit ?? uom.purchaseUnit ?? uom.sellingUnit,
        poConversionFactor: line.conversionFactor
          ? String(line.conversionFactor)
          : uom.conversionFactor,
      };
    });

    const insertedLines = await tx
      .insert(poLines)
      .values(lineValues)
      .returning();

    return { po, lines: insertedLines };
  });
}

/**
 * Submit a DRAFT PO (DRAFT -> SUBMITTED).
 * No inventory effect — PO is now "sent to supplier."
 */
export async function submitPO(
  poId: string,
  orgId: string,
  userId: string,
  userRole: string,
  idempotencyKey: string,
  notes?: string,
) {
  assertProcurementRole(userRole);

  return db.transaction(async (tx) => {
    // Lock PO row
    const poRows = await tx.execute(
      sql`SELECT * FROM purchase_orders
          WHERE id = ${poId} AND org_id = ${orgId}
          FOR UPDATE`,
    );
    if (poRows.length === 0) throw new Error("Purchase Order not found");

    const po = poRows[0] as any;

    // Idempotency: if already submitted with same key, return existing (camelCase via Drizzle)
    if (
      po.status === PurchaseOrderStatus.SUBMITTED &&
      po.idempotency_key === idempotencyKey
    ) {
      const [existing] = await tx
        .select()
        .from(purchaseOrders)
        .where(eq(purchaseOrders.id, poId))
        .limit(1);
      return existing;
    }

    if (
      !isValidPOTransition(
        po.status as PurchaseOrderStatus,
        PurchaseOrderStatus.SUBMITTED,
      )
    ) {
      throw new Error(`Cannot submit PO in ${po.status} status`);
    }

    const [updated] = await tx
      .update(purchaseOrders)
      .set({
        status: "SUBMITTED",
        submittedByUserId: userId,
        submittedAt: new Date(),
        idempotencyKey,
        notes: notes
          ? `${po.notes ?? ""}\n[Submitted] ${notes}`.trim()
          : po.notes,
      })
      .where(eq(purchaseOrders.id, poId))
      .returning();

    return updated;
  });
}

/**
 * Receive items against a PO.
 *
 * THE CRITICAL PATH — all ERP Consultant concurrency corrections applied:
 *
 *  1. Lock PO header row
 *  2. Validate status (SUBMITTED or PARTIALLY_RECEIVED)
 *  3. Lock PO lines in deterministic order (sorted by po_line.id ASC)
 *  4. For each receipt line:
 *     a. Validate accepted + rejected > 0
 *     b. Validate won't exceed orderedQty
 *     c. Insert immutable po_receipt_event row
 *  5. Lock inventory rows in deterministic order (sorted by (locationId, productId))
 *  6. For each receipt line with acceptedQty > 0:
 *     a. Add stock to inventory at PO's destinationLocationId
 *     b. Insert RECEIVING journal entry (referenceId = po_receipt_event.id)
 *  7. Lock product rows in deterministic order (sorted by productId)
 *  8. For each product with acceptedQty > 0:
 *     a. Update current_cost_price to last received unit cost
 *     b. Regenerate mnemonic_cost_code via KINGSCOBRA cipher
 *  9. Update PO line running totals (received_accepted_qty, rejected_qty)
 * 10. Determine new PO status: FULLY_RECEIVED or PARTIALLY_RECEIVED
 */
export async function receivePO(
  poId: string,
  orgId: string,
  userId: string,
  userRole: string,
  input: ReceivePOInput,
) {
  assertProcurementRole(userRole);

  return db.transaction(async (tx) => {
    // ── Step 1: Lock PO header ──
    const poRows = await tx.execute(
      sql`SELECT * FROM purchase_orders
          WHERE id = ${poId} AND org_id = ${orgId}
          FOR UPDATE`,
    );
    if (poRows.length === 0) throw new Error("Purchase Order not found");

    const po = poRows[0] as any;

    // ── Step 2: Validate status allows receiving ──
    const currentStatus = po.status as PurchaseOrderStatus;
    if (
      currentStatus !== PurchaseOrderStatus.SUBMITTED &&
      currentStatus !== PurchaseOrderStatus.PARTIALLY_RECEIVED
    ) {
      throw new Error(`Cannot receive against PO in ${po.status} status`);
    }

    // ── Step 2b: Check DR number uniqueness ──
    const existingDr = await tx
      .select({ id: poReceipts.id })
      .from(poReceipts)
      .where(
        and(
          eq(poReceipts.orgId, orgId),
          eq(poReceipts.purchaseOrderId, poId),
          eq(poReceipts.supplierDrNo, input.supplierDrNo),
        ),
      )
      .limit(1);

    if (existingDr.length > 0) {
      throw new Error(
        `DR number "${input.supplierDrNo}" already used on this PO`,
      );
    }

    // Receiving only into the PO's destination location
    const destinationLocationId = po.destination_location_id;

    // ── Step 3: Lock PO lines in deterministic order (by ID ASC) ──
    // Collect the unique PO line IDs from the input, sort them
    const inputLineIds = input.lines.map((l) => l.poLineId).sort();

    // Lock all referenced PO lines in one sorted query
    const lockedPoLines = await tx.execute(
      sql`SELECT id, product_id, ordered_qty, received_accepted_qty, rejected_qty, unit_cost, unit, conversion_factor
          FROM po_lines
          WHERE purchase_order_id = ${poId}
            AND org_id = ${orgId}
          ORDER BY id ASC
          FOR UPDATE`,
    );

    // Build a map for fast lookup
    const poLineMap = new Map<string, any>();
    for (const row of lockedPoLines) {
      poLineMap.set((row as any).id, row);
    }

    // ── Step 4: Validate each receipt line and insert receipt events ──
    // Also prepare data needed for inventory + product updates
    interface ReceiptResult {
      poLineId: string;
      productId: string;
      acceptedQty: number;
      rejectedQty: number;
      unitCost: string;
      receiptEventId: string;
      /** UOM conversion factor from PO line snapshot (1 = no conversion) */
      conversionFactor: number;
    }
    const receiptResults: ReceiptResult[] = [];

    for (const lineInput of input.lines) {
      const poLine = poLineMap.get(lineInput.poLineId);
      if (!poLine) {
        throw new Error(`PO line ${lineInput.poLineId} not found on this PO`);
      }

      const accepted = lineInput.receivedAcceptedQty;
      const rejected = lineInput.rejectedQty;

      // Each receipt line must have accepted + rejected > 0
      if (accepted + rejected <= 0) {
        throw new Error(
          `Receipt line for PO line ${lineInput.poLineId}: accepted + rejected must be > 0`,
        );
      }

      // Validate won't exceed ordered qty
      const prevAccepted = poLine.received_accepted_qty;
      const prevRejected = poLine.rejected_qty;
      const orderedQty = poLine.ordered_qty;

      if (prevAccepted + accepted + prevRejected + rejected > orderedQty) {
        throw new Error(
          `Receipt for PO line ${lineInput.poLineId} would exceed ordered quantity. ` +
            `Ordered: ${orderedQty}, Previously accepted: ${prevAccepted}, ` +
            `Previously rejected: ${prevRejected}, ` +
            `This receipt: accepted=${accepted}, rejected=${rejected}`,
        );
      }

      // Insert immutable receipt event
      const receiptIdempotencyKey = `${input.idempotencyKey}:RECEIPT:${lineInput.poLineId}`;

      const [receiptEvent] = await tx
        .insert(poReceiptEvents)
        .values({
          orgId,
          purchaseOrderId: poId,
          poLineId: lineInput.poLineId,
          productId: poLine.product_id,
          locationId: destinationLocationId,
          receivedAcceptedQty: accepted,
          rejectedQty: rejected,
          unitCost: lineInput.unitCost,
          notes: lineInput.notes ?? null,
          receivedByUserId: userId,
          idempotencyKey: receiptIdempotencyKey,
        })
        .returning();

      receiptResults.push({
        poLineId: lineInput.poLineId,
        productId: poLine.product_id,
        acceptedQty: accepted,
        rejectedQty: rejected,
        unitCost: lineInput.unitCost,
        receiptEventId: receiptEvent.id,
        conversionFactor: Number(poLine.conversion_factor) || 1,
      });
    }

    // ── Step 4b: Create receipt batch header ──
    const totalAccepted = receiptResults.reduce((sum, r) => sum + r.acceptedQty, 0);
    const totalRejected = receiptResults.reduce((sum, r) => sum + r.rejectedQty, 0);

    const [receipt] = await tx
      .insert(poReceipts)
      .values({
        orgId,
        purchaseOrderId: poId,
        supplierDrNo: input.supplierDrNo,
        receivedByUserId: userId,
        lineCount: receiptResults.length,
        totalAcceptedQty: totalAccepted,
        totalRejectedQty: totalRejected,
        notes: input.notes ?? null,
      })
      .returning();

    // Link receipt events to batch header
    const receiptEventIds = receiptResults.map((r) => r.receiptEventId);
    if (receiptEventIds.length > 0) {
      await tx
        .update(poReceiptEvents)
        .set({ poReceiptId: receipt.id })
        .where(inArray(poReceiptEvents.id, receiptEventIds));
    }

    // ── Step 5: Lock inventory rows in deterministic order ──
    // Only for lines with acceptedQty > 0
    const acceptedResults = receiptResults.filter((r) => r.acceptedQty > 0);

    // Sort by (locationId, productId) for deterministic lock ordering
    const inventoryKeys = acceptedResults
      .map((r) => ({
        productId: r.productId,
        locationId: destinationLocationId,
      }))
      .sort((a, b) => {
        const locCmp = a.locationId.localeCompare(b.locationId);
        if (locCmp !== 0) return locCmp;
        return a.productId.localeCompare(b.productId);
      });

    // Deduplicate (multiple receipt lines might reference same product)
    const uniqueInventoryKeys = inventoryKeys.filter(
      (item, idx, arr) =>
        idx === 0 ||
        item.productId !== arr[idx - 1].productId ||
        item.locationId !== arr[idx - 1].locationId,
    );

    // ── Step 6: Add stock + journal for each accepted line ──
    const invMap = new Map<string, { id: string; stockLevel: number }>();

    for (const key of uniqueInventoryKeys) {
      const inv = await lockInventoryRow(
        tx,
        orgId,
        key.productId,
        key.locationId,
      );
      invMap.set(`${key.locationId}:${key.productId}`, inv);
    }

    for (const result of acceptedResults) {
      const invKey = `${destinationLocationId}:${result.productId}`;
      const inv = invMap.get(invKey)!;

      // Apply UOM conversion: convert purchase units → selling units
      const convFactor = result.conversionFactor;
      const inventoryQty = result.acceptedQty * convFactor;
      if (!Number.isInteger(inventoryQty)) {
        throw new Error(
          `UOM conversion produces fractional inventory qty (${result.acceptedQty} × ${convFactor} = ${inventoryQty}). ` +
          `Conversion factor must produce whole numbers.`,
        );
      }

      const newBalance = inv.stockLevel + inventoryQty;

      // Update inventory
      await tx
        .update(inventory)
        .set({ stockLevel: newBalance })
        .where(eq(inventory.id, inv.id));

      // Update local cache for subsequent lines referencing same product
      inv.stockLevel = newBalance;

      // Insert RECEIVING journal entry (quantities in selling units)
      // referenceId = po_receipt_event.id (NOT the PO header)
      const costPerSellingUnit = convFactor > 1
        ? String((parseFloat(result.unitCost) / convFactor).toFixed(2))
        : result.unitCost;
      const journalIdempotencyKey = `${input.idempotencyKey}:JOURNAL:${result.receiptEventId}`;
      await tx.insert(stockJournal).values({
        orgId,
        productId: result.productId,
        locationId: destinationLocationId,
        userId,
        actorType: "USER",
        changeQuantity: inventoryQty,
        balanceAfter: newBalance,
        referenceType: "RECEIVING",
        referenceId: result.receiptEventId,
        referenceLineId: result.poLineId,
        unitCostSnapshot: costPerSellingUnit,
        idempotencyKey: journalIdempotencyKey,
        notes: convFactor > 1
          ? `PO ${po.po_no} receipt (${result.acceptedQty} × ${convFactor})`
          : `PO ${po.po_no} receipt`,
      });
    }

    // ── Step 7: Lock product rows in deterministic order + update cost ──
    // Only for products that had acceptedQty > 0
    const uniqueProductIds = [
      ...new Set(acceptedResults.map((r) => r.productId)),
    ].sort();

    // For each product, find the latest unit cost from this batch (per selling unit)
    // (if multiple receipt lines for same product, use the last one)
    const productCostMap = new Map<string, string>();
    for (const result of acceptedResults) {
      const convFactor = result.conversionFactor;
      const costPerSellingUnit = convFactor > 1
        ? (parseFloat(result.unitCost) / convFactor).toFixed(2)
        : result.unitCost;
      productCostMap.set(result.productId, costPerSellingUnit);
    }

    for (const productId of uniqueProductIds) {
      const product = await lockProductRow(tx, productId, orgId);
      const newCost = productCostMap.get(productId)!;

      // Generate new mnemonic cost code from the new cost price
      const newMnemonicCostCode = generateCostCode(newCost);

      await tx
        .update(products)
        .set({
          currentCostPrice: newCost,
          mnemonicCostCode: newMnemonicCostCode,
        })
        .where(eq(products.id, productId));
    }

    // ── Step 9: Update PO line running totals ──
    for (const result of receiptResults) {
      const poLine = poLineMap.get(result.poLineId)!;
      const newAccepted = poLine.received_accepted_qty + result.acceptedQty;
      const newRejected = poLine.rejected_qty + result.rejectedQty;

      await tx
        .update(poLines)
        .set({
          receivedAcceptedQty: newAccepted,
          rejectedQty: newRejected,
        })
        .where(eq(poLines.id, result.poLineId));

      // Update local map for status determination
      poLine.received_accepted_qty = newAccepted;
      poLine.rejected_qty = newRejected;
    }

    // ── Step 10: Determine new PO status ──
    // Re-read all PO lines (with updated running totals from local map)
    const allPoLines = [...poLineMap.values()];
    const isFullyReceived = allPoLines.every(
      (line: any) =>
        line.received_accepted_qty + line.rejected_qty >= line.ordered_qty,
    );

    const newStatus = isFullyReceived
      ? PurchaseOrderStatus.FULLY_RECEIVED
      : PurchaseOrderStatus.PARTIALLY_RECEIVED;

    const updateSet: Record<string, any> = {
      status: newStatus,
      idempotencyKey: input.idempotencyKey,
    };

    if (isFullyReceived) {
      updateSet.closedAt = new Date();
      updateSet.closedByUserId = userId;
    }

    const [updatedPO] = await tx
      .update(purchaseOrders)
      .set(updateSet)
      .where(eq(purchaseOrders.id, poId))
      .returning();

    return {
      po: updatedPO,
      receipt: {
        id: receipt.id,
        supplierDrNo: receipt.supplierDrNo,
        lineCount: receipt.lineCount,
        totalAcceptedQty: receipt.totalAcceptedQty,
        totalRejectedQty: receipt.totalRejectedQty,
      },
      receiptEvents: receiptResults.map((r) => ({
        receiptEventId: r.receiptEventId,
        poLineId: r.poLineId,
        productId: r.productId,
        acceptedQty: r.acceptedQty,
        rejectedQty: r.rejectedQty,
        unitCost: r.unitCost,
      })),
    };
  });
}

/**
 * Get all receipt batch headers for a PO, with nested line details.
 * Returns receipts ordered by created_at DESC (most recent first),
 * each with receiver name and line-level product info.
 */
export async function getPOReceipts(poId: string, orgId: string) {
  // Fetch receipt headers for this PO
  const receipts = await db
    .select({
      id: poReceipts.id,
      supplierDrNo: poReceipts.supplierDrNo,
      receivedByUserId: poReceipts.receivedByUserId,
      lineCount: poReceipts.lineCount,
      totalAcceptedQty: poReceipts.totalAcceptedQty,
      totalRejectedQty: poReceipts.totalRejectedQty,
      notes: poReceipts.notes,
      createdAt: poReceipts.createdAt,
      receivedByName: users.fullName,
    })
    .from(poReceipts)
    .innerJoin(users, eq(users.id, poReceipts.receivedByUserId))
    .where(
      and(
        eq(poReceipts.purchaseOrderId, poId),
        eq(poReceipts.orgId, orgId),
      ),
    )
    .orderBy(desc(poReceipts.createdAt));

  if (receipts.length === 0) return [];

  // Fetch all receipt events for these receipts, joined with products
  const receiptIds = receipts.map((r) => r.id);

  const events = await db
    .select({
      id: poReceiptEvents.id,
      poReceiptId: poReceiptEvents.poReceiptId,
      poLineId: poReceiptEvents.poLineId,
      productId: poReceiptEvents.productId,
      receivedAcceptedQty: poReceiptEvents.receivedAcceptedQty,
      rejectedQty: poReceiptEvents.rejectedQty,
      unitCost: poReceiptEvents.unitCost,
      notes: poReceiptEvents.notes,
      createdAt: poReceiptEvents.createdAt,
      productName: products.name,
      sku: products.sku,
      mnemonicSku: products.mnemonicSku,
    })
    .from(poReceiptEvents)
    .innerJoin(products, eq(products.id, poReceiptEvents.productId))
    .where(inArray(poReceiptEvents.poReceiptId, receiptIds))
    .orderBy(asc(poReceiptEvents.createdAt));

  // Group events by receipt ID
  const eventsByReceiptId = new Map<string, typeof events>();
  for (const event of events) {
    const key = event.poReceiptId!;
    if (!eventsByReceiptId.has(key)) {
      eventsByReceiptId.set(key, []);
    }
    eventsByReceiptId.get(key)!.push(event);
  }

  // Assemble result
  return receipts.map((r) => ({
    ...r,
    lines: eventsByReceiptId.get(r.id) ?? [],
  }));
}

/**
 * Close a PO with variance (PARTIALLY_RECEIVED -> CLOSED_WITH_VARIANCE).
 * Used when remaining undelivered items will never arrive.
 * No additional inventory effect.
 */
export async function closeWithVariance(
  poId: string,
  orgId: string,
  userId: string,
  userRole: string,
  idempotencyKey: string,
  notes?: string,
) {
  assertProcurementRole(userRole);

  return db.transaction(async (tx) => {
    const poRows = await tx.execute(
      sql`SELECT * FROM purchase_orders
          WHERE id = ${poId} AND org_id = ${orgId}
          FOR UPDATE`,
    );
    if (poRows.length === 0) throw new Error("Purchase Order not found");

    const po = poRows[0] as any;

    // Idempotency (return camelCase via Drizzle)
    if (
      po.status === PurchaseOrderStatus.CLOSED_WITH_VARIANCE &&
      po.idempotency_key === idempotencyKey
    ) {
      const [existing] = await tx
        .select()
        .from(purchaseOrders)
        .where(eq(purchaseOrders.id, poId))
        .limit(1);
      return existing;
    }

    if (
      !isValidPOTransition(
        po.status as PurchaseOrderStatus,
        PurchaseOrderStatus.CLOSED_WITH_VARIANCE,
      )
    ) {
      throw new Error(
        `Cannot close PO with variance in ${po.status} status`,
      );
    }

    const [updated] = await tx
      .update(purchaseOrders)
      .set({
        status: "CLOSED_WITH_VARIANCE",
        closedByUserId: userId,
        closedAt: new Date(),
        idempotencyKey,
        notes: notes
          ? `${po.notes ?? ""}\n[Closed with variance] ${notes}`.trim()
          : po.notes,
      })
      .where(eq(purchaseOrders.id, poId))
      .returning();

    return updated;
  });
}

/**
 * Cancel a PO (DRAFT/SUBMITTED -> CANCELLED).
 * Only allowed before any receiving has occurred.
 */
export async function cancelPO(
  poId: string,
  orgId: string,
  userId: string,
  userRole: string,
  idempotencyKey: string,
  notes?: string,
) {
  assertProcurementRole(userRole);

  return db.transaction(async (tx) => {
    const poRows = await tx.execute(
      sql`SELECT * FROM purchase_orders
          WHERE id = ${poId} AND org_id = ${orgId}
          FOR UPDATE`,
    );
    if (poRows.length === 0) throw new Error("Purchase Order not found");

    const po = poRows[0] as any;

    // Idempotency (return camelCase via Drizzle)
    if (
      po.status === PurchaseOrderStatus.CANCELLED &&
      po.idempotency_key === idempotencyKey
    ) {
      const [existing] = await tx
        .select()
        .from(purchaseOrders)
        .where(eq(purchaseOrders.id, poId))
        .limit(1);
      return existing;
    }

    if (
      !isValidPOTransition(
        po.status as PurchaseOrderStatus,
        PurchaseOrderStatus.CANCELLED,
      )
    ) {
      throw new Error(`Cannot cancel PO in ${po.status} status`);
    }

    const [updated] = await tx
      .update(purchaseOrders)
      .set({
        status: "CANCELLED",
        cancelledByUserId: userId,
        cancelledAt: new Date(),
        idempotencyKey,
        notes: notes
          ? `${po.notes ?? ""}\n[Cancelled] ${notes}`.trim()
          : po.notes,
      })
      .where(eq(purchaseOrders.id, poId))
      .returning();

    return updated;
  });
}

// ── Query Functions ──

/**
 * Get a single PO with enriched detail.
 */
export async function getPO(poId: string, orgId: string) {
  const [po] = await db
    .select()
    .from(purchaseOrders)
    .where(
      and(eq(purchaseOrders.id, poId), eq(purchaseOrders.orgId, orgId)),
    )
    .limit(1);

  if (!po) return null;
  return buildPODetail(po);
}

/**
 * Get a PO by its public PO number.
 */
export async function getPOByNumber(poNo: string, orgId: string) {
  const [po] = await db
    .select()
    .from(purchaseOrders)
    .where(
      and(eq(purchaseOrders.poNo, poNo), eq(purchaseOrders.orgId, orgId)),
    )
    .limit(1);

  if (!po) return null;
  return buildPODetail(po);
}

/**
 * Build enriched PO detail with supplier, location, lines, and receipt events.
 */
async function buildPODetail(po: typeof purchaseOrders.$inferSelect) {
  // Fetch supplier
  const [supplier] = await db
    .select({
      id: suppliers.id,
      name: suppliers.name,
      contactEmail: suppliers.contactEmail,
      contactPhone: suppliers.contactPhone,
      mnemonicCode: suppliers.mnemonicCode,
    })
    .from(suppliers)
    .where(eq(suppliers.id, po.supplierId))
    .limit(1);

  // Fetch destination location
  const [location] = await db
    .select({
      id: locations.id,
      name: locations.name,
      code: locations.code,
      type: locations.type,
    })
    .from(locations)
    .where(eq(locations.id, po.destinationLocationId))
    .limit(1);

  // Fetch PO lines with product info
  const rawLines = await db
    .select({
      id: poLines.id,
      productId: poLines.productId,
      orderedQty: poLines.orderedQty,
      receivedAcceptedQty: poLines.receivedAcceptedQty,
      rejectedQty: poLines.rejectedQty,
      unitCost: poLines.unitCost,
      listPrice: poLines.listPrice,
      discountChain: poLines.discountChain,
      unit: poLines.unit,
      poConversionFactor: poLines.poConversionFactor,
      createdAt: poLines.createdAt,
      productName: products.name,
      sellingUnit: products.sellingUnit,
      sku: products.sku,
      mnemonicSku: products.mnemonicSku,
      category: products.category,
      barcode: products.barcode,
      unitPrice: products.unitPrice,
      mnemonicCostCode: products.mnemonicCostCode,
    })
    .from(poLines)
    .innerJoin(products, eq(products.id, poLines.productId))
    .where(eq(poLines.purchaseOrderId, po.id))
    .orderBy(asc(poLines.createdAt));

  // Fetch receipt events
  const receiptEvents = await db
    .select()
    .from(poReceiptEvents)
    .where(eq(poReceiptEvents.purchaseOrderId, po.id))
    .orderBy(asc(poReceiptEvents.createdAt));

  return {
    ...po,
    supplier,
    destination: location,
    lines: rawLines,
    receiptEvents,
  };
}

/**
 * List POs with cursor-based pagination.
 */
export async function listPOs(
  orgId: string,
  cursor?: string,
  limit: number = 50,
) {
  let query = db
    .select({
      id: purchaseOrders.id,
      poNo: purchaseOrders.poNo,
      status: purchaseOrders.status,
      supplierId: purchaseOrders.supplierId,
      destinationLocationId: purchaseOrders.destinationLocationId,
      expectedDeliveryDate: purchaseOrders.expectedDeliveryDate,
      createdAt: purchaseOrders.createdAt,
      updatedAt: purchaseOrders.updatedAt,
      supplierName: suppliers.name,
      destinationLocationName: locations.name,
      receiptCount: sql<number>`(
        SELECT COUNT(*)::int FROM po_receipts pr
        WHERE pr.purchase_order_id = ${purchaseOrders.id}
      )`,
      totalReceiptValue: sql<string>`(
        SELECT COALESCE(SUM(pre.received_accepted_qty * pre.unit_cost), 0)::numeric(14,2)
        FROM po_receipt_events pre
        WHERE pre.purchase_order_id = ${purchaseOrders.id}
      )`,
    })
    .from(purchaseOrders)
    .innerJoin(suppliers, eq(suppliers.id, purchaseOrders.supplierId))
    .innerJoin(locations, eq(locations.id, purchaseOrders.destinationLocationId))
    .where(
      cursor
        ? and(
            eq(purchaseOrders.orgId, orgId),
            sql`${purchaseOrders.id} > ${cursor}`,
          )
        : eq(purchaseOrders.orgId, orgId),
    )
    .orderBy(asc(purchaseOrders.id))
    .limit(limit + 1);

  const results = await query;
  const hasMore = results.length > limit;
  const data = hasMore ? results.slice(0, limit) : results;
  const nextCursor = hasMore ? data[data.length - 1].id : null;

  return { data, nextCursor, hasMore };
}

/**
 * Get receipt summary for a PO (for expandable rows in the list).
 * Returns receipt headers with line count and total value per receipt.
 */
export async function getReceiptsSummary(poId: string, orgId: string) {
  const receipts = await db
    .select({
      id: poReceipts.id,
      receiptNumber: poReceipts.supplierDrNo,
      receivedAt: poReceipts.createdAt,
      receivedByName: users.fullName,
      lineCount: poReceipts.lineCount,
      totalAcceptedQty: poReceipts.totalAcceptedQty,
    })
    .from(poReceipts)
    .innerJoin(users, eq(users.id, poReceipts.receivedByUserId))
    .where(
      and(
        eq(poReceipts.purchaseOrderId, poId),
        eq(poReceipts.orgId, orgId),
      ),
    )
    .orderBy(desc(poReceipts.createdAt));

  if (receipts.length === 0) return [];

  // Get total value per receipt
  const receiptIds = receipts.map((r) => r.id);
  const values = await db
    .select({
      poReceiptId: poReceiptEvents.poReceiptId,
      totalValue: sql<string>`SUM(${poReceiptEvents.receivedAcceptedQty} * ${poReceiptEvents.unitCost})::numeric(14,2)`,
    })
    .from(poReceiptEvents)
    .where(inArray(poReceiptEvents.poReceiptId, receiptIds))
    .groupBy(poReceiptEvents.poReceiptId);

  const valueMap = new Map(values.map((v) => [v.poReceiptId!, v.totalValue]));

  return receipts.map((r) => ({
    id: r.id,
    receiptNumber: r.receiptNumber,
    receivedAt: r.receivedAt.toISOString(),
    receivedByName: r.receivedByName,
    lineCount: r.lineCount,
    totalAcceptedQty: r.totalAcceptedQty,
    totalValue: parseFloat(valueMap.get(r.id) ?? "0"),
  }));
}

/**
 * List POs received at a specific location, with line items.
 * Used by the "Import from PO" flow on the New Transfer page.
 */
export async function listPOsReceivedAt(
  orgId: string,
  locationId: string,
  search?: string,
  limit: number = 20,
) {
  const conditions = [
    eq(purchaseOrders.orgId, orgId),
    eq(purchaseOrders.destinationLocationId, locationId),
    sql`${purchaseOrders.status} IN ('FULLY_RECEIVED', 'CLOSED_WITH_VARIANCE', 'PARTIALLY_RECEIVED')`,
  ];

  if (search?.trim()) {
    conditions.push(
      sql`${purchaseOrders.poNo} ILIKE ${"%" + search.trim() + "%"}`,
    );
  }

  const pos = await db
    .select({
      id: purchaseOrders.id,
      poNo: purchaseOrders.poNo,
      status: purchaseOrders.status,
      destinationLocationId: purchaseOrders.destinationLocationId,
      createdAt: purchaseOrders.createdAt,
      supplierName: suppliers.name,
      lineCount: sql<number>`(SELECT COUNT(*)::int FROM po_lines pl WHERE pl.purchase_order_id = ${purchaseOrders.id})`,
      totalReceivedQty: sql<number>`(SELECT COALESCE(SUM(pl.received_accepted_qty), 0)::int FROM po_lines pl WHERE pl.purchase_order_id = ${purchaseOrders.id})`,
    })
    .from(purchaseOrders)
    .innerJoin(suppliers, eq(suppliers.id, purchaseOrders.supplierId))
    .where(and(...conditions))
    .orderBy(desc(purchaseOrders.updatedAt))
    .limit(limit);

  // For each PO, fetch received line items
  const results = [];
  for (const po of pos) {
    const items = await db
      .select({
        productId: poLines.productId,
        productName: products.name,
        sku: products.sku,
        mnemonicSku: products.mnemonicSku,
        receivedQty: poLines.receivedAcceptedQty,
        orderedQty: poLines.orderedQty,
        unitCost: poLines.unitCost,
      })
      .from(poLines)
      .innerJoin(products, eq(products.id, poLines.productId))
      .where(
        and(
          eq(poLines.purchaseOrderId, po.id),
          sql`${poLines.receivedAcceptedQty} > 0`,
        ),
      )
      .orderBy(asc(poLines.createdAt));

    results.push({
      ...po,
      items: items.map((item) => ({
        ...item,
        unitCost: Number(item.unitCost),
      })),
    });
  }

  return { data: results };
}

/**
 * Get receipt events (audit trail) for a specific PO.
 */
export async function getPOReceiptEvents(poId: string, orgId: string) {
  const events = await db
    .select()
    .from(poReceiptEvents)
    .where(
      and(
        eq(poReceiptEvents.purchaseOrderId, poId),
        eq(poReceiptEvents.orgId, orgId),
      ),
    )
    .orderBy(asc(poReceiptEvents.createdAt));

  return events;
}

/**
 * Get RECEIVING journal entries for a PO (via receipt event references).
 */
export async function getPOJournal(poId: string, orgId: string) {
  // Get all receipt event IDs for this PO
  const events = await db
    .select({ id: poReceiptEvents.id })
    .from(poReceiptEvents)
    .where(
      and(
        eq(poReceiptEvents.purchaseOrderId, poId),
        eq(poReceiptEvents.orgId, orgId),
      ),
    );

  if (events.length === 0) return [];

  const eventIds = events.map((e) => e.id);

  // Journal entries reference po_receipt_event.id as referenceId
  const entries = await db
    .select()
    .from(stockJournal)
    .where(
      and(
        eq(stockJournal.orgId, orgId),
        eq(stockJournal.referenceType, "RECEIVING"),
        inArray(stockJournal.referenceId, eventIds),
      ),
    )
    .orderBy(asc(stockJournal.effectiveAt), asc(stockJournal.createdAt));

  return entries;
}

/**
 * List all suppliers for an organization (simple list for dropdowns).
 */
export async function listSuppliers(orgId: string) {
  const results = await db
    .select({
      id: suppliers.id,
      name: suppliers.name,
      contactEmail: suppliers.contactEmail,
      contactPhone: suppliers.contactPhone,
      address: suppliers.address,
      mnemonicCode: suppliers.mnemonicCode,
    })
    .from(suppliers)
    .where(eq(suppliers.orgId, orgId))
    .orderBy(asc(suppliers.name));

  return results;
}

/**
 * Create a new supplier.
 */
export async function createSupplier(
  orgId: string,
  input: {
    name: string;
    contactEmail?: string;
    contactPhone?: string;
    address?: string;
    mnemonicCode?: string;
    avgLeadTimeDays?: number;
  },
) {
  const [supplier] = await db
    .insert(suppliers)
    .values({
      orgId,
      name: input.name,
      contactEmail: input.contactEmail ?? null,
      contactPhone: input.contactPhone ?? null,
      address: input.address ?? null,
      mnemonicCode: input.mnemonicCode ?? null,
      avgLeadTimeDays: input.avgLeadTimeDays ?? 7,
    })
    .returning();

  return supplier;
}

/**
 * Update an existing supplier.
 */
export async function updateSupplier(
  orgId: string,
  supplierId: string,
  input: {
    name?: string;
    contactEmail?: string | null;
    contactPhone?: string | null;
    address?: string | null;
    mnemonicCode?: string | null;
    avgLeadTimeDays?: number;
  },
) {
  const setFields: Record<string, any> = {};
  if (input.name !== undefined) setFields.name = input.name;
  if (input.contactEmail !== undefined) setFields.contactEmail = input.contactEmail;
  if (input.contactPhone !== undefined) setFields.contactPhone = input.contactPhone;
  if (input.address !== undefined) setFields.address = input.address;
  if (input.mnemonicCode !== undefined) setFields.mnemonicCode = input.mnemonicCode;
  if (input.avgLeadTimeDays !== undefined) setFields.avgLeadTimeDays = input.avgLeadTimeDays;

  if (Object.keys(setFields).length === 0) {
    throw new Error("No fields to update");
  }

  const [updated] = await db
    .update(suppliers)
    .set(setFields)
    .where(and(eq(suppliers.id, supplierId), eq(suppliers.orgId, orgId)))
    .returning();

  if (!updated) {
    throw new Error("Supplier not found");
  }

  return updated;
}

/**
 * Delete a supplier. Fails if supplier has any purchase orders.
 */
export async function deleteSupplier(orgId: string, supplierId: string) {
  // Check for existing purchase orders
  const [po] = await db
    .select({ id: purchaseOrders.id })
    .from(purchaseOrders)
    .where(
      and(
        eq(purchaseOrders.supplierId, supplierId),
        eq(purchaseOrders.orgId, orgId),
      ),
    )
    .limit(1);

  if (po) {
    throw new Error("Cannot delete supplier with existing purchase orders");
  }

  const [deleted] = await db
    .delete(suppliers)
    .where(and(eq(suppliers.id, supplierId), eq(suppliers.orgId, orgId)))
    .returning({ id: suppliers.id });

  if (!deleted) {
    throw new Error("Supplier not found");
  }

  return deleted;
}
