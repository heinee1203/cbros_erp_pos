import assert from "node:assert/strict";
import test from "node:test";

import {
  buildVariantProductName,
  getProductMutationPermissionError,
  hasDuplicateSkus,
  isValidProductId,
  requiresSkuForProduct,
  resolveInventoryTargetLocationIds,
  splitProductUpdatePayload,
} from "./mutation-helpers";

test("product mutation permission errors preserve role gates and messages", () => {
  assert.equal(getProductMutationPermissionError("create", "ADMIN"), null);
  assert.equal(getProductMutationPermissionError("update", "MANAGER"), null);
  assert.equal(
    getProductMutationPermissionError("delete", "CASHIER"),
    "Only ADMIN or MANAGER can delete products",
  );
});

test("non-variant products require an explicit sku while variant parents do not", () => {
  assert.equal(requiresSkuForProduct(false, undefined), true);
  assert.equal(requiresSkuForProduct(false, ""), true);
  assert.equal(requiresSkuForProduct(false, "SKU-1"), false);
  assert.equal(requiresSkuForProduct(true, undefined), false);
});

test("sku duplicate detection checks only the provided batch", () => {
  assert.equal(hasDuplicateSkus(["A", "B", "A"]), true);
  assert.equal(hasDuplicateSkus(["A", "B", "C"]), false);
});

test("inventory target locations prefer explicit selections before scoped fallback", () => {
  assert.deepEqual(resolveInventoryTargetLocationIds(["loc_2", "loc_3"], "loc_1"), ["loc_2", "loc_3"]);
  assert.deepEqual(resolveInventoryTargetLocationIds([], "loc_1"), ["loc_1"]);
  assert.deepEqual(resolveInventoryTargetLocationIds(undefined, undefined), []);
});

test("variant names keep the existing parent dash suffix format", () => {
  assert.equal(buildVariantProductName("Brake Pad", "LH"), "Brake Pad — LH");
});

test("splitProductUpdatePayload separates inventory and variant fields from product updates", () => {
  assert.deepEqual(
    splitProductUpdatePayload({
      conversionFactor: 2,
      name: "Oil Filter",
      newVariants: [{ sku: "OIL-L" }],
      reorderPoint: 7,
    }),
    {
      newVariants: [{ sku: "OIL-L" }],
      productUpdates: {
        conversionFactor: "2",
        name: "Oil Filter",
      },
      reorderPoint: 7,
    },
  );
});

test("product id validation accepts canonical UUIDs only", () => {
  assert.equal(isValidProductId("123e4567-e89b-12d3-a456-426614174000"), true);
  assert.equal(isValidProductId("123e4567-e89b-12d3-a456-42661417400z"), false);
});
