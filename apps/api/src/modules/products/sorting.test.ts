import assert from "node:assert/strict";
import test from "node:test";

import { buildStableProductOrderBy, VALID_SORT_FIELDS } from "./sorting";

test("product sort fields include existing public sort keys", () => {
  assert.deepEqual(
    new Set(VALID_SORT_FIELDS),
    new Set([
      "name",
      "sku",
      "category",
      "unitPrice",
      "costPrice",
      "stockLevel",
      "reorderPoint",
      "categoryName",
      "subcategoryName",
      "brandName",
      "margin",
    ]),
  );
});

test("buildStableProductOrderBy always adds deterministic pagination tie-breakers", () => {
  assert.equal(buildStableProductOrderBy("name", "asc").length, 2);
  assert.equal(buildStableProductOrderBy("stockLevel", "desc").length, 3);
  assert.equal(buildStableProductOrderBy("unknown", "asc").length, 3);
});
