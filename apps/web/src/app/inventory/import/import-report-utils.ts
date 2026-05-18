import { downloadCSV } from "@/lib/csv-export";
import {
  filterPreviewChangesForMode,
  getModeScopedUpdateRows,
  hasUpdateOnlyAllowedChange,
} from "./import-mode-policy";
import type { ImportMode, PreviewResponse, PreviewSummaryRow, ProgressResponse } from "./types";

const REPORT_HEADERS = [
  "Row",
  "SKU",
  "Name",
  "Action",
  "Reason",
  "Changed Fields",
  "Locked Fields",
];

type ReportRow = {
  row: number | string;
  sku?: string | null;
  name?: string | null;
  action: string;
  reason: string;
  changedFields?: string[];
  lockedFields?: string[];
};

type PreviewError = PreviewResponse["errors"][number] & { row?: number };

export function getPreviewErrorReportCount(preview: PreviewResponse): number {
  return preview.errors.length;
}

export function getPreviewSkippedReportCount(preview: PreviewResponse): number {
  return buildSkippedRows(preview).length;
}

export function getPreviewNoChangeReportCount(
  preview: PreviewResponse,
  importMode: ImportMode,
): number {
  return buildNoChangeRows(preview, importMode).length;
}

export function downloadPreviewErrorReport(
  preview: PreviewResponse,
  importMode: ImportMode,
): void {
  const lookup = buildPreviewLookup(preview);
  const rows = preview.errors.map((error) => {
    const rowNumber = getErrorRowNumber(error);
    const previewRow = lookup.get(rowNumber);
    return toReportRow({
      row: rowNumber,
      sku: previewRow?.sku,
      name: previewRow?.name,
      action: "ERROR",
      reason: [error.field, error.message].filter(Boolean).join(": "),
      changedFields: getAllowedChanges(previewRow, importMode),
      lockedFields: getLockedChanges(previewRow, importMode),
    });
  });
  downloadCSV("item-import-preview-errors", REPORT_HEADERS, rows);
}

export function downloadPreviewSkippedReport(
  preview: PreviewResponse,
  importMode: ImportMode,
): void {
  const rows = buildSkippedRows(preview).map(({ previewRow, reason, rowNumber }) =>
    toReportRow({
      row: rowNumber,
      sku: previewRow?.sku,
      name: previewRow?.name,
      action: "SKIP",
      reason,
      changedFields: getAllowedChanges(previewRow, importMode),
      lockedFields: getLockedChanges(previewRow, importMode),
    }),
  );
  downloadCSV("item-import-skipped-rows", REPORT_HEADERS, rows);
}

export function downloadPreviewNoChangeReport(
  preview: PreviewResponse,
  importMode: ImportMode,
): void {
  const rows = buildNoChangeRows(preview, importMode).map(({ previewRow, reason }) =>
    toReportRow({
      row: previewRow.rowIndex,
      sku: previewRow.sku,
      name: previewRow.name,
      action: "NO_CHANGE",
      reason,
      changedFields: getAllowedChanges(previewRow, importMode),
      lockedFields: getLockedChanges(previewRow, importMode),
    }),
  );
  downloadCSV("item-import-no-change-rows", REPORT_HEADERS, rows);
}

export function downloadExecutionErrorReport({
  filename,
  errorLog,
  preview,
  importMode,
}: {
  filename: string;
  errorLog: ProgressResponse["errorLog"];
  preview?: PreviewResponse | null;
  importMode?: ImportMode;
}): void {
  if (!errorLog?.length) return;
  const lookup = preview ? buildPreviewLookup(preview) : new Map<number, PreviewSummaryRow>();
  const rows = errorLog.map((error) => {
    const previewRow = lookup.get(error.row);
    return toReportRow({
      row: error.row,
      sku: previewRow?.sku,
      name: previewRow?.name,
      action: "ERROR",
      reason: error.message,
      changedFields: getAllowedChanges(previewRow, importMode),
      lockedFields: getLockedChanges(previewRow, importMode),
    });
  });
  downloadCSV(filename, REPORT_HEADERS, rows);
}

export function downloadHistoryUnmatchedSkuReport(unmatchedSkus: string[]): void {
  const rows = unmatchedSkus.map((sku) => [
    "",
    sku,
    "",
    "SKIP",
    "SKU was not found in APEX during history import preview.",
    "",
    "",
  ]);
  downloadCSV("history-import-unmatched-skus", REPORT_HEADERS, rows);
}

