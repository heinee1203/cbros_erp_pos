import assert from "node:assert/strict";
import test from "node:test";

import {
  getItemImportFieldScope,
  isUuid,
  sanitizeImportFileName,
} from "./import-audit";

test("getItemImportFieldScope documents update-only safety locks", () => {
  const scope = getItemImportFieldScope("update_only");

  assert.deepEqual(scope.allowedFields, ["barcode", "quantity", "selling_price"]);
  assert.equal(scope.lockedFields.includes("brand"), true);
  assert.equal(scope.lockedFields.includes("category"), true);
  assert.equal(scope.lockedFields.includes("availability_flags"), true);
  assert.equal(scope.lockedFields.includes("reorder_fields"), true);
});

test("getItemImportFieldScope keeps stock sync catalog fields locked", () => {
  const scope = getItemImportFieldScope("inventory_sync");

  assert.equal(scope.allowedFields.includes("quantity"), true);
  assert.equal(scope.allowedFields.includes("selling_price"), true);
  assert.equal(scope.lockedFields.includes("brand"), true);
  assert.equal(scope.lockedFields.includes("barcode"), true);
});

test("sanitizeImportFileName trims and caps audit file names", () => {
  assert.equal(sanitizeImportFileName("  items.csv  "), "items.csv");
  assert.equal(sanitizeImportFileName(""), null);
  const capped = sanitizeImportFileName("a".repeat(300));
  assert.ok(capped);
  assert.equal(capped.length, 255);
});

test("isUuid accepts real auth IDs and rejects synthetic test IDs", () => {
  assert.equal(isUuid("9b416888-0ad2-4f4b-83ab-4f3e0f9927ff"), true);
  assert.equal(isUuid("admin-local-test"), false);
  assert.equal(isUuid(null), false);
});
