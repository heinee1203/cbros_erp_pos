import { db } from "@apex/database";
import {
  inventory,
  products,
  productFamilies,
  locations,
} from "@apex/database/schema";
import {
  eq,
  and,
  gt,
  lte,
  ilike,
  or,
  sql,
  type SQL,
} from "drizzle-orm";

// ── Types ──

export interface StockLevelRow {
  id: string;
  productId: string;
  productName: string;
  productSku: string;
  mnemonicSku: string;
  category: string;
  familyName: string | null;
  locationId: string;
  locationName: string;
  locationType: string;
  stockLevel: number;
  reservedLevel: number;
  available: number;
  reorderPoint: number;
  leadTimeDays: number;
  status: "OUT_OF_STOCK" | "LOW_STOCK" | "IN_STOCK";
  updatedAt: string;
}

export interface StockLevelsSummary {
  totalSkus: number;
  inStock: number;
  lowStock: number;
  outOfStock: number;
  belowReorder: number;
  totalReserved: number;
}

export interface StockLevelsPage {
  data: StockLevelRow[];
  summary: StockLevelsSummary;
  nextCursor: string | null;
  hasMore: boolean;
}

export interface StockLevelsQueryParams {
  orgId: string;
  defaultLocationId: string;
  allLocations?: boolean;
  locationId?: string;
  search?: string;
  category?: string;
  stockStatus?: "IN_STOCK" | "LOW_STOCK" | "OUT_OF_STOCK";
  belowReorder?: boolean;
  cursor?: string;
  limit?: number;
}

// ── Computed columns ──

const availableCol = sql<number>`(${inventory.stockLevel} - ${inventory.reservedLevel})`.as(
  "available",
);

// ── Summary query ──

export async function querySummary(params: StockLevelsQueryParams): Promise<StockLevelsSummary> {
  const locationId = params.locationId || params.defaultLocationId;

  const conditions: SQL[] = [eq(products.orgId, params.orgId)];

  if (params.allLocations) {
    // All locations for this org — no location filter
  } else {
    conditions.push(eq(inventory.locationId, locationId));
  }

  if (params.search && params.search.length >= 2) {
    conditions.push(
      or(
        ilike(products.name, `%${params.search}%`),
        eq(products.sku, params.search),
        eq(products.mnemonicSku, params.search.toUpperCase()),
      )!,
    );
  }

  if (params.category) {
    conditions.push(eq(products.category, params.category as any));
  }

  const rows = await db
    .select({
      totalSkus: sql<number>`count(*)::int`,
      inStock: sql<number>`count(*) filter (where ${inventory.stockLevel} > ${inventory.reorderPoint})::int`,
      lowStock: sql<number>`count(*) filter (where ${inventory.stockLevel} > 0 and ${inventory.stockLevel} <= ${inventory.reorderPoint})::int`,
      outOfStock: sql<number>`count(*) filter (where ${inventory.stockLevel} = 0)::int`,
      belowReorder: sql<number>`count(*) filter (where ${inventory.stockLevel} <= ${inventory.reorderPoint})::int`,
      totalReserved: sql<number>`coalesce(sum(${inventory.reservedLevel}), 0)::int`,
    })
    .from(inventory)
    .innerJoin(products, eq(inventory.productId, products.id))
    .where(and(...conditions));

  const row = rows[0]!;
  return {
    totalSkus: row.totalSkus,
    inStock: row.inStock,
    lowStock: row.lowStock,
    outOfStock: row.outOfStock,
    belowReorder: row.belowReorder,
    totalReserved: row.totalReserved,
  };
}

// ── Paginated data query ──

export async function queryStockLevels(
  params: StockLevelsQueryParams,
): Promise<StockLevelsPage> {
  const limit = params.limit ?? 50;
  const locationId = params.locationId || params.defaultLocationId;

  const conditions: SQL[] = [eq(products.orgId, params.orgId)];

  // Location scoping
  if (params.allLocations) {
    // All locations for this org — no location filter
  } else {
    conditions.push(eq(inventory.locationId, locationId));
  }

  // Product search — ILIKE on name, exact on SKU/mnemonic
  if (params.search && params.search.length >= 2) {
    conditions.push(
      or(
        ilike(products.name, `%${params.search}%`),
        eq(products.sku, params.search),
        eq(products.mnemonicSku, params.search.toUpperCase()),
      )!,
    );
  }

  // Category filter
  if (params.category) {
    conditions.push(eq(products.category, params.category as any));
  }

  // Stock status filter
  if (params.stockStatus === "OUT_OF_STOCK") {
    conditions.push(eq(inventory.stockLevel, 0));
  } else if (params.stockStatus === "LOW_STOCK") {
    conditions.push(
      and(
        gt(inventory.stockLevel, 0),
        lte(inventory.stockLevel, inventory.reorderPoint),
      )!,
    );
  } else if (params.stockStatus === "IN_STOCK") {
    conditions.push(gt(inventory.stockLevel, inventory.reorderPoint));
  }

  // Below reorder toggle (includes out-of-stock + low)
  if (params.belowReorder) {
    conditions.push(lte(inventory.stockLevel, inventory.reorderPoint));
  }

  // Cursor pagination (keyset on inventory.id)
  if (params.cursor) {
    conditions.push(gt(inventory.id, params.cursor));
  }

  const rows = await db
    .select({
      id: inventory.id,
      productId: products.id,
      productName: products.name,
      productSku: products.sku,
      mnemonicSku: products.mnemonicSku,
      category: products.category,
      familyName: productFamilies.name,
      locationId: inventory.locationId,
      locationName: locations.name,
      locationType: locations.type,
      stockLevel: inventory.stockLevel,
      reservedLevel: inventory.reservedLevel,
      available: availableCol,
      reorderPoint: inventory.reorderPoint,
      leadTimeDays: inventory.leadTimeDays,
      updatedAt: inventory.updatedAt,
    })
    .from(inventory)
    .innerJoin(products, eq(inventory.productId, products.id))
    .innerJoin(locations, eq(inventory.locationId, locations.id))
    .leftJoin(productFamilies, eq(products.familyId, productFamilies.id))
    .where(and(...conditions))
    .orderBy(inventory.id)
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? data[data.length - 1]!.id : null;

  // Derive status for each row
  const enriched: StockLevelRow[] = data.map((row) => ({
    id: row.id,
    productId: row.productId,
    productName: row.productName,
    productSku: row.productSku,
    mnemonicSku: row.mnemonicSku,
    category: row.category,
    familyName: row.familyName,
    locationId: row.locationId,
    locationName: row.locationName,
    locationType: row.locationType,
    stockLevel: row.stockLevel,
    reservedLevel: row.reservedLevel,
    available: row.available,
    reorderPoint: row.reorderPoint,
    leadTimeDays: row.leadTimeDays,
    status:
      row.stockLevel === 0
        ? "OUT_OF_STOCK"
        : row.stockLevel <= row.reorderPoint
          ? "LOW_STOCK"
          : "IN_STOCK",
    updatedAt: row.updatedAt.toISOString(),
  }));

  // Fetch summary with the same base filters (minus cursor/status/belowReorder)
  const summary = await querySummary({
    orgId: params.orgId,
    defaultLocationId: params.defaultLocationId,
    allLocations: params.allLocations,
    locationId: params.locationId,
    search: params.search,
    category: params.category,
  });

  return { data: enriched, summary, nextCursor, hasMore };
}
