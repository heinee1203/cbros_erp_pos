/**
 * Restore product categories by cross-referencing surviving products with Loyverse CSV.
 * Run: npx tsx apps/api/scripts/restore-product-categories.ts
 */
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, "../../../.env") });

import { db } from "@apex/database";
import { products, categories, brands } from "@apex/database/schema";
import { eq, and, isNull, isNotNull, sql } from "drizzle-orm";

const ORG_ID = "556e350a-7180-4ec9-9e1e-ea0ca1937f40";
const CSV_PATH = "C:\\Users\\Admin\\Downloads\\export_items (66).csv";

function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let current: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') { inQuotes = false; }
      else { field += ch; }
    } else {
      if (ch === '"') { inQuotes = true; }
      else if (ch === ',') { current.push(field); field = ""; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        current.push(field); field = "";
        if (current.length > 1) rows.push(current);
        current = [];
      } else { field += ch; }
    }
  }
  if (current.length > 0 || field) { current.push(field); rows.push(current); }
  return rows;
}

async function main() {
  console.log("=== Restore Product Categories from Loyverse CSV ===\n");

  // 1. Read and parse CSV
  const csvText = fs.readFileSync(CSV_PATH, "utf8");
  const rows = parseCSV(csvText);
  const headers = rows[0].map((h) => h.trim().toLowerCase());
  const skuIdx = headers.indexOf("sku");
  const catIdx = headers.indexOf("category");
  console.log(`CSV: ${rows.length - 1} data rows, SKU col=${skuIdx}, Category col=${catIdx}`);

  // Build SKU → Loyverse Category map
  const skuToLoyverseCat = new Map<string, string>();
  for (let i = 1; i < rows.length; i++) {
    const sku = rows[i][skuIdx]?.trim();
    const cat = rows[i][catIdx]?.trim();
    if (sku && cat) skuToLoyverseCat.set(sku.toLowerCase(), cat);
  }
  console.log(`SKU→LoyverseCat map: ${skuToLoyverseCat.size} entries`);

  // 2. Get all products with valid category_id (the 4,702 surviving ones)
  const correctProducts = await db
    .select({ sku: products.sku, categoryId: products.categoryId })
    .from(products)
    .where(and(eq(products.orgId, ORG_ID), isNotNull(products.categoryId)));

  console.log(`Products with category: ${correctProducts.length}`);

  // Build Loyverse Category Name → Curated Category ID
  const loyverseToCuratedCat = new Map<string, string>();
  let matchedSurvivors = 0;
  for (const p of correctProducts) {
    const loyverseCat = skuToLoyverseCat.get(p.sku.toLowerCase());
    if (loyverseCat && p.categoryId) {
      loyverseToCuratedCat.set(loyverseCat, p.categoryId);
      matchedSurvivors++;
    }
  }
  console.log(`Loyverse→Curated category mapping: ${loyverseToCuratedCat.size} unique pairs (from ${matchedSurvivors} products)`);

  // Log the mapping
  const catNames = await db.select({ id: categories.id, name: categories.name }).from(categories).where(eq(categories.orgId, ORG_ID));
  const catNameMap = new Map(catNames.map((c) => [c.id, c.name]));
  console.log("\n--- Loyverse → Curated Category Mapping ---");
  for (const [loyverse, curatedId] of [...loyverseToCuratedCat].sort((a, b) => a[0].localeCompare(b[0]))) {
    console.log(`  "${loyverse}" → "${catNameMap.get(curatedId) || curatedId}"`);
  }

  // 3. Same for brands
  const correctBrandProducts = await db
    .select({ sku: products.sku, brandId: products.brandId })
    .from(products)
    .where(and(eq(products.orgId, ORG_ID), isNotNull(products.brandId)));

  // Build brand mapping using the Loyverse category name (brand extracted from "CAT - BRAND")
  const brandNames = await db.select({ id: brands.id, name: brands.name }).from(brands).where(eq(brands.orgId, ORG_ID));
  const brandNameMap = new Map(brandNames.map((b) => [b.id, b.name]));
  const brandNameToId = new Map(brandNames.map((b) => [b.name.toLowerCase(), b.id]));

  // Extract brand from Loyverse category: "TIRE #01 - DELIUM" → "DELIUM"
  function extractBrand(loyverseCat: string): string | null {
    if (!loyverseCat || !loyverseCat.includes(" - ")) return null;
    return loyverseCat.split(" - ").slice(1).join(" - ").trim();
  }

  const loyverseToCuratedBrand = new Map<string, string>();
  for (const p of correctBrandProducts) {
    const loyverseCat = skuToLoyverseCat.get(p.sku.toLowerCase());
    if (loyverseCat && p.brandId) {
      const brandFromLoyverse = extractBrand(loyverseCat);
      if (brandFromLoyverse) {
        loyverseToCuratedBrand.set(brandFromLoyverse.toLowerCase(), p.brandId);
      }
    }
  }
  console.log(`\nLoyverse→Curated brand mapping: ${loyverseToCuratedBrand.size} unique pairs`);

  // 4. Apply to nulled products — CATEGORIES
  console.log("\n--- Restoring Categories ---");
  const nullCatProducts = await db
    .select({ id: products.id, sku: products.sku })
    .from(products)
    .where(and(eq(products.orgId, ORG_ID), isNull(products.categoryId)));

  let catRestored = 0, catNotInCsv = 0;
  const unmappedCats = new Map<string, number>();
  const BATCH_SIZE = 500;

  for (let i = 0; i < nullCatProducts.length; i += BATCH_SIZE) {
    const batch = nullCatProducts.slice(i, i + BATCH_SIZE);
    for (const p of batch) {
      const loyverseCat = skuToLoyverseCat.get(p.sku.toLowerCase());
      if (!loyverseCat) { catNotInCsv++; continue; }

      const curatedCatId = loyverseToCuratedCat.get(loyverseCat);
      if (!curatedCatId) {
        unmappedCats.set(loyverseCat, (unmappedCats.get(loyverseCat) || 0) + 1);
        continue;
      }

      await db.update(products).set({ categoryId: curatedCatId }).where(eq(products.id, p.id));
      catRestored++;
    }
    if ((i + BATCH_SIZE) % 5000 < BATCH_SIZE) {
      console.log(`  Progress: ${Math.min(i + BATCH_SIZE, nullCatProducts.length)}/${nullCatProducts.length} (restored: ${catRestored})`);
    }
  }

  console.log(`\nCategories restored: ${catRestored}`);
  console.log(`SKU not in CSV: ${catNotInCsv}`);
  console.log(`Unmapped Loyverse categories: ${unmappedCats.size}`);
  if (unmappedCats.size > 0) {
    console.log("  Top unmapped:");
    const sorted = [...unmappedCats].sort((a, b) => b[1] - a[1]).slice(0, 20);
    for (const [name, count] of sorted) console.log(`    ${String(count).padStart(5)} products  "${name}"`);
  }

  // 5. Apply to nulled products — BRANDS
  console.log("\n--- Restoring Brands ---");
  const nullBrandProducts = await db
    .select({ id: products.id, sku: products.sku })
    .from(products)
    .where(and(eq(products.orgId, ORG_ID), isNull(products.brandId)));

  let brandRestored = 0, brandNotInCsv = 0;
  const unmappedBrands = new Map<string, number>();

  for (let i = 0; i < nullBrandProducts.length; i += BATCH_SIZE) {
    const batch = nullBrandProducts.slice(i, i + BATCH_SIZE);
    for (const p of batch) {
      const loyverseCat = skuToLoyverseCat.get(p.sku.toLowerCase());
      if (!loyverseCat) { brandNotInCsv++; continue; }

      const brandFromLoyverse = extractBrand(loyverseCat);
      if (!brandFromLoyverse) continue;

      // Try exact mapping from surviving products
      let curatedBrandId = loyverseToCuratedBrand.get(brandFromLoyverse.toLowerCase());

      // Fallback: match by brand name
      if (!curatedBrandId) {
        curatedBrandId = brandNameToId.get(brandFromLoyverse.toLowerCase()) ?? undefined;
      }

      if (!curatedBrandId) {
        unmappedBrands.set(brandFromLoyverse, (unmappedBrands.get(brandFromLoyverse) || 0) + 1);
        continue;
      }

      await db.update(products).set({ brandId: curatedBrandId }).where(eq(products.id, p.id));
      brandRestored++;
    }
    if ((i + BATCH_SIZE) % 5000 < BATCH_SIZE) {
      console.log(`  Progress: ${Math.min(i + BATCH_SIZE, nullBrandProducts.length)}/${nullBrandProducts.length} (restored: ${brandRestored})`);
    }
  }

  console.log(`\nBrands restored: ${brandRestored}`);
  console.log(`SKU not in CSV: ${brandNotInCsv}`);
  console.log(`Unmapped brands: ${unmappedBrands.size}`);
  if (unmappedBrands.size > 0) {
    console.log("  Top unmapped:");
    const sorted = [...unmappedBrands].sort((a, b) => b[1] - a[1]).slice(0, 20);
    for (const [name, count] of sorted) console.log(`    ${String(count).padStart(5)} products  "${name}"`);
  }

  // 6. Final verification
  const [finalWithCat] = await db.execute(sql`SELECT COUNT(*) AS cnt FROM products WHERE org_id = ${ORG_ID} AND category_id IS NOT NULL`) as any[];
  const [finalNullCat] = await db.execute(sql`SELECT COUNT(*) AS cnt FROM products WHERE org_id = ${ORG_ID} AND category_id IS NULL`) as any[];
  const [finalWithBrand] = await db.execute(sql`SELECT COUNT(*) AS cnt FROM products WHERE org_id = ${ORG_ID} AND brand_id IS NOT NULL`) as any[];
  const [finalNullBrand] = await db.execute(sql`SELECT COUNT(*) AS cnt FROM products WHERE org_id = ${ORG_ID} AND brand_id IS NULL`) as any[];

  console.log("\n=== Final State ===");
  console.log(`Products with category: ${finalWithCat.cnt} (was 4,702)`);
  console.log(`Products without category: ${finalNullCat.cnt} (was 43,393)`);
  console.log(`Products with brand: ${finalWithBrand.cnt} (was 22,784)`);
  console.log(`Products without brand: ${finalNullBrand.cnt} (was 25,311)`);

  process.exit(0);
}
main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
