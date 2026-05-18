import type { ProgressUpdate } from "./types";

export const RECEIPT_IMPORT_BATCH_SIZE = 500;

export interface ReceiptImportError {
  row: number;
  message: string;
}

export interface ReceiptImportRunState {
  created: number;
  skipped: number;
  priceBackfilled: number;
  errors: ReceiptImportError[];
}

export interface ReceiptsImportResult {
  created: number;
  skipped: number;
  priceBackfilled: number;
  errors: number;
  errorLog: ReceiptImportError[];
  batchId: string;
}

export function createReceiptImportRunState(): ReceiptImportRunState {
  return {
    created: 0,
    skipped: 0,
    priceBackfilled: 0,
    errors: [],
  };
}

export function recordReceiptRowError(
  state: ReceiptImportRunState,
  row: number,
  message: string | undefined,
): void {
  state.errors.push({ row, message: message || "Unknown error" });
  state.skipped++;
}

export function recordReceiptBatchError(
  state: ReceiptImportRunState,
  row: number,
  message: string | undefined,
): void {
  state.errors.push({ row, message: `Batch error: ${message}` });
}

export function createReceiptInitialProgress(total: number): ProgressUpdate {
  return {
    status: "running",
    processed: 0,
    total,
    percent: 0,
    created: 0,
    updated: 0,
    errors: 0,
  };
}

export function createReceiptRunningProgress(
  batchStart: number,
  batchSize: number,
  total: number,
  state: ReceiptImportRunState,
): ProgressUpdate {
  return {
    status: "running",
    processed: Math.min(batchStart + batchSize, total),
    total,
    percent: Math.round(((batchStart + batchSize) / total) * 100),
    created: state.created,
    updated: 0,
    errors: state.errors.length,
  };
}

export function createReceiptCompletedProgress(
  total: number,
  state: ReceiptImportRunState,
): ProgressUpdate {
  return {
    status: "completed",
    processed: total,
    total,
    percent: 100,
    created: state.created,
    updated: 0,
    errors: state.errors.length,
  };
}

export function buildReceiptsImportResult(
  state: ReceiptImportRunState,
  batchId: string,
): ReceiptsImportResult {
  return {
    created: state.created,
    skipped: state.skipped,
    priceBackfilled: state.priceBackfilled,
    errors: state.errors.length,
    errorLog: state.errors,
    batchId,
  };
}
