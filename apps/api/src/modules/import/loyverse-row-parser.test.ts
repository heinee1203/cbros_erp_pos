import assert from "node:assert/strict";
import test from "node:test";

import type { ExistingImportProduct } from "./item-preview-context";
import { parseLoyverseItemRow, parseLoyverseItemRows } from "./loyverse-row-parser";
import { buildHeaderIndex, buildLoyverseColumnIndex } from "./loyverse-utils";
import type { LocationMapping } from "./types";

const headers = [
  "Item name",
  "SKU",
  "Purchase cost",
  "Default price",
  "Barcode",
  "Category",
  "Description",
  "Handle",
  "Option 1 name",
  "Option 1 value",
  "Active",
  "Unit",
  "Track Serial",
  "Track DOT",
  "Special Order",
  "OEM Number",
  "Supplier",
  "In stock [Main]",
  "Available for sale [Main]",
  "Low stock [Main]",
  "Optimal stock [Main]",
];

const colIdx = buildLoyverseColumnIndex(headers);
const headerIdx = buildHeaderIndex(headers);
const locationMapping: LocationMapping[] = [
  {
    csvName: "Main",
    apexLocationId: "loc_1",
    apexLocationName: "Main",
    autoMatched: true,
  },
];

function row(overrides: Partial<Record<(typeof headers)[number], string>> = {}): string[] {
  const values: Record<string, string> = {
    "Item name": "Brake Pad",
    SKU: "SKU-1",
    "Purchase cost": "50.00",
    "Default price": "100.00",
    Barcode: "BAR-1",
    Category: "BRAKES - OEM",
    Description: "Front brake pad",
    Handle: "",
    "Option 1 name": "",
    "Option 1 value": "",
    Active: "Y",
    Unit: " piece ",
    "Track Serial": "N",
    "Track DOT": "Y",
    "Special Order": "0",
    "OEM Number": " OEM-1 ",
    Supplier: " Supplier A ",
    "In stock [Main]": "",
    "Available for sale [Main]": "",
    "Low stock [Main]": "",
    "Optimal stock [Main]": "",
    ...overrides,
  };

  return headers.map((header) => values[header] ?? "");
}

function existingProduct(overrides: Partial<ExistingImportProduct> = {}): ExistingImportProduct {
  return {
    id: "product_1",
    sku: "SKU-1",
    name: "Brake Pad",
    unitPrice: "100.00",
    costPrice: "50.00",
    barcode: "BAR-1",
    categoryId: "category_1",
    categoryName: "BRAKES - OEM",
    description: null,
    ...overrides,
  };
}

test("parseLoyverseItemRow preserves field parsing and classifies unchanged rows", () => {
  const parsed = parseLoyverseItemRow({
    row: row(),
    rowNum: 2,
    colIdx,
    headerIdx,
    locationMapping,
    skuMap: new Map([["sku-1", existingProduct()]]),
    existingStockMap: new Map([["product_1", new Map([["loc_1", 5]])]]),
    existingVariantOptionMap: new Map(),
  });

  assert.equal(parsed.action, "NO_CHANGE");
  assert.equal(parsed.existingProductId, "product_1");
  assert.equal(parsed.brandName, "OEM");
  assert.equal(parsed.active, true);
  assert.equal(parsed.sellingUnit, "piece");
  assert.equal(parsed.trackSerial, false);
  assert.equal(parsed.trackDot, true);
  assert.equal(parsed.specialOrder, false);
  assert.equal(parsed.oemNumber, "OEM-1");
  assert.equal(parsed.supplierName, "Supplier A");
  assert.deepEqual(parsed.errors, []);
});

test("parseLoyverseItemRow reports updates from existing product and stock diffs", () => {
  const parsed = parseLoyverseItemRow({
    row: row({ "Item name": "Brake Pad Pro", "In stock [Main]": "7" }),
    rowNum: 3,
    colIdx,
    headerIdx,
    locationMapping,
    skuMap: new Map([["sku-1", existingProduct()]]),
    existingStockMap: new Map([["product_1", new Map([["loc_1", 5]])]]),
    existingVariantOptionMap: new Map(),
  });

  assert.equal(parsed.action, "UPDATE");
  assert.deepEqual(parsed.changes, [
    'name: "Brake Pad" \u2192 "Brake Pad Pro"',
    "qty@Main: 5 \u2192 7",
  ]);
});

test("parseLoyverseItemRow keeps Excel-damaged SKU errors and skips damaged barcode", () => {
  const parsed = parseLoyverseItemRow({
    row: row({ SKU: "1.01113E+12", Barcode: "4.97579E+12" }),
    rowNum: 4,
    colIdx,
    headerIdx,
    locationMapping,
    skuMap: new Map(),
    existingStockMap: new Map(),
    existingVariantOptionMap: new Map(),
  });

  assert.equal(parsed.action, "CREATE");
  assert.equal(parsed.sku, "");
  assert.equal(parsed.barcode, "");
  assert.deepEqual(parsed.errors, [
    'SKU "1.01113E+12" is in scientific notation (Excel damage). Re-export the CSV directly from Loyverse without opening in Excel.',
  ]);
});

test("parseLoyverseItemRows skips the header row and preserves displayed row numbers", () => {
  const parsedRows = parseLoyverseItemRows({
    rows: [headers, row({ SKU: "CREATE-1" }), row({ SKU: "CREATE-2" })],
    colIdx,
    headerIdx,
    locationMapping,
    skuMap: new Map(),
    existingStockMap: new Map(),
    existingVariantOptionMap: new Map(),
  });

  assert.deepEqual(
    parsedRows.map((parsed) => [parsed.rowIndex, parsed.sku, parsed.action]),
    [
      [2, "CREATE-1", "CREATE"],
      [3, "CREATE-2", "CREATE"],
    ],
  );
});
