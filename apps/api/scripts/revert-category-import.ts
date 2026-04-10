/**
 * Revert category changes from the bad Stock & Availability import.
 *
 * Strategy:
 * 1. Set category_id = NULL on all products pointing to categories created today
 * 2. Delete the 895 categories created today
 * 3. This restores products to "uncategorized" — better than wrong categories
 * 4. A proper re-import with correct mapping can be done afterwards
 *
 * Run: npx tsx apps/api/scripts/revert-category-import.ts
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
const CUTOFF = "2026-04-08T00:00:00Z"; // Categories created on or after this are "bad"

async function main() {
  console.log("=== Revert Category Import ===\n");

  // 1. Count affected products and categories
  const [affectedProducts] = await db.execute(sql`
    SELECT COUNT(*) AS cnt
    FROM products p
    JOIN categories c ON c.id = p.category_id
    WHERE p.org_id = ${ORG_ID} AND c.created_at >= ${CUTOFF}::timestamptz
  `) as any[];

  const [badCats] = await db.execute(sql`
    SELECT COUNT(*) AS cnt FROM categories WHERE org_id = ${ORG_ID} AND created_at >= ${CUTOFF}::timestamptz
  `) as any[];

  console.log(`Products to null out: ${affectedProducts.cnt}`);
  console.log(`Categories to delete: ${badCats.cnt}`);

  // 2. Null out category_id on affected products
  console.log("\nStep 1: Setting category_id = NULL on affected products...");
  const nullResult = await db.execute(sql`
    UPDATE products p
    SET category_id = NULL, subcategory_id = NULL
    FROM categories c
    WHERE p.category_id = c.id
      AND p.org_id = ${ORG_ID}
      AND c.created_at >= ${CUTOFF}::timestamptz
  `);
  console.log(`  Done — ${affectedProducts.cnt} products updated`);

  // 3. Also null out brand_id if the brand was created today
  const [badBrands] = await db.execute(sql`
    SELECT COUNT(*) AS cnt FROM brands WHERE org_id = ${ORG_ID} AND created_at >= ${CUTOFF}::timestamptz
  `) as any[];

  if (parseInt(badBrands.cnt) > 0) {
    console.log(`\nStep 2: Nulling brand_id for ${badBrands.cnt} brands created today...`);
    await db.execute(sql`
      UPDATE products p
      SET brand_id = NULL
      FROM brands b
      WHERE p.brand_id = b.id
        AND p.org_id = ${ORG_ID}
        AND b.created_at >= ${CUTOFF}::timestamptz
    `);

    // Delete bad brands
    await db.execute(sql`DELETE FROM brands WHERE org_id = ${ORG_ID} AND created_at >= ${CUTOFF}::timestamptz`);
    console.log(`  Deleted ${badBrands.cnt} bad brands`);
  }

  // 4. Delete the bad categories (no products point to them now)
  console.log(`\nStep 3: Deleting ${badCats.cnt} bad categories...`);
  await db.execute(sql`DELETE FROM categories WHERE org_id = ${ORG_ID} AND created_at >= ${CUTOFF}::timestamptz`);
  console.log("  Done");

  // 5. Verify
  const [remainingCats] = await db.execute(sql`SELECT COUNT(*) AS cnt FROM categories WHERE org_id = ${ORG_ID}`) as any[];
  const [nullCatProducts] = await db.execute(sql`SELECT COUNT(*) AS cnt FROM products WHERE org_id = ${ORG_ID} AND category_id IS NULL`) as any[];
  const [assignedProducts] = await db.execute(sql`SELECT COUNT(*) AS cnt FROM products WHERE org_id = ${ORG_ID} AND category_id IS NOT NULL`) as any[];

  console.log(`\n--- Verification ---`);
  console.log(`Categories remaining: ${remainingCats.cnt}`);
  console.log(`Products with category: ${assignedProducts.cnt}`);
  console.log(`Products without category (NULL): ${nullCatProducts.cnt}`);
  console.log(`\nRevert complete. Products are now uncategorized — re-import with correct category mapping to restore.`);

  process.exit(0);
}
main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
