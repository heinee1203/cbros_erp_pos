import assert from "node:assert/strict";
import test from "node:test";

import { PurchaseOrderStatus } from "@apex/types";

import {
  applyReceiptResultToPoLine,
  buildProductCostMap,
  buildPurchaseOrderLineValue,
  buildUniqueInventoryReceiptKeys,
  calculateCostPerSellingUnit,
  calculateInventoryQuantity,
  resolveReceivedPurchaseOrderStatus,
  summarizeReceiptResults,
} from "./po-helpers";

test("buildPurchaseOrderLineValue preserves UOM snapshot fallbacks", () => {
  assert.deepEqual(
    buildPurchaseOrderLineValue({
      purchaseOrderId: "po-1",
      orgId: "org-1",
      line: {
        productId: "product-1",
        orderedQty: 3,
        unitCost: "100.00",
        listPrice: undefined,
        discountChain: undefined,
        unit: undefined,
        conversionFactor: undefined,
      },
      uom: {
        sellingUnit: "piece",
        purchaseUnit: "case",
        conversionFactor: "12",
      },
    }),
    {
      purchaseOrderId: "po-1",
      orgId: "org-1",
      productId: "product-1",
      orderedQty: 3,
      unitCost: "100.00",
      listPrice: null,
      discountChain: null,
      unit: "case",
      poConversionFactor: "12",
    },
  );
});

test("receipt helpers preserve totals, key sorting, cost conversion, and status behavior", () => {
  const results = [
    {
      poLineId: "line-2",
      productId: "product-b",
      acceptedQty: 2,
      rejectedQty: 1,
      unitCost: "24.00",
      receiptEventId: "event-2",
      conversionFactor: 12,
    },
    {
      poLineId: "line-1",
      productId: "product-a",
      acceptedQty: 4,
      rejectedQty: 0,
      unitCost: "5.50",
      receiptEventId: "event-1",
      conversionFactor: 1,
    },
    {
      poLineId: "line-3",
      productId: "product-b",
      acceptedQty: 1,
      rejectedQty: 0,
      unitCost: "36.00",
      receiptEventId: "event-3",
      conversionFactor: 12,
    },
  ];

  assert.deepEqual(summarizeReceiptResults(results), {
    totalAccepted: 7,
    totalRejected: 1,
  });
  assert.deepEqual(buildUniqueInventoryReceiptKeys(results, "loc-1"), [
    { productId: "product-a", locationId: "loc-1" },
    { productId: "product-b", locationId: "loc-1" },
  ]);
  assert.equal(calculateInventoryQuantity(2, 12), 24);
  assert.equal(calculateCostPerSellingUnit("24.00", 12), "2.00");
  assert.equal(calculateCostPerSellingUnit("5.50", 1), "5.50");
  assert.equal(buildProductCostMap(results).get("product-b"), "3.00");
  assert.deepEqual(
    applyReceiptResultToPoLine(
      {
        ordered_qty: 10,
        received_accepted_qty: 3,
        rejected_qty: 1,
      },
      results[0],
    ),
    {
      newAccepted: 5,
      newRejected: 2,
    },
  );
  assert.deepEqual(
    resolveReceivedPurchaseOrderStatus([
      {
        ordered_qty: 5,
        received_accepted_qty: 5,
        rejected_qty: 0,
      },
      {
        ordered_qty: 3,
        received_accepted_qty: 2,
        rejected_qty: 1,
      },
    ]),
    {
      isFullyReceived: true,
      status: PurchaseOrderStatus.FULLY_RECEIVED,
    },
  );
  assert.equal(
    resolveReceivedPurchaseOrderStatus([
      {
        ordered_qty: 5,
        received_accepted_qty: 4,
        rejected_qty: 0,
      },
    ]).status,
    PurchaseOrderStatus.PARTIALLY_RECEIVED,
  );
});

test("calculateInventoryQuantity preserves fractional conversion guard", () => {
  assert.throws(
    () => calculateInventoryQuantity(1, 1.5),
    /UOM conversion produces fractional inventory qty/,
  );
});
