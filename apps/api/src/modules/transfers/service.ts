import { db, type DbOrTx } from "@apex/database";
import {
  stockTransfers,
  stockTransferItems,
  stockTransferReceipts,
  inventory,
  locations,
  stockJournal,
  products,
} from "@apex/database/schema";
import { eq, and, sql } from "drizzle-orm";
import type {
  CreateTransferInput,
  DispatchTransferInput,
  ReceiveTransferInput,
  ReportVarianceInput,
} from "@apex/types";
import {
  TransferStatus,
  UserRole,
  isValidTransferTransition,
} from "@apex/types";

// ── Helpers ──

async function getTransitBuffer(tx: DbOrTx, orgId: string) {
  const [buffer] = await tx
    .select()
    .from(locations)
    .where(
      and(
        eq(locations.orgId, orgId),
        eq(locations.type, "TRANSIT_BUFFER"),
        eq(locations.isSystem, true),
        eq(locations.isActive, true),
      ),
    )
    .limit(1);
  if (!buffer) {
    throw new Error("TRANSIT_BUFFER location not found for this organization");
  }
  return buffer;
}

async function generateTransferNo(tx: DbOrTx, orgId: string): Promise<string> {
  const result = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(stockTransfers)
    .where(eq(stockTransfers.orgId, orgId));
  const seq = (result[0]?.count ?? 0) + 1;
  return `TRF-${String(seq).padStart(6, "0")}`;
}

/**
 * Upsert inventory row with row-level locking via SELECT ... FOR UPDATE.
 * Returns the locked row's current stock_level for validation.
 */
async function lockInventoryRow(
  tx: DbOrTx,
  orgId: string,
  productId: string,
  locationId: string,
): Promise<{ id: string; stockLevel: number; reservedLevel: number }> {
  // Use raw SQL for SELECT ... FOR UPDATE (Drizzle doesn't natively support it)
  const rows = await tx.execute(
    sql`SELECT id, stock_level, reserved_level
        FROM inventory
        WHERE org_id = ${orgId}
          AND product_id = ${productId}
          AND location_id = ${locationId}
        FOR UPDATE`,
  );

  if (rows.length > 0) {
    const row = rows[0] as any;
    return {
      id: row.id,
      stockLevel: row.stock_level,
      reservedLevel: row.reserved_level,
    };
  }

  // Create the inventory row if it doesn't exist
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

  return {
    id: newRow.id,
    stockLevel: 0,
    reservedLevel: 0,
  };
}

/**
 * Insert a stock_journal entry with idempotency key.
 * Returns the inserted journal row.
 */
async function insertJournalEntry(
  tx: DbOrTx,
  params: {
    orgId: string;
    productId: string;
    locationId: string;
    userId: string | null;
    actorType: "USER" | "SYSTEM" | "INTEGRATION";
    changeQuantity: number;
    balanceAfter: number;
    referenceType: "TRANSFER_OUT" | "TRANSFER_IN" | "ADJUSTMENT";
    referenceId: string;
    referenceLineId?: string;
    reasonCode?: string;
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
      reasonCode: params.reasonCode as any,
      idempotencyKey: params.idempotencyKey,
      notes: params.notes,
    })
    .returning();
  return entry;
}

// ── Service Functions ──

