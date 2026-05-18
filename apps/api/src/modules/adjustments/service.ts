import { db, type DbOrTx } from "@apex/database";
import { inventory, stockJournal, locations, products } from "@apex/database/schema";
import { eq, and, desc, inArray, sql } from "drizzle-orm";
import type { CreateAdjustmentInput } from "@apex/types";
import {
  checkAndNotifyStockout,
  checkAndNotifyLowStock,
} from "../notifications/service";
import {
  AdjustmentDirection,
  AdjustmentReasonCode,
  isReasonCodeValidForDirection,
  RESTRICTED_REASON_CODES,
  UserRole,
} from "@apex/types";

const ADJUSTMENT_REFERENCE_TYPES = [
  "ADJUSTMENT",
  "STOCKTAKE",
  "OPENING_BALANCE",
] as const;

function buildAdjustmentListWhere({
  orgId,
  locationId,
  query,
}: {
  orgId: string;
  locationId?: string | null;
  query: Record<string, string | undefined>;
}) {
  const conditions = [
    eq(stockJournal.orgId, orgId),
    inArray(stockJournal.referenceType, [...ADJUSTMENT_REFERENCE_TYPES]),
  ];

  if (query.location === "all" || !locationId) {
    // Preserve org-wide view when explicitly requested or no location is scoped.
  } else {
    conditions.push(eq(stockJournal.locationId, query.locationId ?? locationId));
  }

  if (query.reasonCode) {
    conditions.push(sql`${stockJournal.reasonCode} = ${query.reasonCode}`);
  }

  if (query.direction === "add") {
    conditions.push(sql`${stockJournal.changeQuantity} > 0`);
  } else if (query.direction === "deduct") {
    conditions.push(sql`${stockJournal.changeQuantity} < 0`);
  }

  return and(...conditions);
}

