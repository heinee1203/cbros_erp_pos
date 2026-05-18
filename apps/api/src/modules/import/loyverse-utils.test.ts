import assert from "node:assert/strict";
import test from "node:test";

import {
  buildHeaderIndex,
  buildLoyverseColumnIndex,
  extractCsvLocationNames,
  getCellByIndex,
  isExcelDamagedBarcode,
  isExcelDamagedSku,
  parseBrandNameFromCategory,
  parseImportPrices,
  parseLoyverseRowLocation,
} from "./loyverse-utils";

test("buildLoyverseColumnIndex resolves existing item import aliases", () => {
  const headers = ["Item name", "Sku", "Purchase cost", "Default price", "Track DOT", "Option 1 value"];
  const index = buildLoyverseColumnIndex(headers);

  assert.equal(index.name, 0);
  assert.equal(index.sku, 1);
  assert.equal(index.cost, 2);
  assert.equal(index.price, 3);
  assert.equal(index.trackDot, 4);
  assert.equal(index.option1Value, 5);
  assert.equal(index.barcode, -1);
});

test("location header helpers preserve first-seen location order and lowercase lookup", () => {
  const headers = [
    "Name",
    "In stock [Main]",
    "Available for sale [Main]",
    "Price [Branch]",
    "Low stock [Main]",
    "Optimal stock [Warehouse]",
  ];

  assert.deepEqual([...extractCsvLocationNames(headers)], ["Main", "Branch", "Warehouse"]);
  assert.deepEqual(buildHeaderIndex(headers), {
    name: 0,
    "in stock [main]": 1,
    "available for sale [main]": 2,
    "price [branch]": 3,
    "low stock [main]": 4,
    "optimal stock [warehouse]": 5,
  });
});

test("getCellByIndex trims cells and returns blank for missing columns", () => {
  assert.equal(getCellByIndex([" A ", undefined as unknown as string], 0), "A");
  assert.equal(getCellByIndex(["A"], 2), "");
  assert.equal(getCellByIndex(["A"], -1), "");
});

test("Excel damage guards preserve SKU and barcode detection differences", () => {
  assert.equal(isExcelDamagedSku("1.01113E+12"), true);
  assert.equal(isExcelDamagedSku("ABC-E"), false);
  assert.equal(isExcelDamagedBarcode("4.97579E+12"), true);
  assert.equal(isExcelDamagedBarcode("ABC-E"), true);
});

test("parseBrandNameFromCategory keeps current dash-suffix behavior", () => {
  assert.equal(parseBrandNameFromCategory("TIRE #01 - DELIUM"), "DELIUM");
  assert.equal(parseBrandNameFromCategory("A - B - C"), "B - C");
  assert.equal(parseBrandNameFromCategory("Brakes"), "");
});

test("parseImportPrices preserves variable, n/a, and validation behavior", () => {
  assert.deepEqual(parseImportPrices("PHP 1,234.56", "2,500"), {
    isVariablePrice: false,
    costPrice: 1234.56,
    unitPrice: 2500,
    errors: [],
  });
  assert.deepEqual(parseImportPrices("n/a", "variable"), {
    isVariablePrice: true,
    costPrice: 0,
    unitPrice: 0,
    errors: [],
  });
  assert.deepEqual(parseImportPrices("oops", "also oops"), {
    isVariablePrice: false,
    costPrice: Number.NaN,
    unitPrice: Number.NaN,
    errors: ["Invalid cost price", "Invalid unit price"],
  });
});

test("parseLoyverseRowLocation preserves blank stock and defaults behavior", () => {
  const headerIdx = buildHeaderIndex([
    "In stock [Main]",
    "Available for sale [Main]",
    "Low stock [Main]",
    "Optimal stock [Main]",
  ]);

  assert.deepEqual(parseLoyverseRowLocation({ csvName: "Main", apexLocationId: "loc_1" }, headerIdx, ["", "", "", ""]), {
    csvLocationName: "Main",
    apexLocationId: "loc_1",
    stockLevel: 0,
    stockLevelWasPresent: false,
    available: true,
    reorderPoint: 0,
    optimalStock: 0,
  });

  assert.deepEqual(
    parseLoyverseRowLocation({ csvName: "Main", apexLocationId: null }, headerIdx, ["7", "no", "-5", "12"]),
    {
      csvLocationName: "Main",
      apexLocationId: null,
      stockLevel: 7,
      stockLevelWasPresent: true,
      available: false,
      reorderPoint: 0,
      optimalStock: 12,
    },
  );
});
