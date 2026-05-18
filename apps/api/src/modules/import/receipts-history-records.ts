import type { ReceiptImportRowProduct } from "./receipts-execution";
import type { ReceiptRow } from "./receipt-utils";

export interface ReceiptProductLookupRow {
  id: string;
  sku: string | null;
  name: string;
}

export interface ReceiptLocationLookupRow {
  id: string;
  name: string;
}

export interface ReceiptLocationDetails {
  locationId: string | null;
  locationName: string;
}

export type ReceiptHistoryReasonType = "SALE" | "REFUND";
export type ReceiptHistoryDirection = "IN" | "OUT";

export interface ReceiptMovementFields {
  reasonType: ReceiptHistoryReasonType;
  direction: ReceiptHistoryDirection;
}

export interface ReceiptMoneyFields {
  unitPrice: string;
  netSales: string;
  costAmount: string;
  discountAmount: string;
  customerName: string | null;
}

export interface ReceiptHistoricalSaleInsert extends ReceiptMoneyFields, ReceiptMovementFields {
  orgId: string;
  productId: string | null;
  sku: string;
  productName: string;
  locationId: string | null;
  locationName: string;
  employeeName: string | null;
  reasonReference: string;
  quantity: number;
  movementDate: Date;
  importBatchId: string;
}

export function buildReceiptProductMap(
  productRows: ReceiptProductLookupRow[],
): Map<string, ReceiptImportRowProduct> {
  const skuToProduct = new Map<string, ReceiptImportRowProduct>();
  for (const product of productRows) {
    if (product.sku) {
      skuToProduct.set(product.sku.toLowerCase(), { id: product.id, name: product.name });
    }
  }
  return skuToProduct;
}

export function buildReceiptLocationNameMap(
  locationRows: ReceiptLocationLookupRow[],
): Map<string, string> {
  return new Map(locationRows.map((location) => [location.id, location.name]));
}

export function resolveReceiptProduct(
  row: Pick<ReceiptRow, "sku">,
  skuToProduct: Map<string, ReceiptImportRowProduct>,
): ReceiptImportRowProduct | null {
  return row.sku ? skuToProduct.get(row.sku.toLowerCase()) || null : null;
}

export function resolveReceiptLocation(
  row: Pick<ReceiptRow, "store">,
  locationByCsvName: Map<string, string>,
  locationNameById: Map<string, string>,
): ReceiptLocationDetails {
  const locationId = row.store ? locationByCsvName.get(row.store.toLowerCase()) || null : null;
  const locationName = locationId ? (locationNameById.get(locationId) || row.store) : (row.store || "Unknown");

  return {
    locationId,
    locationName,
  };
}

export function buildReceiptMovementFields(
  row: Pick<ReceiptRow, "receiptType">,
): ReceiptMovementFields {
  const isRefund = row.receiptType === "Refund";
  return {
    reasonType: isRefund ? "REFUND" : "SALE",
    direction: isRefund ? "IN" : "OUT",
  };
}

export function normalizeReceiptQuantity(row: Pick<ReceiptRow, "quantity">): number {
  return Math.abs(Math.round(row.quantity));
}

export function buildReceiptProductName(row: Pick<ReceiptRow, "item" | "variant">): string {
  return row.variant ? `${row.item} (${row.variant})` : row.item || "Unknown";
}

export function shouldBackfillReceiptMoney(row: Pick<ReceiptRow, "netSales" | "costOfGoods">): boolean {
  return row.netSales !== 0 || row.costOfGoods !== 0;
}

export function buildReceiptMoneyFields(
  row: Pick<ReceiptRow, "netSales" | "costOfGoods" | "discounts" | "customerName">,
  qty: number,
): ReceiptMoneyFields {
  const unitPrice = qty > 0 ? Math.abs(row.netSales / qty) : 0;
  return {
    unitPrice: unitPrice.toFixed(2),
    netSales: Math.abs(row.netSales).toFixed(2),
    costAmount: Math.abs(row.costOfGoods || 0).toFixed(2),
    discountAmount: Math.abs(row.discounts || 0).toFixed(2),
    customerName: row.customerName || null,
  };
}

export function buildReceiptHistoricalSaleInsert({
  orgId,
  row,
  movementDate,
  product,
  location,
  qty,
  batchId,
}: {
  orgId: string;
  row: ReceiptRow;
  movementDate: Date;
  product: ReceiptImportRowProduct | null;
  location: ReceiptLocationDetails;
  qty: number;
  batchId: string;
}): ReceiptHistoricalSaleInsert {
  return {
    orgId,
    productId: product?.id || null,
    sku: row.sku || "",
    productName: buildReceiptProductName(row),
    locationId: location.locationId,
    locationName: location.locationName,
    employeeName: row.cashierName || null,
    ...buildReceiptMovementFields(row),
    reasonReference: row.receiptNumber,
    quantity: qty,
    ...buildReceiptMoneyFields(row, qty),
    movementDate,
    importBatchId: batchId,
  };
}
