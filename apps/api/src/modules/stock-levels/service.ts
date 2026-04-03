import { db } from "@apex/database";
import {
  inventory,
  products,
  productFamilies,
  categories,
  locations,
  stockMetrics,
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
  costPrice: number;
  unitPrice: number;
  costValue: number;
  sellValue: number;
  status: "OUT_OF_STOCK" | "LOW_STOCK" | "IN_STOCK";
  lastSoldAt: string | null;
  sold1m: number;
  daysOfStock: number | null;
  pendingOrderCount: number;
  updatedAt: string;
}

export interface StockLevelsSummary {
  totalSkus: number;
  inStock: number;
  lowStock: number;
  outOfStock: number;
  belowReorder: number;
  totalReserved: number;
  totalCostValue: number;
  totalSellValue: number;
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
  | "lastSoldAt"
  | "status";

export type SortDir = "asc" | "desc";

export interface StockLevelsQueryParams {
  orgId: string;
  defaultLocationId: string;
  allLocations?: boolean;
  locationId?: string;
  search?: string;
  category?: string;
  familyId?: string;
  categoryId?: string;
  subcategoryId?: string;
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
  lastSoldAt: sql`${stockMetrics.lastSaleDate}`,
  status: inventory.stockLevel, // sort by stock level as proxy for status
};

function getSortOrder(sortBy?: SortField, sortDir?: SortDir) {
  const field = sortBy ?? "name";
  const col = SORT_COLUMN_MAP[field] ?? products.name;
  // For nullable columns like lastSoldAt, use NULLS LAST for DESC / NULLS FIRST for ASC
  if (field === "lastSoldAt") {
    return sortDir === "desc"
      ? [sql`${col} DESC NULLS LAST`]
      : [sql`${col} ASC NULLS FIRST`];
  }
  const dir = sortDir === "desc" ? desc : asc;
  return [dir(col)];
}

// ── Summary query ──

export async function querySummary(params: StockLevelsQueryParams): Promise<StockLevelsSummary> {
  const locationId = params.locationId || params.defaultLocationId;

  const conditions: SQL[] = [
    eq(products.orgId, params.orgId),
    // Exclude non-inventory items
    sql`(${productFamilies.slug} IS NULL OR ${productFamilies.slug} != 'non-items')`,
    sql`NOT EXISTS (
      SELECT 1 FROM categories exc_cat
      WHERE exc_cat.name IN ('Count', 'Price Add', 'Labor')
        AND (exc_cat.id = ${products.categoryId}
          OR exc_cat.id = (SELECT pp.category_id FROM products pp WHERE pp.id = ${products.parentProductId}))
    )`,
  ];

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
      totalCostValue: sql<number>`coalesce(sum(${inventory.stockLevel} * coalesce(${products.currentCostPrice}, ${products.costPrice}, 0)), 0)::numeric(14,2)`,
      totalSellValue: sql<number>`coalesce(sum(${inventory.stockLevel} * coalesce(${products.unitPrice}, 0)), 0)::numeric(14,2)`,
    })
    .from(inventory)
    .innerJoin(products, eq(inventory.productId, products.id))
    .innerJoin(locations, eq(inventory.locationId, locations.id))
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .leftJoin(productFamilies, eq(products.familyId, productFamilies.id))
    .where(and(...conditions));

  const row = rows[0]!;
  return {
    totalSkus: row.totalSkus,
    inStock: row.inStock,
    lowStock: row.lowStock,
    outOfStock: row.outOfStock,
    belowReorder: row.belowReorder,
    totalReserved: row.totalReserved,
    totalCostValue: parseFloat(String(row.totalCostValue)) || 0,
    totalSellValue: parseFloat(String(row.totalSellValue)) || 0,
  };
}

// ── Paginated data query ──

