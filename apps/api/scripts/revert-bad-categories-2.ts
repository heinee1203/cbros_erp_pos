/**
 * Revert bad category assignments (round 2).
 * Run: npx tsx apps/api/scripts/revert-bad-categories-2.ts
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
  console.log("=== Revert Bad Categories (Round 2) ===\n");

  // Count what we're dealing with
  const [todayCats] = await db.execute(sql`SELECT COUNT(*) AS cnt FROM categories WHERE org_id = ${ORG_ID} AND created_at >= CURRENT_DATE::timestamp AT TIME ZONE 'UTC'`) as any[];
  const [affectedProducts] = await db.execute(sql`
    SELECT COUNT(*) AS cnt FROM products p JOIN categories c ON c.id = p.category_id
    WHERE p.org_id = ${ORG_ID} AND c.created_at >= CURRENT_DATE::timestamp AT TIME ZONE 'UTC'
  `) as any[];

  console.log(`Bad categories created today: ${todayCats.cnt}`);
  console.log(`Products pointing to bad categories: ${affectedProducts.cnt}`);

  if (parseInt(todayCats.cnt) === 0) {
    console.log("\nNo bad categories found. Nothing to revert.");
    process.exit(0);
  }

  // Null out category_id + subcategory_id on affected products
  await db.execute(sql`
    UPDATE products p SET category_id = NULL, subcategory_id = NULL
    FROM categories c WHERE p.category_id = c.id AND p.org_id = ${ORG_ID}
    AND c.created_at >= CURRENT_DATE::timestamp AT TIME ZONE 'UTC'
  `);
  console.log(`Nulled category_id on ${affectedProducts.cnt} products`);

  // Also null brand_id for brands created today
  const [todayBrands] = await db.execute(sql`SELECT COUNT(*) AS cnt FROM brands WHERE org_id = ${ORG_ID} AND created_at >= CURRENT_DATE::timestamp AT TIME ZONE 'UTC'`) as any[];
  if (parseInt(todayBrands.cnt) > 0) {
    await db.execute(sql`
      UPDATE products p SET brand_id = NULL FROM brands b
      WHERE p.brand_id = b.id AND p.org_id = ${ORG_ID}
      AND b.created_at >= CURRENT_DATE::timestamp AT TIME ZONE 'UTC'
    `);
    await db.execute(sql`DELETE FROM brands WHERE org_id = ${ORG_ID} AND created_at >= CURRENT_DATE::timestamp AT TIME ZONE 'UTC'`);
    console.log(`Deleted ${todayBrands.cnt} bad brands`);
  }

  // Delete bad categories
  await db.execute(sql`DELETE FROM categories WHERE org_id = ${ORG_ID} AND created_at >= CURRENT_DATE::timestamp AT TIME ZONE 'UTC'`);
  console.log(`Deleted ${todayCats.cnt} bad categories`);

  // Verify
  const [remaining] = await db.execute(sql`SELECT COUNT(*) AS cnt FROM categories WHERE org_id = ${ORG_ID}`) as any[];
  const [nullProds] = await db.execute(sql`SELECT COUNT(*) AS cnt FROM products WHERE org_id = ${ORG_ID} AND category_id IS NULL`) as any[];
  const [assignedProds] = await db.execute(sql`SELECT COUNT(*) AS cnt FROM products WHERE org_id = ${ORG_ID} AND category_id IS NOT NULL`) as any[];

  console.log(`\n--- Verification ---`);
  console.log(`Categories remaining: ${remaining.cnt}`);
  console.log(`Products with category: ${assignedProds.cnt}`);
  console.log(`Products without category: ${nullProds.cnt}`);
  process.exit(0);
}
main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
