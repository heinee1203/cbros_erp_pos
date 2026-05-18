import assert from "node:assert/strict";
import test from "node:test";

import {
  computeItemDiff,
  normalizeText,
  parseMoney2dp,
  parseYN,
  sanitizeText,
  type CsvForDiff,
  type ExistingForDiff,
} from "./diff-utils";

const changeArrow = "\u2192";

const existing: ExistingForDiff = {
  name: "Brake Pad",
  unitPrice: "500.00",
  costPrice: "300.00",
  barcode: "ABC",
  categoryName: "Brakes",
};

const csv: CsvForDiff = {
  name: "Brake Pad",
  unitPrice: "500",
  costPrice: "300.000",
  barcode: "",
  categoryName: "",
  isVariant: false,
  option1Name: "",
  option1Value: "",
  option2Name: "",
  option2Value: "",
  option3Name: "",
  option3Value: "",
  locations: [],
};

test("parseYN accepts common truthy and falsy CSV values", () => {
  for (const value of ["Y", "yes", "TRUE", "1"]) {
    assert.equal(parseYN(value), true);
  }
  for (const value of ["N", "no", "FALSE", "0"]) {
    assert.equal(parseYN(value), false);
  }
  assert.equal(parseYN(""), null);
  assert.equal(parseYN("maybe"), null);
  assert.equal(parseYN(null), null);
});

test("sanitizeText removes invisible CSV artifacts and trims", () => {
  assert.equal(sanitizeText("\uFEFF\u200B  SKU-1 \u00AD"), "SKU-1");
  assert.equal(sanitizeText(undefined), "");
});

test("parseMoney2dp strips currency text and rounds to cents", () => {
  assert.equal(parseMoney2dp("PHP 1,234.567"), 1234.57);
  assert.equal(parseMoney2dp(""), null);
  assert.equal(parseMoney2dp("not money"), null);
  assert.equal(parseMoney2dp(12.345), 12.35);
});

test("normalizeText trims without changing case", () => {
  assert.equal(normalizeText("  Brake Pad\r\n"), "Brake Pad");
});

test("computeItemDiff treats absent CSV fields as unchanged", () => {
  assert.deepEqual(
    computeItemDiff(
      existing,
      {
        ...csv,
        locations: [
          {
            csvLocationName: "Main",
            apexLocationId: "loc_1",
            stockLevel: 0,
            stockLevelWasPresent: false,
          },
          {
            csvLocationName: "Unmapped",
            apexLocationId: null,
            stockLevel: 99,
            stockLevelWasPresent: true,
          },
        ],
      },
      new Map([["loc_1", 5]]),
      [],
    ),
    [],
  );
});

test("computeItemDiff reports tracked field and stock changes", () => {
  assert.deepEqual(
    computeItemDiff(
      existing,
      {
        ...csv,
        name: "Brake Pad Premium",
        unitPrice: "525",
        costPrice: "325.55",
        barcode: "XYZ",
        categoryName: "Performance",
        locations: [
          {
            csvLocationName: "Main",
            apexLocationId: "loc_1",
            stockLevel: 7,
            stockLevelWasPresent: true,
          },
        ],
      },
      new Map([["loc_1", 5]]),
      [],
    ),
    [
      `name: "Brake Pad" ${changeArrow} "Brake Pad Premium"`,
      `unitPrice: 500.00 ${changeArrow} 525.00`,
      `costPrice: 300.00 ${changeArrow} 325.55`,
      `barcode: "ABC" ${changeArrow} "XYZ"`,
      `category: "Brakes" ${changeArrow} "Performance"`,
      `qty@Main: 5 ${changeArrow} 7`,
    ],
  );
});

test("computeItemDiff compares variant option sets only for variant rows", () => {
  assert.deepEqual(
    computeItemDiff(
      existing,
      {
        ...csv,
        isVariant: true,
        option1Name: "Color",
        option1Value: "Black",
      },
      new Map(),
      [{ typeName: "Color", value: "Blue" }],
    ),
    ["variant options changed"],
  );

  assert.deepEqual(
    computeItemDiff(
      existing,
      {
        ...csv,
        isVariant: false,
        option1Name: "Color",
        option1Value: "Black",
      },
      new Map(),
      [{ typeName: "Color", value: "Blue" }],
    ),
    [],
  );
});