export async function queryStockLevels(
  params: StockLevelsQueryParams,
): Promise<StockLevelsPage> {
  const limit = params.limit ?? 50;
  const locationId = params.locationId || params.defaultLocationId;

  const conditions: SQL[] = [
    eq(products.orgId, params.orgId),
    // Exclude non-inventory items
    sql`(${productFamilies.slug} IS NULL OR ${productFamilies.slug} != 'non-items')`,
    sql`NOT EXISTS (
      SELECT 1 FROM categories exc_cat
      WHERE exc_cat.name IN ('Count', 'Price Add', 'Labor')
        AND (exc_cat.id = ${products.categoryId}
          OR exc_cat.id = (SELECT pp.category_id FROM products pp WHERE pp.id = ${products.parentProductId}))
    )`,
  ];

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
        parentProductId: products.parentProductId,
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
        costPrice: sql<number>`coalesce(${products.currentCostPrice}, ${products.costPrice}, 0)::numeric(12,2)`.as("cost_price"),
        unitPrice: sql<number>`coalesce(${products.unitPrice}, 0)::numeric(12,2)`.as("unit_price"),
        updatedAt: inventory.updatedAt,
        lastSoldAt: sql<string | null>`${stockMetrics.lastSaleDate}`.as("last_sold_at"),
        sold1m: sql<number>`coalesce(${stockMetrics.sold1m}, 0)::int`.as("sold_1m"),
        daysOfStock: sql<string | null>`${stockMetrics.daysOfStock}`.as("days_of_stock"),
        pendingOrderCount: sql<number>`(
          SELECT count(*)::int FROM po_lines pol
          JOIN purchase_orders po ON pol.purchase_order_id = po.id
          WHERE pol.product_id = ${products.id}
            AND po.org_id = ${products.orgId}
            AND po.status IN ('DRAFT', 'SUBMITTED', 'PARTIALLY_RECEIVED')
        )`.as("pending_order_count"),
      })
      .from(inventory)
      .innerJoin(products, eq(inventory.productId, products.id))
      .innerJoin(locations, eq(inventory.locationId, locations.id))
      .leftJoin(productFamilies, eq(products.familyId, productFamilies.id))
      .leftJoin(categories, eq(products.categoryId, categories.id))
      .leftJoin(stockMetrics, and(eq(stockMetrics.productId, products.id), eq(stockMetrics.orgId, products.orgId)))
      .where(and(...conditions))
      .orderBy(
        ...getSortOrder(params.sortBy, params.sortDir),
        asc(inventory.id),
      )
      .limit(limit + 1);

  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? data[data.length - 1]!.id : null;

  // Batch-fetch parent names for variants (location view)
  const locParentIds = [...new Set(data.filter(r => r.parentProductId).map(r => r.parentProductId!))];
  const locParentNameMap = new Map<string, string>();
  if (locParentIds.length > 0) {
    const parentRows = await db
      .select({ id: products.id, name: products.name })
      .from(products)
      .where(sql`${products.id} IN (${sql.join(locParentIds.map(id => sql`${id}`), sql`, `)})`);
    for (const p of parentRows) {
      locParentNameMap.set(p.id, p.name);
    }
  }

  // Derive status for each row
  const enriched: StockLevelRow[] = data.map((row) => {
    const displayName = row.parentProductId && locParentNameMap.has(row.parentProductId)
      ? `${locParentNameMap.get(row.parentProductId)} (${row.productName})`
      : row.productName;
    return {
    id: row.id,
    productId: row.productId,
    productName: displayName,
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
    costPrice: parseFloat(String(row.costPrice)) || 0,
    unitPrice: parseFloat(String(row.unitPrice)) || 0,
    costValue: parseFloat(String(row.costPrice)) * row.stockLevel || 0,
    sellValue: parseFloat(String(row.unitPrice)) * row.stockLevel || 0,
    status:
      row.stockLevel === 0
        ? "OUT_OF_STOCK"
        : row.stockLevel <= row.reorderPoint
          ? "LOW_STOCK"
          : "IN_STOCK",
    lastSoldAt: row.lastSoldAt ?? null,
    sold1m: row.sold1m,
    daysOfStock: row.daysOfStock ? parseFloat(row.daysOfStock) : null,
    pendingOrderCount: row.pendingOrderCount,
    updatedAt: row.updatedAt.toISOString(),
  };});

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

