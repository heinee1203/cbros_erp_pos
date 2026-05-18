import type { DbOrTx } from "@apex/database";
import { sql } from "drizzle-orm";
import type { ExecuteOptions, ParsedRow } from "./types";
import type { ImportMode } from "./execution-utils";
import {
  executeImportRowWrite,
  type ExecuteImportRowWriteOptions,
  type GenerateImportMnemonicSku,
  type ImportRowExecutionResult,
} from "./row-execution";

export interface ImportRunCounts {
  created: number;
  updated: number;
  skipped: number;
  noChange: number;
}

export interface ImportRunError {
  row: number;
  message: string;
}

export interface ImportRunState extends ImportRunCounts {
  errors: ImportRunError[];
}

export interface ImportBatchProgress {
  processed: number;
  total: number;
  counts: ImportRunCounts;
  errors: number;
}

export type ImportTransaction = DbOrTx & {
  execute(query: unknown): Promise<unknown>;
};

export type ImportTransactionRunner = (
  callback: (tx: ImportTransaction) => Promise<void>,
) => Promise<void>;

export type ImportRowWriter = (
  options: ExecuteImportRowWriteOptions,
) => Promise<ImportRowExecutionResult>;

export interface RunImportBatchesOptions {
  rows: ParsedRow[];
  orgId: string;
  mode: ImportMode;
  skipErrors?: boolean;
  categoryMapping?: ExecuteOptions["categoryMapping"];
  createNewCategories?: boolean;
  categoryCache: Map<string, string>;
  brandCache: Map<string, string>;
  parentProductMap: Map<string, string>;
  generateMnemonicSku: GenerateImportMnemonicSku;
  runTransaction: ImportTransactionRunner;
  onBatchComplete?: (progress: ImportBatchProgress) => void;
  writeRow?: ImportRowWriter;
  batchSize?: number;
}

export function createImportRunState(): ImportRunState {
  return {
    created: 0,
    updated: 0,
    skipped: 0,
    noChange: 0,
    errors: [],
  };
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "Unknown error";
}

export function handleInvalidImportRow(
  state: ImportRunState,
  row: Pick<ParsedRow, "rowIndex" | "errors">,
  skipErrors?: boolean,
): boolean {
  if (row.errors.length === 0) return false;

  if (!skipErrors) {
    for (const message of row.errors) {
      state.errors.push({ row: row.rowIndex, message });
    }
  }

  state.skipped++;
  return true;
}

export function handleNoChangeImportRow(
  state: ImportRunState,
  row: Pick<ParsedRow, "action">,
): boolean {
  if (row.action !== "NO_CHANGE") return false;

  state.noChange++;
  return true;
}

export function applyImportRowExecutionResult(
  state: ImportRunState,
  result: ImportRowExecutionResult,
): void {
  if (result === "created") {
    state.created++;
  } else if (result === "updated") {
    state.updated++;
  } else if (result === "skipped") {
    state.skipped++;
  }
}

export function recordImportRowError(
  state: ImportRunState,
  rowIndex: number,
  error: unknown,
): void {
  state.skipped++;
  state.errors.push({ row: rowIndex, message: getErrorMessage(error) });
}

export function recordImportBatchError(
  state: ImportRunState,
  batchStart: number,
  error: unknown,
): void {
  state.errors.push({
    row: batchStart + 1,
    message: `Batch error: ${getErrorMessage(error)}`,
  });
}

async function createRowSavepoint(tx: ImportTransaction, rowIndex: number): Promise<void> {
  await tx.execute(sql`SAVEPOINT row_${sql.raw(String(rowIndex))}`);
}

async function releaseRowSavepoint(tx: ImportTransaction, rowIndex: number): Promise<void> {
  await tx.execute(sql`RELEASE SAVEPOINT row_${sql.raw(String(rowIndex))}`);
}

async function rollbackRowSavepoint(tx: ImportTransaction, rowIndex: number): Promise<void> {
  try {
    await tx.execute(sql`ROLLBACK TO SAVEPOINT row_${sql.raw(String(rowIndex))}`);
  } catch {
    // Preserve existing behavior: rollback failure should not mask the row error.
  }
}

function toProgress(state: ImportRunState, processed: number, total: number): ImportBatchProgress {
  return {
    processed,
    total,
    counts: {
      created: state.created,
      updated: state.updated,
      skipped: state.skipped,
      noChange: state.noChange,
    },
    errors: state.errors.length,
  };
}

export async function runImportBatches({
  rows,
  orgId,
  mode,
  skipErrors,
  categoryMapping,
  createNewCategories,
  categoryCache,
  brandCache,
  parentProductMap,
  generateMnemonicSku,
  runTransaction,
  onBatchComplete,
  writeRow = executeImportRowWrite,
  batchSize = 500,
}: RunImportBatchesOptions): Promise<ImportRunState> {
  const state = createImportRunState();

  for (let batchStart = 0; batchStart < rows.length; batchStart += batchSize) {
    const batch = rows.slice(batchStart, batchStart + batchSize);

    try {
      await runTransaction(async (tx) => {
        for (const row of batch) {
          if (handleInvalidImportRow(state, row, skipErrors)) continue;
          if (handleNoChangeImportRow(state, row)) continue;

          try {
            await createRowSavepoint(tx, row.rowIndex);
            const result = await writeRow({
              tx,
              orgId,
              row,
              mode,
              categoryMapping,
              createNewCategories,
              categoryCache,
              brandCache,
              parentProductMap,
              generateMnemonicSku,
            });

            applyImportRowExecutionResult(state, result);
            await releaseRowSavepoint(tx, row.rowIndex);
          } catch (rowError) {
            await rollbackRowSavepoint(tx, row.rowIndex);
            if (skipErrors) {
              recordImportRowError(state, row.rowIndex, rowError);
            } else {
              throw rowError;
            }
          }
        }
      });
    } catch (batchError) {
      recordImportBatchError(state, batchStart, batchError);
    }

    onBatchComplete?.(toProgress(
      state,
      Math.min(batchStart + batchSize, rows.length),
      rows.length,
    ));
  }

  return state;
}
