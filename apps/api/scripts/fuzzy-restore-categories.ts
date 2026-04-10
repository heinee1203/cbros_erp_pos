/**
 * Fuzzy-match Loyverse categories to curated categories and restore product assignments.
 *
 * DRY RUN (default): npx tsx apps/api/scripts/fuzzy-restore-categories.ts
 * APPLY:             npx tsx apps/api/scripts/fuzzy-restore-categories.ts --apply
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
import { eq, and, isNull, sql } from "drizzle-orm";

const ORG_ID = "556e350a-7180-4ec9-9e1e-ea0ca1937f40";
const CSV_PATH = "C:\\Users\\Admin\\Downloads\\export_items (66).csv";
const APPLY = process.argv.includes("--apply");

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
  console.log(`=== Fuzzy Restore Categories ${APPLY ? "(APPLY MODE)" : "(DRY RUN)"} ===\n`);

  // 1. Load curated categories
  const curatedCats = await db.select({ id: categories.id, name: categories.name }).from(categories).where(eq(categories.orgId, ORG_ID));
  const curatedLookup = new Map<string, { id: string; name: string }>();
  for (const c of curatedCats) curatedLookup.set(c.name.toLowerCase().trim(), { id: c.id, name: c.name });
  console.log(`Curated categories: ${curatedCats.length}`);

  // 2. Load curated brands
  const curatedBrandsList = await db.select({ id: brands.id, name: brands.name }).from(brands).where(eq(brands.orgId, ORG_ID));
  const brandLookup = new Map<string, { id: string; name: string }>();
  for (const b of curatedBrandsList) brandLookup.set(b.name.toLowerCase().trim(), { id: b.id, name: b.name });
  console.log(`Curated brands: ${curatedBrandsList.length}`);

  // 3. Parse Loyverse CSV
  const csvText = fs.readFileSync(CSV_PATH, "utf8");
  const rows = parseCSV(csvText);
  const headers = rows[0].map((h) => h.trim().toLowerCase());
  const skuIdx = headers.indexOf("sku");
  const catIdx = headers.indexOf("category");

  const skuToLoyverseCat = new Map<string, string>();
  for (let i = 1; i < rows.length; i++) {
    const sku = rows[i][skuIdx]?.trim();
    const cat = rows[i][catIdx]?.trim();
    if (sku && cat) skuToLoyverseCat.set(sku.toLowerCase(), cat);
  }
  console.log(`CSV SKU→Category entries: ${skuToLoyverseCat.size}`);

  // 4. Collect all unique Loyverse categories used by nulled products
  const nullProducts = await db
    .select({ id: products.id, sku: products.sku })
    .from(products)
    .where(and(eq(products.orgId, ORG_ID), isNull(products.categoryId)));
  console.log(`Products needing categories: ${nullProducts.length}\n`);

  const loyverseCatsUsed = new Map<string, string[]>(); // loyverseCat → [productId, ...]
  for (const p of nullProducts) {
    const lcat = skuToLoyverseCat.get(p.sku.toLowerCase());
    if (lcat) {
      if (!loyverseCatsUsed.has(lcat)) loyverseCatsUsed.set(lcat, []);
      loyverseCatsUsed.get(lcat)!.push(p.id);
    }
  }
  console.log(`Unique Loyverse categories to match: ${loyverseCatsUsed.size}`);

  // 5. Fuzzy match each Loyverse category
  function findCuratedMatch(raw: string): { id: string; name: string; strategy: string } | null {
    const lower = raw.toLowerCase().trim();

    // Strategy 1: Exact match
    if (curatedLookup.has(lower)) return { ...curatedLookup.get(lower)!, strategy: "exact" };

    // Strategy 2: Strip " #XX" suffix → "BRAKE PAD #01" → "brake pad"
    const stripped = lower.replace(/\s*#\d+\s*$/, "").trim();
    if (stripped !== lower && curatedLookup.has(stripped)) return { ...curatedLookup.get(stripped)!, strategy: "strip-#" };

    // Strategy 3: Strip " #XX - BRAND" suffix → "BRAKE PAD #01 - TOYOTA" → "brake pad"
    const strippedBrand = lower.replace(/\s*#\d+\s*-\s*.*$/, "").trim();
    if (strippedBrand !== lower && curatedLookup.has(strippedBrand)) return { ...curatedLookup.get(strippedBrand)!, strategy: "strip-#-brand" };

    // Strategy 4: Strip " - BRAND" (no #) → "CLUTCH DISC - VALEO" → "clutch disc"
    const strippedDashBrand = lower.replace(/\s*-\s+[a-z].*$/, "").trim();
    if (strippedDashBrand !== lower && curatedLookup.has(strippedDashBrand)) return { ...curatedLookup.get(strippedDashBrand)!, strategy: "strip-dash-brand" };

    // Strategy 5: Strip " #XX - BRAND" then also trailing " #XX" from what's left
    const doubleStrip = strippedBrand.replace(/\s*#\d+\s*$/, "").trim();
    if (doubleStrip !== lower && curatedLookup.has(doubleStrip)) return { ...curatedLookup.get(doubleStrip)!, strategy: "double-strip" };

    // Strategy 6: Strip everything after " #" → "SHOCK ABS - PLATE #01 KYB GAS" → "shock abs - plate"
    const beforeHash = lower.replace(/\s*#.*$/, "").trim();
    if (beforeHash !== lower && beforeHash.length > 3 && curatedLookup.has(beforeHash)) return { ...curatedLookup.get(beforeHash)!, strategy: "before-#" };

    // Strategy 7: Strip " - BRAND" from the before-hash result
    const beforeHashNoBrand = beforeHash.replace(/\s*-\s+[a-z].*$/, "").trim();
    if (beforeHashNoBrand !== beforeHash && beforeHashNoBrand.length > 3 && curatedLookup.has(beforeHashNoBrand)) return { ...curatedLookup.get(beforeHashNoBrand)!, strategy: "before-#-no-brand" };

    // Strategy 8: First N chars prefix match (min 8 chars)
    if (stripped.length >= 8) {
      for (const [name, cat] of curatedLookup) {
        if (name.startsWith(stripped) || stripped.startsWith(name)) {
          return { ...cat, strategy: "prefix" };
        }
      }
    }

    // Strategy 9: Contains — curated name fully contained in Loyverse name
    for (const [name, cat] of curatedLookup) {
      if (name.length >= 6 && lower.includes(name)) {
        return { ...cat, strategy: "contains" };
      }
    }

    return null;
  }

  // Also match brands
  function findBrandMatch(loyverseCat: string): { id: string; name: string } | null {
    // Extract brand: "BRAKE PAD #01 - TOYOTA" → "TOYOTA"
    // Or "CLUTCH DISC - VALEO #3" → "VALEO"
    const parts = loyverseCat.split(" - ");
    if (parts.length < 2) return null;
    let brandPart = parts.slice(1).join(" - ").trim();
    // Strip trailing #XX
    brandPart = brandPart.replace(/\s*#\d+\s*$/, "").trim();
    if (!brandPart) return null;

    const lower = brandPart.toLowerCase();
    if (brandLookup.has(lower)) return brandLookup.get(lower)!;

    // Try first word only — "KYB GAS" → "KYB"
    const firstWord = lower.split(/\s+/)[0];
    if (firstWord.length >= 3 && brandLookup.has(firstWord)) return brandLookup.get(firstWord)!;

    return null;
  }

  // Run matching
  const catMapping = new Map<string, { curatedId: string; curatedName: string; strategy: string; productIds: string[] }>();
  const brandMapping = new Map<string, { brandId: string; brandName: string; productIds: string[] }>();
  const unmatchedCats: Array<{ loyverse: string; count: number }> = [];

  for (const [loyverseCat, productIds] of loyverseCatsUsed) {
    const match = findCuratedMatch(loyverseCat);
    if (match) {
      catMapping.set(loyverseCat, { curatedId: match.id, curatedName: match.name, strategy: match.strategy, productIds });
    } else {
      unmatchedCats.push({ loyverse: loyverseCat, count: productIds.length });
    }

    // Brand matching
    const brandMatch = findBrandMatch(loyverseCat);
    if (brandMatch) {
      if (!brandMapping.has(loyverseCat)) {
        brandMapping.set(loyverseCat, { brandId: brandMatch.id, brandName: brandMatch.name, productIds });
      }
    }
  }

  // 6. Print results
  const matchedProductCount = [...catMapping.values()].reduce((s, m) => s + m.productIds.length, 0);
  const unmatchedProductCount = unmatchedCats.reduce((s, u) => s + u.count, 0);

  console.log(`\n=== CATEGORY MATCHING RESULTS ===`);
  console.log(`Matched: ${catMapping.size} Loyverse categories → ${matchedProductCount} products`);
  console.log(`Unmatched: ${unmatchedCats.length} Loyverse categories → ${unmatchedProductCount} products\n`);

  // Group by strategy
  const stratCounts = new Map<string, number>();
  for (const m of catMapping.values()) {
    stratCounts.set(m.strategy, (stratCounts.get(m.strategy) || 0) + m.productIds.length);
  }
  console.log("Match strategies:");
  for (const [s, c] of [...stratCounts].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${s}: ${c} products`);
  }

  console.log(`\n--- Category Mapping (${catMapping.size} pairs) ---`);
  const sortedMapping = [...catMapping].sort((a, b) => b[1].productIds.length - a[1].productIds.length);
  for (const [loyverse, m] of sortedMapping) {
    console.log(`  ${String(m.productIds.length).padStart(5)} products  "${loyverse}" → "${m.curatedName}" [${m.strategy}]`);
  }

  if (unmatchedCats.length > 0) {
    console.log(`\n--- Unmatched (${unmatchedCats.length}) ---`);
    unmatchedCats.sort((a, b) => b.count - a.count);
    for (const u of unmatchedCats.slice(0, 30)) {
      console.log(`  ${String(u.count).padStart(5)} products  "${u.loyverse}"`);
    }
    if (unmatchedCats.length > 30) console.log(`  ... and ${unmatchedCats.length - 30} more`);
  }

  // Brand results
  const brandMatchedProducts = [...brandMapping.values()].reduce((s, m) => s + m.productIds.length, 0);
  console.log(`\n=== BRAND MATCHING RESULTS ===`);
  console.log(`Matched: ${brandMapping.size} → ${brandMatchedProducts} products`);

  // 7. Apply if --apply
  if (!APPLY) {
    console.log(`\n*** DRY RUN — No changes made. Review above and run with --apply to execute. ***`);
    process.exit(0);
  }

  console.log(`\n--- APPLYING CHANGES ---`);

  // Apply categories
  let catApplied = 0;
  for (const [, m] of catMapping) {
    for (const pid of m.productIds) {
      await db.update(products).set({ categoryId: m.curatedId }).where(eq(products.id, pid));
      catApplied++;
    }
    if (catApplied % 2000 === 0) console.log(`  Categories: ${catApplied}/${matchedProductCount}`);
  }
  console.log(`  Categories applied: ${catApplied}`);

  // Apply brands (only for products that currently have null brand_id)
  let brandApplied = 0;
  for (const [, m] of brandMapping) {
    for (const pid of m.productIds) {
      // Only update if brand is currently null
      const [p] = await db.select({ brandId: products.brandId }).from(products).where(eq(products.id, pid));
      if (p && !p.brandId) {
        await db.update(products).set({ brandId: m.brandId }).where(eq(products.id, pid));
        brandApplied++;
      }
    }
    if (brandApplied % 2000 === 0 && brandApplied > 0) console.log(`  Brands: ${brandApplied}`);
  }
  console.log(`  Brands applied: ${brandApplied}`);

  // Verify
  const [finalWithCat] = await db.execute(sql`SELECT COUNT(*) AS cnt FROM products WHERE org_id = ${ORG_ID} AND category_id IS NOT NULL`) as any[];
  const [finalNullCat] = await db.execute(sql`SELECT COUNT(*) AS cnt FROM products WHERE org_id = ${ORG_ID} AND category_id IS NULL`) as any[];
  const [finalWithBrand] = await db.execute(sql`SELECT COUNT(*) AS cnt FROM products WHERE org_id = ${ORG_ID} AND brand_id IS NOT NULL`) as any[];

  console.log(`\n=== Final State ===`);
  console.log(`Products with category: ${finalWithCat.cnt}`);
  console.log(`Products without category: ${finalNullCat.cnt}`);
  console.log(`Products with brand: ${finalWithBrand.cnt}`);

  process.exit(0);
}
main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
