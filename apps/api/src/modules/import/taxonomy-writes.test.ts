import assert from "node:assert/strict";
import test from "node:test";

import { buildImportSlug, resolveImportSubcategory } from "./taxonomy-writes";

test("buildImportSlug normalizes import category and brand names", () => {
  assert.equal(buildImportSlug("Brake Pads & Rotors", "cat"), "brake-pads-rotors");
  assert.equal(buildImportSlug("  A/T Tires!!!  ", "brand"), "a-t-tires");
  assert.equal(buildImportSlug("!!!", "cat", () => 12345), "cat-12345");
});

test("resolveImportSubcategory uses explicit mappings only outside inventory sync", () => {
  const mapping = {
    Brakes: {
      action: "map" as const,
      targetCategoryId: "cat_1",
      targetSubcategoryId: "sub_1",
    },
    Tires: {
      action: "skip" as const,
    },
  };

  assert.equal(resolveImportSubcategory("Brakes", "smart_sync", mapping), "sub_1");
  assert.equal(resolveImportSubcategory("Tires", "smart_sync", mapping), null);
  assert.equal(resolveImportSubcategory("Brakes", "inventory_sync", mapping), null);
  assert.equal(resolveImportSubcategory("Brakes", "update_only", mapping), null);
  assert.equal(resolveImportSubcategory("", "smart_sync", mapping), null);
});