export async function createTransfer(
  input: CreateTransferInput,
  orgId: string,
  userId: string,
) {
  return db.transaction(async (tx) => {
    // Validate locations belong to org and are not TRANSIT_BUFFER
    const [source] = await tx
      .select()
      .from(locations)
      .where(
        and(eq(locations.id, input.sourceLocationId), eq(locations.orgId, orgId)),
      )
      .limit(1);
    if (!source) throw new Error("Source location not found");
    if (source.type === "TRANSIT_BUFFER")
      throw new Error("Cannot create transfer from TRANSIT_BUFFER");

    const [dest] = await tx
      .select()
      .from(locations)
      .where(
        and(
          eq(locations.id, input.destinationLocationId),
          eq(locations.orgId, orgId),
        ),
      )
      .limit(1);
    if (!dest) throw new Error("Destination location not found");
    if (dest.type === "TRANSIT_BUFFER")
      throw new Error("Cannot create transfer to TRANSIT_BUFFER");

    if (input.sourceLocationId === input.destinationLocationId) {
      throw new Error("Source and destination must be different");
    }

    const transferNo = await generateTransferNo(tx, orgId);

    const [transfer] = await tx
      .insert(stockTransfers)
      .values({
        orgId,
        transferNo,
        sourceLocationId: input.sourceLocationId,
        destinationLocationId: input.destinationLocationId,
        status: "DRAFT",
        notes: input.notes,
        requestedByUserId: userId,
      })
      .returning();

    const items = await tx
      .insert(stockTransferItems)
      .values(
        input.items.map((item) => ({
          transferId: transfer.id,
          orgId,
          productId: item.productId,
          requestedQty: item.requestedQty,
        })),
      )
      .returning();

    return { transfer, items };
  });
}

export async function approveTransfer(
  transferId: string,
  orgId: string,
  userId: string,
  idempotencyKey: string,
  notes?: string,
) {
  return db.transaction(async (tx) => {
    // Lock transfer row
    const transferRows = await tx.execute(
      sql`SELECT * FROM stock_transfers WHERE id = ${transferId} AND org_id = ${orgId} FOR UPDATE`,
    );
    if (transferRows.length === 0) throw new Error("Transfer not found");

    const transfer = transferRows[0] as any;
    if (transfer.status !== TransferStatus.DRAFT) {
      throw new Error(`Cannot approve transfer in ${transfer.status} status`);
    }

    // Get all transfer items
    const items = await tx
      .select()
      .from(stockTransferItems)
      .where(eq(stockTransferItems.transferId, transferId));

    // Reserve stock at source for each item
    for (const item of items) {
      const inv = await lockInventoryRow(
        tx,
        orgId,
        item.productId,
        transfer.source_location_id,
      );
      const available = inv.stockLevel - inv.reservedLevel;
      if (available < item.requestedQty) {
        throw new Error(
          `Insufficient available stock for product ${item.productId}. Available: ${available}, Requested: ${item.requestedQty}`,
        );
      }

      // Increment reserved_level
      await tx
        .update(inventory)
        .set({ reservedLevel: sql`reserved_level + ${item.requestedQty}` })
        .where(eq(inventory.id, inv.id));
    }

    // Update transfer status — no journal entries on approval
    const [updated] = await tx
      .update(stockTransfers)
      .set({
        status: "APPROVED",
        approvedByUserId: userId,
        approvedAt: new Date(),
        notes: notes ? `${transfer.notes ?? ""}\n[Approval] ${notes}`.trim() : transfer.notes,
      })
      .where(eq(stockTransfers.id, transferId))
      .returning();

    return updated;
  });
}

export async function startPicking(
  transferId: string,
  orgId: string,
  _idempotencyKey: string,
) {
  return db.transaction(async (tx) => {
    const transferRows = await tx.execute(
      sql`SELECT * FROM stock_transfers WHERE id = ${transferId} AND org_id = ${orgId} FOR UPDATE`,
    );
    if (transferRows.length === 0) throw new Error("Transfer not found");

    const transfer = transferRows[0] as any;
    if (transfer.status !== TransferStatus.APPROVED) {
      throw new Error(
        `Cannot start picking from ${transfer.status} status`,
      );
    }

    const [updated] = await tx
      .update(stockTransfers)
      .set({ status: "PICKING" })
      .where(eq(stockTransfers.id, transferId))
      .returning();

    return updated;
  });
}

