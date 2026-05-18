import { db } from "@apex/database";
import {
  historicalSales,
  products,
  locations,
} from "@apex/database/schema";
import { eq, and, sql } from "drizzle-orm";
import crypto from "node:crypto";

// ── Types ────────────────────────────────────────────────────────────

export interface LocationMapping {
  csvName: string;
  apexLocationId: string | null;
  apexLocationName: string | null;
  autoMatched: boolean;
}

interface ParsedHistoryRow {
  rowIndex: number;
  date: Date;
  itemName: string;
  sku: string;
  storeName: string;
  employeeName: string;
  reasonType: "SALE" | "REFUND" | "PO_RECEIPT" | "TRANSFER_IN" | "TRANSFER_OUT" | "COUNT_ADJUSTMENT" | "DAMAGE" | "LOSS";
  reasonReference: string;
  quantity: number;
  direction: "IN" | "OUT";
  productId: string | null;
  locationId: string | null;
}

export interface HistoryPreviewResult {
  previewToken: string;
  summary: {
    totalRows: number;
    dateRange: { from: string; to: string };
    reasonBreakdown: Array<{ reason: string; count: number }>;
    skuMatchRate: number;
    matchedSkus: number;
    totalSkus: number;
    unmatchedSkus: string[];
  };
  locations: Array<LocationMapping & { matched: boolean }>;
  errors: Array<{ row: number; message: string }>;
  preview: Array<{
    rowIndex: number;
    date: string;
    itemName: string;
    sku: string;
    storeName: string;
    reasonType: string;
    quantity: number;
    direction: string;
    skuMatched: boolean;
  }>;
}

export interface ExecuteHistoryOptions {
  previewToken: string;
  locationMapping?: Record<string, string>;
}

export interface HistoryImportResult {
  inserted: number;
  skipped: number;
  errors: Array<{ row: number; message: string }>;
  duration: number;
  batchId: string;
}

export interface ProgressUpdate {
  status: "running" | "completed" | "failed";
  processed: number;
  total: number;
  percent: number;
  inserted: number;
  errors: number;
  errorLog?: Array<{ row: number; message: string }>;
}

export interface ImportBatch {
  batchId: string;
  rowCount: number;
  minDate: string;
  maxDate: string;
  importedAt: string;
}

// ── In-memory caches ─────────────────────────────────────────────────

interface CachedHistoryPreview {
  data: ParsedHistoryRow[];
  orgId: string;
  locationMapping: LocationMapping[];
  expiresAt: number;
}

const previewCache = new Map<string, CachedHistoryPreview>();
const progressCache = new Map<string, ProgressUpdate>();

const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

function cleanExpiredCache() {
  const now = Date.now();
  for (const [key, val] of previewCache) {
    if (val.expiresAt < now) previewCache.delete(key);
  }
}

// ── CSV Parser ───────────────────────────────────────────────────────

