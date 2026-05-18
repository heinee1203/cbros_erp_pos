import assert from "node:assert/strict";
import test from "node:test";

import {
  clearReceiptsPreviewCacheForTests,
  deleteReceiptsPreview,
  getReceiptsPreview,
  storeReceiptsPreview,
} from "./receipts-preview-cache";
import type { ReceiptRow } from "./receipt-utils";

function receipt(overrides: Partial<ReceiptRow> = {}): ReceiptRow {
  return {
    date: "01/01/2026 09:15",
    receiptNumber: "R-1",
    receiptType: "Sale",
    category: "Brakes",
    sku: "BP-1",
    item: "Brake Pad",
    variant: "",
    quantity: 2,
    grossSales: 1000,
    discounts: 50,
    netSales: 950,
    costOfGoods: 600,
    taxes: 114,
    pos: "POS 1",
    store: "Main",
    cashierName: "Ana",
    customerName: "Chris",
    status: "Closed",
    ...overrides,
  };
}

test("receipts preview cache stores, deletes, and expires preview payloads", () => {
  const originalNow = Date.now;
  Date.now = () => 1_000;
  clearReceiptsPreviewCacheForTests();

  try {
    const rows = [receipt()];
    const mapping = [
      { csvName: "Main", apexLocationId: "loc_1", apexLocationName: "Main", autoMatched: true },
    ];

    storeReceiptsPreview("token_1", "org_1", rows, mapping);
    assert.deepEqual(getReceiptsPreview("token_1"), {
      orgId: "org_1",
      rows,
      locationMapping: mapping,
      expiresAt: 1_801_000,
    });

    deleteReceiptsPreview("token_1");
    assert.equal(getReceiptsPreview("token_1"), null);

    storeReceiptsPreview("token_2", "org_1", rows, mapping);
    Date.now = () => 1_801_000;
    assert.equal(getReceiptsPreview("token_2"), null);
  } finally {
    Date.now = originalNow;
    clearReceiptsPreviewCacheForTests();
  }
});
