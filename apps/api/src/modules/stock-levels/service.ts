import { db } from "@apex/database";
import {
  inventory,
  products,
  productFamilies,
  categories,
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
  asc,
  desc,
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
  optimalStock: number;
  leadTimeDays: number;
  availableForSale: boolean;
  sellingUnit: string;
  purchaseUnit: string | null;
  conversionFactor: string;
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

export type SortField =
  | "name"
  | "sku"
  | "category"
  | "location"
  | "stockLevel"
  | "reservedLevel"
  | "available"
  | "reorderPoint"
  | "status";

export type SortDir = "asc" | "desc";

export interface StockLevelsQueryParams {
  orgId: string;
  defaultLocationId: string;
  allLocations?: boolean;
  locationId?: string;
  search?: string;
  category?: string;
  stockStatus?: "IN_STOCK" | "LOW_STOCK" | "OUT_OF_STOCK";
  belowReorder?: boolean;
  sortBy?: SortField;
  sortDir?: SortDir;
  cursor?: string;
  limit?: number;
}

// ── Computed columns ──

const availableCol = sql<number>`(${inventory.stockLevel} - ${inventory.reservedLevel})`.as(
  "available",
);

// ── Sort helper ──

const SORT_COLUMN_MAP: Record<SortField, SQL | { getSQL(): SQL }> = {
  name: products.name,
  sku: products.sku,
  category: categories.name,
  location: locations.name,
  stockLevel: inventory.stockLevel,
  reservedLevel: inventory.reservedLevel,
  available: sql`(${inventory.stockLevel} - ${inventory.reservedLevel})`,
  reorderPoint: inventory.reorderPoint,
  status: inventory.stockLevel, // sort by stock level as proxy for status
};

function getSortOrder(sortBy?: SortField, sortDir?: SortDir) {
  const col = SORT_COLUMN_MAP[sortBy ?? "name"] ?? products.name;
  const dir = sortDir === "desc" ? desc : asc;
  return [dir(col)];
}

// ── Summary query ──

export async function querySummary(params: StockLevelsQueryParams): Promise<StockLevelsSummary> {
  const locationId = params.locationId || params.defaultLocationId;

  const conditions: SQL[] = [eq(products.orgId, params.orgId)];

  if (params.allLocations) {
    // All locations for this org — exclude inactive locations
    conditions.push(eq(locations.isActive, true));
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
    conditions.push(eq(categories.name, params.category));
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
    .innerJoin(locations, eq(inventory.locationId, locations.id))
    .leftJoin(categories, eq(products.categoryId, categories.id))
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
    // All locations for this org — exclude inactive locations
    conditions.push(eq(locations.isActive, true));
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
    conditions.push(eq(categories.name, params.category));
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
        category: sql<string>`coalesce(${categories.name}, 'Uncategorized')`.as("category_name"),
        familyName: productFamilies.name,
        locationId: inventory.locationId,
        locationName: locations.name,
        locationType: locations.type,
        stockLevel: inventory.stockLevel,
        reservedLevel: inventory.reservedLevel,
        available: availableCol,
        reorderPoint: inventory.reorderPoint,
        optimalStock: inventory.optimalStock,
        leadTimeDays: inventory.leadTimeDays,
        availableForSale: inventory.availableForSale,
        sellingUnit: products.sellingUnit,
        purchaseUnit: products.purchaseUnit,
        conversionFactor: products.conversionFactor,
        updatedAt: inventory.updatedAt,
      })
      .from(inventory)
      .innerJoin(products, eq(inventory.productId, products.id))
      .innerJoin(locations, eq(inventory.locationId, locations.id))
      .leftJoin(productFamilies, eq(products.familyId, productFamilies.id))
      .leftJoin(categories, eq(products.categoryId, categories.id))
      .where(and(...conditions))
      .orderBy(
        ...getSortOrder(params.sortBy, params.sortDir),
        asc(inventory.id),
      )
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
    optimalStock: row.optimalStock,
    leadTimeDays: row.leadTimeDays,
    availableForSale: row.availableForSale,
    sellingUnit: row.sellingUnit,
    purchaseUnit: row.purchaseUnit,
    conversionFactor: row.conversionFactor,
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

// ── Per-product inventory across all locations ──

export interface ProductLocationRow {
  inventoryId: string | null;
  locationId: string;
  locationName: string;
  locationType: string;
  stockLevel: number;
  reservedLevel: number;
  reorderPoint: number;
  optimalStock: number;
  availableForSale: boolean;
}

export async function getProductLocations(
  orgId: string,
  productId: string,
): Promise<ProductLocationRow[]> {
  // Left join: return ALL org locations, even those with no inventory row
  const rows = await db
    .select({
      inventoryId: inventory.id,
      locationId: locations.id,
      locationName: locations.name,
      locationType: locations.type,
      stockLevel: inventory.stockLevel,
      reservedLevel: inventory.reservedLevel,
      reorderPoint: inventory.reorderPoint,
      optimalStock: inventory.optimalStock,
      availableForSale: inventory.availableForSale,
    })
    .from(locations)
    .leftJoin(
      inventory,
      and(
        eq(inventory.locationId, locations.id),
        eq(inventory.productId, productId),
      ),
    )
    .where(and(eq(locations.orgId, orgId), eq(locations.isActive, true)))
    .orderBy(locations.name);

  return rows.map((r) => ({
    inventoryId: r.inventoryId,
    locationId: r.locationId,
    locationName: r.locationName,
    locationType: r.locationType,
    stockLevel: r.stockLevel ?? 0,
    reservedLevel: r.reservedLevel ?? 0,
    reorderPoint: r.reorderPoint ?? 10,
    optimalStock: r.optimalStock ?? 0,
    availableForSale: r.availableForSale ?? false,
  }));
}

// ── Batch toggle availability ──

export interface AvailabilityUpdate {
  locationId: string;
  availableForSale?: boolean;
  reorderPoint?: number;
  optimalStock?: number;
}

export async function updateAvailability(
  orgId: string,
  productId: string,
  updates: AvailabilityUpdate[],
): Promise<void> {
  await db.transaction(async (tx) => {
    for (const update of updates) {
      const setFields: Record<string, any> = {};
      if (update.availableForSale !== undefined) setFields.availableForSale = update.availableForSale;
      if (update.reorderPoint !== undefined) setFields.reorderPoint = update.reorderPoint;
      if (update.optimalStock !== undefined) setFields.optimalStock = update.optimalStock;

      // Upsert: create inventory row if it doesn't exist
      await tx
        .insert(inventory)
        .values({
          orgId,
          productId,
          locationId: update.locationId,
          stockLevel: 0,
          reservedLevel: 0,
          reorderPoint: update.reorderPoint ?? 10,
          optimalStock: update.optimalStock ?? 0,
          availableForSale: update.availableForSale ?? true,
        })
        .onConflictDoUpdate({
          target: [inventory.productId, inventory.locationId],
          set: Object.keys(setFields).length > 0 ? setFields : { availableForSale: update.availableForSale ?? true },
        });
    }
  });
}
