import assert from "node:assert/strict";
import test from "node:test";

import {
  buildMatchedReceiptSkus,
  buildSavedReceiptLocationMappings,
  collectUniqueReceiptSkus,
} from "./receipts-data-loaders";
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

test("collectUniqueReceiptSkus keeps first-seen SKU order and skips blanks", () => {
  assert.deepEqual(
    collectUniqueReceiptSkus([
      receipt({ sku: "BP-1" }),
      receipt({ sku: "" }),
      receipt({ sku: "BP-2" }),
      receipt({ sku: "BP-1" }),
    ]),
    ["BP-1", "BP-2"],
  );
});

test("buildMatchedReceiptSkus matches case-insensitively while preserving CSV SKU casing", () => {
  assert.deepEqual(
    [...buildMatchedReceiptSkus(["bp-1", "BP-2", "BP-3"], [{ sku: "BP-1" }, { sku: "bp-2" }])],
    ["bp-1", "BP-2"],
  );
});

test("buildSavedReceiptLocationMappings lowercases CSV names", () => {
  assert.deepEqual(
    buildSavedReceiptLocationMappings([
      { csv_location_name: "Main", apex_location_id: "loc_1" },
      { csv_location_name: "BRANCH", apex_location_id: "loc_2" },
    ]),
    new Map([
      ["main", "loc_1"],
      ["branch", "loc_2"],
    ]),
  );
});
