import { db, type DbOrTx } from "@apex/database";
import {
  products,
  inventory,
  locations,
  categories,
  brands,
  historicalSales,
  productOptionTypes,
  productOptionValues,
  productVariantOptions,
  suppliers,
} from "@apex/database/schema";
import { eq, and, ilike, sql } from "drizzle-orm";
import { generateEan13 } from "@apex/types";
import crypto from "node:crypto";

// ── Types ────────────────────────────────────────────────────────────

export interface LocationMapping {
  csvName: string;
  apexLocationId: string | null;
  apexLocationName: string | null;
  autoMatched: boolean;
}

export interface CategoryMapping {
  csvName: string;
  apexCategoryId: string | null;
  apexCategoryName: string | null;
  autoMatched: boolean;
  productCount: number;
  createCount: number;
  updateCount: number;
}

export interface ParsedRowLocation {
  csvLocationName: string;
  apexLocationId: string | null;
  stockLevel: number;
  /** True iff the CSV row had a non-empty `In stock [X]` cell for this location.
   *  Distinguishes "explicitly 0" (compare against DB) from "not provided"
   *  (diff helper treats as unchanged, does NOT write 0 over existing stock). */
  stockLevelWasPresent: boolean;
  available: boolean;
  reorderPoint: number | null;
  optimalStock: number | null;
}

/** Row classification after diffing CSV values against the DB row.
 *  - CREATE    → SKU not found in DB
 *  - UPDATE    → SKU found AND at least one tracked field differs
 *  - NO_CHANGE → SKU found AND no tracked field differs (import MUST skip)
 *  See `computeItemDiff` for the tracked-field list. */
export type RowAction = "CREATE" | "UPDATE" | "NO_CHANGE";

export interface ParsedRow {
  rowIndex: number;
  name: string;
  sku: string;
  barcode: string;
  costPrice: string;
  unitPrice: string;
  isVariablePrice: boolean;
  categoryName: string;
  brandName: string;
  description: string;
  handle: string;
  option1Name: string;
  option1Value: string;
  option2Name: string;
  option2Value: string;
  option3Name: string;
  option3Value: string;
  /** Resolved display name for variants: "Parent Name (Variant)" */
  resolvedName: string;
  /** True if this row is part of a variant group */
  isVariant: boolean;
  /** The parent product name for variant groups */
  parentName: string;
  // New fields from export refactor
  active: boolean | null;
  sellingUnit: string;
  trackSerial: boolean | null;
  trackDot: boolean | null;
  specialOrder: boolean | null;
  oemNumber: string;
  supplierName: string;
  locations: ParsedRowLocation[];
  action: RowAction;
  existingProductId: string | null;
  changes: string[];
  errors: string[];
}

/** Parse Y/N/Yes/No/true/false to boolean, null if empty or unrecognized */
function parseYN(value: string | undefined | null): boolean | null {
  if (!value?.trim()) return null;
  const v = value.trim().toUpperCase();
  if (v === "Y" || v === "YES" || v === "TRUE" || v === "1") return true;
  if (v === "N" || v === "NO" || v === "FALSE" || v === "0") return false;
  return null;
}

/** Strip zero-width Unicode artifacts (BOM, LTR/RTL marks, soft hyphens) */
function sanitizeText(s: string | undefined | null): string {
  if (!s) return "";
  return s.replace(/[\u200B-\u200F\u202A-\u202E\uFEFF\u00AD]/g, "").trim();
}

// ── Diff helper ──────────────────────────────────────────────────────
//
// Single source of truth for deciding whether an existing row needs to change
// after an import. Used by both the preview pass (to classify NO_CHANGE vs
// UPDATE) and — via the same ParsedRow.changes list — by the results UI.
//
// Tracked fields (per product-manager spec):
//   1. Name              — trim, case-sensitive
//   2. Unit price        — parseFloat + round to 2 decimals
//   3. Cost price        — parseFloat + round to 2 decimals
//   4. Barcode           — trim, case-sensitive. ABSENT/empty CSV never clears
//                          the DB value (treat absent as unchanged).
//   5. Category name     — trim, case-sensitive. ABSENT CSV → unchanged.
//   6. Quantity per mapped location — numeric compare; absent/blank CSV cell
//                                    → unchanged (NOT coerced to 0).
//   7. Variant option values — set comparison of (type,value) pairs.
//
// Anything NOT in this list (description, sort order, updated_at, etc.) is
// explicitly ignored. See the "out of scope" notes in the task.
//
// Rounding: float equality is unreliable. Use Math.round(x * 100) / 100 on
// both sides before comparing. `"500"` / `"500.00"` / `500` → same bucket.
//
// This helper returns the human-readable change messages AND the raw
// changed-field count. `changes.length === 0` → caller classifies NO_CHANGE.

function parseMoney2dp(value: string | number | null | undefined): number | null {
  if (value == null) return null;
  const s = typeof value === "number" ? String(value) : value.trim();
  if (!s) return null;
  const n = parseFloat(s.replace(/[^0-9.-]/g, ""));
  if (isNaN(n)) return null;
  return Math.round(n * 100) / 100;
}

function normalizeText(s: string | null | undefined): string {
  // Trim both sides — handles trailing \r from Windows-exported CSVs.
  return (s ?? "").trim();
}

interface ExistingForDiff {
  name: string | null;
  unitPrice: string | null;
  costPrice: string | null;
  barcode: string | null;
  categoryName: string | null;
}

interface CsvForDiff {
  name: string;
  unitPrice: string; // already formatted as X.YY string by the parser
  costPrice: string;
  barcode: string;
  categoryName: string;
  isVariant: boolean;
  option1Name: string;
  option1Value: string;
  option2Name: string;
  option2Value: string;
  option3Name: string;
  option3Value: string;
  locations: ParsedRowLocation[];
}

/** Returns a list of human-readable change strings. Empty list ⇒ NO_CHANGE. */
function computeItemDiff(
  existing: ExistingForDiff,
  csv: CsvForDiff,
  existingStockByLocation: Map<string, number>,
  existingVariantOptions: Array<{ typeName: string; value: string }>,
): string[] {
  const changes: string[] = [];

  // ── Name ──────────────────────────────────────────────────────────
  // Absent CSV name never overwrites DB name.
  const csvName = normalizeText(csv.name);
  const dbName = normalizeText(existing.name);
  if (csvName && csvName !== dbName) {
    changes.push(`name: "${dbName}" → "${csvName}"`);
  }

  // ── Unit price ────────────────────────────────────────────────────
  const csvPrice = parseMoney2dp(csv.unitPrice);
  const dbPrice = parseMoney2dp(existing.unitPrice);
  if (csvPrice !== null && csvPrice !== (dbPrice ?? 0)) {
    changes.push(`unitPrice: ${(dbPrice ?? 0).toFixed(2)} → ${csvPrice.toFixed(2)}`);
  }

  // ── Cost price ────────────────────────────────────────────────────
  const csvCost = parseMoney2dp(csv.costPrice);
  const dbCost = parseMoney2dp(existing.costPrice);
  if (csvCost !== null && csvCost !== (dbCost ?? 0)) {
    changes.push(`costPrice: ${(dbCost ?? 0).toFixed(2)} → ${csvCost.toFixed(2)}`);
  }

  // ── Barcode ───────────────────────────────────────────────────────
  // Absent/empty CSV never clears DB barcode. Present + different ⇒ change.
  const csvBarcode = normalizeText(csv.barcode);
  const dbBarcode = normalizeText(existing.barcode);
  if (csvBarcode && csvBarcode !== dbBarcode) {
    changes.push(`barcode: "${dbBarcode}" → "${csvBarcode}"`);
  }

  // ── Category name ─────────────────────────────────────────────────
  // Absent CSV category never clears the existing one.
  const csvCategory = normalizeText(csv.categoryName);
  const dbCategory = normalizeText(existing.categoryName);
  if (csvCategory && csvCategory !== dbCategory) {
    changes.push(`category: "${dbCategory}" → "${csvCategory}"`);
  }

  // ── Quantity per mapped location ──────────────────────────────────
  for (const loc of csv.locations) {
    // Unmapped CSV location (user didn't wire it to a real store) → ignore.
    if (!loc.apexLocationId) continue;
    // Absent/blank CSV cell → treat as unchanged (not coerced to 0).
    if (!loc.stockLevelWasPresent) continue;
    const dbStock = existingStockByLocation.get(loc.apexLocationId) ?? 0;
    if (loc.stockLevel !== dbStock) {
      changes.push(`qty@${loc.csvLocationName}: ${dbStock} → ${loc.stockLevel}`);
    }
  }

  // ── Variant option values (only relevant when the row is a variant) ─
  if (csv.isVariant) {
    const csvPairs: string[] = [];
    if (csv.option1Name && csv.option1Value)
      csvPairs.push(`${normalizeText(csv.option1Name)}=${normalizeText(csv.option1Value)}`);
    if (csv.option2Name && csv.option2Value)
      csvPairs.push(`${normalizeText(csv.option2Name)}=${normalizeText(csv.option2Value)}`);
    if (csv.option3Name && csv.option3Value)
      csvPairs.push(`${normalizeText(csv.option3Name)}=${normalizeText(csv.option3Value)}`);

    const dbPairs = existingVariantOptions.map(
      (p) => `${normalizeText(p.typeName)}=${normalizeText(p.value)}`,
    );

    const csvSet = new Set(csvPairs);
    const dbSet = new Set(dbPairs);
    const added = csvPairs.filter((x) => !dbSet.has(x));
    const removed = dbPairs.filter((x) => !csvSet.has(x));
    if (added.length > 0 || removed.length > 0) {
      changes.push("variant options changed");
    }
  }

  return changes;
}

export interface PreviewRowSummary {
  rowIndex: number;
  name: string;
  variantName: string | null;
  sku: string;
  action: RowAction;
  changes: string[];
  errors: string[];
  isVariant?: boolean;
}

