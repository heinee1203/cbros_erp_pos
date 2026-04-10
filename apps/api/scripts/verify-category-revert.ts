/**
 * Verify the category revert is complete.
 * Run: npx tsx apps/api/scripts/verify-category-revert.ts
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
  console.log("=== Verify Category Revert ===\n");

  const [todayCats] = await db.execute(sql`SELECT COUNT(*) AS cnt FROM categories WHERE org_id = ${ORG_ID} AND created_at >= '2026-04-08T00:00:00Z'`) as any[];
  const [oldCats] = await db.execute(sql`SELECT COUNT(*) AS cnt FROM categories WHERE org_id = ${ORG_ID} AND created_at < '2026-04-08T00:00:00Z'`) as any[];
  const [nullProducts] = await db.execute(sql`SELECT COUNT(*) AS cnt FROM products WHERE org_id = ${ORG_ID} AND category_id IS NULL`) as any[];
  const [assignedProducts] = await db.execute(sql`SELECT COUNT(*) AS cnt FROM products WHERE org_id = ${ORG_ID} AND category_id IS NOT NULL`) as any[];
  const [totalProducts] = await db.execute(sql`SELECT COUNT(*) AS cnt FROM products WHERE org_id = ${ORG_ID}`) as any[];

  console.log(`Categories created today (bad): ${todayCats.cnt} ${parseInt(todayCats.cnt) === 0 ? '✓ All deleted' : '✗ Still exist!'}`);
  console.log(`Old categories (good):          ${oldCats.cnt}`);
  console.log(`Products with category:         ${assignedProducts.cnt}`);
  console.log(`Products without category:      ${nullProducts.cnt}`);
  console.log(`Total products:                 ${totalProducts.cnt}`);

  if (parseInt(todayCats.cnt) === 0) {
    console.log("\n✓ Revert is complete. No bad categories remain.");
  } else {
    console.log("\n✗ Bad categories still exist — revert not complete.");
  }

  process.exit(0);
}
main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
