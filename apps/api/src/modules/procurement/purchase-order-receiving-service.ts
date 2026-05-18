import { db, type DbOrTx } from "@apex/database";
import {
  inventory,
  poLines,
  poReceiptEvents,
  poReceipts,
  products,
  purchaseOrders,
  serialNumbers,
  stockJournal,
} from "@apex/database/schema";
import { and, eq, inArray, sql } from "drizzle-orm";
import {
  generateCostCode,
  PROCUREMENT_ROLES,
  PurchaseOrderStatus,
  type ReceivePOInput,
} from "@apex/types";
import { autoFulfillBackordersForPO } from "../backorders/service";
import {
  applyReceiptResultToPoLine,
  buildProductCostMap,
  buildUniqueInventoryReceiptKeys,
  calculateCostPerSellingUnit,
  calculateInventoryQuantity,
  resolveReceivedPurchaseOrderStatus,
  summarizeReceiptResults,
  type ProcurementReceiptResult,
} from "./po-helpers";

function assertProcurementRole(userRole: string) {
  if (!PROCUREMENT_ROLES.includes(userRole as any)) {
    throw new Error(
      "Access denied: requires ADMIN, MANAGER, or WAREHOUSE_STAFF role",
    );
  }
}

async function lockInventoryRow(
  tx: DbOrTx,
  orgId: string,
  productId: string,
  locationId: string,
): Promise<{ id: string; stockLevel: number; reservedLevel: number }> {
  await tx.execute(
    sql`INSERT INTO inventory (id, org_id, product_id, location_id, stock_level, reserved_level, reorder_point, lead_time_days, created_at, updated_at)
        VALUES (gen_random_uuid(), ${orgId}, ${productId}, ${locationId}, 0, 0, 10, 7, NOW(), NOW())
        ON CONFLICT (product_id, location_id) DO NOTHING`,
  );

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

export async function receivePO(
  poId: string,
  orgId: string,
  userId: string,
  userRole: string,
  input: ReceivePOInput,
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

    const currentStatus = po.status as PurchaseOrderStatus;
    if (
      currentStatus !== PurchaseOrderStatus.SUBMITTED &&
      currentStatus !== PurchaseOrderStatus.PARTIALLY_RECEIVED
    ) {
      throw new Error(`Cannot receive against PO in ${po.status} status`);
    }

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

    const destinationLocationId = po.destination_location_id;
    const inputLineIds = input.lines.map((l) => l.poLineId).sort();

    const lockedPoLines = await tx.execute(
      sql`SELECT id, product_id, ordered_qty, received_accepted_qty, rejected_qty, unit_cost, unit, conversion_factor
          FROM po_lines
          WHERE purchase_order_id = ${poId}
            AND org_id = ${orgId}
          ORDER BY id ASC
          FOR UPDATE`,
    );

    const poLineMap = new Map<string, any>();
    for (const row of lockedPoLines) {
      poLineMap.set((row as any).id, row);
    }

    const receiptResults: ProcurementReceiptResult[] = [];

    for (const lineInput of input.lines) {
      const poLine = poLineMap.get(lineInput.poLineId);
      if (!poLine) {
        throw new Error(`PO line ${lineInput.poLineId} not found on this PO`);
      }

      const accepted = lineInput.receivedAcceptedQty;
      const rejected = lineInput.rejectedQty;

      if (accepted + rejected <= 0) {
        throw new Error(
          `Receipt line for PO line ${lineInput.poLineId}: accepted + rejected must be > 0`,
        );
      }

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

    const { totalAccepted, totalRejected } =
      summarizeReceiptResults(receiptResults);

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

    const receiptEventIds = receiptResults.map((r) => r.receiptEventId);
    if (receiptEventIds.length > 0) {
      await tx
        .update(poReceiptEvents)
        .set({ poReceiptId: receipt.id })
        .where(inArray(poReceiptEvents.id, receiptEventIds));
    }

    const trackingProductIds = [
      ...new Set(receiptResults.map((r) => r.productId)),
    ];
    const serialFlagRows =
      trackingProductIds.length > 0
        ? await tx.execute(
            sql`SELECT id, is_serialized, is_tire FROM products WHERE id IN (${sql.join(
              trackingProductIds.map((id) => sql`${id}`),
              sql`, `,
            )})`,
          )
        : [];
    const serializedIds = new Set(
      (serialFlagRows as any[])
        .filter((p: any) => p.is_serialized && !p.is_tire)
        .map((p: any) => p.id),
    );
    const tireIds = new Set(
      (serialFlagRows as any[])
        .filter((p: any) => p.is_tire)
        .map((p: any) => p.id),
    );

    {
      if (serializedIds.size > 0) {
        const allSerialValues: any[] = [];
        const allSerialStrings = new Set<string>();

        for (const result of receiptResults) {
          if (!serializedIds.has(result.productId) || result.acceptedQty === 0)
            continue;
          const lineInput = input.lines.find(
            (l) => l.poLineId === result.poLineId,
          );
          const serials = lineInput?.serialNumbers ?? [];

          if (serials.length !== result.acceptedQty) {
            throw new Error(
              `Serial count mismatch for PO line: expected ${result.acceptedQty} serials, got ${serials.length}`,
            );
          }

          for (const sn of serials) {
            const key = `${result.productId}:${sn.serialNumber}`;
            if (allSerialStrings.has(key)) {
              throw new Error(
                `Duplicate serial number in batch: ${sn.serialNumber}`,
              );
            }
            allSerialStrings.add(key);

            const values: any = {
              orgId,
              productId: result.productId,
              serialNumber: sn.serialNumber,
              status: "IN_STOCK",
              locationId: destinationLocationId,
              receivedVia: "PO_RECEIPT",
              receivedReferenceId: result.receiptEventId,
              receivedAt: new Date(),
            };

            if (sn.dotCode) {
              const ww = parseInt(sn.dotCode.slice(0, 2), 10);
              const yy = parseInt(sn.dotCode.slice(2, 4), 10);
              if (ww >= 1 && ww <= 53 && yy >= 0 && yy <= 99) {
                const fullYear = yy >= 90 ? 1900 + yy : 2000 + yy;
                values.dotCode = sn.dotCode;
                values.manufactureWeek = ww;
                values.manufactureYear = fullYear;
                values.manufactureDate = new Date(
                  fullYear,
                  0,
                  1 + (ww - 1) * 7,
                );
              }
            }

            allSerialValues.push(values);
          }
        }

        if (allSerialValues.length > 0) {
          const existingCheck = await tx.execute(
            sql`SELECT serial_number, product_id FROM serial_numbers
                WHERE org_id = ${orgId}
                AND serial_number IN (${sql.join(
                  allSerialValues.map((v) => sql`${v.serialNumber}`),
                  sql`, `,
                )})`,
          );
          if ((existingCheck as any[]).length > 0) {
            const dupes = (existingCheck as any[])
              .map((r: any) => r.serial_number)
              .join(", ");
            throw new Error(`Serial numbers already exist: ${dupes}`);
          }

          await tx.insert(serialNumbers).values(allSerialValues);
        }
      }
    }

    if (tireIds.size > 0) {
      const { receiveDotBatches } = await import("../dot-batches/service");

      for (const result of receiptResults) {
        if (!tireIds.has(result.productId) || result.acceptedQty === 0)
          continue;
        const lineInput = input.lines.find(
          (l) => l.poLineId === result.poLineId,
        );
        const batches = lineInput?.dotBatches ?? [];

        const batchTotal = batches.reduce((s, b) => s + b.quantity, 0);
        if (batchTotal !== result.acceptedQty) {
          throw new Error(
            `DOT batch quantity mismatch: expected ${result.acceptedQty} units, got ${batchTotal}`,
          );
        }

        await receiveDotBatches(tx, {
          orgId,
          productId: result.productId,
          locationId: destinationLocationId,
          purchaseOrderId: poId,
          poNumber: po.po_no,
          supplierId: po.supplier_id,
          supplierName: "",
          costPrice: result.unitCost,
          userId,
          batches,
        });
      }
    }

    const acceptedResults = receiptResults.filter((r) => r.acceptedQty > 0);

    const uniqueInventoryKeys = buildUniqueInventoryReceiptKeys(
      acceptedResults,
      destinationLocationId,
    );

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

      const convFactor = result.conversionFactor;
      const inventoryQty = calculateInventoryQuantity(
        result.acceptedQty,
        convFactor,
      );
      const newBalance = inv.stockLevel + inventoryQty;

      await tx
        .update(inventory)
        .set({ stockLevel: newBalance })
        .where(eq(inventory.id, inv.id));

      inv.stockLevel = newBalance;

      const costPerSellingUnit = calculateCostPerSellingUnit(
        result.unitCost,
        convFactor,
      );
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
        notes:
          convFactor > 1
            ? `PO ${po.po_no} receipt (${result.acceptedQty} Ãƒâ€” ${convFactor})`
            : `PO ${po.po_no} receipt`,
      });
    }

    const uniqueProductIds = [
      ...new Set(acceptedResults.map((r) => r.productId)),
    ].sort();

    const productCostMap = buildProductCostMap(acceptedResults);

    for (const productId of uniqueProductIds) {
      const product = await lockProductRow(tx, productId, orgId);
      const newCost = productCostMap.get(productId)!;
      const newMnemonicCostCode = generateCostCode(newCost);

      await tx
        .update(products)
        .set({
          currentCostPrice: newCost,
          mnemonicCostCode: newMnemonicCostCode,
        })
        .where(eq(products.id, productId));
    }

    for (const result of receiptResults) {
      const poLine = poLineMap.get(result.poLineId)!;
      const { newAccepted, newRejected } = applyReceiptResultToPoLine(
        poLine,
        result,
      );

      await tx
        .update(poLines)
        .set({
          receivedAcceptedQty: newAccepted,
          rejectedQty: newRejected,
        })
        .where(eq(poLines.id, result.poLineId));

      poLine.received_accepted_qty = newAccepted;
      poLine.rejected_qty = newRejected;
    }

    const allPoLines = [...poLineMap.values()];
    const { isFullyReceived, status: newStatus } =
      resolveReceivedPurchaseOrderStatus(allPoLines);

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

    if (isFullyReceived) {
      await autoFulfillBackordersForPO(orgId, poId);
    }

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