// ══════════════════════════════════════════════════════
// PRODUCT-AGGREGATED VIEW
// ══════════════════════════════════════════════════════

export interface ProductStockRow {
  productId: string;
  productName: string;
  productSku: string;
  category: string;
  familyName: string | null;
  totalStock: number;
  totalReserved: number;
  totalAvailable: number;
  stockedLocations: number;
  availableLocations: number;
  reorderPoint: number;
  optimalStock: number;
  sellingUnit: string;
  purchaseUnit: string | null;
  conversionFactor: string;
  costPrice: number;
  unitPrice: number;
  totalCostValue: number;
  totalSellValue: number;
  status: "OUT_OF_STOCK" | "LOW_STOCK" | "IN_STOCK";
  lastSoldAt: string | null;
  sold1m: number;
  daysOfStock: number | null;
  pendingOrderCount: number;
}

export interface ProductStockSummary {
  totalProducts: number;
  inStock: number;
  lowStock: number;
  outOfStock: number;
  belowReorder: number;
  totalCostValue: number;
  totalSellValue: number;
}

export async function queryProductStockLevels(
  params: StockLevelsQueryParams,
): Promise<{ data: ProductStockRow[]; summary: ProductStockSummary; nextCursor: string | null; hasMore: boolean }> {
  const limit = params.limit ?? 50;
  const conditions: SQL[] = [
    eq(products.orgId, params.orgId),
    eq(products.isParent, false),
    eq(locations.isActive, true),
    eq(inventory.availableForSale, true),
    // Exclude non-inventory items
    sql`(${productFamilies.slug} IS NULL OR ${productFamilies.slug} != 'non-items')`,
    sql`NOT EXISTS (
      SELECT 1 FROM categories exc_cat
      WHERE exc_cat.name IN ('Count', 'Price Add', 'Labor')
        AND (exc_cat.id = ${products.categoryId}
          OR exc_cat.id = (SELECT pp.category_id FROM products pp WHERE pp.id = ${products.parentProductId}))
    )`,
  ];

  if (params.search && params.search.length >= 2) {
    const searchTerm = params.search;
    conditions.push(
      or(
        ilike(products.name, `%${searchTerm}%`),
        eq(products.sku, searchTerm),
        eq(products.mnemonicSku, searchTerm.toUpperCase()),
        // Also search parent name for variant products
        sql`EXISTS (SELECT 1 FROM products pp WHERE pp.id = ${products.parentProductId} AND pp.name ILIKE ${'%' + searchTerm + '%'})`,
      )!,
    );
  }

  if (params.category) {
    conditions.push(eq(categories.name, params.category));
  }
  if (params.familyId) {
    conditions.push(eq(products.familyId, params.familyId));
  }
  if (params.categoryId) {
    conditions.push(eq(products.categoryId, params.categoryId));
  }
  if (params.subcategoryId) {
    conditions.push(eq(products.subcategoryId, params.subcategoryId));
  }

  // Cursor on product id
  if (params.cursor) {
    conditions.push(gt(products.id, params.cursor));
  }

  // Aggregate query — one row per product
  const rows = await db
    .select({
      productId: products.id,
      productName: products.name,
      parentProductId: products.parentProductId,
      productSku: products.sku,
      category: sql<string>`coalesce(${categories.name}, 'Uncategorized')`.as("category_name"),
      familyName: productFamilies.name,
      totalStock: sql<number>`coalesce(sum(${inventory.stockLevel}), 0)::int`.as("total_stock"),
      totalReserved: sql<number>`coalesce(sum(${inventory.reservedLevel}), 0)::int`.as("total_reserved"),
      totalAvailable: sql<number>`coalesce(sum(${inventory.stockLevel} - ${inventory.reservedLevel}), 0)::int`.as("total_available"),
      stockedLocations: sql<number>`count(distinct case when ${inventory.stockLevel} > 0 then ${inventory.locationId} end)::int`.as("stocked_locations"),
      availableLocations: sql<number>`count(distinct ${inventory.locationId})::int`.as("available_locations"),
      reorderPoint: sql<number>`coalesce(max(${inventory.reorderPoint}), 0)::int`.as("max_reorder_point"),
      optimalStock: sql<number>`coalesce(max(${inventory.optimalStock}), 0)::int`.as("max_optimal_stock"),
      sellingUnit: products.sellingUnit,
      purchaseUnit: products.purchaseUnit,
      conversionFactor: products.conversionFactor,
      costPrice: sql<number>`coalesce(${products.currentCostPrice}, ${products.costPrice}, 0)::numeric(12,2)`.as("cost_price_val"),
      unitPrice: sql<number>`coalesce(${products.unitPrice}, 0)::numeric(12,2)`.as("unit_price_val"),
      totalCostValue: sql<number>`coalesce(sum(${inventory.stockLevel}) * coalesce(${products.currentCostPrice}, ${products.costPrice}, 0), 0)::numeric(14,2)`.as("total_cost_value"),
      totalSellValue: sql<number>`coalesce(sum(${inventory.stockLevel}) * coalesce(${products.unitPrice}, 0), 0)::numeric(14,2)`.as("total_sell_value"),
      lastSoldAt: sql<string | null>`${stockMetrics.lastSaleDate}`.as("last_sold_at"),
      sold1m: sql<number>`coalesce(${stockMetrics.sold1m}, 0)::int`.as("sold_1m"),
      daysOfStock: sql<string | null>`${stockMetrics.daysOfStock}`.as("days_of_stock"),
      pendingOrderCount: sql<number>`(
        SELECT count(*)::int FROM po_lines pol
        JOIN purchase_orders po ON pol.purchase_order_id = po.id
        WHERE pol.product_id = ${products.id}
          AND po.org_id = ${products.orgId}
          AND po.status IN ('DRAFT', 'SUBMITTED', 'PARTIALLY_RECEIVED')
      )`.as("pending_order_count"),
    })
    .from(products)
    .innerJoin(inventory, eq(inventory.productId, products.id))
    .innerJoin(locations, eq(inventory.locationId, locations.id))
    .leftJoin(productFamilies, eq(products.familyId, productFamilies.id))
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .leftJoin(stockMetrics, and(eq(stockMetrics.productId, products.id), eq(stockMetrics.orgId, products.orgId)))
    .where(and(...conditions))
    .groupBy(
      products.id,
      products.name,
      products.parentProductId,
      products.sku,
      categories.name,
      productFamilies.name,
      products.sellingUnit,
      products.purchaseUnit,
      products.conversionFactor,
      products.costPrice,
      products.currentCostPrice,
      products.unitPrice,
      stockMetrics.lastSaleDate,
      stockMetrics.sold1m,
      stockMetrics.daysOfStock,
    )
    .orderBy(
      ...(params.sortBy
        ? [...getSortOrder(params.sortBy, params.sortDir), asc(products.id)]
        : [
            // Default: status sort (OUT_OF_STOCK first, then LOW_STOCK, then IN_STOCK)
            sql`case
              when coalesce(sum(${inventory.stockLevel}), 0) = 0 then 0
              when coalesce(sum(${inventory.stockLevel}), 0) <= max(${inventory.reorderPoint}) then 1
              else 2
            end asc`,
            asc(products.name),
            asc(products.id),
          ]),
    )
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? data[data.length - 1]!.productId : null;

  // Apply status filter post-aggregation if needed
  // Batch-fetch parent names for variants
  const parentIds = [...new Set(data.filter(r => r.parentProductId).map(r => r.parentProductId!))];
  const parentNameMap = new Map<string, string>();
  if (parentIds.length > 0) {
    const parentRows = await db
      .select({ id: products.id, name: products.name })
      .from(products)
      .where(sql`${products.id} IN (${sql.join(parentIds.map(id => sql`${id}`), sql`, `)})`);
    for (const p of parentRows) {
      parentNameMap.set(p.id, p.name);
    }
  }

  let enriched: ProductStockRow[] = data.map((row) => {
    const totalStock = row.totalStock;
    const reorderPoint = row.reorderPoint;
    let status: "OUT_OF_STOCK" | "LOW_STOCK" | "IN_STOCK";
    if (totalStock === 0) {
      status = "OUT_OF_STOCK";
    } else if (totalStock <= reorderPoint) {
      status = "LOW_STOCK";
    } else {
      status = "IN_STOCK";
    }
    // Build display name: "Parent (Variant)" for child products
    const displayName = row.parentProductId && parentNameMap.has(row.parentProductId)
      ? `${parentNameMap.get(row.parentProductId)} (${row.productName})`
      : row.productName;
    return {
      productId: row.productId,
      productName: displayName,
      productSku: row.productSku,
      category: row.category,
      familyName: row.familyName,
      totalStock,
      totalReserved: row.totalReserved,
      totalAvailable: row.totalAvailable,
      stockedLocations: row.stockedLocations,
      availableLocations: row.availableLocations,
      reorderPoint,
      optimalStock: row.optimalStock,
      sellingUnit: row.sellingUnit,
      purchaseUnit: row.purchaseUnit,
      conversionFactor: row.conversionFactor,
      costPrice: parseFloat(String(row.costPrice)) || 0,
      unitPrice: parseFloat(String(row.unitPrice)) || 0,
      totalCostValue: parseFloat(String(row.totalCostValue)) || 0,
      totalSellValue: parseFloat(String(row.totalSellValue)) || 0,
      status,
      lastSoldAt: row.lastSoldAt ?? null,
      sold1m: row.sold1m,
      daysOfStock: row.daysOfStock ? parseFloat(row.daysOfStock) : null,
      pendingOrderCount: row.pendingOrderCount,
    };
  });

  // Apply status filter if requested
  if (params.stockStatus) {
    enriched = enriched.filter((r) => r.status === params.stockStatus);
  }
  if (params.belowReorder) {
    enriched = enriched.filter((r) => r.totalStock <= r.reorderPoint);
  }

  // Summary — product-based counts using raw SQL
  const summaryRows = await db.execute(sql`
    SELECT
      count(*)::int AS total_products,
      count(*) FILTER (WHERE total_stock > max_rp)::int AS in_stock,
      count(*) FILTER (WHERE total_stock > 0 AND total_stock <= max_rp)::int AS low_stock,
      count(*) FILTER (WHERE total_stock = 0)::int AS out_of_stock,
      count(*) FILTER (WHERE total_stock <= max_rp)::int AS below_reorder,
      COALESCE(SUM(total_cost_val), 0)::numeric(14,2) AS total_cost_value,
      COALESCE(SUM(total_sell_val), 0)::numeric(14,2) AS total_sell_value
    FROM (
      SELECT
        p.id,
        COALESCE(SUM(i.stock_level), 0)::int AS total_stock,
        COALESCE(MAX(i.reorder_point), 0)::int AS max_rp,
        COALESCE(SUM(i.stock_level) * COALESCE(p.current_cost_price, p.cost_price, 0), 0) AS total_cost_val,
        COALESCE(SUM(i.stock_level) * COALESCE(p.unit_price, 0), 0) AS total_sell_val
      FROM products p
      INNER JOIN inventory i ON i.product_id = p.id AND i.available_for_sale = true
      INNER JOIN locations loc ON i.location_id = loc.id AND loc.is_active = true
      LEFT JOIN product_families fam ON p.family_id = fam.id
      LEFT JOIN categories cat ON p.category_id = cat.id
      WHERE p.org_id = ${params.orgId}
        AND p.is_parent = false
        AND (fam.slug IS NULL OR fam.slug != 'non-items')
        AND NOT EXISTS (
          SELECT 1 FROM products pp2
          LEFT JOIN product_families pf2 ON pp2.family_id = pf2.id
          WHERE pp2.id = p.parent_product_id AND pf2.slug = 'non-items'
        )
        AND NOT EXISTS (
          SELECT 1 FROM categories exc_cat
          WHERE exc_cat.name IN ('Count', 'Price Add', 'Labor')
            AND (exc_cat.id = p.category_id
              OR exc_cat.id = (SELECT pp.category_id FROM products pp WHERE pp.id = p.parent_product_id))
        )
        ${params.search && params.search.length >= 2
          ? sql`AND (p.name ILIKE ${'%' + params.search + '%'} OR p.sku = ${params.search} OR p.mnemonic_sku = ${params.search.toUpperCase()})`
          : sql``}
        ${params.category
          ? sql`AND EXISTS (SELECT 1 FROM categories c2 WHERE c2.id = p.category_id AND c2.name = ${params.category})`
          : sql``}
        ${params.familyId ? sql`AND p.family_id = ${params.familyId}` : sql``}
        ${params.categoryId ? sql`AND p.category_id = ${params.categoryId}` : sql``}
        ${params.subcategoryId ? sql`AND p.subcategory_id = ${params.subcategoryId}` : sql``}
      GROUP BY p.id
    ) sub
  `);
  const sr = summaryRows[0] as any;
  const summary: ProductStockSummary = {
    totalProducts: sr?.total_products ?? 0,
    inStock: sr?.in_stock ?? 0,
    lowStock: sr?.low_stock ?? 0,
    outOfStock: sr?.out_of_stock ?? 0,
    belowReorder: sr?.below_reorder ?? 0,
    totalCostValue: parseFloat(sr?.total_cost_value) || 0,
    totalSellValue: parseFloat(sr?.total_sell_value) || 0,
  };

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
  // Check if this is a parent product (has children)
  const [parentCheck] = await db
    .select({ isParent: products.isParent })
    .from(products)
    .where(eq(products.id, productId))
    .limit(1);

  if (parentCheck?.isParent) {
    // Parent product — aggregate inventory from ALL child variants
    const rows = await db.execute(sql`
      SELECT
        loc.id AS location_id,
        loc.name AS location_name,
        loc.type AS location_type,
        COALESCE(SUM(i.stock_level), 0)::int AS stock_level,
        COALESCE(SUM(i.reserved_level), 0)::int AS reserved_level,
        COALESCE(MAX(i.reorder_point), 10)::int AS reorder_point,
        COALESCE(MAX(i.optimal_stock), 0)::int AS optimal_stock,
        BOOL_OR(COALESCE(i.available_for_sale, false)) AS available_for_sale
      FROM locations loc
      LEFT JOIN inventory i ON i.location_id = loc.id
        AND i.product_id IN (SELECT id FROM products WHERE parent_product_id = ${productId})
      WHERE loc.org_id = ${orgId} AND loc.is_active = true
      GROUP BY loc.id, loc.name, loc.type
      ORDER BY loc.name
    `);

    return (rows as any[]).map((r: any) => ({
      inventoryId: null, // Aggregated — no single inventory row
      locationId: r.location_id,
      locationName: r.location_name,
      locationType: r.location_type,
      stockLevel: r.stock_level,
      reservedLevel: r.reserved_level,
      reorderPoint: r.reorder_point,
      optimalStock: r.optimal_stock,
      availableForSale: r.available_for_sale ?? false,
    }));
  }

  // Non-parent product — direct inventory lookup
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
  // Check if this is a parent product — if so, apply to all children
  const [parentCheck] = await db
    .select({ isParent: products.isParent })
    .from(products)
    .where(eq(products.id, productId))
    .limit(1);

  const targetProductIds: string[] = [];
  if (parentCheck?.isParent) {
    // Get all child variant IDs
    const children = await db
      .select({ id: products.id })
      .from(products)
      .where(and(eq(products.parentProductId, productId), eq(products.orgId, orgId)));
    targetProductIds.push(...children.map((c) => c.id));
  } else {
    targetProductIds.push(productId);
  }

  await db.transaction(async (tx) => {
    for (const targetId of targetProductIds) {
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
            productId: targetId,
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
    }
  });
}
