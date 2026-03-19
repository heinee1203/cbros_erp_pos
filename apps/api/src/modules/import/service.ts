import { db, type DbOrTx } from "@apex/database";
import {
  products,
  inventory,
  locations,
  categories,
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

export interface ParsedRowLocation {
  csvLocationName: string;
  apexLocationId: string | null;
  stockLevel: number;
  available: boolean;
}

export interface ParsedRow {
  rowIndex: number;
  name: string;
  sku: string;
  barcode: string;
  costPrice: string;
  unitPrice: string;
  isVariablePrice: boolean;
  categoryName: string;
  description: string;
  handle: string;
  option1Name: string;
  option1Value: string;
  option2Value: string;
  option3Value: string;
  /** Resolved display name for variants: "Parent Name (Variant)" */
  resolvedName: string;
  /** True if this row is part of a variant group */
  isVariant: boolean;
  /** The parent product name for variant groups */
  parentName: string;
  locations: ParsedRowLocation[];
  action: "CREATE" | "UPDATE";
  existingProductId: string | null;
  changes: string[];
  errors: string[];
}

export interface PreviewResult {
  previewToken: string;
  format: "loyverse";
  totalRows: number;
  createCount: number;
  updateCount: number;
  skipCount: number;
  errorCount: number;
  locationMapping: LocationMapping[];
  errors: Array<{ row: number; message: string }>;
  preview: Array<{
    rowIndex: number;
    name: string;
    variantName: string | null;
    sku: string;
    action: "CREATE" | "UPDATE";
    changes: string[];
    errors: string[];
    isVariant?: boolean;
  }>;
}

export interface ExecuteOptions {
  previewToken: string;
  locationMapping?: Record<string, string>; // csvName -> apexLocationId overrides
  skipErrors?: boolean;
  createNewCategories?: boolean;
}

export interface ImportResult {
  created: number;
  updated: number;
  skipped: number;
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
  errors: number;
}

// ── In-memory caches ─────────────────────────────────────────────────

interface CachedPreview {
  data: ParsedRow[];
  orgId: string;
  locationMapping: LocationMapping[];
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
  handle: ["Handle", "handle"],
  description: ["Description", "description"],
  trackStock: ["Track stock", "track stock"],
  supplier: ["Supplier", "supplier"],
  option1Name: ["Option 1 name", "option 1 name"],
  option1Value: ["Option 1 value", "option 1 value"],
  option2Name: ["Option 2 name", "option 2 name"],
  option2Value: ["Option 2 value", "option 2 value"],
  option3Name: ["Option 3 name", "option 3 name"],
  option3Value: ["Option 3 value", "option 3 value"],
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
    description: findColumn(headers, "description"),
    handle: findColumn(headers, "handle"),
    option1Name: findColumn(headers, "option1Name"),
    option1Value: findColumn(headers, "option1Value"),
    option2Value: findColumn(headers, "option2Value"),
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

  const locationMapping: LocationMapping[] = [];
  for (const csvName of csvLocationNames) {
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

  // Helper: get cell value by column index
  const getByIdx = (row: string[], idx: number): string => {
    if (idx < 0) return "";
    return (row[idx] ?? "").trim();
  };

  // Load all existing products by SKU for this org (bulk lookup)
  const existingProducts = await db
    .select({
      id: products.id,
      sku: products.sku,
      name: products.name,
      unitPrice: products.unitPrice,
      costPrice: products.costPrice,
      barcode: products.barcode,
      categoryId: products.categoryId,
      description: products.description,
    })
    .from(products)
    .where(eq(products.orgId, orgId));

  const skuMap = new Map<string, (typeof existingProducts)[number]>();
  for (const p of existingProducts) {
    skuMap.set(p.sku.toLowerCase(), p);
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
    const sku = getByIdx(row, colIdx.sku);
    const barcode = getByIdx(row, colIdx.barcode);
    const costStr = getByIdx(row, colIdx.cost);
    const priceStr = getByIdx(row, colIdx.price);
    const categoryName = getByIdx(row, colIdx.category);
    const description = getByIdx(row, colIdx.description);
    const handle = getByIdx(row, colIdx.handle);
    const option1Name = getByIdx(row, colIdx.option1Name);
    const option1Value = getByIdx(row, colIdx.option1Value);
    const option2Value = getByIdx(row, colIdx.option2Value);
    const option3Value = getByIdx(row, colIdx.option3Value);

    const rowErrors: string[] = [];

    // Validate SKU
    if (!sku) {
      rowErrors.push("SKU is required");
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

      const stockLevel = stockIdx !== undefined
        ? parseInt(row[stockIdx] ?? "0", 10) || 0
        : 0;
      const available = availIdx !== undefined
        ? (row[availIdx] ?? "").trim().toLowerCase() !== "no"
        : true;

      rowLocations.push({
        csvLocationName: mapping.csvName,
        apexLocationId: mapping.apexLocationId,
        stockLevel,
        available,
      });
    }

    // Determine action
    const existing = sku ? skuMap.get(sku.toLowerCase()) : null;
    const action: "CREATE" | "UPDATE" = existing ? "UPDATE" : "CREATE";

    // Compute changes for updates
    const changes: string[] = [];
    if (existing) {
      if (name && name !== existing.name) changes.push(`name: "${existing.name}" → "${name}"`);
      if (unitPrice.toFixed(2) !== (existing.unitPrice ?? "0.00"))
        changes.push(`unitPrice: ${existing.unitPrice} → ${unitPrice.toFixed(2)}`);
      if (costPrice.toFixed(2) !== (existing.costPrice ?? "0.00"))
        changes.push(`costPrice: ${existing.costPrice} → ${costPrice.toFixed(2)}`);
      if (barcode && barcode !== (existing.barcode ?? ""))
        changes.push(`barcode: "${existing.barcode ?? ""}" → "${barcode}"`);
      if (description && description !== (existing.description ?? ""))
        changes.push("description changed");
    }

    if (rowErrors.length > 0) {
      skipCount++;
      for (const e of rowErrors) {
        errors.push({ row: rowNum, message: `[${sku || "no SKU"}] ${e}` });
      }
    } else if (action === "CREATE") {
      createCount++;
    } else {
      updateCount++;
    }

    parsedRows.push({
      rowIndex: rowNum,
      name,
      sku,
      barcode,
      costPrice: isNaN(costPrice) ? "0.00" : costPrice.toFixed(2),
      unitPrice: isNaN(unitPrice) ? "0.00" : unitPrice.toFixed(2),
      isVariablePrice,
      categoryName,
      description,
      handle,
      option1Name,
      option1Value,
      option2Value,
      option3Value,
      resolvedName: name, // Will be updated below for variants
      isVariant: false,   // Will be updated below
      parentName: "",     // Will be updated below
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
    if (rows.length <= 1) continue; // Single row with handle = standalone, skip

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

      // If the row has an empty name (variant rows in Loyverse), fill it with the variant suffix
      // so the product name in the DB will be the short variant name (e.g., "FORD RANGER")
      if (!row.name.trim() && variantSuffix) {
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

  // Recount after variant resolution (some rows may have lost their errors)
  createCount = 0;
  updateCount = 0;
  skipCount = 0;
  const updatedErrors: Array<{ row: number; message: string }> = [];
  for (const row of parsedRows) {
    if (row.errors.length > 0) {
      skipCount++;
      for (const e of row.errors) {
        updatedErrors.push({ row: row.rowIndex, message: `[${row.sku || "no SKU"}] ${e}` });
      }
    } else if (row.action === "CREATE") {
      createCount++;
    } else {
      updateCount++;
    }
  }

  // Generate preview token and cache
  const previewToken = crypto.randomUUID();
  previewCache.set(previewToken, {
    data: parsedRows,
    orgId,
    locationMapping,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });

  return {
    previewToken,
    format: "loyverse",
    totalRows: parsedRows.length,
    createCount,
    updateCount,
    skipCount,
    errorCount: updatedErrors.length,
    locationMapping,
    errors: updatedErrors,
    preview: parsedRows.slice(0, 100).map((r) => ({
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
    })),
  };
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
  const importErrors: Array<{ row: number; message: string }> = [];

  // Init progress
  progressCache.set(options.previewToken, {
    status: "running",
    processed: 0,
    total: parsedRows.length,
    percent: 0,
    created: 0,
    updated: 0,
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
          if (parentRow.categoryName) {
            parentCategoryId = categoryCache.get(parentRow.categoryName.toLowerCase()) ?? null;
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

          try {
            // Resolve category
            let categoryId: string | null = null;
            if (row.categoryName) {
              categoryId = categoryCache.get(row.categoryName.toLowerCase()) ?? null;
              if (!categoryId && options.createNewCategories) {
                const slug = row.categoryName
                  .toLowerCase()
                  .replace(/[^a-z0-9]+/g, "-")
                  .replace(/^-|-$/g, "");
                const [newCat] = await tx
                  .insert(categories)
                  .values({
                    orgId,
                    name: row.categoryName,
                    slug: slug || `cat-${Date.now()}`,
                  })
                  .returning({ id: categories.id });
                if (newCat) {
                  categoryId = newCat.id;
                  categoryCache.set(row.categoryName.toLowerCase(), newCat.id);
                }
              }
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
                  name: row.name, // Short variant name (e.g., "FORD RANGER") — display combines with parent
                  sku: row.sku,
                  mnemonicSku,
                  unitPrice: row.unitPrice,
                  costPrice: row.costPrice,
                  isVariablePrice: row.isVariablePrice,
                  barcode,
                  category: "HARD_PARTS",
                  categoryId,
                  description: row.description || null,
                  parentProductId,
                  isParent: false,
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
                });
              }

              created++;
            } else if (row.action === "UPDATE" && row.existingProductId) {
              // Update product fields
              const updateFields: Record<string, unknown> = {};
              if (row.name) updateFields.name = row.name;
              if (row.unitPrice !== "0.00") updateFields.unitPrice = row.unitPrice;
              if (row.costPrice !== "0.00") updateFields.costPrice = row.costPrice;
              if (row.isVariablePrice) updateFields.isVariablePrice = true;
              if (row.barcode) updateFields.barcode = row.barcode;
              if (row.description) updateFields.description = row.description;
              if (categoryId) updateFields.categoryId = categoryId;

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
                    })
                    .where(eq(inventory.id, existingInv.id));
                } else {
                  await tx.insert(inventory).values({
                    orgId,
                    productId: row.existingProductId,
                    locationId: loc.apexLocationId,
                    stockLevel: loc.stockLevel,
                    availableForSale: loc.available,
                  });
                }
              }

              updated++;
            }
          } catch (rowErr: any) {
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
    errors: importErrors.length,
  });

  // Clean up cached preview data (import is done)
  previewCache.delete(options.previewToken);

  return { created, updated, skipped, errors: importErrors, duration };
}

// ── getProgress ──────────────────────────────────────────────────────

export function getProgress(token: string): ProgressUpdate | null {
  return progressCache.get(token) ?? null;
}
