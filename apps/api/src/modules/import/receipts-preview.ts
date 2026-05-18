import { parseReceiptDate, type ReceiptRow } from "./receipt-utils";
import type { LocationMapping } from "./types";

export interface ReceiptsPreviewResult {
  previewToken: string;
  totalRows: number;
  dateRange: { from: string; to: string };
  stores: string[];
  receiptCount: number;
  salesCount: number;
  refundCount: number;
  voidedCount: number;
  skuMatchRate: string;
  unmatchedSkus: { sku: string; item: string; count: number }[];
  locationMapping: LocationMapping[];
  preview: {
    date: string;
    receipt: string;
    item: string;
    sku: string;
    qty: number;
    net: number;
    store: string;
    type: string;
  }[];
}

export interface ReceiptPreviewStats {
  salesCount: number;
  refundCount: number;
  voidedCount: number;
  receiptCount: number;
  stores: string[];
  dateRange: { from: string; to: string };
  uniqueSkus: string[];
  unmatchedSkus: { sku: string; item: string; count: number }[];
  matchRate: string;
}

export interface ReceiptLocationRecord {
  id: string;
  name: string;
}

export function buildReceiptPreviewStats(
  rows: ReceiptRow[],
  matchedSkus: Set<string>,
): ReceiptPreviewStats {
  const salesRows = rows.filter((row) => row.receiptType === "Sale" && row.status !== "Voided");
  const refundRows = rows.filter((row) => row.receiptType === "Refund" && row.status !== "Voided");
  const voidedRows = rows.filter((row) => row.status === "Voided");
  const receiptNumbers = new Set(rows.map((row) => row.receiptNumber));
  const stores = [...new Set(rows.map((row) => row.store).filter(Boolean))];

  const dates = rows.map((row) => parseReceiptDate(row.date)).filter((date) => date !== null) as Date[];
  dates.sort((a, b) => a.getTime() - b.getTime());
  const dateRange = {
    from: dates.length > 0 ? dates[0].toISOString().split("T")[0] : "",
    to: dates.length > 0 ? dates[dates.length - 1].toISOString().split("T")[0] : "",
  };

  const uniqueSkus = [...new Set(rows.map((row) => row.sku).filter(Boolean))];
  const skuCounts = new Map<string, { item: string; count: number }>();
  for (const row of rows) {
    if (row.sku && !matchedSkus.has(row.sku)) {
      const entry = skuCounts.get(row.sku) || { item: row.item, count: 0 };
      entry.count++;
      skuCounts.set(row.sku, entry);
    }
  }

  const unmatchedSkus = [...skuCounts.entries()]
    .map(([sku, info]) => ({ sku, item: info.item, count: info.count }))
    .sort((a, b) => b.count - a.count);

  return {
    salesCount: salesRows.length,
    refundCount: refundRows.length,
    voidedCount: voidedRows.length,
    receiptCount: receiptNumbers.size,
    stores,
    dateRange,
    uniqueSkus,
    unmatchedSkus,
    matchRate: uniqueSkus.length > 0
      ? `${Math.round((matchedSkus.size / uniqueSkus.length) * 100)}%`
      : "N/A",
  };
}

export function buildReceiptPreviewRows(rows: ReceiptRow[]): ReceiptsPreviewResult["preview"] {
  return rows.slice(0, 50).map((row) => ({
    date: row.date,
    receipt: row.receiptNumber,
    item: row.variant ? `${row.item} (${row.variant})` : row.item,
    sku: row.sku,
    qty: row.quantity,
    net: row.netSales,
    store: row.store,
    type: row.receiptType,
  }));
}

export function buildReceiptLocationMapping(
  stores: string[],
  savedMappings: Map<string, string>,
  allLocations: ReceiptLocationRecord[],
): LocationMapping[] {
  return stores.map((store) => {
    const savedId = savedMappings.get(store.toLowerCase());
    if (savedId) {
      const loc = allLocations.find((location) => location.id === savedId);
      return {
        csvName: store,
        apexLocationId: savedId,
        apexLocationName: loc?.name || store,
        autoMatched: true,
        saved: true,
      };
    }

    const exact = allLocations.find((location) => location.name.toLowerCase() === store.toLowerCase());
    if (exact) {
      return {
        csvName: store,
        apexLocationId: exact.id,
        apexLocationName: exact.name,
        autoMatched: true,
        saved: false,
      };
    }

    return {
      csvName: store,
      apexLocationId: null,
      apexLocationName: null,
      autoMatched: false,
      saved: false,
    };
  });
}