export interface PreviewResult {
  previewToken: string;
  format: "loyverse";
  totalRows: number;
  createCount: number;
  updateCount: number;
  /** Rows with SKU found but zero tracked-field differences — skipped on import. */
  noChangeCount: number;
  skipCount: number;
  errorCount: number;
  locationMapping: LocationMapping[];
  categoryMapping: CategoryMapping[];
  errors: Array<{ row: number; message: string }>;
  /** First 100 parsed rows (any action). Preserves the historical default view. */
  preview: PreviewRowSummary[];
  /** ALL CREATE rows — caller can show creates even if none are in the first 100. */
  createPreview: PreviewRowSummary[];
  /** ALL UPDATE rows — needed when NO_CHANGE dominates and updates wouldn't
   *  otherwise appear in the 100-row default slice. Typically small. */
  updatePreview: PreviewRowSummary[];
  /** First 100 NO_CHANGE rows for sanity-check preview. The full list can be
   *  tens of thousands and would blow the JSON response, so it's sampled. */
  noChangePreview: PreviewRowSummary[];
}

export interface ExecuteOptions {
  previewToken: string;
  importMode?: "smart_sync" | "create_only" | "update_only" | "inventory_sync";
  locationMapping?: Record<string, string>; // csvName -> apexLocationId overrides
  categoryMapping?: Record<string, { action: "create" | "map" | "skip"; targetCategoryId?: string; targetSubcategoryId?: string; familyId?: string; createSubcategory?: boolean }>;
  skipErrors?: boolean;
  createNewCategories?: boolean;
}

export interface ImportResult {
  created: number;
  updated: number;
  /** Rows skipped because of validation errors or mode filter (create_only/update_only).
   *  Does NOT include NO_CHANGE rows — those are counted separately in `noChange`. */
  skipped: number;
  /** Rows the diff helper classified as NO_CHANGE and the import loop silently skipped. */
  noChange: number;
  errors: Array<{ row: number; message: string }>;
  duration: number;
}

export interface ProgressUpdate {
  status: "running" | "completed" | "failed";
  processed: number;
  total: number;
  percent: number;
  created: number;
  updated: number;
  /** Only populated by the Item Catalog import pipeline. Optional so the
   *  Sales Receipts / Inventory Movements pipelines (out of scope for the
   *  NO_CHANGE refactor) don't need to construct it. */
  noChange?: number;
  errors: number;
}

// ── In-memory caches ─────────────────────────────────────────────────

interface CachedPreview {
  data: ParsedRow[];
  orgId: string;
  locationMapping: LocationMapping[];
  categoryMapping: CategoryMapping[];
  expiresAt: number;
}

const previewCache = new Map<string, CachedPreview>();
const progressCache = new Map<string, ProgressUpdate>();

const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

function cleanExpiredCache() {
  const now = Date.now();
  for (const [key, val] of previewCache) {
    if (val.expiresAt < now) previewCache.delete(key);
  }
}

// ── Header Alias Map ─────────────────────────────────────────────────

const HEADER_ALIASES: Record<string, string[]> = {
  name: ["Name", "Item name", "Item Name", "name", "item name"],
  sku: ["SKU", "Sku", "sku"],
  price: ["Default price", "Price", "default price", "price"],
  cost: ["Cost", "Purchase cost", "cost", "purchase cost"],
  barcode: ["Barcode", "barcode"],
  category: ["Category", "category"],
  subcategory: ["Sub-category", "sub-category", "Subcategory", "subcategory"],
  brand: ["Brand", "brand", "BRAND"],
  family: ["Family", "family", "FAMILY"],
  handle: ["Handle", "handle"],
  description: ["Description", "description"],
  trackStock: ["Track stock", "track stock"],
  supplier: ["Supplier", "supplier"],
  active: ["Active", "active", "ACTIVE"],
  unit: ["Unit", "unit", "Sold by", "sold by"],
  trackSerial: ["Track Serial", "track serial"],
  trackDot: ["Track DOT", "track dot", "Track Dot"],
  specialOrder: ["Special Order", "special order"],
  oemNumber: ["OEM Number", "oem number", "OEM", "oem"],
  option1Name: ["Option 1 name", "option 1 name", "Option 1", "option 1"],
  option1Value: ["Option 1 value", "option 1 value"],
  option2Name: ["Option 2 name", "option 2 name", "Option 2", "option 2"],
  option2Value: ["Option 2 value", "option 2 value"],
  option3Name: ["Option 3 name", "option 3 name", "Option 3", "option 3"],
  option3Value: ["Option 3 value", "option 3 value"],
  // Parsed but IGNORED — calculated or system-managed fields:
  markup: ["Markup %", "markup %"],
  createdAt: ["Created at", "created at"],
  updatedAt: ["Updated at", "updated at"],
};

function findColumn(headers: string[], field: string): number {
  const aliases = HEADER_ALIASES[field] ?? [field];
  return headers.findIndex((h) => aliases.includes(h.trim()));
}

function isLoyverseFormat(headers: string[]): boolean {
  const hasName = findColumn(headers, "name") >= 0;
  const hasSku = findColumn(headers, "sku") >= 0;
  return hasName && hasSku;
}

// ── CSV Parser ───────────────────────────────────────────────────────

function parseCSV(text: string): string[][] {
  // Remove BOM
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
  // Push last row
  cells.push(current.trim());
  if (cells.some((c) => c)) rows.push(cells);
  return rows;
}

// ── Mnemonic SKU generator (duplicated from products routes) ─────────

