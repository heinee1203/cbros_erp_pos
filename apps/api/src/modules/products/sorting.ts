import { brands, categories, inventory, productSubcategories, products } from "@apex/database/schema";
import { asc, desc, sql } from "drizzle-orm";

// Allowed sort columns mapped to their Drizzle column references.
export const SORT_COLUMNS: Record<string, any> = {
  name: products.name,
  sku: products.sku,
  category: products.category,
  unitPrice: products.unitPrice,
  costPrice: products.costPrice,
  stockLevel: inventory.stockLevel,
  reorderPoint: inventory.reorderPoint,
  categoryName: categories.name,
  subcategoryName: productSubcategories.name,
  brandName: brands.name,
  margin: sql`CASE WHEN CAST(${products.unitPrice} AS numeric) > 0 THEN (CAST(${products.unitPrice} AS numeric) - CAST(${products.costPrice} AS numeric)) / CAST(${products.unitPrice} AS numeric) * 100 ELSE 0 END`,
};

export type SortField = string;

export const VALID_SORT_FIELDS = Object.keys(SORT_COLUMNS);

export function buildStableProductOrderBy(sortBy: SortField, sortDir: "asc" | "desc") {
  const sortCol = SORT_COLUMNS[sortBy] ?? products.name;
  const orderFn = sortDir === "desc" ? desc : asc;
  const orderClauses = [orderFn(sortCol)];

  if (sortBy !== "name") {
    orderClauses.push(asc(products.name));
  }
  orderClauses.push(asc(products.id));

  return orderClauses;
}
