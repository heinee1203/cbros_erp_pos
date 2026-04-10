/**
 * Diagnose duplicate receipt numbers in historical_sales.
 * Run: npx tsx apps/api/scripts/diagnose-duplicate-receipts.ts
 */
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, "../../../.env") });

import { db } from "@apex/database";
import { sql } from "drizzle-orm";

async function main() {
  console.log("=== Diagnose Duplicate Receipt Numbers ===\n");

  // Check which table holds receipt data
  // Try historical_sales first (that's the Loyverse import table)
  try {
    const [total] = await db.execute(sql`SELECT COUNT(*) AS cnt FROM historical_sales`) as any[];
    console.log(`historical_sales total rows: ${total.cnt}`);
  } catch {
    console.log("historical_sales table not found, trying sale_receipts...");
  }

  // Q1: How many receipt numbers appear more than once?
  console.log("\n--- Q1: Duplicate receipt numbers ---");
  const dupeCount = await db.execute(sql`
    SELECT COUNT(*) as total_dupes FROM (
      SELECT receipt_number, COUNT(*) as cnt
      FROM historical_sales
      GROUP BY receipt_number
      HAVING COUNT(*) > 1
    ) dupes
  `) as any[];
  console.log(`Receipt numbers with >1 row: ${dupeCount[0].total_dupes}`);

  // Q2: Are these multi-line receipts (different SKUs) or true duplicates (same SKU)?
  console.log("\n--- Q2: Same receipt + same SKU duplicates ---");
  const exactDupes = await db.execute(sql`
    SELECT COUNT(*) as total FROM (
      SELECT receipt_number, sku, COUNT(*) as cnt
      FROM historical_sales
      GROUP BY receipt_number, sku
      HAVING COUNT(*) > 1
    ) d
  `) as any[];
  console.log(`Receipt+SKU combos with >1 row: ${exactDupes[0].total}`);

  // Q3: Show sample of multi-line receipts (different SKUs same receipt)
  console.log("\n--- Q3: Sample multi-line receipt (different SKUs) ---");
  const sampleReceipt = await db.execute(sql`
    SELECT receipt_number FROM historical_sales
    GROUP BY receipt_number HAVING COUNT(*) > 1
    LIMIT 1
  `) as any[];
  if (sampleReceipt.length > 0) {
    const rn = sampleReceipt[0].receipt_number;
    const lines = await db.execute(sql`
      SELECT receipt_number, sku, item_name, quantity, gross_total_sales, location_name
      FROM historical_sales WHERE receipt_number = ${rn} ORDER BY sku
    `) as any[];
    console.log(`Receipt ${rn}: ${lines.length} line items`);
    for (const l of lines) console.log(`  ${l.sku}  ${l.item_name?.slice(0, 40)}  qty:${l.quantity}  ₱${l.gross_total_sales}  ${l.location_name}`);
  }

  // Q4: Show sample of exact duplicates if any (same receipt + same SKU)
  if (parseInt(exactDupes[0].total) > 0) {
    console.log("\n--- Q4: Sample exact duplicates (same receipt+SKU) ---");
    const sampleDupe = await db.execute(sql`
      SELECT receipt_number, sku FROM historical_sales
      GROUP BY receipt_number, sku HAVING COUNT(*) > 1
      LIMIT 3
    `) as any[];
    for (const d of sampleDupe) {
      const rows = await db.execute(sql`
        SELECT id, receipt_number, sku, item_name, quantity, gross_total_sales, location_name, receipt_date::text
        FROM historical_sales WHERE receipt_number = ${d.receipt_number} AND sku = ${d.sku}
        ORDER BY id
      `) as any[];
      console.log(`  ${d.receipt_number} + ${d.sku}: ${rows.length} rows`);
      for (const r of rows) console.log(`    id:${r.id.slice(0,8)}  qty:${r.quantity}  ₱${r.gross_total_sales}  ${r.location_name}  ${r.receipt_date}`);
    }

    // Q5: Count exact duplicate rows to delete
    console.log("\n--- Q5: Count rows to delete (keeping oldest of each duplicate) ---");
    const toDelete = await db.execute(sql`
      SELECT COUNT(*) as cnt FROM (
        SELECT id, ROW_NUMBER() OVER (
          PARTITION BY receipt_number, sku, quantity, gross_total_sales, receipt_date, location_name
          ORDER BY id ASC
        ) as rn FROM historical_sales
      ) d WHERE rn > 1
    `) as any[];
    console.log(`Rows to delete: ${toDelete[0].cnt}`);
  }

  // Summary
  console.log("\n=== DIAGNOSIS ===");
  if (parseInt(exactDupes[0].total) === 0) {
    console.log("Cause C: Multi-line receipts (different SKUs per receipt). NO duplicates to delete.");
    console.log("Fix: React key should use row.id, not receipt_number. Already fixed.");
  } else {
    console.log(`Cause A: ${exactDupes[0].total} exact duplicate receipt+SKU combos found.`);
    console.log("These are likely from double-importing the same CSV.");
  }

  process.exit(0);
}
main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
