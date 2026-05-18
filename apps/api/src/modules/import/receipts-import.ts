import { historicalSales } from "@apex/database/schema";
import crypto from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { setImportProgress } from "./item-import-cache";
import {
  loadReceiptLocationNameMap,
  loadReceiptProductMap,
} from "./receipts-data-loaders";
import {
  buildReceiptLocationMap,
  type ReceiptsExecuteOptions,
} from "./receipts-execution";
import {
  buildReceiptHistoricalSaleInsert,
  buildReceiptMoneyFields,
  shouldBackfillReceiptMoney,
} from "./receipts-history-records";
import {
  clearReceiptsPreviewCacheForTests,
  deleteReceiptsPreview,
  getReceiptsPreview,
} from "./receipts-preview-cache";
import {
  RECEIPT_IMPORT_BATCH_SIZE,
  buildReceiptsImportResult,
  createReceiptCompletedProgress,
  createReceiptImportRunState,
  createReceiptInitialProgress,
  createReceiptRunningProgress,
  recordReceiptBatchError,
  recordReceiptRowError,
} from "./receipts-run-state";
import { buildReceiptRowWriteDecision } from "./receipts-row-decision";

export {
  buildReceiptLocationMap,
  shouldSkipReceiptRow,
  type ReceiptImportRowProduct,
  type ReceiptSkipDecision,
  type ReceiptsExecuteOptions,
} from "./receipts-execution";
export {
  buildReceiptHistoricalSaleInsert,
  buildReceiptLocationNameMap,
  buildReceiptMoneyFields,
  buildReceiptProductMap,
  buildReceiptProductName,
  buildReceiptMovementFields,
  normalizeReceiptQuantity,
  resolveReceiptLocation,
  resolveReceiptProduct,
  shouldBackfillReceiptMoney,
  type ReceiptHistoricalSaleInsert,
  type ReceiptHistoryDirection,
  type ReceiptHistoryReasonType,
  type ReceiptLocationDetails,
  type ReceiptLocationLookupRow,
  type ReceiptMoneyFields,
  type ReceiptMovementFields,
  type ReceiptProductLookupRow,
} from "./receipts-history-records";
export {
  clearReceiptsPreviewCacheForTests,
  type CachedReceiptsPreview,
} from "./receipts-preview-cache";
export {
  RECEIPT_IMPORT_BATCH_SIZE,
  buildReceiptsImportResult,
  createReceiptCompletedProgress,
  createReceiptImportRunState,
  createReceiptInitialProgress,
  createReceiptRunningProgress,
  recordReceiptBatchError,
  recordReceiptRowError,
  type ReceiptImportError,
  type ReceiptImportRunState,
  type ReceiptsImportResult,
} from "./receipts-run-state";
export {
  buildReceiptRowWriteDecision,
  type ReceiptRowWriteDecision,
  type ReceiptRowWriteDecisionContext,
} from "./receipts-row-decision";
export {
  buildReceiptsPreviewResult,
  parseReceiptsCSV,
  type BuildReceiptsPreviewResultOptions,
} from "./receipts-preview-service";
export {
  buildReceiptLocationMapping,
  buildReceiptPreviewRows,
  buildReceiptPreviewStats,
  type ReceiptLocationRecord,
  type ReceiptPreviewStats,
  type ReceiptsPreviewResult,
} from "./receipts-preview";

async function getDatabase() {
  const { db } = await import("@apex/database");
  return db;
}

export async function executeReceiptsImport(options: ReceiptsExecuteOptions) {
  const cached = getReceiptsPreview(options.previewToken);
  if (!cached) throw new Error("Preview expired. Please re-upload the CSV.");

  const { orgId, rows } = cached;
  const db = await getDatabase();
  const batchId = crypto.randomUUID();

  const locMap = buildReceiptLocationMap(options.locationMapping, cached.locationMapping);

  const skuToProduct = await loadReceiptProductMap(orgId);
  const locIdToName = await loadReceiptLocationNameMap(orgId);

  const progressToken = options.previewToken;
  setImportProgress(progressToken, createReceiptInitialProgress(rows.length));

  const runState = createReceiptImportRunState();

  for (let batchStart = 0; batchStart < rows.length; batchStart += RECEIPT_IMPORT_BATCH_SIZE) {
    const batch = rows.slice(batchStart, batchStart + RECEIPT_IMPORT_BATCH_SIZE);

    try {
      await db.transaction(async (tx) => {
        for (let i = 0; i < batch.length; i++) {
          const row = batch[i];
          const rowIndex = batchStart + i + 1;

          try {
            await tx.execute(sql`SAVEPOINT receipt_row_${sql.raw(String(rowIndex))}`);

            const decision = buildReceiptRowWriteDecision(row, {
              options,
              skuToProduct,
              locationByCsvName: locMap,
              locationNameById: locIdToName,
            });

            if (decision.action === "skip") {
              runState.skipped++;
              await tx.execute(sql`RELEASE SAVEPOINT receipt_row_${sql.raw(String(rowIndex))}`);
              continue;
            }

            if (decision.action === "invalid_date") {
              recordReceiptRowError(runState, rowIndex, decision.message);
              await tx.execute(sql`RELEASE SAVEPOINT receipt_row_${sql.raw(String(rowIndex))}`);
              continue;
            }

            if (decision.action === "zero_quantity") {
              runState.skipped++;
              await tx.execute(sql`RELEASE SAVEPOINT receipt_row_${sql.raw(String(rowIndex))}`);
              continue;
            }

            const [existing] = await tx
              .select({ id: historicalSales.id })
              .from(historicalSales)
              .where(and(
                eq(historicalSales.orgId, orgId),
                eq(historicalSales.reasonReference, row.receiptNumber),
                eq(historicalSales.sku, row.sku || ""),
                eq(historicalSales.movementDate, decision.movementDate),
              ))
              .limit(1);

            if (existing) {
              if (shouldBackfillReceiptMoney(row)) {
                await tx
                  .update(historicalSales)
                  .set(buildReceiptMoneyFields(row, decision.qty))
                  .where(eq(historicalSales.id, existing.id));
                runState.priceBackfilled++;
              }
              runState.skipped++;
              await tx.execute(sql`RELEASE SAVEPOINT receipt_row_${sql.raw(String(rowIndex))}`);
              continue;
            }

            await tx.insert(historicalSales).values(buildReceiptHistoricalSaleInsert({
              orgId,
              row,
              movementDate: decision.movementDate,
              product: decision.product,
              location: decision.location,
              qty: decision.qty,
              batchId,
            }));

            runState.created++;
            await tx.execute(sql`RELEASE SAVEPOINT receipt_row_${sql.raw(String(rowIndex))}`);
          } catch (rowErr: any) {
            try {
              await tx.execute(sql`ROLLBACK TO SAVEPOINT receipt_row_${sql.raw(String(rowIndex))}`);
            } catch {}
            recordReceiptRowError(runState, rowIndex, rowErr.message);
          }
        }
      });
    } catch (batchErr: any) {
      recordReceiptBatchError(runState, batchStart + 1, batchErr.message);
    }

    setImportProgress(
      progressToken,
      createReceiptRunningProgress(batchStart, RECEIPT_IMPORT_BATCH_SIZE, rows.length, runState),
    );
  }

  setImportProgress(progressToken, createReceiptCompletedProgress(rows.length, runState));

  deleteReceiptsPreview(options.previewToken);

  return buildReceiptsImportResult(runState, batchId);
}
