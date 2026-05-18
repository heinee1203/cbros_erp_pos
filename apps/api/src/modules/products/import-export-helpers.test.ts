import assert from "node:assert/strict";
import test from "node:test";

import {
  buildProductExportHandle,
  buildProductExportInventoryMap,
  buildProductExportOptionMap,
  buildProductExportRows,
  parseProductExportQuery,
} from "./import-export-helpers";

test("parseProductExportQuery preserves export defaults and strict boolean flags", () => {
  assert.deepEqual(parseProductExportQuery({}), {
    search: "",
    familyId: "",
    categoryId: "",
    subcategoryId: "",
    brandId: "",
    sortBy: "name",
    sortDir: "asc",
    includeCost: false,
    includeStock: false,
    includeNonItems: false,
    activeFilter: undefined,
  });

  assert.deepEqual(parseProductExportQuery({
    active: "false",
    brandId: "brand-1",
    categoryId: "cat-1",
    familyId: "family-1",
    includeCost: "true",
    includeNonItems: "true",
    includeStock: "true",
    search: "brake",
    sortBy: "stockLevel",
    sortDir: "desc",
    subCategoryId: "legacy-subcategory",
    subcategoryId: "subcategory-1",
  }), {
    search: "brake",
    familyId: "family-1",
    categoryId: "cat-1",
    subcategoryId: "subcategory-1",
    brandId: "brand-1",
    sortBy: "stockLevel",
    sortDir: "desc",
    includeCost: true,
    includeStock: true,
    includeNonItems: true,
    activeFilter: "false",
  });
});

test("buildProductExportHandle preserves the existing parent handle format", () => {
  assert.equal(buildProductExportHandle("  Premium Brake Pads / Front!!! "), "premium-brake-pads-front");
  assert.equal(
    buildProductExportHandle("ABCDEFGHIJKLMNOPQRSTUVWXYZ 1234567890 long name"),
    "abcdefghijklmnopqrstuvwxyz-1234567890-long-name",
  );
  assert.equal(buildProductExportHandle("!!!"), "");
});

test("product export option and inventory maps preserve lookup shape", () => {
  const optionMap = buildProductExportOptionMap([
    { variantProductId: "variant-1", typeName: "Size", value: "M" },
    { variantProductId: "variant-1", typeName: "Color", value: "Black" },
    { variantProductId: "variant-2", typeName: "Size", value: "L" },
  ]);

  assert.deepEqual(optionMap.get("variant-1"), [
    { typeName: "Size", value: "M" },
    { typeName: "Color", value: "Black" },
  ]);
  assert.deepEqual(optionMap.get("variant-2"), [
    { typeName: "Size", value: "L" },
  ]);

  const inventoryMap = buildProductExportInventoryMap([
    {
      productId: "variant-1",
      locationId: "loc-1",
      stockLevel: 7,
      reorderPoint: 2,
      optimalStock: 10,
      availableForSale: false,
    },
  ]);

  assert.deepEqual(inventoryMap.get("variant-1")?.get("loc-1"), {
    productId: "variant-1",
    locationId: "loc-1",
    stockLevel: 7,
    reorderPoint: 2,
    optimalStock: 10,
    availableForSale: false,
  });
});

test("buildProductExportRows preserves parent, variant, stock, and cost behavior", () => {
  const rows = buildProductExportRows({
    productRows: [
      {
        id: "parent-1",
        name: "Premium Brake Pads",
        sku: "PARENT",
        costPrice: "12.00",
        isParent: true,
        parentProductId: null,
      },
      {
        id: "variant-1",
        name: "Premium Brake Pads Medium",
        sku: "VARIANT",
        costPrice: "13.00",
        isParent: false,
        parentProductId: "parent-1",
      },
    ],
    locations: [
      { id: "loc-1", name: "Main" },
      { id: "loc-2", name: "Warehouse" },
    ],
    optionMap: buildProductExportOptionMap([
      { variantProductId: "variant-1", typeName: "Size", value: "Medium" },
    ]),
    inventoryMap: buildProductExportInventoryMap([
      {
        productId: "variant-1",
        locationId: "loc-1",
        stockLevel: 5,
        reorderPoint: 1,
        optimalStock: 9,
        availableForSale: false,
      },
    ]),
    includeStock: true,
    includeCost: false,
  });

  assert.equal(rows[0].handle, "premium-brake-pads");
  assert.equal(rows[0].parentName, null);
  assert.equal("costPrice" in rows[0], false);
  assert.deepEqual(rows[0].optionEntries, []);
  assert.deepEqual(rows[0].locations, [
    {
      locationId: "loc-1",
      locationName: "Main",
      availableForSale: true,
      stockLevel: 0,
      reorderPoint: 0,
      optimalStock: 0,
    },
    {
      locationId: "loc-2",
      locationName: "Warehouse",
      availableForSale: true,
      stockLevel: 0,
      reorderPoint: 0,
      optimalStock: 0,
    },
  ]);

  assert.equal(rows[1].handle, "premium-brake-pads");
  assert.equal(rows[1].parentName, "Premium Brake Pads");
  assert.equal("costPrice" in rows[1], false);
  assert.deepEqual(rows[1].optionEntries, [
    { typeName: "Size", value: "Medium" },
  ]);
  assert.deepEqual(rows[1].locations, [
    {
      locationId: "loc-1",
      locationName: "Main",
      availableForSale: false,
      stockLevel: 5,
      reorderPoint: 1,
      optimalStock: 9,
    },
    {
      locationId: "loc-2",
      locationName: "Warehouse",
      availableForSale: true,
      stockLevel: 0,
      reorderPoint: 0,
      optimalStock: 0,
    },
  ]);
});

test("buildProductExportRows keeps cost when requested and leaves locations undefined when stock is omitted", () => {
  const [row] = buildProductExportRows({
    productRows: [
      {
        id: "product-1",
        name: "Oil Filter",
        costPrice: "4.00",
        isParent: false,
        parentProductId: null,
      },
    ],
    locations: [],
    optionMap: new Map(),
    inventoryMap: new Map(),
    includeStock: false,
    includeCost: true,
  });

  assert.equal(row.costPrice, "4.00");
  assert.equal(Object.hasOwn(row, "locations"), true);
  assert.equal(row.locations, undefined);
});
