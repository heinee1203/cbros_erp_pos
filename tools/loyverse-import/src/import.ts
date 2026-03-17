import path from "path";
import { fileURLToPath } from "url";
import { db, BATCH_SIZE, getOrgId, closeDb } from "./config";
import { parseCSV, type LoyverseRow } from "./parser";
import { ensureLocations } from "./locations";
import { ensureCategories, classifyCategory } from "./categories";
import { generateMnemonicSku, resetMnemonicState } from "./mnemonic";
import { generateCostCode } from "@apex/types";
import { products, inventory } from "@apex/database/schema";
import { sql } from "drizzle-orm";

// Monorepo root (3 levels up from src/)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MONOREPO_ROOT = path.resolve(__dirname, "../../..");

async function main() {
  // Filter out "--" separator that pnpm passes through
  const args = process.argv.slice(2).filter((a) => a !== "--");
  const rawCsvArg = args.find((a) => !a.startsWith("-"));
  const csvPath = rawCsvArg
    ? path.resolve(MONOREPO_ROOT, rawCsvArg)
    : path.resolve(MONOREPO_ROOT, "updated_export_items.csv");
  const clearFlag = args.includes("--clear");

  console.log("═══════════════════════════════════════════════");
  console.log("  APEX POS — Loyverse Catalog Import");
  console.log("═══════════════════════════════════════════════\n");

  const startTime = Date.now();

  try {
    // 1. Get org
    const orgId = await getOrgId();
    console.log(`  Org ID: ${orgId}\n`);

    // 2. Parse CSV
    console.log("── Parsing CSV ──");
    const { rows } = parseCSV(csvPath);
    console.log(`  Total rows: ${rows.length}\n`);

    // 3. Clear existing data if requested
    if (clearFlag) {
      console.log("── Clearing Existing Data ──");
      await clearExistingData(orgId);
      console.log("  Done.\n");
    }

    // 4. Ensure locations
    console.log("── Ensuring Locations ──");
    const locationMap = await ensureLocations(orgId);
    console.log();

    // 5. Ensure categories
    console.log("── Ensuring Categories ──");
    const uniqueCats = [
      ...new Set(rows.map((r) => r.category).filter(Boolean)),
    ];
    const categoryMap = await ensureCategories(orgId, uniqueCats);
    console.log();

    // 6. Import products + inventory
    console.log("── Importing Products ──");
    const stats = await importProducts(rows, orgId, locationMap, categoryMap);

    // 7. Summary
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    printSummary(stats, elapsed);
  } catch (err: any) {
    console.error(`\n  FATAL: ${err.message}`);
    console.error(err.stack);
    process.exit(1);
  } finally {
    await closeDb();
  }
}

async function clearExistingData(orgId: string) {
  // Delete in FK-safe order
  const tables = [
    "stock_journal",
    "job_card_parts",
    "job_card_state_log",
    "job_cards",
    "inventory_count_lines",
    "inventory_counts",
    "stock_transfer_items",
    "stock_transfer_receipts",
    "stock_transfers",
    "po_receipt_events",
    "po_receipts",
    "po_lines",
    "purchase_orders",
    "sale_payments",
    "sale_lines",
    "sales",
    "shifts",
    "inventory",
    "vehicle_compatibility",
    "products",
    "categories",
  ];

  for (const table of tables) {
    try {
      await db.execute(
        sql.raw(`DELETE FROM ${table} WHERE org_id = '${orgId}'`),
      );
      console.log(`  Cleared: ${table}`);
    } catch (e: any) {
      // Table might not exist or might have no org_id
      console.log(`  Skip: ${table} (${e.message?.substring(0, 60)})`);
    }
  }
}

interface ImportStats {
  productsInserted: number;
  inventoryInserted: number;
  variablePrice: number;
  fixedPrice: number;
  withBarcode: number;
  withCost: number;
  duplicateBarcodes: number;
  duplicateSkus: number;
  availableForSaleCount: number;
  inventoryByLocation: Map<string, { skus: number; units: number }>;
  categoryBreakdown: Map<string, number>;
}

