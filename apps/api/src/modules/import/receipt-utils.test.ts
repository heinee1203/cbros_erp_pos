import assert from "node:assert/strict";
import test from "node:test";

import { parseReceiptDate, parseReceiptRows } from "./receipt-utils";

test("parseReceiptDate parses Loyverse receipt dates in Manila time", () => {
  assert.equal(parseReceiptDate("31/12/2025 14:05")?.toISOString(), "2025-12-31T06:05:00.000Z");
  assert.equal(parseReceiptDate("31/12/2025")?.toISOString(), "2025-12-30T16:00:00.000Z");
  assert.equal(parseReceiptDate("not-a-date"), null);
  assert.equal(parseReceiptDate("31/12"), null);
});

test("parseReceiptRows preserves receipt CSV parsing behavior", () => {
  const csv = [
    "\uFEFFDate,Receipt number,Receipt type,Category,SKU,Item name,Variant,Quantity,Gross sales,Discounts,Net sales,Cost of goods,Taxes,POS,Store,Cashier name,Customer name,Status",
    '01/01/2026 09:15,R-1,Sale,Brakes,BP-1,"Brake, Pad",Front,2,1000,50,950,600,114,POS 1,Main,Ana,Chris,Closed',
    ",R-2,Sale,Brakes,BP-2,Skipped,,1,1,1,1,1,1,POS 1,Main,Ana,Chris,Closed",
    '01/01/2026 10:00,R-3,Refund,Brakes,BP-3,Brake Pad,,not-number,,,-25,,0,POS 1,Branch,Ana,,Voided',
  ].join("\n");

  assert.deepEqual(parseReceiptRows(csv), [
    {
      date: "01/01/2026 09:15",
      receiptNumber: "R-1",
      receiptType: "Sale",
      category: "Brakes",
      sku: "BP-1",
      item: "Brake, Pad",
      variant: "Front",
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
    },
    {
      date: "01/01/2026 10:00",
      receiptNumber: "R-3",
      receiptType: "Refund",
      category: "Brakes",
      sku: "BP-3",
      item: "Brake Pad",
      variant: "",
      quantity: 0,
      grossSales: 0,
      discounts: 0,
      netSales: -25,
      costOfGoods: 0,
      taxes: 0,
      pos: "POS 1",
      store: "Branch",
      cashierName: "Ana",
      customerName: "",
      status: "Voided",
    },
  ]);
});

test("parseReceiptRows keeps existing validation errors for empty and invalid files", () => {
  assert.throws(() => parseReceiptRows("Date,Receipt number"), /CSV file is empty/);
  assert.throws(
    () => parseReceiptRows("SKU,Quantity,Net sales,Store,Status\nA,1,10,Main,Closed"),
    /Missing required columns: Date, Receipt number, Receipt type/,
  );
});
