import assert from "node:assert/strict";
import test from "node:test";

import {
  cleanExpiredItemPreviews,
  clearItemImportCachesForTests,
  deleteItemPreview,
  getImportProgress,
  getItemPreview,
  setImportProgress,
  storeItemPreview,
} from "./item-import-cache";
import type { ParsedRow } from "./types";

function row(overrides: Partial<ParsedRow> = {}): ParsedRow {
  return {
    rowIndex: 1,
    name: "Brake Pad",
    sku: "BP-1",
    barcode: "",
    costPrice: "300.00",
    unitPrice: "500.00",
    isVariablePrice: false,
    categoryName: "",
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

test("storeItemPreview keeps preview payloads until the TTL expires", () => {
  clearItemImportCachesForTests();

  storeItemPreview({
    token: "preview_1",
    data: [row({ sku: "BP-1" })],
    orgId: "org_1",
    locationMapping: [],
    categoryMapping: [],
    now: () => 1_000,
    ttlMs: 100,
  });

  assert.equal(getItemPreview("preview_1")?.orgId, "org_1");
  assert.equal(cleanExpiredItemPreviews(1_050), 0);
  assert.equal(getItemPreview("preview_1")?.data[0].sku, "BP-1");
  assert.equal(cleanExpiredItemPreviews(1_101), 1);
  assert.equal(getItemPreview("preview_1"), null);
});

test("deleteItemPreview removes one preview without clearing progress", () => {
  clearItemImportCachesForTests();

  storeItemPreview({
    token: "preview_1",
    data: [row()],
    orgId: "org_1",
    locationMapping: [],
    categoryMapping: [],
  });
  setImportProgress("preview_1", {
    status: "running",
    processed: 0,
    total: 1,
    percent: 0,
    created: 0,
    updated: 0,
    noChange: 0,
    errors: 0,
  });

  deleteItemPreview("preview_1");

  assert.equal(getItemPreview("preview_1"), null);
  assert.equal(getImportProgress("preview_1")?.status, "running");
});

test("setImportProgress and getImportProgress preserve progress payloads", () => {
  clearItemImportCachesForTests();

  setImportProgress("token_1", {
    status: "completed",
    processed: 5,
    total: 5,
    percent: 100,
    created: 1,
    updated: 2,
    noChange: 2,
    errors: 0,
  });

  assert.deepEqual(getImportProgress("token_1"), {
    status: "completed",
    processed: 5,
    total: 5,
    percent: 100,
    created: 1,
    updated: 2,
    noChange: 2,
    errors: 0,
  });
});