export async function dispatchTransfer(
  transferId: string,
  orgId: string,
  userId: string,
  input: DispatchTransferInput,
) {
  return db.transaction(async (tx) => {
    // Lock transfer
    const transferRows = await tx.execute(
      sql`SELECT * FROM stock_transfers WHERE id = ${transferId} AND org_id = ${orgId} FOR UPDATE`,
    );
    if (transferRows.length === 0) throw new Error("Transfer not found");

    const transfer = transferRows[0] as any;
    if (
      transfer.status !== TransferStatus.APPROVED &&
      transfer.status !== TransferStatus.PICKING
    ) {
      throw new Error(
        `Cannot dispatch from ${transfer.status} status`,
      );
    }

    const transitBuffer = await getTransitBuffer(tx, orgId);

    for (const line of input.lines) {
      // Lock transfer item
      const itemRows = await tx.execute(
        sql`SELECT * FROM stock_transfer_items
            WHERE id = ${line.transferItemId} AND transfer_id = ${transferId}
            FOR UPDATE`,
      );
      if (itemRows.length === 0)
        throw new Error(`Transfer item ${line.transferItemId} not found`);

      const item = itemRows[0] as any;
      if (line.dispatchQty > item.requested_qty - item.dispatched_qty) {
        throw new Error(
          `Dispatch quantity ${line.dispatchQty} exceeds remaining for item ${line.transferItemId}`,
        );
      }

      // Lock source inventory
      const sourceInv = await lockInventoryRow(
        tx,
        orgId,
        item.product_id,
        transfer.source_location_id,
      );
      if (sourceInv.reservedLevel < line.dispatchQty) {
        throw new Error(
          `Insufficient reserved stock at source for product ${item.product_id}`,
        );
      }

      // Lock TRANSIT_BUFFER inventory (create if not exists)
      const transitInv = await lockInventoryRow(
        tx,
        orgId,
        item.product_id,
        transitBuffer.id,
      );

      // 1. Decrement source stock_level and reserved_level
      const newSourceStock = sourceInv.stockLevel - line.dispatchQty;
      const newSourceReserved = sourceInv.reservedLevel - line.dispatchQty;
      await tx
        .update(inventory)
        .set({
          stockLevel: newSourceStock,
          reservedLevel: newSourceReserved,
        })
        .where(eq(inventory.id, sourceInv.id));

      // 2. Increment TRANSIT_BUFFER stock_level
      const newTransitStock = transitInv.stockLevel + line.dispatchQty;
      await tx
        .update(inventory)
        .set({ stockLevel: newTransitStock })
        .where(eq(inventory.id, transitInv.id));

      // 3. TRANSFER_OUT journal for source
      await insertJournalEntry(tx, {
        orgId,
        productId: item.product_id,
        locationId: transfer.source_location_id,
        userId,
        actorType: "USER",
        changeQuantity: -line.dispatchQty,
        balanceAfter: newSourceStock,
        referenceType: "TRANSFER_OUT",
        referenceId: transferId,
        referenceLineId: line.transferItemId,
        idempotencyKey: `${input.idempotencyKey}:DISPATCH:OUT:${line.transferItemId}`,
        notes: input.notes,
      });

      // 4. TRANSFER_IN journal for TRANSIT_BUFFER
      await insertJournalEntry(tx, {
        orgId,
        productId: item.product_id,
        locationId: transitBuffer.id,
        userId,
        actorType: "SYSTEM",
        changeQuantity: line.dispatchQty,
        balanceAfter: newTransitStock,
        referenceType: "TRANSFER_IN",
        referenceId: transferId,
        referenceLineId: line.transferItemId,
        idempotencyKey: `${input.idempotencyKey}:DISPATCH:IN:${line.transferItemId}`,
        notes: input.notes,
      });

      // 5. Update transfer item dispatched_qty
      await tx
        .update(stockTransferItems)
        .set({
          dispatchedQty: sql`dispatched_qty + ${line.dispatchQty}`,
        })
        .where(eq(stockTransferItems.id, line.transferItemId));
    }

    // Update transfer status
    const [updated] = await tx
      .update(stockTransfers)
      .set({
        status: "DISPATCHED",
        dispatchedByUserId: userId,
        dispatchedAt: new Date(),
      })
      .where(eq(stockTransfers.id, transferId))
      .returning();

    return updated;
  });
}

