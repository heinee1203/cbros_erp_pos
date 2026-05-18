import {
  categories,
  inventory,
  locations,
  productOptionTypes,
  productOptionValues,
  productVariantOptions,
  products,
} from "@apex/database/schema";
import { and, eq, sql } from "drizzle-orm";
import type { LocationMapping } from "./types";

export interface OrgLocationRecord {
  id: string;
  name: string;
}

export interface SavedImportLocationMappingRow {
  csv_location_name: string;
  apex_location_id: string;
}

export interface ExistingImportProduct {
  id: string;
  sku: string;
  name: string | null;
  unitPrice: string | null;
  costPrice: string | null;
  barcode: string | null;
  categoryId: string | null;
  categoryName: string | null;
  description: string | null;
}

export interface ExistingInventorySnapshotRow {
  productId: string;
  locationId: string;
  stockLevel: number;
}

export interface ExistingVariantOptionSnapshotRow {
  productId: string;
  typeName: string;
  value: string;
}

export interface ItemPreviewContext {
  locationMapping: LocationMapping[];
  skuMap: Map<string, ExistingImportProduct>;
  existingStockMap: Map<string, Map<string, number>>;
  existingVariantOptionMap: Map<string, Array<{ typeName: string; value: string }>>;
}

async function getDatabase() {
  const { db } = await import("@apex/database");
  return db;
}

export function buildSavedImportLocationMappings(
  rows: Iterable<SavedImportLocationMappingRow>,
): Map<string, string> {
  const savedMappings = new Map<string, string>();

  for (const row of rows) {
    savedMappings.set(row.csv_location_name.toLowerCase(), row.apex_location_id);
  }

  return savedMappings;
}

export function buildItemImportLocationMapping(
  csvLocationNames: Iterable<string>,
  orgLocations: OrgLocationRecord[],
  savedMappings: Map<string, string>,
): LocationMapping[] {
  const locationMapping: LocationMapping[] = [];

  for (const csvName of csvLocationNames) {
    const match = orgLocations.find(
      (location) => location.name.trim().toLowerCase() === csvName.trim().toLowerCase(),
    );
    const savedId = savedMappings.get(csvName.trim().toLowerCase());
    const savedLoc = savedId ? orgLocations.find((location) => location.id === savedId) : null;

    locationMapping.push({
      csvName,
      apexLocationId: match?.id ?? savedLoc?.id ?? null,
      apexLocationName: match?.name ?? savedLoc?.name ?? null,
      autoMatched: Boolean(match || savedLoc),
    });
  }

  return locationMapping;
}

export function buildExistingProductSkuMap(
  existingProducts: ExistingImportProduct[],
): Map<string, ExistingImportProduct> {
  const skuMap = new Map<string, ExistingImportProduct>();

  for (const product of existingProducts) {
    skuMap.set(product.sku.toLowerCase(), product);
  }

  return skuMap;
}

export function buildExistingStockMap(
  existingInventoryRows: ExistingInventorySnapshotRow[],
): Map<string, Map<string, number>> {
  const existingStockMap = new Map<string, Map<string, number>>();

  for (const row of existingInventoryRows) {
    let locationsForProduct = existingStockMap.get(row.productId);
    if (!locationsForProduct) {
      locationsForProduct = new Map();
      existingStockMap.set(row.productId, locationsForProduct);
    }
    locationsForProduct.set(row.locationId, row.stockLevel);
  }

  return existingStockMap;
}

export function buildExistingVariantOptionMap(
  existingVariantOptionRows: ExistingVariantOptionSnapshotRow[],
): Map<string, Array<{ typeName: string; value: string }>> {
  const existingVariantOptionMap = new Map<string, Array<{ typeName: string; value: string }>>();

  for (const row of existingVariantOptionRows) {
    let options = existingVariantOptionMap.get(row.productId);
    if (!options) {
      options = [];
      existingVariantOptionMap.set(row.productId, options);
    }
    options.push({ typeName: row.typeName, value: row.value });
  }

  return existingVariantOptionMap;
}

export async function loadItemPreviewContext(
  orgId: string,
  csvLocationNames: Iterable<string>,
): Promise<ItemPreviewContext> {
  const db = await getDatabase();

  const [
    orgLocations,
    savedMappingRows,
    existingProducts,
    existingInventoryRows,
    existingVariantOptionRows,
  ] = await Promise.all([
    db
      .select({ id: locations.id, name: locations.name })
      .from(locations)
      .where(and(eq(locations.orgId, orgId), eq(locations.isActive, true))),
    db.execute(
      sql`SELECT csv_location_name, apex_location_id FROM import_location_mappings WHERE org_id = ${orgId}`,
    ),
    db
      .select({
        id: products.id,
        sku: products.sku,
        name: products.name,
        unitPrice: products.unitPrice,
        costPrice: products.costPrice,
        barcode: products.barcode,
        categoryId: products.categoryId,
        categoryName: categories.name,
        description: products.description,
      })
      .from(products)
      .leftJoin(categories, eq(products.categoryId, categories.id))
      .where(eq(products.orgId, orgId)),
    db
      .select({
        productId: inventory.productId,
        locationId: inventory.locationId,
        stockLevel: inventory.stockLevel,
      })
      .from(inventory)
      .innerJoin(products, eq(products.id, inventory.productId))
      .where(eq(products.orgId, orgId)),
    db
      .select({
        productId: productVariantOptions.productId,
        typeName: productOptionTypes.name,
        value: productOptionValues.value,
      })
      .from(productVariantOptions)
      .innerJoin(productOptionValues, eq(productVariantOptions.optionValueId, productOptionValues.id))
      .innerJoin(productOptionTypes, eq(productOptionValues.optionTypeId, productOptionTypes.id))
      .innerJoin(products, eq(products.id, productVariantOptions.productId))
      .where(eq(products.orgId, orgId)),
  ]);

  const savedMappings = buildSavedImportLocationMappings(
    savedMappingRows as Iterable<SavedImportLocationMappingRow>,
  );

  return {
    locationMapping: buildItemImportLocationMapping(csvLocationNames, orgLocations, savedMappings),
    skuMap: buildExistingProductSkuMap(existingProducts),
    existingStockMap: buildExistingStockMap(existingInventoryRows),
    existingVariantOptionMap: buildExistingVariantOptionMap(existingVariantOptionRows),
  };
}
