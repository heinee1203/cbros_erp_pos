import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCategoryMapping,
  buildLoyversePreviewResult,
  summarizeParsedRows,
  toPreviewRowSummary,
} from "./preview-assembly";
import type { ParsedRow } from "./types";

function row(overrides: Partial<ParsedRow>): ParsedRow {
  return {
    rowIndex: 1,
    name: "Brake Pad",
    sku: "BP-1",
    barcode: "",
    costPrice: "0.00",
    unitPrice: "0.00",
    isVariablePrice: false,
    categoryName: "Brakes",
    brandName: "",
    description: "",
    handle: "",
    option1Name: "",
    option1Value: "",
    option2Name: "",
    option2Value: "",
    option3Name: "",
    option3Value: "",
    resolvedName: "Brake Pad",
    isVariant: false,
    parentName: "",
    active: null,
    sellingUnit: "",
    trackSerial: null,
    trackDot: null,
    specialOrder: null,
    oemNumber: "",
    supplierName: "",
    locations: [],
    action: "CREATE",
    existingProductId: null,
    changes: [],
    errors: [],
    ...overrides,
  };
}

test("summarizeParsedRows counts actions and formats row errors", () => {
  assert.deepEqual(
    summarizeParsedRows([
      row({ action: "CREATE" }),
      row({ action: "UPDATE" }),
      row({ action: "NO_CHANGE" }),
      row({ rowIndex: 4, sku: "", action: "CREATE", errors: ["SKU is required"] }),
    ]),
    {
      createCount: 1,
      updateCount: 1,
      noChangeCount: 1,
      skipCount: 1,
      errors: [{ row: 4, message: "[no SKU] SKU is required" }],
    },
  );
});

test("buildCategoryMapping preserves category matching and action counts", () => {
  assert.deepEqual(
    buildCategoryMapping(
      [
        row({ categoryName: "Brakes", action: "CREATE" }),
        row({ categoryName: " Brakes ", action: "UPDATE" }),
        row({ categoryName: "Tires", action: "NO_CHANGE" }),
        row({ categoryName: "", action: "CREATE" }),
      ],
      [
        { id: "cat_1", name: "brakes" },
        { id: "cat_2", name: "Lighting" },
      ],
    ),
    [
      {
        csvName: "Brakes",
        apexCategoryId: "cat_1",
        apexCategoryName: "brakes",
        autoMatched: true,
        productCount: 2,
        createCount: 1,
        updateCount: 1,
      },
      {
        csvName: "Tires",
        apexCategoryId: null,
        apexCategoryName: null,
        autoMatched: false,
        productCount: 1,
        createCount: 0,
        updateCount: 0,
      },
    ],
  );
});

test("toPreviewRowSummary formats variant rows with parent and option values", () => {
  assert.deepEqual(
    toPreviewRowSummary(
      row({
        rowIndex: 7,
        isVariant: true,
        parentName: "Brake Pad",
        option1Value: "Front",
        option2Value: "Ceramic",
        sku: "BP-F",
        action: "UPDATE",
        changes: ["variant options changed"],
      }),
    ),
    {
      rowIndex: 7,
      name: "Brake Pad",
      variantName: "Front / Ceramic",
      sku: "BP-F",
      action: "UPDATE",
      changes: ["variant options changed"],
      errors: [],
      isVariant: true,
    },
  );
});

test("buildLoyversePreviewResult preserves preview slices and full create/update lists", () => {
  const rows = [
    row({ rowIndex: 1, action: "CREATE", sku: "C" }),
    row({ rowIndex: 2, action: "UPDATE", sku: "U" }),
    row({ rowIndex: 3, action: "NO_CHANGE", sku: "N" }),
  ];

  const result = buildLoyversePreviewResult({
    previewToken: "preview_1",
    parsedRows: rows,
    counts: { createCount: 1, updateCount: 1, noChangeCount: 1, skipCount: 0 },
    errors: [],
    locationMapping: [],
    categoryMapping: [],
  });

  assert.equal(result.previewToken, "preview_1");
  assert.equal(result.format, "loyverse");
  assert.equal(result.totalRows, 3);
  assert.deepEqual(result.preview.map((summary) => summary.sku), ["C", "U", "N"]);
  assert.deepEqual(result.createPreview.map((summary) => summary.sku), ["C"]);
  assert.deepEqual(result.updatePreview.map((summary) => summary.sku), ["U"]);
  assert.deepEqual(result.noChangePreview.map((summary) => summary.sku), ["N"]);
});
