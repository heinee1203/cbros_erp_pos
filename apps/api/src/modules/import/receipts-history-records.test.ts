import assert from "node:assert/strict";
import test from "node:test";

import {
  buildReceiptHistoricalSaleInsert,
  buildReceiptLocationNameMap,
  buildReceiptMoneyFields,
  buildReceiptMovementFields,
  buildReceiptProductMap,
  buildReceiptProductName,
  normalizeReceiptQuantity,
  resolveReceiptLocation,
  resolveReceiptProduct,
  shouldBackfillReceiptMoney,
} from "./receipts-history-records";
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

test("receipt history lookup maps preserve lowercase SKU and location id behavior", () => {
  const products = buildReceiptProductMap([
    { id: "product_1", sku: "BP-1", name: "Brake Pad" },
    { id: "product_2", sku: null, name: "No SKU" },
  ]);
  const locations = buildReceiptLocationNameMap([{ id: "loc_1", name: "Main Branch" }]);

  assert.deepEqual(resolveReceiptProduct(receipt({ sku: "bp-1" }), products), {
    id: "product_1",
    name: "Brake Pad",
  });
  assert.equal(resolveReceiptProduct(receipt({ sku: "" }), products), null);
  assert.deepEqual(
    resolveReceiptLocation(receipt({ store: "Main" }), new Map([["main", "loc_1"]]), locations),
    { locationId: "loc_1", locationName: "Main Branch" },
  );
  assert.deepEqual(
    resolveReceiptLocation(receipt({ store: "Branch" }), new Map([["branch", "missing"]]), locations),
    { locationId: "missing", locationName: "Branch" },
  );
  assert.deepEqual(
    resolveReceiptLocation(receipt({ store: "" }), new Map(), locations),
    { locationId: null, locationName: "Unknown" },
  );
});

test("receipt history helpers preserve movement, quantity, product name, and money formatting", () => {
  assert.deepEqual(buildReceiptMovementFields(receipt()), { reasonType: "SALE", direction: "OUT" });
  assert.deepEqual(
    buildReceiptMovementFields(receipt({ receiptType: "Refund" })),
    { reasonType: "REFUND", direction: "IN" },
  );
  assert.equal(normalizeReceiptQuantity(receipt({ quantity: -1.6 })), 2);
  assert.equal(buildReceiptProductName(receipt({ item: "Rotor", variant: "Front" })), "Rotor (Front)");
  assert.equal(buildReceiptProductName(receipt({ item: "", variant: "" })), "Unknown");
  assert.equal(shouldBackfillReceiptMoney(receipt({ netSales: 0, costOfGoods: 0 })), false);
  assert.equal(shouldBackfillReceiptMoney(receipt({ netSales: -100, costOfGoods: 0 })), true);
  assert.deepEqual(
    buildReceiptMoneyFields(receipt({ quantity: 3, netSales: -100, costOfGoods: -30, discounts: -5, customerName: "" }), 3),
    {
      unitPrice: "33.33",
      netSales: "100.00",
      costAmount: "30.00",
      discountAmount: "5.00",
      customerName: null,
    },
  );
});

test("buildReceiptHistoricalSaleInsert preserves historical sales insert payload shape", () => {
  const movementDate = new Date("2026-01-01T01:15:00.000Z");
  const row = receipt({
    receiptNumber: "R-100",
    receiptType: "Refund",
    variant: "Front",
    quantity: -2,
    netSales: -500,
    costOfGoods: -200,
    discounts: -25,
    customerName: "",
  });

  assert.deepEqual(
    buildReceiptHistoricalSaleInsert({
      orgId: "org_1",
      row,
      movementDate,
      product: { id: "product_1", name: "Brake Pad" },
      location: { locationId: "loc_1", locationName: "Main" },
      qty: 2,
      batchId: "batch_1",
    }),
    {
      orgId: "org_1",
      productId: "product_1",
      sku: "BP-1",
      productName: "Brake Pad (Front)",
      locationId: "loc_1",
      locationName: "Main",
      employeeName: "Ana",
      reasonType: "REFUND",
      reasonReference: "R-100",
      quantity: 2,
      unitPrice: "250.00",
      netSales: "500.00",
      costAmount: "200.00",
      discountAmount: "25.00",
      customerName: null,
      direction: "IN",
      movementDate,
      importBatchId: "batch_1",
    },
  );
});