function parseCSV(text: string): string[][] {
  const clean = text.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let current = "";
  let inQuotes = false;
  let cells: string[] = [];

  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (ch === '"') {
      if (inQuotes && clean[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      cells.push(current.trim());
      current = "";
    } else if (
      (ch === "\n" || (ch === "\r" && clean[i + 1] === "\n")) &&
      !inQuotes
    ) {
      cells.push(current.trim());
      if (cells.some((c) => c)) rows.push(cells);
      cells = [];
      current = "";
      if (ch === "\r") i++;
    } else {
      current += ch;
    }
  }
  cells.push(current.trim());
  if (cells.some((c) => c)) rows.push(cells);
  return rows;
}

// ── Date parser: DD/MM/YYYY HH:mm ───────────────────────────────────

function parseLoyverseDate(dateStr: string): Date | null {
  // Format: DD/MM/YYYY HH:mm
  const match = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const [, day, month, year, hour, minute] = match;
  const d = new Date(
    parseInt(year, 10),
    parseInt(month, 10) - 1,
    parseInt(day, 10),
    parseInt(hour, 10),
    parseInt(minute, 10),
  );
  if (isNaN(d.getTime())) return null;
  return d;
}

// ── Reason parser ────────────────────────────────────────────────────

type ReasonType = ParsedHistoryRow["reasonType"];

function parseReason(
  reasonStr: string,
  adjustment: number,
): { type: ReasonType; reference: string } {
  // Split on " #" to get type and reference
  const hashIdx = reasonStr.indexOf(" #");
  const typePart = hashIdx >= 0 ? reasonStr.slice(0, hashIdx).trim() : reasonStr.trim();
  const reference = hashIdx >= 0 ? reasonStr.slice(hashIdx + 2).trim() : "";

  const lower = typePart.toLowerCase();

  if (lower === "sale") return { type: "SALE", reference };
  if (lower === "refund") return { type: "REFUND", reference };
  if (lower === "receive items") return { type: "PO_RECEIPT", reference };
  if (lower === "transfer") {
    return {
      type: adjustment < 0 ? "TRANSFER_OUT" : "TRANSFER_IN",
      reference,
    };
  }
  if (lower === "inventory count") return { type: "COUNT_ADJUSTMENT", reference };
  if (lower === "damage") return { type: "DAMAGE", reference };
  if (lower === "loss") return { type: "LOSS", reference };

  // Default fallback based on sign
  return { type: adjustment < 0 ? "LOSS" : "COUNT_ADJUSTMENT", reference };
}

// ── parseLoyverseHistory ─────────────────────────────────────────────

export async function parseLoyverseHistory(
  csvText: string,
  orgId: string,
): Promise<HistoryPreviewResult> {
  cleanExpiredCache();

  const rows = parseCSV(csvText);
  if (rows.length < 2) {
    throw new Error("CSV file is empty or has no data rows");
  }

  const headers = rows[0].map((h) => h.trim());

  // Validate Loyverse inventory history format
  const requiredHeaders = ["Date", "Item", "SKU", "Store", "Reason", "Adjustment"];
  const missingHeaders = requiredHeaders.filter(
    (rh) => !headers.some((h) => h.toLowerCase() === rh.toLowerCase()),
  );
  if (missingHeaders.length > 0) {
    throw new Error(
      `Not a valid Loyverse Inventory History CSV. Missing headers: ${missingHeaders.join(", ")}`,
    );
  }

  // Build header index map
  const headerIdx: Record<string, number> = {};
  for (let i = 0; i < headers.length; i++) {
    headerIdx[headers[i].toLowerCase()] = i;
  }

  const getVal = (row: string[], headerName: string): string => {
    const idx = headerIdx[headerName.toLowerCase()];
    if (idx === undefined) return "";
    return (row[idx] ?? "").trim();
  };

  // Batch-load products by SKU
  const orgProducts = await db
    .select({ id: products.id, sku: products.sku })
    .from(products)
    .where(eq(products.orgId, orgId));

  const skuMap = new Map<string, string>();
  for (const p of orgProducts) {
    skuMap.set(p.sku.toLowerCase(), p.id);
  }

  // Batch-load locations by name
  const orgLocations = await db
    .select({ id: locations.id, name: locations.name })
    .from(locations)
    .where(and(eq(locations.orgId, orgId), eq(locations.isActive, true)));

  // Build location mapping from CSV store names
  const csvStoreNames = new Set<string>();
  for (let i = 1; i < rows.length; i++) {
    const store = getVal(rows[i], "store");
    if (store) csvStoreNames.add(store);
  }

  const locationMapping: LocationMapping[] = [];
  for (const csvName of csvStoreNames) {
    const match = orgLocations.find(
      (loc) => loc.name.trim().toLowerCase() === csvName.trim().toLowerCase(),
    );
    locationMapping.push({
      csvName,
      apexLocationId: match?.id ?? null,
      apexLocationName: match?.name ?? null,
      autoMatched: !!match,
    });
  }

  // Build a quick lookup from csvName -> locationId
  const locationLookup = new Map<string, string | null>();
  for (const m of locationMapping) {
    locationLookup.set(m.csvName.toLowerCase(), m.apexLocationId);
  }

  // Parse data rows
  const parsedRows: ParsedHistoryRow[] = [];
  const errors: Array<{ row: number; message: string }> = [];
  const reasonBreakdown: Record<string, number> = {};
  let skuMatched = 0;
  let skuUnmatched = 0;
  let minDate: Date | null = null;
  let maxDate: Date | null = null;

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 1;

    const dateStr = getVal(row, "date");
    const itemName = getVal(row, "item");
    const sku = getVal(row, "sku");
    const storeName = getVal(row, "store");
    const employeeName = getVal(row, "employee");
    const reasonStr = getVal(row, "reason");
    const adjustmentStr = getVal(row, "adjustment");

    // Parse date
    const date = parseLoyverseDate(dateStr);
    if (!date) {
      errors.push({ row: rowNum, message: `Invalid date format: "${dateStr}"` });
      continue;
    }

    // Parse adjustment
    const adjustment = parseInt(adjustmentStr, 10);
    if (isNaN(adjustment)) {
      errors.push({ row: rowNum, message: `Invalid adjustment value: "${adjustmentStr}"` });
      continue;
    }

    // Parse reason
    const { type: reasonType, reference: reasonReference } = parseReason(reasonStr, adjustment);

    // Direction and absolute quantity
    const direction: "IN" | "OUT" = adjustment < 0 ? "OUT" : "IN";
    const quantity = Math.abs(adjustment);

    // Match SKU to product
    const productId = sku ? (skuMap.get(sku.toLowerCase()) ?? null) : null;
    if (productId) {
      skuMatched++;
    } else {
      skuUnmatched++;
    }

    // Match store to location
    const locationId = storeName
      ? (locationLookup.get(storeName.toLowerCase()) ?? null)
      : null;

    // Track date range
    if (!minDate || date < minDate) minDate = date;
    if (!maxDate || date > maxDate) maxDate = date;

    // Track reason breakdown
    reasonBreakdown[reasonType] = (reasonBreakdown[reasonType] ?? 0) + 1;

    parsedRows.push({
      rowIndex: rowNum,
      date,
      itemName,
      sku,
      storeName,
      employeeName,
      reasonType,
      reasonReference,
      quantity,
      direction,
      productId,
      locationId,
    });
  }

  // Generate preview token and cache
  const previewToken = crypto.randomUUID();
  previewCache.set(previewToken, {
    data: parsedRows,
    orgId,
    locationMapping,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });

  // Collect unmatched SKUs
  const unmatchedSkuSet = new Set<string>();
  for (const row of parsedRows) {
    if (!row.productId && row.sku) unmatchedSkuSet.add(row.sku);
  }

  // Build reasonBreakdown as array for frontend
  const reasonBreakdownArray = Object.entries(reasonBreakdown).map(([reason, count]) => ({
    reason,
    count: count as number,
  }));

  return {
    previewToken,
    // Nested under 'summary' to match frontend PreviewResponse interface
    summary: {
      totalRows: parsedRows.length,
      dateRange: minDate && maxDate
        ? { from: minDate.toISOString(), to: maxDate.toISOString() }
        : { from: "", to: "" },
      reasonBreakdown: reasonBreakdownArray,
      skuMatchRate: parsedRows.length > 0 ? skuMatched / (skuMatched + skuUnmatched) : 0,
      matchedSkus: skuMatched,
      totalSkus: skuMatched + skuUnmatched,
      unmatchedSkus: [...unmatchedSkuSet],
    },
    // Location mapping as 'locations' array
    locations: locationMapping.map((lm) => ({
      ...lm,
      matched: !!lm.apexLocationId,
    })),
    errors,
    preview: parsedRows.slice(0, 100).map((r) => ({
      rowIndex: r.rowIndex,
      date: r.date.toISOString(),
      itemName: r.itemName,
      sku: r.sku,
      storeName: r.storeName,
      reasonType: r.reasonType,
      quantity: r.quantity,
      direction: r.direction,
      skuMatched: !!r.productId,
    })),
  };
}

