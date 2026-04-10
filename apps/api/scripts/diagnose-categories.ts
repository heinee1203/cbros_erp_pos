/**
 * Diagnose category/brand/subcategory state after reverts.
 * Run: npx tsx apps/api/scripts/diagnose-categories.ts
 */
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, "../../../.env") });

import { db } from "@apex/database";
import { sql } from "drizzle-orm";

const ORG_ID = "556e350a-7180-4ec9-9e1e-ea0ca1937f40";

async function main() {
  console.log("=== Category/Brand/Subcategory Diagnostic ===\n");

  // 1. Counts
  const [catCount] = await db.execute(sql`SELECT COUNT(*) AS cnt FROM categories WHERE org_id = ${ORG_ID}`) as any[];
  const [brandCount] = await db.execute(sql`SELECT COUNT(*) AS cnt FROM brands WHERE org_id = ${ORG_ID}`) as any[];
  let subCount = { cnt: "N/A" };
  try { [subCount] = await db.execute(sql`SELECT COUNT(*) AS cnt FROM subcategories WHERE org_id = ${ORG_ID}`) as any[]; } catch { subCount = { cnt: "table not found" }; }
  const [totalProducts] = await db.execute(sql`SELECT COUNT(*) AS cnt FROM products WHERE org_id = ${ORG_ID}`) as any[];

  console.log(`Categories remaining:    ${catCount.cnt}`);
  console.log(`Brands remaining:        ${brandCount.cnt}`);
  console.log(`Subcategories remaining: ${subCount.cnt}`);
  console.log(`Total products:          ${totalProducts.cnt}`);

  // 2. Product category/brand assignment status
  const [withCat] = await db.execute(sql`SELECT COUNT(*) AS cnt FROM products WHERE org_id = ${ORG_ID} AND category_id IS NOT NULL`) as any[];
  const [nullCat] = await db.execute(sql`SELECT COUNT(*) AS cnt FROM products WHERE org_id = ${ORG_ID} AND category_id IS NULL`) as any[];
  const [withBrand] = await db.execute(sql`SELECT COUNT(*) AS cnt FROM products WHERE org_id = ${ORG_ID} AND brand_id IS NOT NULL`) as any[];
  const [nullBrand] = await db.execute(sql`SELECT COUNT(*) AS cnt FROM products WHERE org_id = ${ORG_ID} AND brand_id IS NULL`) as any[];

  console.log(`\nProducts with category:    ${withCat.cnt}`);
  console.log(`Products without category: ${nullCat.cnt}`);
  console.log(`Products with brand:       ${withBrand.cnt}`);
  console.log(`Products without brand:    ${nullBrand.cnt}`);

  // 3. Orphaned references (product points to deleted category/brand)
  const orphanedCats = await db.execute(sql`
    SELECT COUNT(DISTINCT p.category_id) AS cnt
    FROM products p LEFT JOIN categories c ON c.id = p.category_id
    WHERE p.org_id = ${ORG_ID} AND p.category_id IS NOT NULL AND c.id IS NULL
  `) as any[];
  const orphanedBrands = await db.execute(sql`
    SELECT COUNT(DISTINCT p.brand_id) AS cnt
    FROM products p LEFT JOIN brands b ON b.id = p.brand_id
    WHERE p.org_id = ${ORG_ID} AND p.brand_id IS NOT NULL AND b.id IS NULL
  `) as any[];

  console.log(`\nOrphaned category references: ${orphanedCats[0].cnt} distinct IDs`);
  console.log(`Orphaned brand references:    ${orphanedBrands[0].cnt} distinct IDs`);

  // 4. Products with orphaned category_id (count)
  const [orphanedCatProducts] = await db.execute(sql`
    SELECT COUNT(*) AS cnt
    FROM products p LEFT JOIN categories c ON c.id = p.category_id
    WHERE p.org_id = ${ORG_ID} AND p.category_id IS NOT NULL AND c.id IS NULL
  `) as any[];
  console.log(`Products with orphaned category_id: ${orphanedCatProducts.cnt}`);

  // 5. Remaining categories (list them all)
  const remainingCats = await db.execute(sql`
    SELECT c.name, c.id, c.created_at::text,
      (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id) AS product_count
    FROM categories c WHERE c.org_id = ${ORG_ID}
    ORDER BY c.name LIMIT 50
  `) as any[];
  console.log(`\n--- Remaining Categories (${remainingCats.length}) ---`);
  for (const c of remainingCats) {
    console.log(`  ${String(c.product_count).padStart(5)} products  "${c.name}"  (${c.created_at?.slice(0, 10)})`);
  }

  // 6. Remaining brands (list first 30)
  const remainingBrands = await db.execute(sql`
    SELECT b.name, b.id, b.created_at::text,
      (SELECT COUNT(*) FROM products p WHERE p.brand_id = b.id) AS product_count
    FROM brands b WHERE b.org_id = ${ORG_ID}
    ORDER BY b.name LIMIT 30
  `) as any[];
  console.log(`\n--- Remaining Brands (${remainingBrands.length}) ---`);
  for (const b of remainingBrands) {
    console.log(`  ${String(b.product_count).padStart(5)} products  "${b.name}"  (${b.created_at?.slice(0, 10)})`);
  }

  // 7. Subcategories
  try {
    const remainingSubs = await db.execute(sql`
      SELECT s.name, s.id, c.name AS cat_name
      FROM subcategories s LEFT JOIN categories c ON c.id = s.category_id
      WHERE s.org_id = ${ORG_ID} ORDER BY s.name LIMIT 30
    `) as any[];
    console.log(`\n--- Remaining Subcategories (${remainingSubs.length}) ---`);
    for (const s of remainingSubs) console.log(`  "${s.name}" → category: "${s.cat_name || 'DELETED'}"`);
  } catch { console.log("\n--- Subcategories table does not exist ---"); }

  // 8. Check creation dates — are there old categories from the curation period?
  const catsByDate = await db.execute(sql`
    SELECT date_trunc('day', created_at)::text AS day, COUNT(*) AS cnt
    FROM categories WHERE org_id = ${ORG_ID}
    GROUP BY 1 ORDER BY 1
  `) as any[];
  console.log(`\n--- Category creation timeline ---`);
  for (const c of catsByDate) {
    console.log(`  ${c.day?.slice(0, 10)}  ${c.cnt} categories`);
  }

  process.exit(0);
}
main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