export async function receiveTransfer(
  transferId: string,
  orgId: string,
  userId: string,
  input: ReceiveTransferInput,
) {
  return db.transaction(async (tx) => {
    // Lock transfer
    const transferRows = await tx.execute(
      sql`SELECT * FROM stock_transfers WHERE id = ${transferId} AND org_id = ${orgId} FOR UPDATE`,
    );
    if (transferRows.length === 0) throw new Error("Transfer not found");

    const transfer = transferRows[0] as any;
    const allowedStatuses = [
      TransferStatus.DISPATCHED,
      TransferStatus.PARTIALLY_RECEIVED,
      TransferStatus.DISCREPANCY_REVIEW,
    ];
    if (!allowedStatuses.includes(transfer.status)) {
      throw new Error(`Cannot receive from ${transfer.status} status`);
    }

    const transitBuffer = await getTransitBuffer(tx, orgId);

    for (const line of input.lines) {
      // Lock transfer item
      const itemRows = await tx.execute(
        sql`SELECT * FROM stock_transfer_items
            WHERE id = ${line.transferItemId} AND transfer_id = ${transferId}
            FOR UPDATE`,
      );
      if (itemRows.length === 0)
        throw new Error(`Transfer item ${line.transferItemId} not found`);

      const item = itemRows[0] as any;
      const remainingToReceive =
        item.dispatched_qty - item.received_qty - item.variance_qty;
      if (line.receiveQty > remainingToReceive) {
        throw new Error(
          `Receive qty ${line.receiveQty} exceeds remaining receivable ${remainingToReceive} for item ${line.transferItemId}`,
        );
      }

      // Lock TRANSIT_BUFFER inventory
      const transitInv = await lockInventoryRow(
        tx,
        orgId,
        item.product_id,
        transitBuffer.id,
      );
      if (transitInv.stockLevel < line.receiveQty) {
        throw new Error(
          `Insufficient TRANSIT_BUFFER stock for product ${item.product_id}`,
        );
      }

      // Lock destination inventory
      const destInv = await lockInventoryRow(
        tx,
        orgId,
        item.product_id,
        transfer.destination_location_id,
      );

      // 1. Decrement TRANSIT_BUFFER
      const newTransitStock = transitInv.stockLevel - line.receiveQty;
      await tx
        .update(inventory)
        .set({ stockLevel: newTransitStock })
        .where(eq(inventory.id, transitInv.id));

      // 2. Increment destination
      const newDestStock = destInv.stockLevel + line.receiveQty;
      await tx
        .update(inventory)
        .set({ stockLevel: newDestStock })
        .where(eq(inventory.id, destInv.id));

      // 3. TRANSFER_OUT journal for TRANSIT_BUFFER
      await insertJournalEntry(tx, {
        orgId,
        productId: item.product_id,
        locationId: transitBuffer.id,
        userId,
        actorType: "SYSTEM",
        changeQuantity: -line.receiveQty,
        balanceAfter: newTransitStock,
        referenceType: "TRANSFER_OUT",
        referenceId: transferId,
        referenceLineId: line.transferItemId,
        idempotencyKey: `${input.idempotencyKey}:RECEIVE:OUT:${line.transferItemId}`,
        notes: input.notes,
      });

      // 4. TRANSFER_IN journal for destination
      await insertJournalEntry(tx, {
        orgId,
        productId: item.product_id,
        locationId: transfer.destination_location_id,
        userId,
        actorType: "USER",
        changeQuantity: line.receiveQty,
        balanceAfter: newDestStock,
        referenceType: "TRANSFER_IN",
        referenceId: transferId,
        referenceLineId: line.transferItemId,
        idempotencyKey: `${input.idempotencyKey}:RECEIVE:IN:${line.transferItemId}`,
        notes: input.notes,
      });

      // 5. Append receipt event
      await tx.insert(stockTransferReceipts).values({
        orgId,
        transferId,
        transferItemId: line.transferItemId,
        locationId: transfer.destination_location_id,
        receivedQty: line.receiveQty,
        notes: input.notes,
        receivedByUserId: userId,
      });

      // 6. Update transfer item
      await tx
        .update(stockTransferItems)
        .set({
          receivedQty: sql`received_qty + ${line.receiveQty}`,
        })
        .where(eq(stockTransferItems.id, line.transferItemId));
    }

    // Recompute status
    const allItems = await tx
      .select()
      .from(stockTransferItems)
      .where(eq(stockTransferItems.transferId, transferId));

    const fullyReceived = allItems.every(
      (i) => i.dispatchedQty === i.receivedQty && i.varianceQty === 0,
    );

    const newStatus = fullyReceived
      ? TransferStatus.RECEIVED
      : TransferStatus.PARTIALLY_RECEIVED;

    const updateData: Record<string, any> = {
      status: newStatus,
      receivedByUserId: userId,
    };
    if (newStatus === TransferStatus.RECEIVED) {
      updateData.completedAt = new Date();
    }

    const [updated] = await tx
      .update(stockTransfers)
      .set(updateData)
      .where(eq(stockTransfers.id, transferId))
      .returning();

    return updated;
  });
}

