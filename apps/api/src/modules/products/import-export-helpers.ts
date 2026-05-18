export type ProductExportQuery = {
  search: string;
  familyId: string;
  categoryId: string;
  subcategoryId: string;
  brandId: string;
  sortBy: string;
  sortDir: string;
  includeCost: boolean;
  includeStock: boolean;
  includeNonItems: boolean;
  activeFilter?: string;
};

export type ProductExportLocation = {
  id: string;
  name: string;
};

export type ProductExportInventory = {
  productId: string;
  locationId: string;
  stockLevel: number;
  reorderPoint: number;
  optimalStock: number;
  availableForSale: boolean;
};

export type ProductExportOption = {
  typeName: string;
  value: string;
};

type ProductExportOptionRow = ProductExportOption & {
  variantProductId: string;
};

type ProductExportProductRow = {
  id: string;
  name: string;
  isParent: boolean | null;
  parentProductId: string | null;
  costPrice?: unknown;
  [key: string]: unknown;
};

export function parseProductExportQuery(
  query: Record<string, string | undefined>,
): ProductExportQuery {
  return {
    search: query.search || "",
    familyId: query.familyId || "",
    // Keep export aligned to canonical categoryId; legacy subCategoryId is not accepted.
    categoryId: query.categoryId || "",
    subcategoryId: query.subcategoryId || "",
    brandId: query.brandId || "",
    sortBy: query.sortBy || "name",
    sortDir: query.sortDir || "asc",
    includeCost: query.includeCost === "true",
    includeStock: query.includeStock === "true",
    includeNonItems: query.includeNonItems === "true",
    activeFilter: query.active,
  };
}

export function buildProductExportHandle(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50);
}

export function buildProductExportOptionMap(optionRows: ProductExportOptionRow[]) {
  const optionMap = new Map<string, ProductExportOption[]>();

  for (const row of optionRows) {
    if (!optionMap.has(row.variantProductId)) {
      optionMap.set(row.variantProductId, []);
    }
    optionMap.get(row.variantProductId)!.push({
      typeName: row.typeName,
      value: row.value,
    });
  }

  return optionMap;
}

export function buildProductExportInventoryMap(inventoryRows: ProductExportInventory[]) {
  const inventoryMap = new Map<string, Map<string, ProductExportInventory>>();

  for (const row of inventoryRows) {
    if (!inventoryMap.has(row.productId)) {
      inventoryMap.set(row.productId, new Map());
    }
    inventoryMap.get(row.productId)!.set(row.locationId, row);
  }

  return inventoryMap;
}

export function buildProductExportRows({
  productRows,
  locations,
  optionMap,
  inventoryMap,
  includeStock,
  includeCost,
}: {
  productRows: ProductExportProductRow[];
  locations: ProductExportLocation[];
  optionMap: Map<string, ProductExportOption[]>;
  inventoryMap: Map<string, Map<string, ProductExportInventory>>;
  includeStock: boolean;
  includeCost: boolean;
}) {
  const parentNameMap = new Map<string, string>();
  const parentHandleMap = new Map<string, string>();

  for (const product of productRows) {
    if (!product.isParent) continue;

    parentNameMap.set(product.id, product.name);
    parentHandleMap.set(product.id, buildProductExportHandle(product.name));
  }

  return productRows.map((product) => {
    let handle = "";
    if (product.isParent) {
      handle = parentHandleMap.get(product.id) ?? "";
    } else if (product.parentProductId) {
      handle = parentHandleMap.get(product.parentProductId) ?? "";
    }

    const parentName = product.parentProductId
      ? (parentNameMap.get(product.parentProductId) ?? null)
      : null;
    const optionEntries = product.parentProductId
      ? (optionMap.get(product.id) ?? [])
      : [];
    const locationData = includeStock
      ? locations.map((location) => {
          const inventory = inventoryMap.get(product.id)?.get(location.id);
          return {
            locationId: location.id,
            locationName: location.name,
            availableForSale: inventory?.availableForSale ?? true,
            stockLevel: inventory?.stockLevel ?? 0,
            reorderPoint: inventory?.reorderPoint ?? 0,
            optimalStock: inventory?.optimalStock ?? 0,
          };
        })
      : undefined;

    const result: Record<string, unknown> = {
      ...product,
      handle,
      parentName,
      optionEntries,
      locations: locationData,
    };

    if (!includeCost) {
      delete result.costPrice;
    }

    return result;
  });
}