function buildSkippedRows(preview: PreviewResponse): Array<{
  rowNumber: number;
  previewRow?: PreviewSummaryRow;
  reason: string;
}> {
  const lookup = buildPreviewLookup(preview);
  const errorsByRow = new Map<number, string[]>();

  for (const error of preview.errors) {
    const rowNumber = getErrorRowNumber(error);
    const reasons = errorsByRow.get(rowNumber) ?? [];
    reasons.push([error.field, error.message].filter(Boolean).join(": "));
    errorsByRow.set(rowNumber, reasons);
  }

  const skippedRows = Array.from(errorsByRow.entries()).map(([rowNumber, reasons]) => ({
    rowNumber,
    previewRow: lookup.get(rowNumber),
    reason: reasons.join("; "),
  }));

  for (const row of preview.preview ?? []) {
    if (row.action !== "SKIP" || errorsByRow.has(row.rowIndex)) continue;
    skippedRows.push({
      rowNumber: row.rowIndex,
      previewRow: row,
      reason: row.errors?.join("; ") || "Skipped by preview/import mode.",
    });
  }

  return skippedRows.sort((left, right) => left.rowNumber - right.rowNumber);
}

function buildNoChangeRows(
  preview: PreviewResponse,
  importMode: ImportMode,
): Array<{ previewRow: PreviewSummaryRow; reason: string }> {
  const rows = new Map<number, { previewRow: PreviewSummaryRow; reason: string }>();

  for (const row of preview.noChangePreview ?? []) {
    rows.set(row.rowIndex, {
      previewRow: row,
      reason: "No tracked field changes.",
    });
  }

  if (importMode === "update_only") {
    for (const row of preview.updatePreview ?? []) {
      if (hasUpdateOnlyAllowedChange(row)) continue;
      rows.set(row.rowIndex, {
        previewRow: row,
        reason: "Only locked fields changed in Update Only mode.",
      });
    }
  }

  const scopedRows = getModeScopedUpdateRows(preview, importMode);
  for (const row of preview.updatePreview ?? []) {
    if (importMode !== "update_only") continue;
    if (scopedRows.some((scopedRow) => scopedRow.rowIndex === row.rowIndex)) continue;
    if (rows.has(row.rowIndex)) continue;
    rows.set(row.rowIndex, {
      previewRow: row,
      reason: "Excluded from Update Only because no allowed fields changed.",
    });
  }

  return Array.from(rows.values()).sort(
    (left, right) => left.previewRow.rowIndex - right.previewRow.rowIndex,
  );
}

function buildPreviewLookup(preview: PreviewResponse): Map<number, PreviewSummaryRow> {
  const lookup = new Map<number, PreviewSummaryRow>();
  for (const row of [
    ...(preview.preview ?? []),
    ...(preview.createPreview ?? []),
    ...(preview.updatePreview ?? []),
    ...(preview.noChangePreview ?? []),
  ]) {
    if (!lookup.has(row.rowIndex)) lookup.set(row.rowIndex, row);
  }
  return lookup;
}

function getErrorRowNumber(error: PreviewError): number {
  return error.row ?? error.rowIndex;
}

function getAllowedChanges(
  row: PreviewSummaryRow | undefined,
  importMode: ImportMode | undefined,
): string[] {
  if (!row?.changes?.length) return [];
  return importMode ? filterPreviewChangesForMode(row.changes, importMode) : row.changes;
}

function getLockedChanges(
  row: PreviewSummaryRow | undefined,
  importMode: ImportMode | undefined,
): string[] {
  if (!row?.changes?.length || !importMode) return [];
  const allowed = new Set(filterPreviewChangesForMode(row.changes, importMode));
  return row.changes.filter((change) => !allowed.has(change));
}

function toReportRow(row: ReportRow): string[] {
  return [
    String(row.row ?? ""),
    row.sku ?? "",
    row.name ?? "",
    row.action,
    row.reason,
    formatFieldList(row.changedFields),
    formatFieldList(row.lockedFields),
  ];
}

function formatFieldList(fields: string[] | undefined): string {
  return fields?.filter(Boolean).join("; ") ?? "";
}