export async function reportVariance(
  transferId: string,
  orgId: string,
  userId: string,
  input: ReportVarianceInput,
) {
  return db.transaction(async (tx) => {
    // Lock transfer
    const transferRows = await tx.execute(
      sql`SELECT * FROM stock_transfers WHERE id = ${transferId} AND org_id = ${orgId} FOR UPDATE`,
    );
    if (transferRows.length === 0) throw new Error("Transfer not found");

    const transfer = transferRows[0] as any;
    const allowedStatuses = [
      TransferStatus.DISPATCHED,
      TransferStatus.PARTIALLY_RECEIVED,
      TransferStatus.DISCREPANCY_REVIEW,
    ];
    if (!allowedStatuses.includes(transfer.status)) {
      throw new Error(
        `Cannot report variance from ${transfer.status} status`,
      );
    }

    const transitBuffer = await getTransitBuffer(tx, orgId);

    for (const line of input.lines) {
      // Lock transfer item
      const itemRows = await tx.execute(
        sql`SELECT * FROM stock_transfer_items
            WHERE id = ${line.transferItemId} AND transfer_id = ${transferId}
            FOR UPDATE`,
      );
      if (itemRows.length === 0)
        throw new Error(`Transfer item ${line.transferItemId} not found`);

      const item = itemRows[0] as any;
      const remainingUnaccounted =
        item.dispatched_qty - item.received_qty - item.variance_qty;
      if (line.varianceQty > remainingUnaccounted) {
        throw new Error(
          `Variance qty ${line.varianceQty} exceeds unaccounted ${remainingUnaccounted} for item ${line.transferItemId}`,
        );
      }

      // Lock TRANSIT_BUFFER inventory
      const transitInv = await lockInventoryRow(
        tx,
        orgId,
        item.product_id,
        transitBuffer.id,
      );
      if (transitInv.stockLevel < line.varianceQty) {
        throw new Error(
          `Insufficient TRANSIT_BUFFER stock to write off variance for product ${item.product_id}`,
        );
      }

      // 1. Decrement TRANSIT_BUFFER
      const newTransitStock = transitInv.stockLevel - line.varianceQty;
      await tx
        .update(inventory)
        .set({ stockLevel: newTransitStock })
        .where(eq(inventory.id, transitInv.id));

      // 2. ADJUSTMENT journal for TRANSIT_BUFFER (write off)
      await insertJournalEntry(tx, {
        orgId,
        productId: item.product_id,
        locationId: transitBuffer.id,
        userId,
        actorType: "USER",
        changeQuantity: -line.varianceQty,
        balanceAfter: newTransitStock,
        referenceType: "ADJUSTMENT",
        referenceId: transferId,
        referenceLineId: line.transferItemId,
        reasonCode: line.reasonCode,
        idempotencyKey: `${input.idempotencyKey}:VARIANCE:${line.transferItemId}`,
        notes: line.notes,
      });

      // 3. Increment variance_qty on transfer item
      await tx
        .update(stockTransferItems)
        .set({
          varianceQty: sql`variance_qty + ${line.varianceQty}`,
        })
        .where(eq(stockTransferItems.id, line.transferItemId));
    }

    // Recompute status
    const allItems = await tx
      .select()
      .from(stockTransferItems)
      .where(eq(stockTransferItems.transferId, transferId));

    const allFullyAccounted = allItems.every(
      (i) => i.dispatchedQty === i.receivedQty + i.varianceQty,
    );
    const hasVariance = allItems.some((i) => i.varianceQty > 0);

    let newStatus: string;
    if (allFullyAccounted && hasVariance) {
      newStatus = TransferStatus.CLOSED_WITH_VARIANCE;
    } else if (allFullyAccounted && !hasVariance) {
      newStatus = TransferStatus.RECEIVED;
    } else {
      newStatus = TransferStatus.DISCREPANCY_REVIEW;
    }

    const updateData: Record<string, any> = { status: newStatus };
    if (
      newStatus === TransferStatus.CLOSED_WITH_VARIANCE ||
      newStatus === TransferStatus.RECEIVED
    ) {
      updateData.completedAt = new Date();
    }

    const [updated] = await tx
      .update(stockTransfers)
      .set(updateData)
      .where(eq(stockTransfers.id, transferId))
      .returning();

    return updated;
  });
}

