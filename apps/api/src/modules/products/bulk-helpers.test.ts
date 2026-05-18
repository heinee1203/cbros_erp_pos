import assert from "node:assert/strict";
import test from "node:test";

import {
  buildBulkProductUpdateFields,
  buildPostgresUuidArrayLiteral,
  getBulkProductIdsLimitError,
  resolveBulkFindReplaceColumn,
} from "./bulk-helpers";

test("buildBulkProductUpdateFields preserves existing bulk update field policy", () => {
  assert.deepEqual(
    buildBulkProductUpdateFields({
      categoryId: "cat_1",
      specialOrder: false,
      discontinued: true,
      brandId: "brand_1",
      familyId: "family_1",
      subcategoryId: "sub_1",
      isSerialized: true,
      warrantyMonths: null,
      isTire: false,
      maxTireAgeYears: 5,
    }),
    {
      categoryId: "cat_1",
      specialOrder: false,
      discontinued: true,
      brandId: "brand_1",
      familyId: "family_1",
      subcategoryId: "sub_1",
      isSerialized: true,
      warrantyMonths: null,
      isTire: false,
      maxTireAgeYears: 5,
    },
  );
});

test("buildBulkProductUpdateFields omits undefined but keeps null and false values", () => {
  assert.deepEqual(
    buildBulkProductUpdateFields({
      brandId: undefined,
      isSerialized: false,
      warrantyMonths: null,
      maxTireAgeYears: undefined,
    }),
    {
      isSerialized: false,
      warrantyMonths: null,
    },
  );
});

test("getBulkProductIdsLimitError preserves bulk request limit messages", () => {
  assert.equal(getBulkProductIdsLimitError(["a", "b"], 2), null);
  assert.equal(getBulkProductIdsLimitError(["a", "b", "c"], 2), "Maximum 2 items per request");
  assert.equal(getBulkProductIdsLimitError(undefined, 2), null);
});

test("resolveBulkFindReplaceColumn preserves supported find/replace fields", () => {
  assert.equal(resolveBulkFindReplaceColumn("name"), "name");
  assert.equal(resolveBulkFindReplaceColumn("sku"), "sku");
  assert.equal(resolveBulkFindReplaceColumn("oem"), "oem_number");
  assert.equal(resolveBulkFindReplaceColumn("description"), null);
});

test("buildPostgresUuidArrayLiteral preserves existing postgres uuid array literal shape", () => {
  assert.equal(
    buildPostgresUuidArrayLiteral([
      "123e4567-e89b-12d3-a456-426614174000",
      "123e4567-e89b-12d3-a456-426614174001",
    ]),
    "{123e4567-e89b-12d3-a456-426614174000,123e4567-e89b-12d3-a456-426614174001}",
  );
});