async function generateUniqueMnemonicSku(
  orgId: string,
  productName: string,
  dbOrTx: DbOrTx,
): Promise<string> {
  const prefix = productName
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .slice(0, 4)
    .padEnd(4, "X");

  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  for (let attempt = 0; attempt < 10; attempt++) {
    let suffix = "";
    for (let i = 0; i < 6; i++) {
      suffix += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    const candidate = prefix + suffix;

    const [existing] = await dbOrTx
      .select({ id: products.id })
      .from(products)
      .where(and(eq(products.orgId, orgId), eq(products.mnemonicSku, candidate)))
      .limit(1);

    if (!existing) return candidate;
  }

  // Fallback: timestamp-based
  const ts = Date.now().toString(36).toUpperCase().slice(-6).padStart(6, "X");
  return prefix + ts;
}

// ── parseLoyverseCSV ─────────────────────────────────────────────────

export async function parseLoyverseCSV(
  csvText: string,
  orgId: string,
): Promise<PreviewResult> {
  cleanExpiredCache();

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

  // Build column index map using aliases
  const colIdx = {
    name: findColumn(headers, "name"),
    sku: findColumn(headers, "sku"),
    price: findColumn(headers, "price"),
    cost: findColumn(headers, "cost"),
    barcode: findColumn(headers, "barcode"),
    category: findColumn(headers, "category"),
    subcategory: findColumn(headers, "subcategory"),
    brand: findColumn(headers, "brand"),
    family: findColumn(headers, "family"),
    description: findColumn(headers, "description"),
    handle: findColumn(headers, "handle"),
    supplier: findColumn(headers, "supplier"),
    active: findColumn(headers, "active"),
    unit: findColumn(headers, "unit"),
    trackSerial: findColumn(headers, "trackSerial"),
    trackDot: findColumn(headers, "trackDot"),
    specialOrder: findColumn(headers, "specialOrder"),
    oemNumber: findColumn(headers, "oemNumber"),
    option1Name: findColumn(headers, "option1Name"),
    option1Value: findColumn(headers, "option1Value"),
    option2Name: findColumn(headers, "option2Name"),
    option2Value: findColumn(headers, "option2Value"),
    option3Name: findColumn(headers, "option3Name"),
    option3Value: findColumn(headers, "option3Value"),
  };

  // Also build a generic lowercase header index map for location columns
  const headerIdx: Record<string, number> = {};
  for (let i = 0; i < headers.length; i++) {
    headerIdx[headers[i].toLowerCase()] = i;
  }

  // Extract per-location columns: "In stock [X]", "Available for sale [X]", "Price [X]", "Low stock [X]", "Optimal stock [X]"
  const stockPattern = /^in stock \[(.+)\]$/i;
  const availPattern = /^available for sale \[(.+)\]$/i;
  const priceLocPattern = /^price \[(.+)\]$/i;
  const lowStockPattern = /^low stock \[(.+)\]$/i;
  const optimalStockPattern = /^optimal stock \[(.+)\]$/i;
  const csvLocationNames = new Set<string>();

  for (const h of headers) {
    const stockMatch = h.match(stockPattern);
    if (stockMatch) csvLocationNames.add(stockMatch[1].trim());
    const availMatch = h.match(availPattern);
    if (availMatch) csvLocationNames.add(availMatch[1].trim());
    const priceLocMatch = h.match(priceLocPattern);
    if (priceLocMatch) csvLocationNames.add(priceLocMatch[1].trim());
    const lowStockMatch = h.match(lowStockPattern);
    if (lowStockMatch) csvLocationNames.add(lowStockMatch[1].trim());
    const optimalStockMatch = h.match(optimalStockPattern);
    if (optimalStockMatch) csvLocationNames.add(optimalStockMatch[1].trim());
  }

  // Match CSV locations to Apex locations by name (case-insensitive)
  const orgLocations = await db
    .select({ id: locations.id, name: locations.name })
    .from(locations)
    .where(and(eq(locations.orgId, orgId), eq(locations.isActive, true)));

  // Check saved import location mappings
  const savedMappingRows = await db.execute(
    sql`SELECT csv_location_name, apex_location_id FROM import_location_mappings WHERE org_id = ${orgId}`,
  );
  const savedMappings = new Map<string, string>();
  for (const row of savedMappingRows) {
    savedMappings.set((row as any).csv_location_name.toLowerCase(), (row as any).apex_location_id);
  }

  const locationMapping: LocationMapping[] = [];
  for (const csvName of csvLocationNames) {
    // Try auto-match by name first
    const match = orgLocations.find(
      (loc) => loc.name.trim().toLowerCase() === csvName.trim().toLowerCase(),
    );
    // Then check saved mappings
    const savedId = savedMappings.get(csvName.trim().toLowerCase());
    const savedLoc = savedId ? orgLocations.find((l) => l.id === savedId) : null;

    const resolvedId = match?.id ?? savedLoc?.id ?? null;
    const resolvedName = match?.name ?? savedLoc?.name ?? null;

    locationMapping.push({
      csvName,
      apexLocationId: resolvedId,
      apexLocationName: resolvedName,
      autoMatched: !!match || !!savedLoc,
    });
  }

  // Helper: get cell value by column index
  const getByIdx = (row: string[], idx: number): string => {
    if (idx < 0) return "";
    return (row[idx] ?? "").trim();
  };

  // Load all existing products by SKU for this org (bulk lookup).
  // Added categoryName (left-joined) so the diff helper can compare against
  // the CSV's category column without a second per-row lookup.
  const existingProducts = await db
    .select({
      id: products.id,
      sku: products.sku,
      name: products.name,
      unitPrice: products.unitPrice,
      costPrice: products.costPrice,
      barcode: products.barcode,
      categoryId: products.categoryId,
      categoryName: categories.name,
      description: products.description,
    })
    .from(products)
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .where(eq(products.orgId, orgId));

  const skuMap = new Map<string, (typeof existingProducts)[number]>();
  for (const p of existingProducts) {
    skuMap.set(p.sku.toLowerCase(), p);
  }

  // ── Pre-load existing per-location stock ─────────────────────────────
  // One sweep across the org's inventory. The diff helper needs to know what
  // stock the DB already has at each (product, location) so it can decide
  // whether the CSV's stock column is a real change. Fetching per-row during
  // parse would be O(N × locations) queries — prohibitive at 47K rows.
  const existingInventoryRows = await db
    .select({
      productId: inventory.productId,
      locationId: inventory.locationId,
      stockLevel: inventory.stockLevel,
    })
    .from(inventory)
    .innerJoin(products, eq(products.id, inventory.productId))
    .where(eq(products.orgId, orgId));

  /** productId → (locationId → stockLevel) */
  const existingStockMap = new Map<string, Map<string, number>>();
  for (const row of existingInventoryRows) {
    let locs = existingStockMap.get(row.productId);
    if (!locs) {
      locs = new Map();
      existingStockMap.set(row.productId, locs);
    }
    locs.set(row.locationId, row.stockLevel);
  }

  // ── Pre-load existing variant option values ──────────────────────────
  // Only variants have entries here. Used by the diff helper to detect
  // "variant options changed" vs NO_CHANGE. Missing entry ⇒ no options.
  const existingVariantOptionRows = await db
    .select({
      productId: productVariantOptions.productId,
      typeName: productOptionTypes.name,
      value: productOptionValues.value,
    })
    .from(productVariantOptions)
    .innerJoin(
      productOptionValues,
      eq(productVariantOptions.optionValueId, productOptionValues.id),
    )
    .innerJoin(
      productOptionTypes,
      eq(productOptionValues.optionTypeId, productOptionTypes.id),
    )
    .innerJoin(products, eq(products.id, productVariantOptions.productId))
    .where(eq(products.orgId, orgId));

  /** variantProductId → [{ typeName, value }, …] */
  const existingVariantOptionMap = new Map<
    string,
    Array<{ typeName: string; value: string }>
  >();
  for (const row of existingVariantOptionRows) {
    let arr = existingVariantOptionMap.get(row.productId);
    if (!arr) {
      arr = [];
      existingVariantOptionMap.set(row.productId, arr);
    }
    arr.push({ typeName: row.typeName, value: row.value });
  }

  // Parse data rows
  const parsedRows: ParsedRow[] = [];
  const errors: Array<{ row: number; message: string }> = [];
  let createCount = 0;
  let updateCount = 0;
  let skipCount = 0;

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 1; // 1-based for user display

    const name = getByIdx(row, colIdx.name);
    const rawSku = getByIdx(row, colIdx.sku);
    // SKUs in scientific notation (e.g., "1.01113E+12") are Excel-damaged —
    // precision is lost, so flag as an error rather than importing a corrupt SKU.
    const sku = rawSku && /[eE]\+/.test(rawSku) ? "" : rawSku;
    const rawBarcode = getByIdx(row, colIdx.barcode);
    // Barcodes in scientific notation (e.g., "4.97579E+12") are unrecoverable —
    // Excel destroyed the precision. Skip the barcode entirely; keep existing DB value.
    const barcode = rawBarcode && /[eE]/.test(rawBarcode) ? "" : rawBarcode;
    const costStr = getByIdx(row, colIdx.cost);
    const priceStr = getByIdx(row, colIdx.price);
    const categoryName = getByIdx(row, colIdx.category);
    // Parse brand from category name: "TIRE #01 - DELIUM" → brand "DELIUM"
    const brandName = categoryName && categoryName.includes(" - ")
      ? categoryName.split(" - ").slice(1).join(" - ").trim()
      : "";
    const description = getByIdx(row, colIdx.description);
    const handle = getByIdx(row, colIdx.handle);
    const option1Name = getByIdx(row, colIdx.option1Name);
    const option1Value = getByIdx(row, colIdx.option1Value);
    const option2Name = getByIdx(row, colIdx.option2Name);
    const option2Value = getByIdx(row, colIdx.option2Value);
    const option3Name = getByIdx(row, colIdx.option3Name);
    const option3Value = getByIdx(row, colIdx.option3Value);

    // New fields from export refactor
    const active = parseYN(getByIdx(row, colIdx.active));
    const sellingUnit = sanitizeText(getByIdx(row, colIdx.unit));
    const trackSerial = parseYN(getByIdx(row, colIdx.trackSerial));
    const trackDot = parseYN(getByIdx(row, colIdx.trackDot));
    const specialOrder = parseYN(getByIdx(row, colIdx.specialOrder));
    const oemNumber = sanitizeText(getByIdx(row, colIdx.oemNumber));
    const supplierName = sanitizeText(getByIdx(row, colIdx.supplier));

    const rowErrors: string[] = [];

    // Validate SKU
    if (!sku) {
      if (rawSku && /[eE]\+/.test(rawSku)) {
        rowErrors.push(`SKU "${rawSku}" is in scientific notation (Excel damage). Re-export the CSV directly from Loyverse without opening in Excel.`);
      } else {
        rowErrors.push("SKU is required");
      }
    }

    // Validate prices — handle Loyverse "variable" price items
    const priceNorm = (priceStr ?? "").trim().toLowerCase();
    const costNorm = (costStr ?? "").trim().toLowerCase();
    const isVariablePrice = priceNorm === "variable";
    const costPrice = costNorm && costNorm !== "variable" && costNorm !== "n/a"
      ? parseFloat(costStr!.replace(/[^0-9.-]/g, ""))
      : 0;
    const unitPrice = isVariablePrice ? 0
      : priceNorm && priceNorm !== "n/a"
        ? parseFloat(priceStr!.replace(/[^0-9.-]/g, ""))
        : 0;
    if (costStr && costNorm !== "variable" && costNorm !== "n/a" && isNaN(costPrice))
      rowErrors.push("Invalid cost price");
    if (priceStr && !isVariablePrice && priceNorm !== "n/a" && priceNorm !== "" && isNaN(unitPrice))
      rowErrors.push("Invalid unit price");

    // Extract per-location stock data
    const rowLocations: ParsedRowLocation[] = [];
    for (const mapping of locationMapping) {
      const stockIdx =
        headerIdx[`in stock [${mapping.csvName}]`.toLowerCase()];
      const availIdx =
        headerIdx[`available for sale [${mapping.csvName}]`.toLowerCase()];
      const lowStockIdx =
        headerIdx[`low stock [${mapping.csvName}]`.toLowerCase()];
      const optimalStockIdx =
        headerIdx[`optimal stock [${mapping.csvName}]`.toLowerCase()];

      // Track whether the CSV actually had a stock cell for this row —
      // the diff helper uses this to distinguish "explicitly 0" (compare
      // against DB) from "not provided" (treat as unchanged). Previously
      // both cases collapsed to 0 which made every no-op re-export look
      // like an update on stock=0 items.
      const rawStock = stockIdx !== undefined ? (row[stockIdx] ?? "").trim() : "";
      const stockLevelWasPresent = rawStock !== "";
      const stockLevel = stockLevelWasPresent ? (parseInt(rawStock, 10) || 0) : 0;
      const availRaw = availIdx !== undefined ? (row[availIdx] ?? "").trim().toLowerCase() : "";
      const available = availRaw === "" ? true : (availRaw === "y" || availRaw === "yes" || availRaw === "true" || availRaw === "1");
      // Blank reorder point defaults to 0 (no alert), not the schema default of 10
      const rawLowStock = lowStockIdx !== undefined ? (row[lowStockIdx] ?? "").trim() : "";
      const reorderPoint = rawLowStock !== ""
        ? Math.max(0, parseInt(rawLowStock, 10) || 0)
        : 0;
      const rawOptimal = optimalStockIdx !== undefined ? (row[optimalStockIdx] ?? "").trim() : "";
      const optimalStock = rawOptimal !== ""
        ? Math.max(0, parseInt(rawOptimal, 10) || 0)
        : 0;

      rowLocations.push({
        csvLocationName: mapping.csvName,
        apexLocationId: mapping.apexLocationId,
        stockLevel,
        stockLevelWasPresent,
        available,
        reorderPoint,
        optimalStock,
      });
    }

    // ── Classify the row ─────────────────────────────────────────────
    // CREATE  → SKU not found
    // UPDATE  → SKU found, diff has ≥1 change on tracked fields
    // NO_CHANGE → SKU found, diff is empty (import MUST skip)
    //
    // Diff is computed by `computeItemDiff` using the pre-loaded DB context
    // (stock per location, variant option values, category name). Description
    // is deliberately NOT tracked — the import loop never writes description
    // on UPDATE, so showing it in "changes" was a phantom.
    const existing = sku ? skuMap.get(sku.toLowerCase()) : null;
    let action: RowAction;
    let changes: string[];
    if (!existing) {
      action = "CREATE";
      changes = [];
    } else {
      changes = computeItemDiff(
        {
          name: existing.name,
          unitPrice: existing.unitPrice,
          costPrice: existing.costPrice,
          barcode: existing.barcode,
          categoryName: existing.categoryName,
        },
        {
          name,
          unitPrice: isNaN(unitPrice) ? "0.00" : unitPrice.toFixed(2),
          costPrice: isNaN(costPrice) ? "0.00" : costPrice.toFixed(2),
          barcode,
          categoryName,
          // `isVariant` / option fields are patched later during variant
          // grouping; we reclassify in the second pass below so they're
          // honored. For now, compare as non-variant (options empty).
          isVariant: false,
          option1Name,
          option1Value,
          option2Name,
          option2Value,
          option3Name,
          option3Value,
          locations: rowLocations,
        },
        existingStockMap.get(existing.id) ?? new Map(),
        existingVariantOptionMap.get(existing.id) ?? [],
      );
      action = changes.length > 0 ? "UPDATE" : "NO_CHANGE";
    }

    if (rowErrors.length > 0) {
      skipCount++;
      for (const e of rowErrors) {
        errors.push({ row: rowNum, message: `[${sku || "no SKU"}] ${e}` });
      }
    } else if (action === "CREATE") {
      createCount++;
    } else if (action === "UPDATE") {
      updateCount++;
    }
    // NO_CHANGE rows don't contribute to any count at this point — they're
    // tallied during the final recount pass below.

    parsedRows.push({
      rowIndex: rowNum,
      name,
      sku,
      barcode,
      costPrice: isNaN(costPrice) ? "0.00" : costPrice.toFixed(2),
      unitPrice: isNaN(unitPrice) ? "0.00" : unitPrice.toFixed(2),
      isVariablePrice,
      categoryName,
      brandName,
      description,
      handle,
      option1Name,
      option1Value,
      option2Name,
      option2Value,
      option3Name,
      option3Value,
      resolvedName: name, // Will be updated below for variants
      isVariant: false,   // Will be updated below
      parentName: "",     // Will be updated below
      active,
      sellingUnit,
      trackSerial,
      trackDot,
      specialOrder,
      oemNumber,
      supplierName,
      locations: rowLocations,
      action,
      existingProductId: existing?.id ?? null,
      changes,
      errors: rowErrors,
    });
  }

  // ── Variant grouping by Handle ──
  // Group rows by Handle to resolve parent/variant relationships
  const handleGroups = new Map<string, ParsedRow[]>();
  for (const row of parsedRows) {
    if (!row.handle) continue;
    if (!handleGroups.has(row.handle)) handleGroups.set(row.handle, []);
    handleGroups.get(row.handle)!.push(row);
  }

  for (const [, rows] of handleGroups) {
    if (rows.length <= 1) {
      // Single row with handle — check if it has option values
      const row = rows[0];
      const hasOptionValue = row.option1Value?.trim();
      if (hasOptionValue) {
        // Single variant — still create parent/child structure
        const parentName = row.name.trim() || `Unknown (${row.handle})`;
        const variantParts = [row.option1Value, row.option2Value, row.option3Value].filter(Boolean);
        const variantSuffix = variantParts.join(" / ");
        row.isVariant = true;
        row.parentName = parentName;
        row.resolvedName = `${parentName} (${variantSuffix})`;
        if (variantSuffix) row.name = variantSuffix;
        row.errors = row.errors.filter((e) => e !== "Name is required");
      }
      continue;
    }

    // Find the parent row — the one with a non-empty Name
    const parentRow = rows.find((r) => r.name.trim()) || rows[0];
    const parentName = parentRow.name.trim() || `Unknown (${parentRow.handle})`;

    // Mark all rows in this group as variants
    for (const row of rows) {
      const variantParts = [row.option1Value, row.option2Value, row.option3Value].filter(Boolean);
      const variantSuffix = variantParts.join(" / ");

      row.isVariant = true;
      row.parentName = parentName;
      row.resolvedName = variantSuffix
        ? `${parentName} (${variantSuffix})`
        : parentName;

      // For variant rows, the DB product name should be the short variant name (e.g., "14", "FORD RANGER")
      // The first row in a Loyverse group has BOTH the parent name AND an option value —
      // it must use the variant suffix as its name, not the parent name.
      if (variantSuffix) {
        row.name = variantSuffix;
      }

      // Don't flag missing Name as error for variant rows — we resolved it
      row.errors = row.errors.filter((e) => e !== "Name is required");
      if (row.errors.length === 0 && row.sku) {
        // Re-count: was previously counted as skip due to missing name
        // Don't re-count — the counts were set based on errors at parse time
        // This is fine since we removed the error
      }
    }
  }

  // Recount after variant resolution (some rows may have lost their errors).
  //
  // Also re-run the diff for rows that are now known to be variants — the
  // first-pass classification treated them as non-variants (isVariant=false)
  // because the variant grouping runs afterward. For these rows the option
  // fields need to participate in the diff, which can promote NO_CHANGE to
  // UPDATE (or vice versa) when option values actually differ.
  createCount = 0;
  updateCount = 0;
  let noChangeCount = 0;
  skipCount = 0;
  const updatedErrors: Array<{ row: number; message: string }> = [];
  for (const row of parsedRows) {
    // Re-diff variant rows whose existingProductId is known — their first-pass
    // diff ignored option values.
    if (row.isVariant && row.existingProductId && row.errors.length === 0) {
      const existing = skuMap.get(row.sku.toLowerCase());
      if (existing) {
        row.changes = computeItemDiff(
          {
            name: existing.name,
            unitPrice: existing.unitPrice,
            costPrice: existing.costPrice,
            barcode: existing.barcode,
            categoryName: existing.categoryName,
          },
          {
            name: row.name,
            unitPrice: row.unitPrice,
            costPrice: row.costPrice,
            barcode: row.barcode,
            categoryName: row.categoryName,
            isVariant: true,
            option1Name: row.option1Name,
            option1Value: row.option1Value,
            option2Name: row.option2Name,
            option2Value: row.option2Value,
            option3Name: row.option3Name,
            option3Value: row.option3Value,
            locations: row.locations,
          },
          existingStockMap.get(existing.id) ?? new Map(),
          existingVariantOptionMap.get(existing.id) ?? [],
        );
        row.action = row.changes.length > 0 ? "UPDATE" : "NO_CHANGE";
      }
    }

    if (row.errors.length > 0) {
      skipCount++;
      for (const e of row.errors) {
        updatedErrors.push({ row: row.rowIndex, message: `[${row.sku || "no SKU"}] ${e}` });
      }
    } else if (row.action === "CREATE") {
      createCount++;
    } else if (row.action === "UPDATE") {
      updateCount++;
    } else {
      noChangeCount++;
    }
  }

  // ── Category matching ──
  // Extract unique category names from parsed rows and match to existing categories
  const csvCategoryCounts = new Map<string, number>();
  for (const row of parsedRows) {
    if (row.categoryName) {
      const key = row.categoryName.trim();
      if (key) csvCategoryCounts.set(key, (csvCategoryCounts.get(key) ?? 0) + 1);
    }
  }

  const orgCategories = await db
    .select({ id: categories.id, name: categories.name })
    .from(categories)
    .where(eq(categories.orgId, orgId));

  // Count creates vs updates per category
  const csvCategoryActions = new Map<string, { create: number; update: number }>();
  for (const row of parsedRows) {
    const key = row.categoryName?.trim().toLowerCase();
    if (key) {
      const entry = csvCategoryActions.get(key) ?? { create: 0, update: 0 };
      if (row.action === "CREATE") entry.create++;
      else if (row.action === "UPDATE") entry.update++;
      csvCategoryActions.set(key, entry);
    }
  }

  const categoryMapping: CategoryMapping[] = [];
  for (const [csvName, count] of csvCategoryCounts) {
    const match = orgCategories.find(
      (c) => c.name.trim().toLowerCase() === csvName.trim().toLowerCase(),
    );
    const actions = csvCategoryActions.get(csvName.trim().toLowerCase()) ?? { create: 0, update: 0 };
    categoryMapping.push({
      csvName,
      apexCategoryId: match?.id ?? null,
      apexCategoryName: match?.name ?? null,
      autoMatched: !!match,
      productCount: count,
      createCount: actions.create,
      updateCount: actions.update,
    });
  }

  // Generate preview token and cache
  const previewToken = crypto.randomUUID();
  previewCache.set(previewToken, {
    data: parsedRows,
    orgId,
    locationMapping,
    categoryMapping,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });

  // Row → preview-summary shape. Keeps variant display logic in one place.
  const toSummary = (r: ParsedRow): PreviewRowSummary => ({
    rowIndex: r.rowIndex,
    name: r.isVariant ? r.parentName : r.name,
    variantName: r.isVariant
      ? [r.option1Value, r.option2Value, r.option3Value].filter(Boolean).join(" / ") || null
      : null,
    sku: r.sku,
    action: r.action,
    changes: r.changes,
    errors: r.errors,
    isVariant: r.isVariant,
  });

  return {
    previewToken,
    format: "loyverse",
    totalRows: parsedRows.length,
    createCount,
    updateCount,
    noChangeCount,
    skipCount,
    errorCount: updatedErrors.length,
    locationMapping,
    categoryMapping,
    errors: updatedErrors,
    preview: parsedRows.slice(0, 100).map(toSummary),
    // ALL CREATE rows — lets the frontend show creates even if none are in the first 100.
    createPreview: parsedRows.filter((r) => r.action === "CREATE").map(toSummary),
    // ALL UPDATE rows — typically small (this fix's whole premise is that only a
    // handful of rows on a 47K reimport are real updates). Needed because with
    // NO_CHANGE rows dominating the CSV, updates would never appear in the
    // first-100 slice.
    updatePreview: parsedRows.filter((r) => r.action === "UPDATE").map(toSummary),
    // Sample of NO_CHANGE rows for user sanity-check. Capped — the full list can
    // be tens of thousands of rows and would blow the JSON response.
    noChangePreview: parsedRows
      .filter((r) => r.action === "NO_CHANGE")
      .slice(0, 100)
      .map(toSummary),
  };
}

