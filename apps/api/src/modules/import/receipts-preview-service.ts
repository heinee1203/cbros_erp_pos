import crypto from "node:crypto";
import { cleanExpiredItemPreviews } from "./item-import-cache";
import {
  loadMatchedReceiptSkus,
  loadReceiptPreviewLocationMapping,
} from "./receipts-data-loaders";
import {
  buildReceiptPreviewRows,
  buildReceiptPreviewStats,
  type ReceiptPreviewStats,
  type ReceiptsPreviewResult,
} from "./receipts-preview";
import { storeReceiptsPreview } from "./receipts-preview-cache";
import { parseReceiptRows, type ReceiptRow } from "./receipt-utils";
import type { LocationMapping } from "./types";

export interface BuildReceiptsPreviewResultOptions {
  previewToken: string;
  rows: ReceiptRow[];
  stats: ReceiptPreviewStats;
  locationMapping: LocationMapping[];
}

export function buildReceiptsPreviewResult({
  previewToken,
  rows,
  stats,
  locationMapping,
}: BuildReceiptsPreviewResultOptions): ReceiptsPreviewResult {
  return {
    previewToken,
    totalRows: rows.length,
    dateRange: stats.dateRange,
    stores: stats.stores,
    receiptCount: stats.receiptCount,
    salesCount: stats.salesCount,
    refundCount: stats.refundCount,
    voidedCount: stats.voidedCount,
    skuMatchRate: stats.matchRate,
    unmatchedSkus: stats.unmatchedSkus.slice(0, 50),
    locationMapping,
    preview: buildReceiptPreviewRows(rows),
  };
}

export async function parseReceiptsCSV(
  csvText: string,
  orgId: string,
): Promise<ReceiptsPreviewResult> {
  cleanExpiredItemPreviews();

  const parsedRows = parseReceiptRows(csvText);
  const matchedSkus = await loadMatchedReceiptSkus(orgId, parsedRows);
  const stats = buildReceiptPreviewStats(parsedRows, matchedSkus);
  const locationMapping = await loadReceiptPreviewLocationMapping(orgId, stats.stores);

  const token = crypto.randomUUID();
  storeReceiptsPreview(token, orgId, parsedRows, locationMapping);

  return buildReceiptsPreviewResult({
    previewToken: token,
    rows: parsedRows,
    stats,
    locationMapping,
  });
}