async function importProducts(
  rows: LoyverseRow[],
  orgId: string,
  locationMap: Map<string, string>,
  categoryMap: Map<string, string>,
): Promise<ImportStats> {
  resetMnemonicState();

  const stats: ImportStats = {
    productsInserted: 0,
    inventoryInserted: 0,
    variablePrice: 0,
    fixedPrice: 0,
    withBarcode: 0,
    withCost: 0,
    duplicateBarcodes: 0,
    duplicateSkus: 0,
    availableForSaleCount: 0,
    inventoryByLocation: new Map(),
    categoryBreakdown: new Map(),
  };

  // Track seen barcodes and SKUs to handle duplicates
  const seenBarcodes = new Set<string>();
  const seenSkus = new Set<string>();

  // Process in batches
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);

    await db.transaction(async (tx) => {
      for (const row of batch) {
        // Handle empty/duplicate SKU
        let sku = row.sku;
        if (!sku) {
          sku = `LV-${row.handle || "NOHANDLE"}-${i}`;
        }
        // Deduplicate SKU
        let skuSuffix = 0;
        let finalSku = sku;
        while (seenSkus.has(finalSku)) {
          skuSuffix++;
          finalSku = `${sku}-V${skuSuffix}`;
          stats.duplicateSkus++;
        }
        seenSkus.add(finalSku);

        // Handle barcode - nullify duplicates to avoid unique constraint violation
        let barcode: string | null = row.barcode || null;
        if (barcode) {
          if (seenBarcodes.has(barcode)) {
            stats.duplicateBarcodes++;
            barcode = null; // Nullify duplicate barcode
          } else {
            seenBarcodes.add(barcode);
            stats.withBarcode++;
          }
        }

        const isVariable = row.defaultPrice === "variable";
        const unitPrice = isVariable
          ? "0.00"
          : (parseFloat(row.defaultPrice) || 0).toFixed(2);
        const costStr = row.cost || row.purchaseCost || "0";
        const costPrice = (parseFloat(costStr) || 0).toFixed(2);

        if (isVariable) stats.variablePrice++;
        else stats.fixedPrice++;
        if (parseFloat(costPrice) > 0) stats.withCost++;

        const enumCategory = classifyCategory(row.category);
        stats.categoryBreakdown.set(
          enumCategory,
          (stats.categoryBreakdown.get(enumCategory) || 0) + 1,
        );

        // Generate mnemonic cost code
        let mnemonicCostCode: string | null = null;
        try {
          if (parseFloat(costPrice) > 0) {
            mnemonicCostCode = generateCostCode(costPrice);
          }
        } catch {
          /* skip if 0 cost */
        }

        // Insert product
        const [product] = await tx
          .insert(products)
          .values({
            orgId,
            name: row.name || finalSku,
            sku: finalSku,
            mnemonicSku: generateMnemonicSku(row.name || finalSku),
            category: enumCategory,
            categoryId: categoryMap.get(row.category) || null,
            unitPrice,
            costPrice,
            currentCostPrice: costPrice,
            mnemonicCostCode,
            barcode,
            isActive: true,
            isVariablePrice: isVariable,
          })
          .returning({ id: products.id });

        stats.productsInserted++;

        // Insert inventory per location
        for (const [locName, locId] of locationMap.entries()) {
          const locData = row.locationData.get(locName);
          if (!locData) continue;

          const stockLevel = Math.round(locData.inStock);
          const reorderPoint = Math.round(locData.lowStock) || 10;
          const availableForSale = locData.availableForSale;

          // Skip locations with no stock AND not available for sale
          // (no need to create inventory rows for irrelevant locations)
          if (stockLevel === 0 && !availableForSale) continue;

          // Insert inventory row for available products or those with stock
          await tx.insert(inventory).values({
            orgId,
            productId: product.id,
            locationId: locId,
            stockLevel,
            reservedLevel: 0,
            reorderPoint,
            availableForSale,
          });

          stats.inventoryInserted++;
          if (availableForSale) stats.availableForSaleCount++;

          const locStats = stats.inventoryByLocation.get(locName) || {
            skus: 0,
            units: 0,
          };
          locStats.skus++;
          locStats.units += stockLevel;
          stats.inventoryByLocation.set(locName, locStats);
        }
      }
    });

    const progress = Math.min(i + BATCH_SIZE, rows.length);
    process.stdout.write(
      `\r  Imported ${progress.toLocaleString()} / ${rows.length.toLocaleString()} products`,
    );
  }

  console.log("\n");
  return stats;
}

function printSummary(stats: ImportStats, elapsed: string) {
  console.log("═══════════════════════════════════════════════");
  console.log("  Loyverse Import Complete");
  console.log("═══════════════════════════════════════════════");
  console.log(
    `  Products imported:     ${stats.productsInserted.toLocaleString()}`,
  );
  console.log(
    `  Variable-price items:  ${stats.variablePrice.toLocaleString()}`,
  );
  console.log(
    `  Fixed-price items:     ${stats.fixedPrice.toLocaleString()}`,
  );
  console.log(
    `  Items with barcode:    ${stats.withBarcode.toLocaleString()}`,
  );
  console.log(
    `  Duplicate barcodes:    ${stats.duplicateBarcodes.toLocaleString()} (nullified)`,
  );
  console.log(
    `  Duplicate SKUs:        ${stats.duplicateSkus.toLocaleString()} (suffixed)`,
  );
  console.log(
    `  Items with cost > 0:   ${stats.withCost.toLocaleString()}`,
  );
  console.log(
    `  Inventory rows:        ${stats.inventoryInserted.toLocaleString()}`,
  );
  console.log(
    `  Available for sale:    ${stats.availableForSaleCount.toLocaleString()} / ${stats.inventoryInserted.toLocaleString()} (${((stats.availableForSaleCount / stats.inventoryInserted) * 100).toFixed(1)}%)`,
  );
  console.log();
  console.log("  Category breakdown:");
  for (const [cat, count] of stats.categoryBreakdown.entries()) {
    console.log(`    ${cat.padEnd(18)} ${count.toLocaleString()}`);
  }
  console.log();
  console.log("  Inventory by location:");
  for (const [loc, data] of stats.inventoryByLocation.entries()) {
    console.log(
      `    ${loc.padEnd(22)} ${data.skus.toLocaleString().padStart(8)} SKUs, ${data.units.toLocaleString().padStart(10)} units`,
    );
  }
  console.log();
  console.log(`  Elapsed: ${elapsed}s`);
  console.log("═══════════════════════════════════════════════");
}

main();