// ── Option type/value population for variants ──────────────────────
// Populates product_option_types, product_option_values, and
// product_variant_options so the export can reconstruct Option 1/2/3
// columns. Each parent has its OWN option types (SIZE, LEAF, etc.).

async function upsertOptionLinks(
  tx: any,
  orgId: string,
  parentProductId: string,
  variantProductId: string,
  row: ParsedRow,
) {
  const optionPairs: Array<{ name: string; value: string; sort: number }> = [];
  if (row.option1Name && row.option1Value)
    optionPairs.push({ name: row.option1Name, value: row.option1Value, sort: 0 });
  if (row.option2Name && row.option2Value)
    optionPairs.push({ name: row.option2Name, value: row.option2Value, sort: 1 });
  if (row.option3Name && row.option3Value)
    optionPairs.push({ name: row.option3Name, value: row.option3Value, sort: 2 });

  for (const { name, value, sort } of optionPairs) {
    // Find or create option type scoped to this parent
    const [existingType] = await tx
      .select({ id: productOptionTypes.id })
      .from(productOptionTypes)
      .where(
        and(
          eq(productOptionTypes.orgId, orgId),
          eq(productOptionTypes.productId, parentProductId),
          eq(productOptionTypes.name, name),
        ),
      )
      .limit(1);

    let optTypeId: string;
    if (existingType) {
      optTypeId = existingType.id;
    } else {
      const [newType] = await tx
        .insert(productOptionTypes)
        .values({
          orgId,
          productId: parentProductId,
          name,
          sortOrder: sort,
        })
        .returning({ id: productOptionTypes.id });
      optTypeId = newType.id;
    }

    // Find or create option value
    const [existingVal] = await tx
      .select({ id: productOptionValues.id })
      .from(productOptionValues)
      .where(
        and(
          eq(productOptionValues.optionTypeId, optTypeId),
          eq(productOptionValues.value, value),
        ),
      )
      .limit(1);

    let optValId: string;
    if (existingVal) {
      optValId = existingVal.id;
    } else {
      const [newVal] = await tx
        .insert(productOptionValues)
        .values({
          optionTypeId: optTypeId,
          value,
          sortOrder: 0,
        })
        .returning({ id: productOptionValues.id });
      optValId = newVal.id;
    }

    // Link variant → option value (idempotent)
    await tx
      .insert(productVariantOptions)
      .values({
        productId: variantProductId,
        optionValueId: optValId,
      })
      .onConflictDoNothing();
  }
}