// ── executeHistoryImport ─────────────────────────────────────────────

export async function executeHistoryImport(
  options: ExecuteHistoryOptions,
): Promise<HistoryImportResult> {
  cleanExpiredCache();

  const cached = previewCache.get(options.previewToken);
  if (!cached) {
    throw new Error("Preview token expired or invalid. Please re-upload the CSV.");
  }

  const { data: parsedRows, orgId, locationMapping } = cached;

  // Apply location mapping overrides
  if (options.locationMapping) {
    for (const mapping of locationMapping) {
      const override = options.locationMapping[mapping.csvName];
      if (override) {
        mapping.apexLocationId = override;
        mapping.autoMatched = false;
      }
    }

    // Rebuild location lookup with overrides
    const locationLookup = new Map<string, string | null>();
    for (const m of locationMapping) {
      locationLookup.set(m.csvName.toLowerCase(), m.apexLocationId);
    }

    // Update parsed row location IDs
    for (const row of parsedRows) {
      if (row.storeName) {
        const overrideId = locationLookup.get(row.storeName.toLowerCase());
        if (overrideId !== undefined) {
          row.locationId = overrideId;
        }
      }
    }
  }

  const startTime = Date.now();
  const batchId = crypto.randomUUID();
  let inserted = 0;
  let skipped = 0;
  const importErrors: Array<{ row: number; message: string }> = [];

  // Init progress
  progressCache.set(options.previewToken, {
    status: "running",
    processed: 0,
    total: parsedRows.length,
    percent: 0,
    inserted: 0,
    errors: 0,
  });

  // Process in batches of 1000
  const BATCH_SIZE = 1000;
  for (let batchStart = 0; batchStart < parsedRows.length; batchStart += BATCH_SIZE) {
    const batch = parsedRows.slice(batchStart, batchStart + BATCH_SIZE);

    try {
      await db.transaction(async (tx) => {
        const values = [];
        for (const row of batch) {
          if (row.quantity === 0) {
            skipped++;
            continue;
          }

          values.push({
            orgId,
            productId: row.productId,
            sku: row.sku,
            productName: row.itemName,
            locationId: row.locationId,
            locationName: row.storeName,
            employeeName: row.employeeName || null,
            reasonType: row.reasonType,
            reasonReference: row.reasonReference || null,
            quantity: row.quantity,
            direction: row.direction,
            movementDate: row.date,
            importBatchId: batchId,
          });
        }

        if (values.length > 0) {
          await tx.insert(historicalSales).values(values);
          inserted += values.length;
        }
      });
    } catch (batchErr: any) {
      importErrors.push({
        row: batchStart + 1,
        message: `Batch error: ${batchErr.message || "Unknown error"}`,
      });
    }

    // Update progress
    const processed = Math.min(batchStart + BATCH_SIZE, parsedRows.length);
    progressCache.set(options.previewToken, {
      status: "running",
      processed,
      total: parsedRows.length,
      percent: Math.round((processed / parsedRows.length) * 100),
      inserted,
      errors: importErrors.length,
    });
  }

  const duration = Date.now() - startTime;

  // Final progress
  progressCache.set(options.previewToken, {
    status: importErrors.length > 0 && inserted === 0 ? "failed" : "completed",
    processed: parsedRows.length,
    total: parsedRows.length,
    percent: 100,
    inserted,
    errors: importErrors.length,
  });

  // Clean up cached preview
  previewCache.delete(options.previewToken);

  return { inserted, skipped, errors: importErrors, duration, batchId };
}

