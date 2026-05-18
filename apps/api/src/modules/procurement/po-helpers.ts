import type { CreatePOInput } from "@apex/types";
import { PurchaseOrderStatus } from "@apex/types";

export interface ProductUomSnapshot {
  sellingUnit: string;
  purchaseUnit: string | null;
  conversionFactor: string;
}

export interface BuildPurchaseOrderLineValueInput {
  line: CreatePOInput["lines"][number];
  uom: ProductUomSnapshot;
  purchaseOrderId: string;
  orgId: string;
}

export interface ProcurementReceiptResult {
  poLineId: string;
  productId: string;
  acceptedQty: number;
  rejectedQty: number;
  unitCost: string;
  receiptEventId: string;
  conversionFactor: number;
}

export interface ReceivedPurchaseOrderLineSnapshot {
  ordered_qty: number;
  received_accepted_qty: number;
  rejected_qty: number;
}

export function buildPurchaseOrderLineValue({
  line,
  uom,
  purchaseOrderId,
  orgId,
}: BuildPurchaseOrderLineValueInput) {
  return {
    purchaseOrderId,
    orgId,
    productId: line.productId,
    orderedQty: line.orderedQty,
    unitCost: line.unitCost,
    listPrice: line.listPrice ?? null,
    discountChain: line.discountChain ?? null,
    unit: line.unit ?? uom.purchaseUnit ?? uom.sellingUnit,
    poConversionFactor: line.conversionFactor
      ? String(line.conversionFactor)
      : uom.conversionFactor,
  };
}

export function summarizeReceiptResults(results: ProcurementReceiptResult[]) {
  return results.reduce(
    (summary, result) => ({
      totalAccepted: summary.totalAccepted + result.acceptedQty,
      totalRejected: summary.totalRejected + result.rejectedQty,
    }),
    { totalAccepted: 0, totalRejected: 0 },
  );
}

export function buildUniqueInventoryReceiptKeys(
  results: ProcurementReceiptResult[],
  destinationLocationId: string,
) {
  const inventoryKeys = results
    .map((result) => ({
      productId: result.productId,
      locationId: destinationLocationId,
    }))
    .sort((a, b) => {
      const locCmp = a.locationId.localeCompare(b.locationId);
      if (locCmp !== 0) return locCmp;
      return a.productId.localeCompare(b.productId);
    });

  return inventoryKeys.filter(
    (item, idx, arr) =>
      idx === 0 ||
      item.productId !== arr[idx - 1].productId ||
      item.locationId !== arr[idx - 1].locationId,
  );
}

export function calculateInventoryQuantity(
  acceptedQty: number,
  conversionFactor: number,
) {
  const inventoryQty = acceptedQty * conversionFactor;
  if (!Number.isInteger(inventoryQty)) {
    throw new Error(
      `UOM conversion produces fractional inventory qty (${acceptedQty} × ${conversionFactor} = ${inventoryQty}). ` +
        "Conversion factor must produce whole numbers.",
    );
  }
  return inventoryQty;
}

export function calculateCostPerSellingUnit(
  unitCost: string,
  conversionFactor: number,
) {
  return conversionFactor > 1
    ? String((parseFloat(unitCost) / conversionFactor).toFixed(2))
    : unitCost;
}

export function buildProductCostMap(results: ProcurementReceiptResult[]) {
  const productCostMap = new Map<string, string>();
  for (const result of results) {
    productCostMap.set(
      result.productId,
      calculateCostPerSellingUnit(result.unitCost, result.conversionFactor),
    );
  }
  return productCostMap;
}

export function applyReceiptResultToPoLine(
  poLine: ReceivedPurchaseOrderLineSnapshot,
  result: ProcurementReceiptResult,
) {
  return {
    newAccepted: poLine.received_accepted_qty + result.acceptedQty,
    newRejected: poLine.rejected_qty + result.rejectedQty,
  };
}

export function resolveReceivedPurchaseOrderStatus(
  lines: ReceivedPurchaseOrderLineSnapshot[],
) {
  const isFullyReceived = lines.every(
    (line) =>
      line.received_accepted_qty + line.rejected_qty >= line.ordered_qty,
  );

  return {
    isFullyReceived,
    status: isFullyReceived
      ? PurchaseOrderStatus.FULLY_RECEIVED
      : PurchaseOrderStatus.PARTIALLY_RECEIVED,
  };
}
