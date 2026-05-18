import assert from "node:assert/strict";
import test from "node:test";

import {
  buildExistingProductSkuMap,
  buildExistingStockMap,
  buildExistingVariantOptionMap,
  buildItemImportLocationMapping,
  buildSavedImportLocationMappings,
  type ExistingImportProduct,
} from "./item-preview-context";

function product(overrides: Partial<ExistingImportProduct>): ExistingImportProduct {
  return {
    id: "prod_1",
    sku: "BP-1",
    name: "Brake Pad",
    unitPrice: "500.00",
    costPrice: "300.00",
    barcode: "",
    categoryId: null,
    categoryName: null,
    description: null,
    ...overrides,
  };
}

test("buildSavedImportLocationMappings lowercases CSV names", () => {
  const mappings = buildSavedImportLocationMappings([
    { csv_location_name: "Main Store", apex_location_id: "loc_1" },
    { csv_location_name: "BRANCH", apex_location_id: "loc_2" },
  ]);

  assert.equal(mappings.get("main store"), "loc_1");
  assert.equal(mappings.get("branch"), "loc_2");
});

test("buildItemImportLocationMapping keeps current exact-match before saved-match priority", () => {
  assert.deepEqual(
    buildItemImportLocationMapping(
      ["Main", "Warehouse", "Unknown"],
      [
        { id: "loc_main", name: "Main" },
        { id: "loc_saved", name: "Saved Warehouse" },
      ],
      new Map([
        ["main", "loc_saved"],
        ["warehouse", "loc_saved"],
      ]),
    ),
    [
      {
        csvName: "Main",
        apexLocationId: "loc_main",
        apexLocationName: "Main",
        autoMatched: true,
      },
      {
        csvName: "Warehouse",
        apexLocationId: "loc_saved",
        apexLocationName: "Saved Warehouse",
        autoMatched: true,
      },
      {
        csvName: "Unknown",
        apexLocationId: null,
        apexLocationName: null,
        autoMatched: false,
      },
    ],
  );
});

test("buildExistingProductSkuMap lowercases SKU keys and preserves overwrite behavior", () => {
  const skuMap = buildExistingProductSkuMap([
    product({ id: "prod_1", sku: "BP-1" }),
    product({ id: "prod_2", sku: "bp-1" }),
  ]);

  assert.equal(skuMap.get("bp-1")?.id, "prod_2");
});

test("buildExistingStockMap groups stock by product and location", () => {
  const stockMap = buildExistingStockMap([
    { productId: "prod_1", locationId: "loc_1", stockLevel: 5 },
    { productId: "prod_1", locationId: "loc_2", stockLevel: 7 },
    { productId: "prod_2", locationId: "loc_1", stockLevel: 3 },
  ]);

  assert.equal(stockMap.get("prod_1")?.get("loc_1"), 5);
  assert.equal(stockMap.get("prod_1")?.get("loc_2"), 7);
  assert.equal(stockMap.get("prod_2")?.get("loc_1"), 3);
});

test("buildExistingVariantOptionMap groups option values by variant product", () => {
  const optionMap = buildExistingVariantOptionMap([
    { productId: "variant_1", typeName: "Position", value: "Front" },
    { productId: "variant_1", typeName: "Material", value: "Ceramic" },
    { productId: "variant_2", typeName: "Position", value: "Rear" },
  ]);

  assert.deepEqual(optionMap.get("variant_1"), [
    { typeName: "Position", value: "Front" },
    { typeName: "Material", value: "Ceramic" },
  ]);
  assert.deepEqual(optionMap.get("variant_2"), [{ typeName: "Position", value: "Rear" }]);
});