export async function cancelTransfer(
  transferId: string,
  orgId: string,
  userId: string,
  idempotencyKey: string,
  notes?: string,
) {
  return db.transaction(async (tx) => {
    // Lock transfer
    const transferRows = await tx.execute(
      sql`SELECT * FROM stock_transfers WHERE id = ${transferId} AND org_id = ${orgId} FOR UPDATE`,
    );
    if (transferRows.length === 0) throw new Error("Transfer not found");

    const transfer = transferRows[0] as any;
    const cancellableStatuses = [
      TransferStatus.DRAFT,
      TransferStatus.APPROVED,
      TransferStatus.PICKING,
    ];
    if (!cancellableStatuses.includes(transfer.status)) {
      throw new Error(`Cannot cancel transfer in ${transfer.status} status`);
    }

    // Release reservations if APPROVED or PICKING
    if (
      transfer.status === TransferStatus.APPROVED ||
      transfer.status === TransferStatus.PICKING
    ) {
      const items = await tx
        .select()
        .from(stockTransferItems)
        .where(eq(stockTransferItems.transferId, transferId));

      for (const item of items) {
        const inv = await lockInventoryRow(
          tx,
          orgId,
          item.productId,
          transfer.source_location_id,
        );
        const newReserved = Math.max(0, inv.reservedLevel - item.requestedQty);
        await tx
          .update(inventory)
          .set({ reservedLevel: newReserved })
          .where(eq(inventory.id, inv.id));
      }
    }

    // No journal entries for cancellation
    const [updated] = await tx
      .update(stockTransfers)
      .set({
        status: "CANCELLED",
        notes: notes
          ? `${transfer.notes ?? ""}\n[Cancelled] ${notes}`.trim()
          : transfer.notes,
      })
      .where(eq(stockTransfers.id, transferId))
      .returning();

    return updated;
  });
}

// ── Allowed Actions ──

/**
 * Server-side action resolution.
 *
 * The frontend MUST NOT infer actions from status alone.
 * This function computes the exact set of permitted actions
 * based on (status, role, activeLocation).
 */
