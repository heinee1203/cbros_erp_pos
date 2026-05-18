import assert from "node:assert/strict";
import test from "node:test";

import {
  applyLocationMappingOverrides,
  applyProtectedImportMetadataBlock,
  applyUpdateOnlyChangeScope,
  createCompletedProgress,
  createInitialProgress,
  createRunningProgress,
  filterRowsForImportMode,
  filterUpdateOnlyChanges,
  hasUpdateOnlyQuantityWrite,
  isProtectedUpdateImportMode,
  resolveImportMode,
  shouldSkipForImportMode,
} from "./execution-utils";

const rows = [
  { action: "CREATE" as const, errors: [] },
  { action: "UPDATE" as const, errors: [] },
  { action: "NO_CHANGE" as const, errors: [] },
  { action: "NO_CHANGE" as const, errors: ["bad row"] },
];

test("resolveImportMode defaults to smart_sync", () => {
  assert.equal(resolveImportMode(undefined), "smart_sync");
  assert.equal(resolveImportMode("inventory_sync"), "inventory_sync");
});

test("filterRowsForImportMode keeps mode-relevant rows plus validation errors", () => {
  assert.deepEqual(filterRowsForImportMode(rows, "smart_sync"), rows);
  assert.deepEqual(filterRowsForImportMode(rows, "inventory_sync"), rows);
  assert.deepEqual(filterRowsForImportMode(rows, "create_only"), [rows[0], rows[3]]);
  assert.deepEqual(filterRowsForImportMode(rows, "update_only"), [rows[1], rows[3]]);
});

test("applyProtectedImportMetadataBlock strips metadata for protected update modes", () => {
  const options = {
    previewToken: "token",
    categoryMapping: {
      Brakes: { action: "map" as const, targetCategoryId: "cat_1" },
    },
    createNewCategories: true,
  };
  const parsedRows = [
    { categoryName: "Brakes", brandName: "Brembo" },
    { categoryName: "Tires", brandName: "Delium" },
  ];

  applyProtectedImportMetadataBlock("update_only", parsedRows, options);

  assert.deepEqual(parsedRows, [
    { categoryName: "", brandName: "" },
    { categoryName: "", brandName: "" },
  ]);
  assert.equal(options.categoryMapping, undefined);
  assert.equal(options.createNewCategories, false);
});

test("applyProtectedImportMetadataBlock is a no-op outside protected modes", () => {
  const options = { previewToken: "token", createNewCategories: true };
  const parsedRows = [{ categoryName: "Brakes", brandName: "Brembo" }];

  applyProtectedImportMetadataBlock("smart_sync", parsedRows, options);

  assert.deepEqual(parsedRows, [{ categoryName: "Brakes", brandName: "Brembo" }]);
  assert.equal(options.createNewCategories, true);
});

test("protected update mode and change scope keep only update-only fields", () => {
  assert.equal(isProtectedUpdateImportMode("inventory_sync"), true);
  assert.equal(isProtectedUpdateImportMode("update_only"), true);
  assert.equal(isProtectedUpdateImportMode("smart_sync"), false);

  assert.deepEqual(
    filterUpdateOnlyChanges([
      "name: old -> new",
      "unitPrice: 1.00 -> 2.00",
      "costPrice: 1.00 -> 2.00",
      "barcode: old -> new",
      "category: old -> new",
      "qty@Main: 1 -> 2",
    ]),
    ["unitPrice: 1.00 -> 2.00", "barcode: old -> new", "qty@Main: 1 -> 2"],
  );

  const parsedRows = [
    { action: "UPDATE" as const, changes: ["category: old -> new"], locations: [] },
    { action: "UPDATE" as const, changes: ["qty@Main: 1 -> 2", "name: old -> new"], locations: [] },
    {
      action: "UPDATE" as const,
      changes: ["category: old -> new"],
      locations: [{ apexLocationId: "loc_1", stockLevelWasPresent: true }],
    },
  ];

  applyUpdateOnlyChangeScope(parsedRows as any);

  assert.deepEqual(parsedRows, [
    { action: "NO_CHANGE", changes: [], locations: [] },
    { action: "UPDATE", changes: ["qty@Main: 1 -> 2"], locations: [] },
    {
      action: "UPDATE",
      changes: [],
      locations: [{ apexLocationId: "loc_1", stockLevelWasPresent: true }],
    },
  ]);
  assert.equal(hasUpdateOnlyQuantityWrite(parsedRows[2] as any), true);
});

test("applyLocationMappingOverrides updates mapping rows and parsed row locations", () => {
  const locationMapping = [
    { csvName: "Main", apexLocationId: "old_main", apexLocationName: "Main", autoMatched: true },
    { csvName: "Branch", apexLocationId: null, apexLocationName: null, autoMatched: false },
  ];
  const parsedRows = [
    {
      locations: [
        { csvLocationName: "Main", apexLocationId: "old_main" },
        { csvLocationName: "Branch", apexLocationId: null },
      ],
    },
  ];

  applyLocationMappingOverrides({ Main: "new_main", Branch: "branch_1" }, locationMapping, parsedRows);

  assert.deepEqual(locationMapping, [
    { csvName: "Main", apexLocationId: "new_main", apexLocationName: "Main", autoMatched: false },
    { csvName: "Branch", apexLocationId: "branch_1", apexLocationName: null, autoMatched: false },
  ]);
  assert.deepEqual(parsedRows[0].locations, [
    { csvLocationName: "Main", apexLocationId: "new_main" },
    { csvLocationName: "Branch", apexLocationId: "branch_1" },
  ]);
});

test("shouldSkipForImportMode mirrors defensive create/update mode guards", () => {
  assert.equal(shouldSkipForImportMode("create_only", "UPDATE"), true);
  assert.equal(shouldSkipForImportMode("update_only", "CREATE"), true);
  assert.equal(shouldSkipForImportMode("create_only", "CREATE"), false);
  assert.equal(shouldSkipForImportMode("smart_sync", "UPDATE"), false);
});

test("progress builders preserve import progress payload shapes", () => {
  assert.deepEqual(createInitialProgress(20), {
    status: "running",
    processed: 0,
    total: 20,
    percent: 0,
    created: 0,
    updated: 0,
    noChange: 0,
    errors: 0,
  });

  assert.deepEqual(createRunningProgress(5, 20, { created: 1, updated: 2, noChange: 3, errors: 4 }), {
    status: "running",
    processed: 5,
    total: 20,
    percent: 25,
    created: 1,
    updated: 2,
    noChange: 3,
    errors: 4,
  });

  const errorLog = [{ row: 7, message: "Bad SKU" }];
  assert.deepEqual(createCompletedProgress(20, { created: 1, updated: 2, noChange: 3, errors: 1 }, errorLog), {
    status: "completed",
    processed: 20,
    total: 20,
    percent: 100,
    created: 1,
    updated: 2,
    noChange: 3,
    errors: 1,
    errorLog,
  });
});
