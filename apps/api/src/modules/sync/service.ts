import { db } from "@apex/database";
import { products, inventory } from "@apex/database/schema";
import { and, eq, gt } from "drizzle-orm";

interface SyncOpts {
  orgId: string;
  locationId: string;
  since?: string; // ISO timestamp
}

export async function getCatalogDelta(opts: SyncOpts) {
  const { orgId, since } = opts;

  const conditions = [eq(products.orgId, orgId)];
  if (since) {
    conditions.push(gt(products.updatedAt, new Date(since)));
  }

  const rows = await db
    .select({
      id: products.id,
      name: products.name,
      sku: products.sku,
      mnemonicSku: products.mnemonicSku,
      barcode: products.barcode,
      category: products.category,
      unitPrice: products.unitPrice,
      familyId: products.familyId,
      updatedAt: products.updatedAt,
    })
    .from(products)
    .where(and(...conditions))
    .orderBy(products.updatedAt);

  return rows;
}

export async function getInventoryDelta(opts: SyncOpts) {
  const { orgId, locationId, since } = opts;

  const conditions = [
    eq(inventory.orgId, orgId),
    eq(inventory.locationId, locationId),
  ];
  if (since) {
    conditions.push(gt(inventory.updatedAt, new Date(since)));
  }

  const rows = await db
    .select({
      id: inventory.id,
      productId: inventory.productId,
      locationId: inventory.locationId,
      stockLevel: inventory.stockLevel,
      reservedLevel: inventory.reservedLevel,
      reorderPoint: inventory.reorderPoint,
      updatedAt: inventory.updatedAt,
    })
    .from(inventory)
    .where(and(...conditions))
    .orderBy(inventory.updatedAt);

  return rows;
}
