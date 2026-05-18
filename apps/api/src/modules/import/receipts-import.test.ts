import assert from "node:assert/strict";
import test from "node:test";

import {
  buildReceiptLocationMap,
  shouldSkipReceiptRow,
} from "./receipts-execution";
import {
  buildReceiptLocationMapping,
  buildReceiptPreviewRows,
  buildReceiptPreviewStats,
} from "./receipts-preview";
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

test("buildReceiptPreviewStats preserves counts, date range, SKU match rate, and unmatched ordering", () => {
  const stats = buildReceiptPreviewStats(
    [
      receipt({ receiptNumber: "R-1", sku: "BP-1", store: "Main" }),
      receipt({
        receiptNumber: "R-2",
        receiptType: "Refund",
        sku: "BP-2",
        item: "Rotor",
        store: "Branch",
        date: "02/01/2026 10:00",
      }),
      receipt({
        receiptNumber: "R-3",
        status: "Voided",
        sku: "BP-2",
        item: "Rotor",
        store: "Branch",
        date: "03/01/2026 10:00",
      }),
    ],
    new Set(["BP-1"]),
  );

  assert.equal(stats.salesCount, 1);
  assert.equal(stats.refundCount, 1);
  assert.equal(stats.voidedCount, 1);
  assert.equal(stats.receiptCount, 3);
  assert.deepEqual(stats.stores, ["Main", "Branch"]);
  assert.deepEqual(stats.dateRange, { from: "2026-01-01", to: "2026-01-03" });
  assert.deepEqual(stats.uniqueSkus, ["BP-1", "BP-2"]);
  assert.equal(stats.matchRate, "50%");
  assert.deepEqual(stats.unmatchedSkus, [{ sku: "BP-2", item: "Rotor", count: 2 }]);
});

test("buildReceiptLocationMap applies explicit overrides before preview fallbacks", () => {
  const locMap = buildReceiptLocationMap(
    { Main: "override_main" },
    [
      { csvName: "Main", apexLocationId: "preview_main", apexLocationName: "Main", autoMatched: true },
      { csvName: "Branch", apexLocationId: "branch_1", apexLocationName: "Branch", autoMatched: true },
      { csvName: "Unmapped", apexLocationId: null, apexLocationName: null, autoMatched: false },
    ],
  );

  assert.equal(locMap.get("main"), "override_main");
  assert.equal(locMap.get("branch"), "branch_1");
  assert.equal(locMap.has("unmapped"), false);
});

test("buildReceiptLocationMapping preserves saved, exact, and unmatched location behavior", () => {
  assert.deepEqual(
    buildReceiptLocationMapping(
      ["Main", "Branch", "Unknown"],
      new Map([["main", "loc_saved"]]),
      [
        { id: "loc_saved", name: "Saved Main" },
        { id: "loc_branch", name: "Branch" },
      ],
    ),
    [
      {
        csvName: "Main",
        apexLocationId: "loc_saved",
        apexLocationName: "Saved Main",
        autoMatched: true,
        saved: true,
      },
      {
        csvName: "Branch",
        apexLocationId: "loc_branch",
        apexLocationName: "Branch",
        autoMatched: true,
        saved: false,
      },
      {
        csvName: "Unknown",
        apexLocationId: null,
        apexLocationName: null,
        autoMatched: false,
        saved: false,
      },
    ],
  );
});

test("shouldSkipReceiptRow preserves default skip options and explicit opt-outs", () => {
  assert.equal(shouldSkipReceiptRow(receipt({ status: "Voided" }), {}).skip, true);
  assert.equal(shouldSkipReceiptRow(receipt({ status: "Voided" }), { skipVoided: false }).skip, false);

  assert.equal(shouldSkipReceiptRow(receipt({ sku: "CUSTOMER COUNT" }), {}).skip, true);
  assert.equal(
    shouldSkipReceiptRow(receipt({ item: "DAILY CUSTOMER COUNT" }), { skipCustomerCount: false }).skip,
    false,
  );

  assert.equal(shouldSkipReceiptRow(receipt({ quantity: 0, netSales: 0 }), {}).skip, true);
  assert.equal(shouldSkipReceiptRow(receipt({ quantity: 0, netSales: 0 }), { skipZeroQty: false }).skip, false);
});

test("buildReceiptPreviewRows formats variant display names and limits to fifty rows", () => {
  const rows = Array.from({ length: 55 }, (_, index) =>
    receipt({
      receiptNumber: `R-${index + 1}`,
      item: "Brake Pad",
      variant: index === 0 ? "Front" : "",
    }),
  );

  const preview = buildReceiptPreviewRows(rows);

  assert.equal(preview.length, 50);
  assert.equal(preview[0].item, "Brake Pad (Front)");
  assert.equal(preview[1].item, "Brake Pad");
  assert.equal(preview[49].receipt, "R-50");
});
