/**
 * Deep investigation: how many products were reassigned to newly-created categories.
 * Run: npx tsx apps/api/scripts/investigate-category-changes-2.ts
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
  console.log("=== Deep Category Investigation ===\n");

  // How many products point to categories created today (April 8)?
  const [badCatProducts] = await db.execute(sql`
    SELECT COUNT(*) AS cnt
    FROM products p
    JOIN categories c ON c.id = p.category_id
    WHERE p.org_id = ${ORG_ID}
      AND c.created_at >= '2026-04-08T00:00:00Z'
  `) as any[];
  console.log(`Products assigned to categories created today: ${badCatProducts.cnt}`);

  // How many categories were created today?
  const [todayCats] = await db.execute(sql`
    SELECT COUNT(*) AS cnt FROM categories WHERE org_id = ${ORG_ID} AND created_at >= '2026-04-08T00:00:00Z'
  `) as any[];
  console.log(`Categories created today: ${todayCats.cnt}`);

  // How many categories existed BEFORE today?
  const [oldCats] = await db.execute(sql`
    SELECT COUNT(*) AS cnt FROM categories WHERE org_id = ${ORG_ID} AND created_at < '2026-04-08T00:00:00Z'
  `) as any[];
  console.log(`Categories that existed before today: ${oldCats.cnt}`);

  // How many products still point to old categories?
  const [goodProducts] = await db.execute(sql`
    SELECT COUNT(*) AS cnt
    FROM products p
    JOIN categories c ON c.id = p.category_id
    WHERE p.org_id = ${ORG_ID}
      AND c.created_at < '2026-04-08T00:00:00Z'
  `) as any[];
  console.log(`Products with pre-existing categories: ${goodProducts.cnt}`);

  // Products with NULL category
  const [nullProducts] = await db.execute(sql`
    SELECT COUNT(*) AS cnt FROM products WHERE org_id = ${ORG_ID} AND category_id IS NULL
  `) as any[];
  console.log(`Products with NULL category: ${nullProducts.cnt}`);

  // The big import was 01:42-01:49 — ~23K products
  // The smaller one was 06:34-06:35 — 198 products
  // Check: were products updated at 01:42-01:49 reassigned to new categories?
  console.log("\n--- Import at 01:42-01:49 UTC (big batch ~23K) ---");
  const [bigBatchBadCats] = await db.execute(sql`
    SELECT COUNT(*) AS cnt
    FROM products p
    JOIN categories c ON c.id = p.category_id
    WHERE p.org_id = ${ORG_ID}
      AND p.updated_at >= '2026-04-08T01:42:00Z'
      AND p.updated_at <= '2026-04-08T01:50:00Z'
      AND c.created_at >= '2026-04-08T00:00:00Z'
  `) as any[];

  const [bigBatchTotal] = await db.execute(sql`
    SELECT COUNT(*) AS cnt
    FROM products
    WHERE org_id = ${ORG_ID}
      AND updated_at >= '2026-04-08T01:42:00Z'
      AND updated_at <= '2026-04-08T01:50:00Z'
  `) as any[];

  console.log(`  Total products updated: ${bigBatchTotal.cnt}`);
  console.log(`  Assigned to new (today's) categories: ${bigBatchBadCats.cnt}`);

  // Were the categories created BEFORE the import (at 00:35 and 01:32)?
  console.log("\n--- Category creation timeline ---");
  const catTimeline = await db.execute(sql`
    SELECT date_trunc('minute', created_at) AS minute, COUNT(*) AS cnt
    FROM categories
    WHERE org_id = ${ORG_ID}
      AND created_at >= '2026-04-08T00:00:00Z'
    GROUP BY 1
    ORDER BY 1
  `) as any[];
  for (const c of catTimeline) {
    console.log(`  ${new Date(c.minute).toISOString()}  — ${c.cnt} categories created`);
  }

  // What were the ORIGINAL categories that products had before being reassigned?
  // We can't know directly, but we can check: do the old categories still exist and have 0 products?
  console.log("\n--- Old categories with 0 products (likely orphaned after reassignment) ---");
  const orphanedCats = await db.execute(sql`
    SELECT c.name, c.id, c.created_at
    FROM categories c
    LEFT JOIN products p ON p.category_id = c.id
    WHERE c.org_id = ${ORG_ID}
      AND c.created_at < '2026-04-08T00:00:00Z'
    GROUP BY c.id, c.name, c.created_at
    HAVING COUNT(p.id) = 0
    ORDER BY c.name
    LIMIT 30
  `) as any[];
  console.log(`  Found ${orphanedCats.length} old categories with 0 products:`);
  for (const c of orphanedCats) {
    console.log(`    "${c.name}" (created ${new Date(c.created_at).toISOString().slice(0, 10)})`);
  }

  process.exit(0);
}
main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
