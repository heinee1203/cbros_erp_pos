import { db, type DbOrTx } from "@apex/database";
import { inventory, stockJournal, locations, products } from "@apex/database/schema";
import { eq, and, sql } from "drizzle-orm";
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

/**
 * Lock an inventory row with SELECT ... FOR UPDATE for safe concurrent updates.
 * Creates the row if it doesn't exist.
 */
async function lockInventoryRow(
  tx: DbOrTx,
  orgId: string,
  productId: string,
  locationId: string,
): Promise<{ id: string; stockLevel: number; reservedLevel: number }> {
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

  return { id: newRow.id, stockLevel: 0, reservedLevel: 0 };
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
  return db.transaction(async (tx) => {
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
