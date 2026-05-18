import { createHash } from "crypto";
import { db } from "@apex/database";
import {
  apiKeys,
  brands,
  categories,
  inventory,
  locations,
  productFamilies,
  products,
  productSubcategories,
} from "@apex/database/schema";
import {
  and,
  asc,
  desc,
  eq,
  ilike,
  inArray,
  or,
  sql,
  type SQL,
} from "drizzle-orm";

export type CatalogSearchQuery = Record<string, string | undefined>;

function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

function buildCatalogProductSelect() {
  return {
    id: products.id,
    sku: products.sku,
    name: products.name,
    parentName: sql<string | null>`(SELECT pp.name FROM products pp WHERE pp.id = ${products.parentProductId})`.as(
      "parent_name",
    ),
    brandName: brands.name,
    familyName: productFamilies.name,
    categoryName: categories.name,
    subcategoryName: productSubcategories.name,
    oemNumber: products.oemNumber,
    unitPrice: products.unitPrice,
    costPrice: products.costPrice,
  };
}

function mapCatalogProduct(
  product: {
    id: string;
    sku: string;
    name: string;
    parentName: string | null;
    brandName: string | null;
    familyName: string | null;
    categoryName: string | null;
    subcategoryName: string | null;
    oemNumber: string | null;
    unitPrice: string | null;
    costPrice: string | null;
  },
  stock: { total: number; byLocation: Record<string, number> },
) {
  const displayName = product.parentName
    ? `${product.parentName} (${product.name})`
    : product.name;

  return {
    id: product.id,
    sku: product.sku,
    name: displayName,
    brand: product.brandName,
    family: product.familyName,
    category: product.categoryName,
    subcategory: product.subcategoryName,
    oem_number: product.oemNumber,
    sell_price: parseFloat(product.unitPrice || "0"),
    cost_price: parseFloat(product.costPrice || "0"),
    stock: {
      total: stock.total,
      by_location: stock.byLocation,
    },
  };
}

function buildSearchConditions(orgId: string, query: CatalogSearchQuery) {
  const searchTerm = query.q || "";
  const conditions: SQL[] = [
    eq(products.orgId, orgId),
    eq(products.isActive, true),
  ];

  if (query.categoryId) {
    conditions.push(eq(products.categoryId, query.categoryId));
  }
  if (query.familyId) {
    conditions.push(eq(products.familyId, query.familyId));
  }
  if (query.brandId) {
    conditions.push(eq(products.brandId, query.brandId));
  }

  conditions.push(
    or(
      ilike(products.name, `%${searchTerm}%`),
      ilike(products.sku, `%${searchTerm}%`),
      ilike(products.oemNumber, `%${searchTerm}%`),
      eq(products.barcode, searchTerm),
    )!,
  );

  return conditions;
}

async function getStockMapForProducts(orgId: string, productIds: string[]) {
  const stockMap = new Map<
    string,
    { total: number; byLocation: Record<string, number> }
  >();

  if (productIds.length === 0) {
    return stockMap;
  }

  const stockRows = await db
    .select({
      productId: inventory.productId,
      locationName: locations.name,
      stockLevel: inventory.stockLevel,
    })
    .from(inventory)
    .innerJoin(
      locations,
      and(eq(inventory.locationId, locations.id), eq(locations.isActive, true)),
    )
    .where(
      and(eq(inventory.orgId, orgId), inArray(inventory.productId, productIds)),
    );

  for (const row of stockRows) {
    if (!stockMap.has(row.productId)) {
      stockMap.set(row.productId, { total: 0, byLocation: {} });
    }
    const entry = stockMap.get(row.productId)!;
    entry.total += row.stockLevel;
    entry.byLocation[row.locationName] = row.stockLevel;
  }

  return stockMap;
}