// ── getProgress ──────────────────────────────────────────────────────

export function getProgress(token: string): ProgressUpdate | null {
  return progressCache.get(token) ?? null;
}

// ── listBatches ──────────────────────────────────────────────────────

export async function listBatches(orgId: string): Promise<ImportBatch[]> {
  const rows = await db.execute(sql`
    SELECT
      import_batch_id AS "batchId",
      COUNT(*)::integer AS "rowCount",
      MIN(movement_date) AS "minDate",
      MAX(movement_date) AS "maxDate",
      MIN(imported_at) AS "importedAt"
    FROM historical_sales
    WHERE org_id = ${orgId}
    GROUP BY import_batch_id
    ORDER BY MIN(imported_at) DESC
  `);

  return (rows as any[]).map((r) => ({
    batchId: r.batchId,
    rowCount: r.rowCount,
    minDate: r.minDate instanceof Date ? r.minDate.toISOString() : String(r.minDate),
    maxDate: r.maxDate instanceof Date ? r.maxDate.toISOString() : String(r.maxDate),
    importedAt: r.importedAt instanceof Date ? r.importedAt.toISOString() : String(r.importedAt),
  }));
}

// ── deleteBatch ──────────────────────────────────────────────────────

export async function deleteBatch(
  orgId: string,
  batchId: string,
): Promise<{ deleted: number }> {
  const result = await db.execute(sql`
    DELETE FROM historical_sales
    WHERE org_id = ${orgId} AND import_batch_id = ${batchId}
  `);

  const deleted = typeof (result as any).count === "number"
    ? (result as any).count
    : (result as any[]).length ?? 0;

  return { deleted };
}
