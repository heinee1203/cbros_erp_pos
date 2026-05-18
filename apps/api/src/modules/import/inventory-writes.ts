import { type DbOrTx } from "@apex/database";
import { inventory } from "@apex/database/schema";
import { and, eq } from "drizzle-orm";

export interface ImportInventoryLocation {
  apexLocationId: string | null;
  stockLevel: number;
  stockLevelWasPresent?: boolean;
  available: boolean;
  reorderPoint: number | null;
  optimalStock: number | null;
}

function toInventoryValues(orgId: string, productId: string, loc: ImportInventoryLocation) {
  return {
    orgId,
    productId,
    locationId: loc.apexLocationId!,
    stockLevel: loc.stockLevel,
    availableForSale: loc.available,
    reorderPoint: loc.reorderPoint ?? 0,
    optimalStock: loc.optimalStock ?? 0,
  };
}

export async function insertInventoryForProduct(
  tx: DbOrTx,
  orgId: string,
  productId: string,
  locations: ImportInventoryLocation[],
): Promise<void> {
  for (const loc of locations) {
    if (!loc.apexLocationId) continue;
    await tx.insert(inventory).values(toInventoryValues(orgId, productId, loc));
  }
}

export async function upsertInventoryForProduct(
  tx: DbOrTx,
  orgId: string,
  productId: string,
  locations: ImportInventoryLocation[],
): Promise<void> {
  for (const loc of locations) {
    if (!loc.apexLocationId) continue;

    const [existingInv] = await tx
      .select({ id: inventory.id })
      .from(inventory)
      .where(and(eq(inventory.productId, productId), eq(inventory.locationId, loc.apexLocationId)))
      .limit(1);

    if (existingInv) {
      await tx
        .update(inventory)
        .set({
          stockLevel: loc.stockLevel,
          availableForSale: loc.available,
          reorderPoint: loc.reorderPoint ?? 0,
          optimalStock: loc.optimalStock ?? 0,
        })
        .where(eq(inventory.id, existingInv.id));
    } else {
      await tx.insert(inventory).values(toInventoryValues(orgId, productId, loc));
    }
  }
}

export async function upsertInventoryQuantityForProduct(
  tx: DbOrTx,
  orgId: string,
  productId: string,
  locations: ImportInventoryLocation[],
): Promise<void> {
  for (const loc of locations) {
    if (!loc.apexLocationId || !loc.stockLevelWasPresent) continue;

    const [existingInv] = await tx
      .select({ id: inventory.id })
      .from(inventory)
      .where(and(eq(inventory.productId, productId), eq(inventory.locationId, loc.apexLocationId)))
      .limit(1);

    if (existingInv) {
      await tx.update(inventory).set({ stockLevel: loc.stockLevel }).where(eq(inventory.id, existingInv.id));
    } else {
      await tx.insert(inventory).values({
        orgId,
        productId,
        locationId: loc.apexLocationId,
        stockLevel: loc.stockLevel,
        availableForSale: true,
        reorderPoint: 0,
        optimalStock: 0,
      });
    }
  }
}
