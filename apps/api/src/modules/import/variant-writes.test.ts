import assert from "node:assert/strict";
import test from "node:test";

import {
  buildVariantOptionPairs,
  collectVariantHandles,
  resolveParentTaxonomyIds,
  selectVariantParentRow,
  type VariantParentRow,
} from "./variant-writes";

const rows: VariantParentRow[] = [
  {
    isVariant: true,
    handle: "brake-pad",
    parentName: "",
    name: "Brake Pad - Front",
    categoryName: "Brakes",
    brandName: "Brembo",
  },
  {
    isVariant: true,
    handle: "brake-pad",
    parentName: "Brake Pad",
    name: "Brake Pad - Rear",
    categoryName: "Brakes",
    brandName: "Brembo",
  },
  {
    isVariant: false,
    handle: "ignored",
    parentName: "",
    name: "Rotor",
    categoryName: "Brakes",
    brandName: "Brembo",
  },
  {
    isVariant: true,
    handle: "tire",
    parentName: "",
    name: "Tire Small",
    categoryName: "Tires",
    brandName: "Delium",
  },
];

test("collectVariantHandles returns unique variant handles in first-seen order", () => {
  assert.deepEqual(collectVariantHandles(rows), ["brake-pad", "tire"]);
});

test("selectVariantParentRow prefers a row with explicit parentName", () => {
  assert.equal(selectVariantParentRow(rows.slice(0, 2)).name, "Brake Pad - Rear");
  assert.equal(selectVariantParentRow([rows[3]]).name, "Tire Small");
});

test("resolveParentTaxonomyIds uses caches unless inventory sync blocks taxonomy", () => {
  const categoryCache = new Map([
    ["brakes", "cat_1"],
    ["tires", "cat_2"],
  ]);
  const brandCache = new Map([
    ["brembo", "brand_1"],
    ["delium", "brand_2"],
  ]);

  assert.deepEqual(resolveParentTaxonomyIds(rows[0], "smart_sync", categoryCache, brandCache), {
    parentCategoryId: "cat_1",
    parentBrandId: "brand_1",
  });
  assert.deepEqual(resolveParentTaxonomyIds(rows[0], "inventory_sync", categoryCache, brandCache), {
    parentCategoryId: null,
    parentBrandId: null,
  });
  assert.deepEqual(resolveParentTaxonomyIds(rows[0], "update_only", categoryCache, brandCache), {
    parentCategoryId: null,
    parentBrandId: null,
  });
});

test("buildVariantOptionPairs keeps only complete option name/value pairs", () => {
  assert.deepEqual(
    buildVariantOptionPairs({
      option1Name: "Position",
      option1Value: "Front",
      option2Name: "Color",
      option2Value: "",
      option3Name: "Size",
      option3Value: "Large",
    }),
    [
      { name: "Position", value: "Front", sort: 0 },
      { name: "Size", value: "Large", sort: 2 },
    ],
  );
});
