import assert from "node:assert/strict";
import test from "node:test";

import { buildReceiptsPreviewResult } from "./receipts-preview-service";
import type { ReceiptPreviewStats } from "./receipts-preview";
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

test("buildReceiptsPreviewResult preserves receipt preview response shape", () => {
  const unmatchedSkus = Array.from({ length: 55 }, (_, index) => ({
    sku: `SKU-${index + 1}`,
    item: `Item ${index + 1}`,
    count: index + 1,
  }));
  const stats: ReceiptPreviewStats = {
    salesCount: 2,
    refundCount: 1,
    voidedCount: 1,
    receiptCount: 3,
    stores: ["Main", "Branch"],
    dateRange: { from: "2026-01-01", to: "2026-01-02" },
    uniqueSkus: ["BP-1"],
    unmatchedSkus,
    matchRate: "75%",
  };
  const locationMapping = [
    { csvName: "Main", apexLocationId: "loc_1", apexLocationName: "Main", autoMatched: true },
  ];

  const result = buildReceiptsPreviewResult({
    previewToken: "token_1",
    rows: [
      receipt({ receiptNumber: "R-1", variant: "Front" }),
      receipt({ receiptNumber: "R-2", receiptType: "Refund", sku: "BP-2" }),
    ],
    stats,
    locationMapping,
  });

  assert.equal(result.previewToken, "token_1");
  assert.equal(result.totalRows, 2);
  assert.equal(result.skuMatchRate, "75%");
  assert.equal(result.unmatchedSkus.length, 50);
  assert.deepEqual(result.locationMapping, locationMapping);
  assert.deepEqual(result.preview, [
    {
      date: "01/01/2026 09:15",
      receipt: "R-1",
      item: "Brake Pad (Front)",
      sku: "BP-1",
      qty: 2,
      net: 950,
      store: "Main",
      type: "Sale",
    },
    {
      date: "01/01/2026 09:15",
      receipt: "R-2",
      item: "Brake Pad",
      sku: "BP-2",
      qty: 2,
      net: 950,
      store: "Main",
      type: "Refund",
    },
  ]);
});