// ── executeImport ────────────────────────────────────────────────────

export async function executeImport(
  options: ExecuteOptions,
): Promise<ImportResult> {
  cleanExpiredCache();

  const cached = previewCache.get(options.previewToken);
  if (!cached) {
    throw new Error("Preview token expired or invalid. Please re-upload the CSV.");
  }

  const { data: allParsedRows, orgId, locationMapping } = cached;

  // ── Early filter: only process rows relevant to the import mode ──
  // This avoids iterating through 46K rows when only 4 are new (create_only)
  const mode = options.importMode || "smart_sync";
  const parsedRows = mode === "create_only"
    ? allParsedRows.filter((r) => r.action === "CREATE" || r.errors.length > 0)
    : mode === "update_only"
      ? allParsedRows.filter((r) => r.action === "UPDATE" || r.errors.length > 0)
      : allParsedRows;

  // ── HARD BLOCK: inventory_sync NEVER touches categories/brands ──
  if (mode === "inventory_sync") {
    console.warn("[IMPORT] inventory_sync mode — categories/brands BLOCKED");
    // Strip ALL category/brand data from rows so no code path can use it
    for (const row of parsedRows) {
      row.categoryName = "";
      row.brandName = "";
    }
    // Also strip category mapping from options
    delete options.categoryMapping;
    options.createNewCategories = false;
  }

  // Apply location mapping overrides
  if (options.locationMapping) {
    for (const mapping of locationMapping) {
      const override = options.locationMapping[mapping.csvName];
      if (override) {
        mapping.apexLocationId = override;
        mapping.autoMatched = false;
      }
    }
    // Also update parsed row locations
    for (const row of parsedRows) {
      for (const loc of row.locations) {
        const override = options.locationMapping[loc.csvLocationName];
        if (override) {
          loc.apexLocationId = override;
        }
      }
    }
  }

  const startTime = Date.now();
  let created = 0;
  let updated = 0;
  let skipped = 0;
  let noChange = 0;
  const importErrors: Array<{ row: number; message: string }> = [];

  // Init progress
  progressCache.set(options.previewToken, {
    status: "running",
    processed: 0,
    total: parsedRows.length,
    percent: 0,
    created: 0,
    updated: 0,
    noChange: 0,
    errors: 0,
  });

  // Category cache: name → id
  const categoryCache = new Map<string, string>();
  const orgCategories = await db
    .select({ id: categories.id, name: categories.name })
    .from(categories)
    .where(eq(categories.orgId, orgId));
  for (const c of orgCategories) {
    categoryCache.set(c.name.toLowerCase(), c.id);
  }

  // Brand cache: name → id
  const brandCache = new Map<string, string>();
  const orgBrands = await db
    .select({ id: brands.id, name: brands.name })
    .from(brands)
    .where(eq(brands.orgId, orgId));
  for (const b of orgBrands) {
    brandCache.set(b.name.toLowerCase(), b.id);
  }

  // Pre-create parent products for variant groups
  // Collect unique parent names from variant groups that need parents
  const parentProductMap = new Map<string, string>(); // handle -> parentProductId
  const variantHandles = new Set(
    parsedRows.filter((r) => r.isVariant && r.handle).map((r) => r.handle),
  );

  if (variantHandles.size > 0) {
    await db.transaction(async (tx) => {
      for (const handle of variantHandles) {
        const groupRows = parsedRows.filter((r) => r.handle === handle);
        const parentRow = groupRows.find((r) => r.parentName) || groupRows[0];
        const parentName = parentRow.parentName || parentRow.name;

        // Check if parent already exists by name + isParent
        const [existingParent] = await tx
          .select({ id: products.id })
          .from(products)
          .where(
            and(
              eq(products.orgId, orgId),
              eq(products.name, parentName),
              eq(products.isParent, true),
            ),
          )
          .limit(1);

        if (existingParent) {
          parentProductMap.set(handle, existingParent.id);
        } else {
          // Create parent product
          const parentMnemonic = await generateUniqueMnemonicSku(
            orgId,
            parentName,
            tx as unknown as DbOrTx,
          );
          const parentSku = `P-${Date.now().toString(36).toUpperCase().slice(-8)}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;

          let parentCategoryId: string | null = null;
          let parentBrandId: string | null = null;
          // inventory_sync: NEVER assign category/brand to parent products
          if (parentRow.categoryName && mode !== "inventory_sync") {
            parentCategoryId = categoryCache.get(parentRow.categoryName.toLowerCase()) ?? null;
          }
          if (parentRow.brandName && mode !== "inventory_sync") {
            parentBrandId = brandCache.get(parentRow.brandName.toLowerCase()) ?? null;
          }

          const [newParent] = await tx
            .insert(products)
            .values({
              orgId,
              name: parentName,
              sku: parentSku,
              mnemonicSku: parentMnemonic,
              category: "HARD_PARTS",
              unitPrice: "0.00",
              costPrice: "0.00",
              isParent: true,
              categoryId: parentCategoryId,
              brandId: parentBrandId,
            })
            .returning({ id: products.id });

          if (newParent) {
            parentProductMap.set(handle, newParent.id);
          }
        }
      }
    });
  }

  // Process in batches of 500
  const BATCH_SIZE = 500;
  for (let batchStart = 0; batchStart < parsedRows.length; batchStart += BATCH_SIZE) {
    const batch = parsedRows.slice(batchStart, batchStart + BATCH_SIZE);

    try {
      await db.transaction(async (tx) => {
        for (const row of batch) {
          // Skip rows with validation errors
          if (row.errors.length > 0) {
            if (options.skipErrors) {
              skipped++;
              continue;
            } else {
              for (const e of row.errors) {
                importErrors.push({ row: row.rowIndex, message: e });
              }
              skipped++;
              continue;
            }
          }

          // NO_CHANGE: the preview pass already diffed CSV vs DB and found
          // zero changed tracked fields. Skipping here means:
          //   - no SAVEPOINT open
          //   - no UPDATE/INSERT against products/inventory
          //   - no audit-table write (price-change log, etc.)
          //   - no updated_at bump
          // This is the entire point of the NO_CHANGE classification — turning
          // 47K no-op UPDATEs into a zero-write walk.
          if (row.action === "NO_CHANGE") {
            noChange++;
            continue;
          }

          try {
            // SAVEPOINT for row-level error isolation — allows rollback without aborting batch transaction
            await tx.execute(sql`SAVEPOINT row_${sql.raw(String(row.rowIndex))}`);

            // ── INVENTORY SYNC FAST PATH ──
            // For existing items in inventory_sync mode, update stock + availability + prices
            // Skip name/category — massive performance improvement
            if (mode === "inventory_sync" && row.action === "UPDATE" && row.existingProductId) {
              // Update prices on the product
              const priceFields: Record<string, unknown> = {};
              if (row.unitPrice && row.unitPrice !== "0.00") priceFields.unitPrice = row.unitPrice;
              if (row.costPrice && row.costPrice !== "0.00") priceFields.costPrice = row.costPrice;
              if (row.isVariablePrice) priceFields.isVariablePrice = true;
              if (Object.keys(priceFields).length > 0) {
                await tx.update(products).set(priceFields).where(eq(products.id, row.existingProductId));
              }
              // Upsert inventory per mapped location (stock + availability)
              for (const loc of row.locations) {
                if (!loc.apexLocationId) continue;
                const [existingInv] = await tx
                  .select({ id: inventory.id })
                  .from(inventory)
                  .where(
                    and(
                      eq(inventory.productId, row.existingProductId),
                      eq(inventory.locationId, loc.apexLocationId),
                    ),
                  )
                  .limit(1);

                if (existingInv) {
                  await tx
                    .update(inventory)
                    .set({
                      stockLevel: loc.stockLevel,
                      availableForSale: loc.available,
                      reorderPoint: loc.reorderPoint ?? 0,
                      optimalStock: loc.optimalStock ?? 0,
                    })
                    .where(eq(inventory.id, existingInv.id));
                } else {
                  await tx.insert(inventory).values({
                    orgId,
                    productId: row.existingProductId,
                    locationId: loc.apexLocationId,
                    stockLevel: loc.stockLevel,
                    availableForSale: loc.available,
                    reorderPoint: loc.reorderPoint ?? 0,
                    optimalStock: loc.optimalStock ?? 0,
                  });
                }
              }

              updated++;
              await tx.execute(sql`RELEASE SAVEPOINT row_${sql.raw(String(row.rowIndex))}`);
              continue; // Skip ALL category/brand/family logic — next row
            }

            // Resolve category — check user mapping first, then cache, then auto-create
            // HARD BLOCK: inventory_sync NEVER resolves categories (for ANY row type)
            let categoryId: string | null = null;
            if (row.categoryName && mode !== "inventory_sync") {
              const catMapping = options.categoryMapping?.[row.categoryName];
              if (catMapping) {
                if (catMapping.action === "map" && catMapping.targetCategoryId) {
                  categoryId = catMapping.targetCategoryId;
                } else if (catMapping.action === "create") {
                  // Check cache first (may have been created for a previous row)
                  categoryId = categoryCache.get(row.categoryName.toLowerCase()) ?? null;
                  if (!categoryId) {
                    if (!catMapping.familyId) {
                      throw new Error(`Cannot create category "${row.categoryName}" without a family. Please select a family in the category mapping.`);
                    }
                    const slug = row.categoryName
                      .toLowerCase()
                      .replace(/[^a-z0-9]+/g, "-")
                      .replace(/^-|-$/g, "");
                    const catSlugVal = slug || `cat-${Date.now()}`;
                    const [newCat] = await tx
                      .insert(categories)
                      .values({
                        orgId,
                        name: row.categoryName,
                        slug: catSlugVal,
                        familyId: catMapping.familyId,
                      })
                      .onConflictDoNothing()
                      .returning({ id: categories.id });
                    if (newCat) {
                      categoryId = newCat.id;
                      categoryCache.set(row.categoryName.toLowerCase(), newCat.id);
                    } else {
                      // Already exists — fetch it
                      const [existCat] = await tx
                        .select({ id: categories.id })
                        .from(categories)
                        .where(and(eq(categories.orgId, orgId), eq(categories.slug, catSlugVal)))
                        .limit(1);
                      if (existCat) {
                        categoryId = existCat.id;
                        categoryCache.set(row.categoryName.toLowerCase(), existCat.id);
                      }
                    }
                  }
                }
              } else {
                // No explicit mapping — try auto-match by name
                categoryId = categoryCache.get(row.categoryName.toLowerCase()) ?? null;
                if (!categoryId && options.createNewCategories && (mode as string) !== "inventory_sync") {
                  const autoSlug = row.categoryName
                    .toLowerCase()
                    .replace(/[^a-z0-9]+/g, "-")
                    .replace(/^-|-$/g, "");
                  const autoSlugVal = autoSlug || `cat-${Date.now()}`;
                  const [newCat] = await tx
                    .insert(categories)
                    .values({
                      orgId,
                      name: row.categoryName,
                      slug: autoSlugVal,
                    })
                    .onConflictDoNothing()
                    .returning({ id: categories.id });
                  if (newCat) {
                    categoryId = newCat.id;
                    categoryCache.set(row.categoryName.toLowerCase(), newCat.id);
                  } else {
                    const [existCat] = await tx
                      .select({ id: categories.id })
                      .from(categories)
                      .where(and(eq(categories.orgId, orgId), eq(categories.slug, autoSlugVal)))
                      .limit(1);
                    if (existCat) {
                      categoryId = existCat.id;
                      categoryCache.set(row.categoryName.toLowerCase(), existCat.id);
                    }
                  }
                }
              }
            }

            // Resolve sub-category from mapping
            // HARD BLOCK: inventory_sync NEVER resolves subcategories
            let subcategoryId: string | null = null;
            if (row.categoryName && mode !== "inventory_sync") {
              const catMapping = options.categoryMapping?.[row.categoryName];
              if (catMapping?.targetSubcategoryId) {
                subcategoryId = catMapping.targetSubcategoryId;
              }
            }

            // Resolve brand from parsed category name
            // HARD BLOCK: inventory_sync NEVER resolves brands
            let brandId: string | null = null;
            if (row.brandName && mode !== "inventory_sync") {
              brandId = brandCache.get(row.brandName.toLowerCase()) ?? null;
              if (!brandId) {
                // Create brand — use onConflictDoNothing to avoid aborting transaction
                const slug = row.brandName
                  .toLowerCase()
                  .replace(/[^a-z0-9]+/g, "-")
                  .replace(/^-|-$/g, "");
                const [newBrand] = await tx
                  .insert(brands)
                  .values({
                    orgId,
                    name: row.brandName,
                    slug: slug || `brand-${Date.now()}`,
                  })
                  .onConflictDoNothing()
                  .returning({ id: brands.id });
                if (newBrand) {
                  brandId = newBrand.id;
                  brandCache.set(row.brandName.toLowerCase(), newBrand.id);
                } else {
                  // Already exists — fetch it
                  const [existing] = await tx
                    .select({ id: brands.id })
                    .from(brands)
                    .where(and(eq(brands.orgId, orgId), eq(brands.slug, slug || `brand-${Date.now()}`)))
                    .limit(1);
                  if (existing) {
                    brandId = existing.id;
                    brandCache.set(row.brandName.toLowerCase(), existing.id);
                  }
                }
              }
            }

            // Import mode safety check (rows are pre-filtered above, but double-check)
            if (mode === "create_only" && row.action === "UPDATE") {
              skipped++;
              await tx.execute(sql`RELEASE SAVEPOINT row_${sql.raw(String(row.rowIndex))}`);
              continue;
            }
            if (mode === "update_only" && row.action === "CREATE") {
              skipped++;
              await tx.execute(sql`RELEASE SAVEPOINT row_${sql.raw(String(row.rowIndex))}`);
              continue;
            }

            if (row.action === "CREATE") {
              // Generate mnemonic SKU
              const mnemonicSku = await generateUniqueMnemonicSku(
                orgId,
                row.name,
                tx as unknown as DbOrTx,
              );
              // Generate barcode if not provided
              const barcode = row.barcode || generateEan13();

              // Determine parent product ID for variants
              const parentProductId = row.isVariant && row.handle
                ? parentProductMap.get(row.handle) ?? null
                : null;

              const [product] = await tx
                .insert(products)
                .values({
                  orgId,
                  name: row.name,
                  sku: row.sku,
                  mnemonicSku,
                  unitPrice: row.unitPrice,
                  costPrice: row.costPrice,
                  isVariablePrice: row.isVariablePrice,
                  barcode,
                  category: "HARD_PARTS",
                  categoryId: mode === "inventory_sync" ? null : categoryId,
                  subcategoryId: mode === "inventory_sync" ? null : subcategoryId,
                  brandId: mode === "inventory_sync" ? null : brandId,
                  description: row.description || null,
                  parentProductId,
                  isParent: false,
                  // New fields from export refactor
                  ...(row.sellingUnit ? { sellingUnit: row.sellingUnit } : {}),
                  ...(row.trackSerial != null ? { isSerialized: row.trackSerial } : {}),
                  ...(row.trackDot != null ? { isTire: row.trackDot } : {}),
                  ...(row.specialOrder != null ? { specialOrder: row.specialOrder } : {}),
                  ...(row.active != null ? { isActive: row.active, discontinued: !row.active } : {}),
                  ...(row.oemNumber ? { oemNumber: row.oemNumber } : {}),
                })
                .returning({ id: products.id });

              // Insert inventory per mapped location
              for (const loc of row.locations) {
                if (!loc.apexLocationId) continue;
                await tx.insert(inventory).values({
                  orgId,
                  productId: product.id,
                  locationId: loc.apexLocationId,
                  stockLevel: loc.stockLevel,
                  availableForSale: loc.available,
                  reorderPoint: loc.reorderPoint ?? 0,
                  optimalStock: loc.optimalStock ?? 0,
                });
              }

              // Populate option type/value/link tables for variants (Gap 1)
              if (row.isVariant && parentProductId) {
                await upsertOptionLinks(tx, orgId, parentProductId, product.id, row);
              }

              created++;
            } else if (row.action === "UPDATE" && row.existingProductId) {
              // Update product fields — inventory_sync mode: stock + availability only (no name/price)
              const updateFields: Record<string, unknown> = {};
              if (mode === "inventory_sync") {
                // Inventory Sync: ONLY prices — NEVER update name/category/brand/description
                if (row.unitPrice && row.unitPrice !== "0.00") updateFields.unitPrice = row.unitPrice;
                if (row.costPrice && row.costPrice !== "0.00") updateFields.costPrice = row.costPrice;
                if (row.isVariablePrice) updateFields.isVariablePrice = true;
                // Hard block: do NOT include categoryId, subcategoryId, brandId, name, barcode, description
              } else {
                // Smart Sync / Update Only: update safe fields ONLY.
                // NEVER update brand, category, or subcategory on existing products —
                // the April 14 2026 import proved that CSV brand columns create 200+
                // junk brand entries and reassign thousands of products. Brand/category
                // assignments must be managed manually, not via bulk import.
                if (row.unitPrice !== "0.00") updateFields.unitPrice = row.unitPrice;
                if (row.costPrice !== "0.00") updateFields.costPrice = row.costPrice;
                if (row.isVariablePrice) updateFields.isVariablePrice = true;
                if (row.barcode) updateFields.barcode = row.barcode;
                if (row.oemNumber) updateFields.oemNumber = row.oemNumber;
                if (row.sellingUnit) updateFields.sellingUnit = row.sellingUnit;
                if (row.trackSerial != null) updateFields.isSerialized = row.trackSerial;
                if (row.trackDot != null) updateFields.isTire = row.trackDot;
                if (row.specialOrder != null) updateFields.specialOrder = row.specialOrder;
                if (row.active != null) { updateFields.isActive = row.active; updateFields.discontinued = !row.active; }
                // BLOCKED on UPDATE: name, description, categoryId, subcategoryId, brandId
                // These are identity fields that should not change via import.
              }

              if (Object.keys(updateFields).length > 0) {
                await tx
                  .update(products)
                  .set(updateFields)
                  .where(eq(products.id, row.existingProductId));
              }

              // Upsert inventory per mapped location
              for (const loc of row.locations) {
                if (!loc.apexLocationId) continue;

                const [existingInv] = await tx
                  .select({ id: inventory.id })
                  .from(inventory)
                  .where(
                    and(
                      eq(inventory.productId, row.existingProductId),
                      eq(inventory.locationId, loc.apexLocationId),
                    ),
                  )
                  .limit(1);

                if (existingInv) {
                  await tx
                    .update(inventory)
                    .set({
                      stockLevel: loc.stockLevel,
                      availableForSale: loc.available,
                      reorderPoint: loc.reorderPoint ?? 0,
                      optimalStock: loc.optimalStock ?? 0,
                    })
                    .where(eq(inventory.id, existingInv.id));
                } else {
                  await tx.insert(inventory).values({
                    orgId,
                    productId: row.existingProductId,
                    locationId: loc.apexLocationId,
                    stockLevel: loc.stockLevel,
                    availableForSale: loc.available,
                    reorderPoint: loc.reorderPoint ?? 0,
                    optimalStock: loc.optimalStock ?? 0,
                  });
                }
              }

              // Populate option links for existing variants on UPDATE (Gap 1)
              if (row.isVariant && row.handle) {
                const parentId = parentProductMap.get(row.handle);
                if (parentId && row.existingProductId) {
                  await upsertOptionLinks(tx, orgId, parentId, row.existingProductId, row);
                }
              }

              updated++;
            }
            // Release savepoint on success
            await tx.execute(sql`RELEASE SAVEPOINT row_${sql.raw(String(row.rowIndex))}`);
          } catch (rowErr: any) {
            // Rollback to savepoint — keeps the transaction alive for remaining rows
            try {
              await tx.execute(sql`ROLLBACK TO SAVEPOINT row_${sql.raw(String(row.rowIndex))}`);
            } catch {}
            if (options.skipErrors) {
              skipped++;
              importErrors.push({
                row: row.rowIndex,
                message: rowErr.message || "Unknown error",
              });
            } else {
              throw rowErr;
            }
          }
        }
      });
    } catch (batchErr: any) {
      // If an entire batch fails and skipErrors is false, record and continue
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
      created,
      updated,
      noChange,
      errors: importErrors.length,
    });
  }

  const duration = Date.now() - startTime;

  // Final progress
  progressCache.set(options.previewToken, {
    status: "completed",
    processed: parsedRows.length,
    total: parsedRows.length,
    percent: 100,
    created,
    updated,
    noChange,
    errors: importErrors.length,
    errorLog: importErrors,
  });

  // Clean up cached preview data (import is done)
  previewCache.delete(options.previewToken);

  return { created, updated, skipped, noChange, errors: importErrors.length, errorLog: importErrors, duration };
}

// ── getProgress ──────────────────────────────────────────────────────

export function getProgress(token: string): ProgressUpdate | null {
  return progressCache.get(token) ?? null;
}

// ══════════════════════════════════════════════════════════════════════
// RECEIPTS (SALES HISTORY) IMPORT
// ══════════════════════════════════════════════════════════════════════

interface ReceiptRow {
  date: string;
  receiptNumber: string;
  receiptType: string;
  category: string;
  sku: string;
  item: string;
  variant: string;
  quantity: number;
  grossSales: number;
  discounts: number;
  netSales: number;
  costOfGoods: number;
  taxes: number;
  pos: string;
  store: string;
  cashierName: string;
  customerName: string;
  status: string;
}

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
  preview: { date: string; receipt: string; item: string; sku: string; qty: number; net: number; store: string; type: string }[];
}

interface CachedReceiptsPreview {
  orgId: string;
  rows: ReceiptRow[];
  locationMapping: LocationMapping[];
  expiresAt: number;
}

const receiptsPreviewCache = new Map<string, CachedReceiptsPreview>();

export async function parseReceiptsCSV(csvText: string, orgId: string): Promise<ReceiptsPreviewResult> {
  cleanExpiredCache();

  // Parse CSV — handle BOM
  let text = csvText;
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) throw new Error("CSV file is empty or has no data rows");

  // Parse header
  const headerLine = lines[0];
  const headers = parseCSVLine(headerLine);
  const headerMap: Record<string, number> = {};
  headers.forEach((h, i) => { headerMap[h.trim()] = i; });

  // Validate required columns
  const requiredCols = ["Date", "Receipt number", "Receipt type", "SKU", "Quantity", "Net sales", "Store", "Status"];
  const missingCols = requiredCols.filter((c) => headerMap[c] === undefined);
  if (missingCols.length > 0) {
    // Try alternate names
    const altNames: Record<string, string[]> = {
      "Item": ["Item name", "Product"],
      "Net sales": ["Net Sales", "Net amount"],
    };
    // If critical columns are missing, throw
    if (headerMap["Date"] === undefined || headerMap["Receipt number"] === undefined) {
      throw new Error(`Missing required columns: ${missingCols.join(", ")}. Is this a Loyverse Receipts by Item export?`);
    }
  }

  const getCol = (row: string[], col: string): string => {
    const idx = headerMap[col];
    return idx !== undefined ? (row[idx] || "").trim() : "";
  };

  // Parse rows
  const parsedRows: ReceiptRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i]);
    if (cols.length < 5) continue;

    const status = getCol(cols, "Status");
    const dateStr = getCol(cols, "Date");
    if (!dateStr) continue;

    parsedRows.push({
      date: dateStr,
      receiptNumber: getCol(cols, "Receipt number"),
      receiptType: getCol(cols, "Receipt type"),
      category: getCol(cols, "Category"),
      sku: getCol(cols, "SKU"),
      item: getCol(cols, "Item") || getCol(cols, "Item name"),
      variant: getCol(cols, "Variant"),
      quantity: parseFloat(getCol(cols, "Quantity")) || 0,
      grossSales: parseFloat(getCol(cols, "Gross sales")) || 0,
      discounts: parseFloat(getCol(cols, "Discounts")) || 0,
      netSales: parseFloat(getCol(cols, "Net sales")) || 0,
      costOfGoods: parseFloat(getCol(cols, "Cost of goods")) || 0,
      taxes: parseFloat(getCol(cols, "Taxes")) || 0,
      pos: getCol(cols, "POS"),
      store: getCol(cols, "Store"),
      cashierName: getCol(cols, "Cashier name"),
      customerName: getCol(cols, "Customer name"),
      status,
    });
  }

  // Analyze
  const salesRows = parsedRows.filter((r) => r.receiptType === "Sale" && r.status !== "Voided");
  const refundRows = parsedRows.filter((r) => r.receiptType === "Refund" && r.status !== "Voided");
  const voidedRows = parsedRows.filter((r) => r.status === "Voided");
  const receiptNumbers = new Set(parsedRows.map((r) => r.receiptNumber));
  const stores = [...new Set(parsedRows.map((r) => r.store).filter(Boolean))];

  // Date range
  const dates = parsedRows.map((r) => parseReceiptDate(r.date)).filter((d) => d !== null) as Date[];
  dates.sort((a, b) => a.getTime() - b.getTime());
  const dateRange = {
    from: dates.length > 0 ? dates[0].toISOString().split("T")[0] : "",
    to: dates.length > 0 ? dates[dates.length - 1].toISOString().split("T")[0] : "",
  };

  // SKU matching
  const uniqueSkus = [...new Set(parsedRows.map((r) => r.sku).filter(Boolean))];
  const matchedSkus = new Set<string>();
  if (uniqueSkus.length > 0) {
    const existing = await db
      .select({ sku: products.sku })
      .from(products)
      .where(eq(products.orgId, orgId));
    const existingSet = new Set(existing.map((e) => e.sku.toLowerCase()));
    for (const sku of uniqueSkus) {
      if (existingSet.has(sku.toLowerCase())) matchedSkus.add(sku);
    }
  }

  const unmatchedSkus: { sku: string; item: string; count: number }[] = [];
  const skuCounts = new Map<string, { item: string; count: number }>();
  for (const row of parsedRows) {
    if (row.sku && !matchedSkus.has(row.sku)) {
      const entry = skuCounts.get(row.sku) || { item: row.item, count: 0 };
      entry.count++;
      skuCounts.set(row.sku, entry);
    }
  }
  for (const [sku, info] of skuCounts) {
    unmatchedSkus.push({ sku, item: info.item, count: info.count });
  }
  unmatchedSkus.sort((a, b) => b.count - a.count);

  const matchRate = uniqueSkus.length > 0
    ? `${Math.round((matchedSkus.size / uniqueSkus.length) * 100)}%`
    : "N/A";

  // Location mapping — reuse saved mappings
  const savedMappingRows = await db.execute(
    sql`SELECT csv_location_name, apex_location_id FROM import_location_mappings WHERE org_id = ${orgId}`,
  );
  const savedMappings = new Map<string, string>();
  for (const row of savedMappingRows) {
    savedMappings.set((row as any).csv_location_name?.toLowerCase(), (row as any).apex_location_id);
  }

  const allLocations = await db.select({ id: locations.id, name: locations.name })
    .from(locations)
    .where(and(eq(locations.orgId, orgId), eq(locations.isActive, true)));

  const locationMapping: LocationMapping[] = stores.map((store) => {
    // Check saved mapping
    const savedId = savedMappings.get(store.toLowerCase());
    if (savedId) {
      const loc = allLocations.find((l) => l.id === savedId);
      return {
        csvName: store,
        apexLocationId: savedId,
        apexLocationName: loc?.name || store,
        autoMatched: true,
        saved: true,
      };
    }
    // Try exact match
    const exact = allLocations.find((l) => l.name.toLowerCase() === store.toLowerCase());
    if (exact) {
      return {
        csvName: store,
        apexLocationId: exact.id,
        apexLocationName: exact.name,
        autoMatched: true,
        saved: false,
      };
    }
    return { csvName: store, apexLocationId: null, apexLocationName: null, autoMatched: false, saved: false };
  });

  // Cache for execute
  const token = crypto.randomUUID();
  receiptsPreviewCache.set(token, {
    orgId,
    rows: parsedRows,
    locationMapping,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });

  return {
    previewToken: token,
    totalRows: parsedRows.length,
    dateRange,
    stores,
    receiptCount: receiptNumbers.size,
    salesCount: salesRows.length,
    refundCount: refundRows.length,
    voidedCount: voidedRows.length,
    skuMatchRate: matchRate,
    unmatchedSkus: unmatchedSkus.slice(0, 50),
    locationMapping,
    preview: parsedRows.slice(0, 50).map((r) => ({
      date: r.date,
      receipt: r.receiptNumber,
      item: r.variant ? `${r.item} (${r.variant})` : r.item,
      sku: r.sku,
      qty: r.quantity,
      net: r.netSales,
      store: r.store,
      type: r.receiptType,
    })),
  };
}

function parseReceiptDate(dateStr: string): Date | null {
  // Format: DD/MM/YYYY HH:mm
  const [datePart, timePart] = dateStr.split(" ");
  if (!datePart) return null;
  const [day, month, year] = datePart.split("/");
  if (!day || !month || !year) return null;
  const isoStr = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}T${timePart || "00:00"}:00+08:00`;
  const d = new Date(isoStr);
  return isNaN(d.getTime()) ? null : d;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (c === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += c;
    }
  }
  result.push(current);
  return result;
}

export interface ReceiptsExecuteOptions {
  previewToken: string;
  locationMapping?: Record<string, string>;
  skipVoided?: boolean;
  skipCustomerCount?: boolean;
  skipZeroQty?: boolean;
}

export async function executeReceiptsImport(options: ReceiptsExecuteOptions) {
  const cached = receiptsPreviewCache.get(options.previewToken);
  if (!cached) throw new Error("Preview expired. Please re-upload the CSV.");

  const { orgId, rows } = cached;
  const batchId = crypto.randomUUID();
  const BATCH_SIZE = 500;

  // Build location mapping
  const locMap = new Map<string, string>();
  if (options.locationMapping) {
    for (const [csvName, locId] of Object.entries(options.locationMapping)) {
      locMap.set(csvName.toLowerCase(), locId);
    }
  }
  for (const lm of cached.locationMapping) {
    if (lm.apexLocationId && !locMap.has(lm.csvName.toLowerCase())) {
      locMap.set(lm.csvName.toLowerCase(), lm.apexLocationId);
    }
  }

  // Build product lookup by SKU
  const allProducts = await db.select({ id: products.id, sku: products.sku, name: products.name })
    .from(products)
    .where(eq(products.orgId, orgId));
  const skuToProduct = new Map<string, { id: string; name: string }>();
  for (const p of allProducts) {
    if (p.sku) skuToProduct.set(p.sku.toLowerCase(), { id: p.id, name: p.name });
  }

  // Location name lookup
  const allLocations = await db.select({ id: locations.id, name: locations.name })
    .from(locations)
    .where(eq(locations.orgId, orgId));
  const locIdToName = new Map(allLocations.map((l) => [l.id, l.name]));

  // Track progress
  const progressToken = options.previewToken;
  progressCache.set(progressToken, {
    status: "running",
    processed: 0,
    total: rows.length,
    percent: 0,
    created: 0,
    updated: 0,
    errors: 0,
  });

  let created = 0;
  let skipped = 0;
  let priceBackfilled = 0;
  const errors: { row: number; message: string }[] = [];

  for (let batchStart = 0; batchStart < rows.length; batchStart += BATCH_SIZE) {
    const batch = rows.slice(batchStart, batchStart + BATCH_SIZE);

    try {
      await db.transaction(async (tx) => {
        for (let i = 0; i < batch.length; i++) {
          const row = batch[i];
          const rowIndex = batchStart + i + 1;

          try {
            await tx.execute(sql`SAVEPOINT receipt_row_${sql.raw(String(rowIndex))}`);

            // Skip voided
            if (row.status === "Voided" && (options.skipVoided ?? true)) {
              skipped++;
              await tx.execute(sql`RELEASE SAVEPOINT receipt_row_${sql.raw(String(rowIndex))}`);
              continue;
            }

            // Skip CUSTOMER COUNT
            if ((row.sku === "CUSTOMER COUNT" || row.item?.includes("CUSTOMER COUNT")) && (options.skipCustomerCount ?? true)) {
              skipped++;
              await tx.execute(sql`RELEASE SAVEPOINT receipt_row_${sql.raw(String(rowIndex))}`);
              continue;
            }

            // Skip zero qty + zero net
            if (row.quantity === 0 && row.netSales === 0 && (options.skipZeroQty ?? true)) {
              skipped++;
              await tx.execute(sql`RELEASE SAVEPOINT receipt_row_${sql.raw(String(rowIndex))}`);
              continue;
            }

            // Parse date
            const movementDate = parseReceiptDate(row.date);
            if (!movementDate) {
              errors.push({ row: rowIndex, message: `Invalid date: ${row.date}` });
              skipped++;
              await tx.execute(sql`RELEASE SAVEPOINT receipt_row_${sql.raw(String(rowIndex))}`);
              continue;
            }

            // Match product
            const product = row.sku ? skuToProduct.get(row.sku.toLowerCase()) : null;

            // Map location
            const locationId = row.store ? locMap.get(row.store.toLowerCase()) || null : null;
            const locationName = locationId ? (locIdToName.get(locationId) || row.store) : (row.store || "Unknown");

            // Determine type
            const isRefund = row.receiptType === "Refund";
            const reasonType = isRefund ? "REFUND" : "SALE";
            const direction = isRefund ? "IN" : "OUT";
            const qty = Math.abs(Math.round(row.quantity));
            if (qty === 0) {
              skipped++;
              await tx.execute(sql`RELEASE SAVEPOINT receipt_row_${sql.raw(String(rowIndex))}`);
              continue;
            }

            const productName = row.variant
              ? `${row.item} (${row.variant})`
              : row.item || "Unknown";

            // Dedup check
            const [existing] = await tx
              .select({ id: historicalSales.id })
              .from(historicalSales)
              .where(and(
                eq(historicalSales.orgId, orgId),
                eq(historicalSales.reasonReference, row.receiptNumber),
                eq(historicalSales.sku, row.sku || ""),
                eq(historicalSales.movementDate, movementDate),
              ))
              .limit(1);

            if (existing) {
              // Update existing record with price data (may have been imported before price columns existed)
              if (row.netSales !== 0 || row.costOfGoods !== 0) {
                const upUnitPrice = qty > 0 ? Math.abs(row.netSales / qty) : 0;
                await tx
                  .update(historicalSales)
                  .set({
                    unitPrice: upUnitPrice.toFixed(2),
                    netSales: Math.abs(row.netSales).toFixed(2),
                    costAmount: Math.abs(row.costOfGoods || 0).toFixed(2),
                    discountAmount: Math.abs(row.discounts || 0).toFixed(2),
                    customerName: row.customerName || null,
                  })
                  .where(eq(historicalSales.id, existing.id));
                priceBackfilled++;
              }
              skipped++;
              await tx.execute(sql`RELEASE SAVEPOINT receipt_row_${sql.raw(String(rowIndex))}`);
              continue;
            }

            // Insert
            const unitPrice = qty > 0 ? Math.abs(row.netSales / qty) : 0;
            await tx.insert(historicalSales).values({
              orgId,
              productId: product?.id || null,
              sku: row.sku || "",
              productName,
              locationId,
              locationName,
              employeeName: row.cashierName || null,
              reasonType: reasonType as any,
              reasonReference: row.receiptNumber,
              quantity: qty,
              unitPrice: unitPrice.toFixed(2),
              netSales: Math.abs(row.netSales).toFixed(2),
              costAmount: Math.abs(row.costOfGoods || 0).toFixed(2),
              discountAmount: Math.abs(row.discounts || 0).toFixed(2),
              customerName: row.customerName || null,
              direction: direction as any,
              movementDate,
              importBatchId: batchId,
            });

            created++;
            await tx.execute(sql`RELEASE SAVEPOINT receipt_row_${sql.raw(String(rowIndex))}`);
          } catch (rowErr: any) {
            try { await tx.execute(sql`ROLLBACK TO SAVEPOINT receipt_row_${sql.raw(String(rowIndex))}`); } catch {}
            errors.push({ row: rowIndex, message: rowErr.message || "Unknown error" });
            skipped++;
          }
        }
      });
    } catch (batchErr: any) {
      errors.push({ row: batchStart + 1, message: `Batch error: ${batchErr.message}` });
    }

    // Update progress
    progressCache.set(progressToken, {
      status: "running",
      processed: Math.min(batchStart + BATCH_SIZE, rows.length),
      total: rows.length,
      percent: Math.round(((batchStart + BATCH_SIZE) / rows.length) * 100),
      created,
      updated: 0,
      errors: errors.length,
    });
  }

  // Final progress
  progressCache.set(progressToken, {
    status: "completed",
    processed: rows.length,
    total: rows.length,
    percent: 100,
    created,
    updated: 0,
    errors: errors.length,
  });

  // Clean up preview cache
  receiptsPreviewCache.delete(options.previewToken);

  return { created, skipped, priceBackfilled, errors: errors.length, errorLog: errors, batchId };
}

// ── Backfill orphaned historical sales ──

export async function backfillOrphanedSales(orgId: string) {
  const result = await db.execute(sql`
    UPDATE historical_sales hs
    SET product_id = p.id
    FROM products p
    WHERE hs.product_id IS NULL
      AND hs.org_id = p.org_id
      AND hs.org_id = ${orgId}
      AND hs.sku IS NOT NULL
      AND hs.sku != ''
      AND LOWER(TRIM(hs.sku)) = LOWER(TRIM(p.sku))
  `);
  return { linked: result.length ?? 0 };
}