export function computeAllowedActions(
  transfer: {
    status: string;
    sourceLocationId: string;
    destinationLocationId: string;
  },
  role: string,
  activeLocationId: string,
): string[] {
  const actions: string[] = [];
  const isAdmin = role === UserRole.ADMIN;
  const isManager = role === UserRole.MANAGER;
  const isAdminOrManager = isAdmin || isManager;
  const isTransferRole =
    isAdminOrManager || role === UserRole.WAREHOUSE_STAFF;
  const atSource = activeLocationId === transfer.sourceLocationId;
  const atDestination = activeLocationId === transfer.destinationLocationId;

  switch (transfer.status) {
    case TransferStatus.DRAFT:
      if (isAdminOrManager) actions.push("approve");
      if (isTransferRole) actions.push("cancel");
      break;

    case TransferStatus.APPROVED:
      if (atSource && isTransferRole) actions.push("start_picking");
      if (atSource && isTransferRole) actions.push("dispatch");
      if (isAdminOrManager) actions.push("cancel");
      break;

    case TransferStatus.PICKING:
      if (atSource && isTransferRole) actions.push("dispatch");
      if (isAdminOrManager) actions.push("cancel");
      break;

    case TransferStatus.DISPATCHED:
      if (atDestination && isTransferRole) actions.push("receive");
      if (isAdminOrManager) actions.push("report_variance");
      break;

    case TransferStatus.PARTIALLY_RECEIVED:
      if (atDestination && isTransferRole) actions.push("receive");
      if (isAdminOrManager) actions.push("report_variance");
      break;

    case TransferStatus.DISCREPANCY_REVIEW:
      if (atDestination && isTransferRole) actions.push("receive");
      if (isAdminOrManager) actions.push("report_variance");
      break;

    // Terminal states — no actions
    case TransferStatus.RECEIVED:
    case TransferStatus.CLOSED_WITH_VARIANCE:
    case TransferStatus.CANCELLED:
      break;
  }

  return actions;
}

/**
 * Generate human-readable labels for each action with location context.
 * e.g., "Dispatch from Central Warehouse", "Receive into Downtown Store"
 */
function computeActionLabels(
  actions: string[],
  sourceName: string,
  destName: string,
): Record<string, string> {
  const labels: Record<string, string> = {};
  for (const action of actions) {
    switch (action) {
      case "approve":
        labels[action] = "Approve Transfer";
        break;
      case "start_picking":
        labels[action] = `Start Picking at ${sourceName}`;
        break;
      case "dispatch":
        labels[action] = `Dispatch from ${sourceName}`;
        break;
      case "receive":
        labels[action] = `Receive into ${destName}`;
        break;
      case "report_variance":
        labels[action] = "Report Variance";
        break;
      case "cancel":
        labels[action] = "Cancel Transfer";
        break;
      default:
        labels[action] = action;
    }
  }
  return labels;
}

// ── Query Functions ──

/**
 * Shared logic: load a transfer with enriched items, locations, receipts,
 * and server-computed allowedActions.
 */