export async function listAdjustments({
  orgId,
  locationId,
  query,
  page,
  limit,
  offset,
}: {
  orgId: string;
  locationId?: string | null;
  query: Record<string, string | undefined>;
  page: number;
  limit: number;
  offset: number;
}) {
  const where = buildAdjustmentListWhere({ orgId, locationId, query });

  const [countResult] = await db
    .select({ total: sql<number>`COUNT(*)::int` })
    .from(stockJournal)
    .where(where);

  const total = countResult?.total ?? 0;

  const rows = await db
    .select({
      id: stockJournal.id,
      productId: stockJournal.productId,
      productName: products.name,
      productSku: products.sku,
      locationId: stockJournal.locationId,
      locationName: locations.name,
      changeQuantity: stockJournal.changeQuantity,
      balanceAfter: stockJournal.balanceAfter,
      referenceType: stockJournal.referenceType,
      reasonCode: stockJournal.reasonCode,
      notes: stockJournal.notes,
      userId: stockJournal.userId,
      effectiveAt: stockJournal.effectiveAt,
      createdAt: stockJournal.createdAt,
    })
    .from(stockJournal)
    .innerJoin(products, eq(stockJournal.productId, products.id))
    .innerJoin(locations, eq(stockJournal.locationId, locations.id))
    .where(where)
    .orderBy(desc(stockJournal.effectiveAt))
    .limit(limit)
    .offset(offset);

  return {
    data: rows,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

/**
 * Lock an inventory row with SELECT ... FOR UPDATE for safe concurrent updates.
 * Creates the row if it doesn't exist.
 */
async function lockInventoryRow(
  tx: DbOrTx,
  orgId: string,
  productId: string,
  locationId: string,
): Promise<{ id: string; stockLevel: number; reservedLevel: number; reorderPoint: number }> {
  const rows = await tx.execute(
    sql`SELECT id, stock_level, reserved_level, reorder_point
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
      reorderPoint: row.reorder_point,
    };
  }

  // Create inventory row if doesn't exist
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

  return { id: newRow.id, stockLevel: 0, reservedLevel: 0, reorderPoint: newRow.reorderPoint };
}

export async function createAdjustment(
  input: CreateAdjustmentInput,
  orgId: string,
  userId: string,
  userRole: string,
) {
  // ── Pre-transaction validation ──

  // 1. Validate reason code matches direction
  const reasonCode = input.reasonCode as AdjustmentReasonCode;
  const direction = input.direction as AdjustmentDirection;
  if (!isReasonCodeValidForDirection(reasonCode, direction)) {
    throw new Error(
      `Reason code ${input.reasonCode} is not valid for ${input.direction} adjustments`,
    );
  }

  // 2. DATA_CORRECTION: admin/owner only, notes mandatory
  if (RESTRICTED_REASON_CODES.includes(reasonCode)) {
    if (userRole !== UserRole.ADMIN && userRole !== UserRole.MANAGER) {
      throw new Error(
        `Reason code ${input.reasonCode} requires ADMIN or MANAGER role`,
      );
    }
    if (!input.notes || input.notes.trim().length === 0) {
      throw new Error(
        `Notes are mandatory for ${input.reasonCode} adjustments`,
      );
    }
  }

  // 3. OPENING_BALANCE: admin only
  if (reasonCode === AdjustmentReasonCode.OPENING_BALANCE) {
    if (userRole !== UserRole.ADMIN) {
      throw new Error("OPENING_BALANCE adjustments require ADMIN role");
    }
  }

  // 4. Notes required for all negative (OUT) adjustments
  if (direction === AdjustmentDirection.OUT) {
    if (!input.notes || input.notes.trim().length === 0) {
      throw new Error("Notes are required for all stock removal adjustments");
    }
  }

  // ── Transaction ──
  const result = await db.transaction(async (tx) => {
    // Validate location belongs to org
    const [location] = await tx
      .select()
      .from(locations)
      .where(
        and(eq(locations.id, input.locationId), eq(locations.orgId, orgId)),
      )
      .limit(1);
    if (!location) throw new Error("Location not found");
    if (location.type === "TRANSIT_BUFFER") {
      throw new Error(
        "Cannot perform manual adjustments on TRANSIT_BUFFER locations",
      );
    }

    // Lock inventory row
    const inv = await lockInventoryRow(
      tx,
      orgId,
      input.productId,
      input.locationId,
    );

    // Calculate change quantity (signed)
    const changeQty =
      direction === AdjustmentDirection.IN
        ? input.quantity
        : -input.quantity;

    // Validate sufficient stock for OUT
    if (direction === AdjustmentDirection.OUT) {
      if (inv.stockLevel < input.quantity) {
        throw new Error(
          `Insufficient stock. Current: ${inv.stockLevel}, Requested removal: ${input.quantity}`,
        );
      }
    }

    const newBalance = inv.stockLevel + changeQty;

    // Update inventory
    await tx
      .update(inventory)
      .set({ stockLevel: newBalance })
      .where(eq(inventory.id, inv.id));

    // Insert journal entry
    const [journalEntry] = await tx
      .insert(stockJournal)
      .values({
        orgId,
        productId: input.productId,
        locationId: input.locationId,
        userId,
        actorType: "USER",
        changeQuantity: changeQty,
        balanceAfter: newBalance,
        referenceType: "ADJUSTMENT",
        referenceId: inv.id, // reference the inventory row
        reasonCode: input.reasonCode as any,
        idempotencyKey: input.idempotencyKey,
        effectiveAt: input.effectiveAt ? new Date(input.effectiveAt) : new Date(),
        notes: input.notes,
      })
      .returning();

    return {
      journalEntry,
      updatedBalance: newBalance,
      locationId: input.locationId,
      productId: input.productId,
      reorderPoint: inv.reorderPoint,
    };
  });

  // Fire-and-forget stock notifications for OUT adjustments
  if (
    direction === AdjustmentDirection.OUT &&
    result.updatedBalance <= result.reorderPoint
  ) {
    setImmediate(async () => {
      try {
        const [product] = await db
          .select({ name: products.name })
          .from(products)
          .where(eq(products.id, result.productId))
          .limit(1);
        const [loc] = await db
          .select({ name: locations.name })
          .from(locations)
          .where(eq(locations.id, result.locationId))
          .limit(1);
        const pName = product?.name ?? "Unknown Product";
        const lName = loc?.name ?? "";

        if (result.updatedBalance <= 0) {
          await checkAndNotifyStockout(orgId, result.productId, pName, lName, result.updatedBalance);
        } else {
          await checkAndNotifyLowStock(orgId, result.productId, pName, lName, result.updatedBalance, result.reorderPoint);
        }
      } catch (err) {
        console.error("[NOTIFICATION] Adjustment notification error:", err);
      }
    });
  }

  return result;
}
