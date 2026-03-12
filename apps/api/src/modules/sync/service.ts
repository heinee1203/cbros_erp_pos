import { db } from "@apex/database";
import { products, inventory } from "@apex/database/schema";
import { and, eq, gt, asc, sql } from "drizzle-orm";

interface SyncOpts {
  orgId: string;
  locationId: string;
  since?: string; // ISO timestamp
  cursor?: string; // UUID — keyset pagination cursor
  limit?: number; // default 500, max 1000
}

interface SyncResult<T> {
  data: T[];
  syncedAt: string;
  count: number;
  nextCursor: string | null;
  hasMore: boolean;
}

function clampLimit(raw?: number): number {
  const limit = raw ?? 500;
  return Math.min(Math.max(1, limit), 1000);
}

export async function getCatalogDelta(opts: SyncOpts): Promise<SyncResult<any>> {
  const { orgId, since, cursor } = opts;
  const limit = clampLimit(opts.limit);

  const conditions = [eq(products.orgId, orgId)];
  if (since) {
    conditions.push(gt(products.updatedAt, new Date(since)));
  }

  if (cursor) {
    const [cursorRow] = await db
      .select({ updatedAt: products.updatedAt })
      .from(products)
      .where(eq(products.id, cursor))
      .limit(1);
    if (cursorRow) {
      conditions.push(
        sql`(${products.updatedAt}, ${products.id}) > (${cursorRow.updatedAt}, ${cursor})`,
      );
    }
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
      isVariablePrice: products.isVariablePrice,
      isActive: products.isActive,
      familyId: products.familyId,
      updatedAt: products.updatedAt,
    })
    .from(products)
    .where(and(...conditions))
    .orderBy(asc(products.updatedAt), asc(products.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? data[data.length - 1].id : null;

  return {
    data,
    syncedAt: new Date().toISOString(),
    count: data.length,
    nextCursor,
    hasMore,
  };
}

export async function getInventoryDelta(opts: SyncOpts): Promise<SyncResult<any>> {
  const { orgId, locationId, since, cursor } = opts;
  const limit = clampLimit(opts.limit);

  const conditions = [
    eq(inventory.orgId, orgId),
    eq(inventory.locationId, locationId),
  ];
  if (since) {
    conditions.push(gt(inventory.updatedAt, new Date(since)));
  }

  if (cursor) {
    const [cursorRow] = await db
      .select({ updatedAt: inventory.updatedAt })
      .from(inventory)
      .where(eq(inventory.id, cursor))
      .limit(1);
    if (cursorRow) {
      conditions.push(
        sql`(${inventory.updatedAt}, ${inventory.id}) > (${cursorRow.updatedAt}, ${cursor})`,
      );
    }
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
    .orderBy(asc(inventory.updatedAt), asc(inventory.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? data[data.length - 1].id : null;

  return {
    data,
    syncedAt: new Date().toISOString(),
    count: data.length,
    nextCursor,
    hasMore,
  };
}
