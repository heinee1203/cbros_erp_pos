import { db } from "@apex/database";
import crypto from "node:crypto";
import { generateUniqueMnemonicSku } from "../products/sku";
import { isLoyverseFormat, parseCSV } from "./csv-utils";
import {
  applyLocationMappingOverrides,
  applyProtectedImportMetadataBlock,
  applyUpdateOnlyChangeScope,
  createCompletedProgress,
  createInitialProgress,
  createRunningProgress,
  filterRowsForImportMode,
  resolveImportMode,
} from "./execution-utils";
import {
  cleanExpiredItemPreviews,
  deleteItemPreview,
  getImportProgress,
  getItemPreview,
  setImportProgress,
  storeItemPreview,
} from "./item-import-cache";
import { loadItemPreviewContext } from "./item-preview-context";
import { runImportBatches, type ImportTransaction } from "./import-runner";
import {
  buildHeaderIndex,
  buildLoyverseColumnIndex,
  extractCsvLocationNames,
} from "./loyverse-utils";
import { parseLoyverseItemRows } from "./loyverse-row-parser";
import {
  buildCategoryMapping,
  buildLoyversePreviewResult,
  summarizeParsedRows,
} from "./preview-assembly";
import { loadImportTaxonomyCaches, loadOrgCategoryNames } from "./taxonomy-cache-loader";
import { applyVariantGrouping, rediffVariantRows } from "./variant-preview";
import { precreateVariantParents } from "./variant-writes";
import {
  captureImportRowAfterSnapshot,
  captureImportRowBeforeSnapshot,
  insertItemImportAuditLog,
  type ImportAuditMetadata,
  type ImportAuditRowSnapshot,
} from "./import-audit";
import { executeImportRowWrite } from "./row-execution";
import type { ExecuteOptions, ImportResult, PreviewResult, ProgressUpdate } from "./types";

// ── Types ────────────────────────────────────────────────────────────

export type {
  CategoryMapping,
  ExecuteOptions,
  ImportResult,
  LocationMapping,
  ParsedRow,
  ParsedRowLocation,
  PreviewResult,
  PreviewRowSummary,
  ProgressUpdate,
  RowAction,
} from "./types";

// ── parseLoyverseCSV ─────────────────────────────────────────────────

export async function parseLoyverseCSV(
  csvText: string,
  orgId: string,
): Promise<PreviewResult> {
  cleanExpiredItemPreviews();

  const rows = parseCSV(csvText);
  if (rows.length < 2) {
    throw new Error("CSV file is empty or has no data rows");
  }

  const headers = rows[0].map((h) => h.trim());

  // Validate Loyverse format using alias-based detection
  if (!isLoyverseFormat(headers)) {
    throw new Error(
      `Not a valid Loyverse CSV. Could not find required columns: Name (or "Item name") and SKU.`,
    );
  }

  const colIdx = buildLoyverseColumnIndex(headers);
  const headerIdx = buildHeaderIndex(headers);
  const csvLocationNames = extractCsvLocationNames(headers);
  const {
    locationMapping,
    skuMap,
    existingStockMap,
    existingVariantOptionMap,
  } = await loadItemPreviewContext(orgId, csvLocationNames);
  const parsedRows = parseLoyverseItemRows({
    rows,
    colIdx,
    headerIdx,
    locationMapping,
    skuMap,
    existingStockMap,
    existingVariantOptionMap,
  });

  applyVariantGrouping(parsedRows);
  rediffVariantRows(parsedRows, skuMap, existingStockMap, existingVariantOptionMap);

  const finalSummary = summarizeParsedRows(parsedRows);
  const createCount = finalSummary.createCount;
  const updateCount = finalSummary.updateCount;
  const noChangeCount = finalSummary.noChangeCount;
  const skipCount = finalSummary.skipCount;
  const updatedErrors = finalSummary.errors;

  const orgCategories = await loadOrgCategoryNames(orgId);
  const categoryMapping = buildCategoryMapping(parsedRows, orgCategories);
  // Generate preview token and cache
  const previewToken = crypto.randomUUID();
  storeItemPreview({
    token: previewToken,
    data: parsedRows,
    orgId,
    locationMapping,
    categoryMapping,
  });

  // Row → preview-summary shape. Keeps variant display logic in one place.
  return buildLoyversePreviewResult({
    previewToken,
    parsedRows,
    counts: { createCount, updateCount, noChangeCount, skipCount },
    errors: updatedErrors,
    locationMapping,
    categoryMapping,
  });
}

// ── executeImport ────────────────────────────────────────────────────

