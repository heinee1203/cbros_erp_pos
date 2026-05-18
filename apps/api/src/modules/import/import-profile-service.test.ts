import assert from "node:assert/strict";
import test from "node:test";

import {
  IMPORT_PROFILE_FIELD_LOCK_POLICY_VERSION,
  normalizeImportProfileInput,
  sanitizeCategoryMapping,
  sanitizeImportProfileName,
  sanitizeStringMapping,
} from "./import-profile-service";

test("normalizeImportProfileInput applies safe item import defaults", () => {
  const input = normalizeImportProfileInput({ name: " Update prices " });

  assert.equal(input.name, "Update prices");
  assert.equal(input.importType, "items");
  assert.equal(input.importMode, "create_only");
  assert.equal(input.includeCreates, true);
  assert.equal(input.includeUpdates, true);
  assert.equal(input.includeNoChange, false);
  assert.equal(input.createNewCategories, true);
  assert.equal(input.fieldLockPolicyVersion, IMPORT_PROFILE_FIELD_LOCK_POLICY_VERSION);
});

test("normalizeImportProfileInput preserves update-only field-lock metadata", () => {
  const input = normalizeImportProfileInput({
    name: "Update only weekly",
    importMode: "update_only",
    includeCreates: false,
    includeUpdates: true,
    includeNoChange: true,
    createNewCategories: false,
    fieldLockPolicyVersion: "item-import-field-scope-v1",
  });

  assert.equal(input.importMode, "update_only");
  assert.equal(input.includeCreates, false);
  assert.equal(input.includeUpdates, true);
  assert.equal(input.includeNoChange, true);
  assert.equal(input.createNewCategories, false);
  assert.equal(input.fieldLockPolicyVersion, "item-import-field-scope-v1");
});

test("sanitizeImportProfileName rejects empty and overlong names", () => {
  assert.throws(() => sanitizeImportProfileName("  "), /Profile name is required/);
  assert.throws(
    () => sanitizeImportProfileName("x".repeat(121)),
    /120 characters or less/,
  );
});

test("sanitizeStringMapping keeps only non-empty string mappings", () => {
  assert.deepEqual(
    sanitizeStringMapping({
      "Main Store": " 11111111-1111-1111-1111-111111111111 ",
      Empty: "",
      Number: 123,
    }),
    {
      "Main Store": "11111111-1111-1111-1111-111111111111",
    },
  );
});

test("sanitizeCategoryMapping keeps supported category mapping choices", () => {
  assert.deepEqual(
    sanitizeCategoryMapping({
      Brakes: {
        action: "map",
        targetCategoryId: "cat_1",
        targetSubcategoryId: "sub_1",
        createSubcategory: false,
      },
      Tires: {
        action: "create",
        familyId: "family_1",
        createSubcategory: true,
      },
      Bad: {
        action: "rename",
      },
    }),
    {
      Brakes: {
        action: "map",
        targetCategoryId: "cat_1",
        targetSubcategoryId: "sub_1",
        createSubcategory: false,
      },
      Tires: {
        action: "create",
        familyId: "family_1",
        createSubcategory: true,
      },
    },
  );
});
