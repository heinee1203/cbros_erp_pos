import assert from "node:assert/strict";
import test from "node:test";

import { buildReceiptRowWriteDecision } from "./receipts-row-decision";
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

function context() {
  return {
    options: {},
    skuToProduct: new Map([["bp-1", { id: "product_1", name: "Brake Pad" }]]),
    locationByCsvName: new Map([["main", "loc_1"]]),
    locationNameById: new Map([["loc_1", "Main Branch"]]),
  };
}

test("buildReceiptRowWriteDecision preserves receipt skip behavior", () => {
  assert.deepEqual(buildReceiptRowWriteDecision(receipt({ status: "Voided" }), context()), {
    action: "skip",
  });
  assert.equal(
    buildReceiptRowWriteDecision(receipt({ status: "Voided" }), {
      ...context(),
      options: { skipVoided: false },
    }).action,
    "write",
  );
});

test("buildReceiptRowWriteDecision reports invalid dates before resolving write fields", () => {
  assert.deepEqual(buildReceiptRowWriteDecision(receipt({ date: "bad date" }), context()), {
    action: "invalid_date",
    message: "Invalid date: bad date",
  });
});

test("buildReceiptRowWriteDecision skips normalized zero quantity rows", () => {
  assert.deepEqual(
    buildReceiptRowWriteDecision(receipt({ quantity: 0.2, netSales: 10 }), context()),
    { action: "zero_quantity" },
  );
});

test("buildReceiptRowWriteDecision builds write context for valid rows", () => {
  const decision = buildReceiptRowWriteDecision(receipt({ quantity: -1.6 }), context());

  assert.equal(decision.action, "write");
  if (decision.action !== "write") return;

  assert.equal(decision.movementDate.toISOString(), "2026-01-01T01:15:00.000Z");
  assert.deepEqual(decision.product, { id: "product_1", name: "Brake Pad" });
  assert.deepEqual(decision.location, { locationId: "loc_1", locationName: "Main Branch" });
  assert.equal(decision.qty, 2);
});
