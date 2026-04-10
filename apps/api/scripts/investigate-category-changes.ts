/**
 * Investigate category changes from the last Stock & Availability import.
 * Run: npx tsx apps/api/scripts/investigate-category-changes.ts
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
  console.log("=== Investigate Category Changes ===\n");

  // 1. Find recent bulk updates (products updated in clusters — likely from import)
  console.log("--- Recent product update clusters (last 7 days) ---");
  const clusters = await db.execute(sql`
    SELECT date_trunc('minute', updated_at) AS minute, COUNT(*) AS cnt
    FROM products
    WHERE org_id = ${ORG_ID}
      AND updated_at >= NOW() - INTERVAL '7 days'
    GROUP BY 1
    HAVING COUNT(*) > 10
    ORDER BY 1 DESC
    LIMIT 10
  `) as any[];

  for (const c of clusters) {
    console.log(`  ${new Date(c.minute).toISOString()}  — ${c.cnt} products updated`);
  }

  if (clusters.length === 0) {
    console.log("  No bulk update clusters found in last 7 days.");
  }

  // 2. Check for recently created categories (might have been created by import)
  console.log("\n--- Categories created in last 7 days ---");
  const newCats = await db.execute(sql`
    SELECT id, name, created_at
    FROM categories
    WHERE org_id = ${ORG_ID}
      AND created_at >= NOW() - INTERVAL '7 days'
    ORDER BY created_at DESC
    LIMIT 20
  `) as any[];

  for (const c of newCats) {
    const productCount = await db.execute(sql`SELECT COUNT(*) as cnt FROM products WHERE category_id = ${c.id}`) as any[];
    console.log(`  ${new Date(c.created_at).toISOString()}  "${c.name}" — ${productCount[0].cnt} products`);
  }
  if (newCats.length === 0) console.log("  None");

  // 3. Check category distribution — any categories with suspiciously many/few products
  console.log("\n--- Top 20 categories by product count ---");
  const catDist = await db.execute(sql`
    SELECT c.name, c.id, COUNT(p.id) AS cnt, c.created_at
    FROM categories c
    LEFT JOIN products p ON p.category_id = c.id
    WHERE c.org_id = ${ORG_ID}
    GROUP BY c.id, c.name, c.created_at
    ORDER BY cnt DESC
    LIMIT 20
  `) as any[];

  for (const c of catDist) {
    console.log(`  ${String(c.cnt).padStart(6)} products  "${c.name}"  ${c.created_at ? `(created ${new Date(c.created_at).toISOString().slice(0, 10)})` : ""}`);
  }

  // 4. Check products with NULL category
  const [nullCats] = await db.execute(sql`
    SELECT COUNT(*) AS cnt FROM products WHERE org_id = ${ORG_ID} AND category_id IS NULL
  `) as any[];
  console.log(`\n--- Products with NULL category_id: ${nullCats.cnt} ---`);

  // 5. Check if the import affected category_id on products
  // Look for products whose updated_at is in the last import cluster
  if (clusters.length > 0) {
    const lastCluster = clusters[0];
    const clusterTime = new Date(lastCluster.minute);
    const from = new Date(clusterTime.getTime() - 60000).toISOString();
    const to = new Date(clusterTime.getTime() + 600000).toISOString(); // +10min window

    console.log(`\n--- Products updated during last import (${from} to ${to}) ---`);

    // Sample of updated products with their categories
    const affected = await db.execute(sql`
      SELECT p.sku, p.name, c.name AS cat_name, p.category_id, p.updated_at
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      WHERE p.org_id = ${ORG_ID}
        AND p.updated_at >= ${from}::timestamptz
        AND p.updated_at <= ${to}::timestamptz
      ORDER BY p.sku
      LIMIT 30
    `) as any[];

    console.log(`  ${affected.length} sample products (of ${lastCluster.cnt} total):`);
    for (const p of affected) {
      console.log(`    SKU ${p.sku}  "${p.name}"  → category: "${p.cat_name || 'NULL'}"`);
    }

    // Check how many distinct categories were assigned in this batch
    const distinctCats = await db.execute(sql`
      SELECT c.name, COUNT(*) AS cnt
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      WHERE p.org_id = ${ORG_ID}
        AND p.updated_at >= ${from}::timestamptz
        AND p.updated_at <= ${to}::timestamptz
      GROUP BY c.name
      ORDER BY cnt DESC
      LIMIT 20
    `) as any[];

    console.log(`\n  Category distribution of affected products:`);
    for (const c of distinctCats) {
      console.log(`    ${String(c.cnt).padStart(6)}  "${c.name || 'NULL'}"`);
    }
  }

  // 6. Total products and categories
  const [totalProducts] = await db.execute(sql`SELECT COUNT(*) AS cnt FROM products WHERE org_id = ${ORG_ID}`) as any[];
  const [totalCats] = await db.execute(sql`SELECT COUNT(*) AS cnt FROM categories WHERE org_id = ${ORG_ID}`) as any[];
  console.log(`\n--- Totals: ${totalProducts.cnt} products, ${totalCats.cnt} categories ---`);

  process.exit(0);
}
main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