async function buildTransferDetail(
  transfer: typeof stockTransfers.$inferSelect,
  orgId: string,
  role: string,
  activeLocationId: string,
) {
  // Fetch items with product info
  const rawItems = await db
    .select({
      id: stockTransferItems.id,
      transferId: stockTransferItems.transferId,
      productId: stockTransferItems.productId,
      requestedQty: stockTransferItems.requestedQty,
      dispatchedQty: stockTransferItems.dispatchedQty,
      receivedQty: stockTransferItems.receivedQty,
      varianceQty: stockTransferItems.varianceQty,
      createdAt: stockTransferItems.createdAt,
      mnemonicSku: products.mnemonicSku,
      productName: products.name,
      sku: products.sku,
    })
    .from(stockTransferItems)
    .innerJoin(products, eq(products.id, stockTransferItems.productId))
    .where(eq(stockTransferItems.transferId, transfer.id));

  const items = rawItems.map((item) => ({
    ...item,
    remainingReceivable:
      item.dispatchedQty - item.receivedQty - item.varianceQty,
    remainingDispatchable: item.requestedQty - item.dispatchedQty,
  }));

  const [source] = await db
    .select()
    .from(locations)
    .where(eq(locations.id, transfer.sourceLocationId))
    .limit(1);

  const [destination] = await db
    .select()
    .from(locations)
    .where(eq(locations.id, transfer.destinationLocationId))
    .limit(1);

  const receipts = await db
    .select()
    .from(stockTransferReceipts)
    .where(eq(stockTransferReceipts.transferId, transfer.id));

  const allowedActions = computeAllowedActions(
    transfer,
    role,
    activeLocationId,
  );

  const actionLabels = computeActionLabels(
    allowedActions,
    source?.name ?? "Source",
    destination?.name ?? "Destination",
  );

  return {
    ...transfer,
    sourceLocation: source,
    destinationLocation: destination,
    items,
    receipts,
    allowedActions,
    actionLabels,
  };
}

export async function getTransfer(
  transferId: string,
  orgId: string,
  role: string = UserRole.ADMIN,
  activeLocationId: string = "",
) {
  const [transfer] = await db
    .select()
    .from(stockTransfers)
    .where(
      and(
        eq(stockTransfers.id, transferId),
        eq(stockTransfers.orgId, orgId),
      ),
    )
    .limit(1);

  if (!transfer) return null;

  return buildTransferDetail(transfer, orgId, role, activeLocationId);
}

export async function getTransferByNumber(
  transferNo: string,
  orgId: string,
  role: string,
  activeLocationId: string,
) {
  const [transfer] = await db
    .select()
    .from(stockTransfers)
    .where(
      and(
        eq(stockTransfers.transferNo, transferNo),
        eq(stockTransfers.orgId, orgId),
      ),
    )
    .limit(1);

  if (!transfer) return null;

  return buildTransferDetail(transfer, orgId, role, activeLocationId);
}

/**
 * List transfers with cursor-based pagination.
 */
export async function listTransfers(
  orgId: string,
  cursor?: string,
  limit: number = 50,
) {
  const conditions = cursor
    ? and(
        eq(stockTransfers.orgId, orgId),
        sql`${stockTransfers.id} > ${cursor}`,
      )
    : eq(stockTransfers.orgId, orgId);

  const results = await db
    .select({
      id: stockTransfers.id,
      transferNo: stockTransfers.transferNo,
      status: stockTransfers.status,
      sourceLocationId: stockTransfers.sourceLocationId,
      destinationLocationId: stockTransfers.destinationLocationId,
      createdAt: stockTransfers.createdAt,
      updatedAt: stockTransfers.updatedAt,
      sourceLocationName: sql<string>`sl.name`,
      destinationLocationName: sql<string>`dl.name`,
    })
    .from(stockTransfers)
    .innerJoin(sql`locations sl`, sql`sl.id = ${stockTransfers.sourceLocationId}`)
    .innerJoin(sql`locations dl`, sql`dl.id = ${stockTransfers.destinationLocationId}`)
    .where(conditions)
    .orderBy(stockTransfers.id)
    .limit(limit + 1);

  const hasMore = results.length > limit;
  const data = hasMore ? results.slice(0, limit) : results;
  const nextCursor = hasMore ? data[data.length - 1].id : null;

  return { data, nextCursor, hasMore };
}

export async function getTransferJournal(transferId: string, orgId: string) {
  const entries = await db
    .select()
    .from(stockJournal)
    .where(
      and(
        eq(stockJournal.referenceId, transferId),
        eq(stockJournal.orgId, orgId),
      ),
    )
    .orderBy(stockJournal.effectiveAt, stockJournal.createdAt);

  return entries;
}
