import assert from "node:assert/strict";
import test from "node:test";

import { applyVariantGrouping, groupRowsByHandle, rediffVariantRows } from "./variant-preview";
import type { ParsedRow } from "./types";

function row(overrides: Partial<ParsedRow>): ParsedRow {
  return {
    rowIndex: 1,
    name: "Brake Pad",
    sku: "BP-1",
    barcode: "",
    costPrice: "300.00",
    unitPrice: "500.00",
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

test("groupRowsByHandle ignores rows without handles and preserves handled groups", () => {
  const handled = row({ handle: "brake-pad", sku: "BP-H" });
  const unhandled = row({ handle: "", sku: "BP-U" });

  const groups = groupRowsByHandle([handled, unhandled]);

  assert.equal(groups.size, 1);
  assert.deepEqual(groups.get("brake-pad"), [handled]);
});

test("applyVariantGrouping converts a single handled option row into a variant", () => {
  const rows = [
    row({
      handle: "brake-pad",
      option1Name: "Position",
      option1Value: "Front",
      option2Name: "Material",
      option2Value: "Ceramic",
      errors: ["Name is required", "SKU is required"],
    }),
  ];

  applyVariantGrouping(rows);

  assert.equal(rows[0].isVariant, true);
  assert.equal(rows[0].parentName, "Brake Pad");
  assert.equal(rows[0].resolvedName, "Brake Pad (Front / Ceramic)");
  assert.equal(rows[0].name, "Front / Ceramic");
  assert.deepEqual(rows[0].errors, ["SKU is required"]);
});

test("applyVariantGrouping marks grouped rows with a shared parent name", () => {
  const rows = [
    row({
      rowIndex: 1,
      handle: "brake-pad",
      name: "Brake Pad",
      option1Value: "Front",
      errors: [],
    }),
    row({
      rowIndex: 2,
      handle: "brake-pad",
      name: "",
      option1Value: "Rear",
      errors: ["Name is required"],
    }),
    row({
      rowIndex: 3,
      handle: "brake-pad",
      name: "",
      option1Value: "",
      errors: ["Name is required"],
    }),
  ];

  applyVariantGrouping(rows);

  assert.deepEqual(
    rows.map((r) => ({
      isVariant: r.isVariant,
      parentName: r.parentName,
      resolvedName: r.resolvedName,
      name: r.name,
      errors: r.errors,
    })),
    [
      {
        isVariant: true,
        parentName: "Brake Pad",
        resolvedName: "Brake Pad (Front)",
        name: "Front",
        errors: [],
      },
      {
        isVariant: true,
        parentName: "Brake Pad",
        resolvedName: "Brake Pad (Rear)",
        name: "Rear",
        errors: [],
      },
      {
        isVariant: true,
        parentName: "Brake Pad",
        resolvedName: "Brake Pad",
        name: "",
        errors: [],
      },
    ],
  );
});

test("rediffVariantRows recomputes variant changes and action", () => {
  const rows = [
    row({
      sku: "BP-F",
      name: "Front",
      isVariant: true,
      existingProductId: "prod_1",
      action: "NO_CHANGE",
      option1Name: "Position",
      option1Value: "Front",
    }),
  ];

  rediffVariantRows(
    rows,
    new Map([
      [
        "bp-f",
        {
          id: "prod_1",
          name: "Front",
          unitPrice: "500.00",
          costPrice: "300.00",
          barcode: "",
          categoryName: "Brakes",
        },
      ],
    ]),
    new Map(),
    new Map([["prod_1", [{ typeName: "Position", value: "Rear" }]]]),
  );

  assert.deepEqual(rows[0].changes, ["variant options changed"]);
  assert.equal(rows[0].action, "UPDATE");
});

test("rediffVariantRows skips non-variants and errored rows", () => {
  const rows = [
    row({ sku: "BP-N", isVariant: false, existingProductId: "prod_1", action: "NO_CHANGE" }),
    row({
      sku: "BP-E",
      isVariant: true,
      existingProductId: "prod_2",
      action: "NO_CHANGE",
      errors: ["SKU is required"],
    }),
  ];

  rediffVariantRows(
    rows,
    new Map([
      [
        "bp-n",
        {
          id: "prod_1",
          name: "Changed",
          unitPrice: "1.00",
          costPrice: "1.00",
          barcode: "",
          categoryName: "Other",
        },
      ],
    ]),
    new Map(),
    new Map(),
  );

  assert.deepEqual(rows.map((r) => r.changes), [[], []]);
  assert.deepEqual(rows.map((r) => r.action), ["NO_CHANGE", "NO_CHANGE"]);
});