export async function executeImport(
  options: ExecuteOptions,
): Promise<ImportResult> {
  cleanExpiredItemPreviews();

  const cached = getItemPreview(options.previewToken);
  if (!cached) {
    throw new Error("Preview token expired or invalid. Please re-upload the CSV.");
  }

  const { data: allParsedRows, orgId, locationMapping } = cached;

  // ── Early filter: only process rows relevant to the import mode ──
  // This avoids iterating through 46K rows when only 4 are new (create_only)
  const mode = resolveImportMode(options.importMode);
  const requestedCategoryMapping = options.categoryMapping;
  const requestedCreateNewCategories = options.createNewCategories;
  const requestedLocationMapping = options.locationMapping;
  const parsedRows = filterRowsForImportMode(allParsedRows, mode);

  if (mode === "inventory_sync" || mode === "update_only") {
    console.warn(`[IMPORT] ${mode} mode - taxonomy metadata BLOCKED`);
    applyProtectedImportMetadataBlock(mode, parsedRows, options);
  }

  // Apply location mapping overrides
  applyLocationMappingOverrides(options.locationMapping, locationMapping, parsedRows);

  if (mode === "update_only") {
    applyUpdateOnlyChangeScope(parsedRows);
  }

  const startTime = Date.now();
  const startedAt = new Date(startTime).toISOString();
  const rowSnapshots: ImportAuditRowSnapshot[] = [];
  // Init progress
  setImportProgress(options.previewToken, createInitialProgress(parsedRows.length));

  const { categoryCache, brandCache } = await loadImportTaxonomyCaches(orgId);

  const parentProductMap = await precreateVariantParents({
    orgId,
    rows: parsedRows,
    mode,
    categoryCache,
    brandCache,
    generateMnemonicSku: generateUniqueMnemonicSku,
  });
  const runState = await runImportBatches({
    rows: parsedRows,
    orgId,
    mode,
    skipErrors: options.skipErrors,
    categoryMapping: options.categoryMapping,
    createNewCategories: options.createNewCategories,
    categoryCache,
    brandCache,
    parentProductMap,
    generateMnemonicSku: generateUniqueMnemonicSku,
    runTransaction: async (callback) => {
      await db.transaction(async (tx) => callback(tx as unknown as ImportTransaction));
    },
    writeRow: async (writeOptions) => {
      let beforeSnapshot: Awaited<ReturnType<typeof captureImportRowBeforeSnapshot>> | null = null;

      try {
        beforeSnapshot = await captureImportRowBeforeSnapshot({
          tx: writeOptions.tx,
          orgId: writeOptions.orgId,
          row: writeOptions.row,
        });
      } catch (snapshotError) {
        console.error("[import-audit] Failed to capture before snapshot:", snapshotError);
      }

      const result = await executeImportRowWrite(writeOptions);

      if (result === "created" || result === "updated") {
        try {
          rowSnapshots.push(
            await captureImportRowAfterSnapshot({
              tx: writeOptions.tx,
              orgId: writeOptions.orgId,
              row: writeOptions.row,
              before: beforeSnapshot,
              result,
            }),
          );
        } catch (snapshotError) {
          console.error("[import-audit] Failed to capture after snapshot:", snapshotError);
        }
      }

      return result;
    },
    onBatchComplete: ({ processed, total, counts, errors }) => {
      setImportProgress(
        options.previewToken,
        createRunningProgress(processed, total, {
          created: counts.created,
          updated: counts.updated,
          noChange: counts.noChange,
          errors,
        }),
      );
    },
  });

  const duration = Date.now() - startTime;
  let audit: ImportAuditMetadata | undefined;

  try {
    audit = await insertItemImportAuditLog({
      db,
      orgId,
      userId: options.userId,
      ipAddress: options.ipAddress,
      previewToken: options.previewToken,
      mode,
      fileName: options.fileName,
      startedAt,
      completedAt: new Date().toISOString(),
      durationMs: duration,
      counts: {
        totalRows: parsedRows.length,
        created: runState.created,
        updated: runState.updated,
        skipped: runState.skipped,
        noChange: runState.noChange,
        errors: runState.errors.length,
      },
      selectedMappings: {
        locationMapping: requestedLocationMapping,
        categoryMapping: requestedCategoryMapping,
        createNewCategories: requestedCreateNewCategories,
      },
      rowSnapshots,
    });
  } catch (auditError) {
    console.error("[import-audit] Failed to write item import audit log:", auditError);
  }

  // Final progress
  setImportProgress(
    options.previewToken,
    createCompletedProgress(
      parsedRows.length,
      {
        created: runState.created,
        updated: runState.updated,
        noChange: runState.noChange,
        errors: runState.errors.length,
      },
      runState.errors,
      audit,
    ),
  );

  // Clean up cached preview data (import is done)
  deleteItemPreview(options.previewToken);

  return {
    created: runState.created,
    updated: runState.updated,
    skipped: runState.skipped,
    noChange: runState.noChange,
    errors: runState.errors.length,
    errorLog: runState.errors,
    duration,
    audit,
  };
}

// ── getProgress ──────────────────────────────────────────────────────

export function getProgress(token: string): ProgressUpdate | null {
  return getImportProgress(token);
}

// ══════════════════════════════════════════════════════════════════════
// RECEIPTS (SALES HISTORY) IMPORT
// ══════════════════════════════════════════════════════════════════════

export {
  parseReceiptsCSV,
  executeReceiptsImport,
  type ReceiptsExecuteOptions,
  type ReceiptsPreviewResult,
} from "./receipts-import";
export { backfillOrphanedSales } from "./sales-backfill";