async function getStockRowsForProduct(orgId: string, productId: string) {
  return db
    .select({
      locationName: locations.name,
      stockLevel: inventory.stockLevel,
    })
    .from(inventory)
    .innerJoin(
      locations,
      and(eq(inventory.locationId, locations.id), eq(locations.isActive, true)),
    )
    .where(and(eq(inventory.productId, productId), eq(inventory.orgId, orgId)));
}

export async function findCatalogApiKey(apiKey: string) {
  const hash = hashKey(apiKey);
  const [keyRow] = await db
    .select({
      id: apiKeys.id,
      orgId: apiKeys.orgId,
      isActive: apiKeys.isActive,
    })
    .from(apiKeys)
    .where(eq(apiKeys.keyHash, hash))
    .limit(1);

  return keyRow ?? null;
}

export function markCatalogApiKeyUsed(apiKeyId: string) {
  db.update(apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKeys.id, apiKeyId))
    .execute()
    .catch(() => {});
}

export async function searchCatalog(orgId: string, query: CatalogSearchQuery) {
  const searchTerm = query.q || "";
  const limit = Math.min(parseInt(query.limit || "20"), 50);
  const offset = parseInt(query.offset || "0");
  const conditions = buildSearchConditions(orgId, query);

  const rows = await db
    .select(buildCatalogProductSelect())
    .from(products)
    .leftJoin(brands, eq(products.brandId, brands.id))
    .leftJoin(productFamilies, eq(products.familyId, productFamilies.id))
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .leftJoin(
      productSubcategories,
      eq(products.subcategoryId, productSubcategories.id),
    )
    .where(and(...conditions))
    .orderBy(
      desc(
        sql`CASE WHEN UPPER(${products.sku}) = UPPER(${searchTerm}) THEN 1 ELSE 0 END`,
      ),
      asc(products.name),
    )
    .limit(limit + 1)
    .offset(offset);

  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  const stockMap = await getStockMapForProducts(
    orgId,
    data.map((product) => product.id),
  );

  let results = data.map((product) =>
    mapCatalogProduct(
      product,
      stockMap.get(product.id) ?? { total: 0, byLocation: {} },
    ),
  );

  if (query.inStock === "true") {
    results = results.filter((result) => result.stock.total > 0);
  }

  const [countRow] = await db
    .select({ count: sql<number>`COUNT(*)::integer` })
    .from(products)
    .leftJoin(brands, eq(products.brandId, brands.id))
    .where(and(...conditions));

  return {
    results,
    total: (countRow as any).count,
    has_more: hasMore,
  };
}

export async function getCatalogItem(orgId: string, id: string) {
  const [product] = await db
    .select(buildCatalogProductSelect())
    .from(products)
    .leftJoin(brands, eq(products.brandId, brands.id))
    .leftJoin(productFamilies, eq(products.familyId, productFamilies.id))
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .leftJoin(
      productSubcategories,
      eq(products.subcategoryId, productSubcategories.id),
    )
    .where(and(eq(products.id, id), eq(products.orgId, orgId)))
    .limit(1);

  if (!product) {
    return null;
  }

  const stockRows = await getStockRowsForProduct(orgId, id);
  const stock = { total: 0, byLocation: {} as Record<string, number> };
  for (const row of stockRows) {
    stock.total += row.stockLevel;
    stock.byLocation[row.locationName] = row.stockLevel;
  }

  return mapCatalogProduct(product, stock);
}

export async function getCatalogItemStock(orgId: string, id: string) {
  const [product] = await db
    .select({ id: products.id, sku: products.sku })
    .from(products)
    .where(and(eq(products.id, id), eq(products.orgId, orgId)))
    .limit(1);

  if (!product) {
    return null;
  }

  const stockRows = await getStockRowsForProduct(orgId, id);
  const byLocation = stockRows.map((row) => ({
    location: row.locationName,
    quantity: row.stockLevel,
  }));

  return {
    product_id: id,
    sku: product.sku,
    total: byLocation.reduce((sum, row) => sum + row.quantity, 0),
    by_location: byLocation,
  };
}
