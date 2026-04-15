/**
 * Audit zero / null / CUSTOMER COUNT rows in historical_sales (READ-ONLY).
 *
 * This is the post-rollback rewrite. The earlier version filtered only by
 * `net_sales = 0` which missed every row with `net_sales IS NULL` — that's
 * the actual root cause of "₱0 lines still showing in Receipt Detail".
 *
 * This version reports BOTH conditions:
 *   * net_sales = 0 (explicitly zero, what the bad cleanup deleted)
 *   * net_sales IS NULL (untouched by the cleanup, still in the table)
 *
 * Plus a CUSTOMER COUNT count so the user can verify whether the 1,017 rows
 * deleted in the bad cleanup have been restored after the Loyverse re-import.
 *
 * Run: npx tsx apps/api/scripts/audit-historical-sales-zeros.ts
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
  console.log("=== Audit historical_sales — zeros, nulls, CUSTOMER COUNT ===\n");
  console.log(`Org: ${ORG_ID}\n`);

  // ── Total table size ───────────────────────────────────────────────────
  const [total] = (await db.execute(sql`
    SELECT COUNT(*)::int AS n
    FROM historical_sales
    WHERE org_id = ${ORG_ID}
  `)) as any[];
  console.log(`Total historical_sales rows for org: ${total.n.toLocaleString()}\n`);

  // ── 1. SALE rows by net_sales state ────────────────────────────────────
  console.log("1. SALE rows by net_sales state:");
  const stateCounts = (await db.execute(sql`
    SELECT
      CASE
        WHEN net_sales IS NULL THEN '  net_sales IS NULL'
        WHEN net_sales = 0     THEN '  net_sales = 0    '
        WHEN net_sales > 0     THEN '  net_sales > 0    '
        ELSE                        '  net_sales < 0    '
      END AS state,
      COUNT(*)::int AS n
    FROM historical_sales
    WHERE org_id = ${ORG_ID}
    AND reason_type = 'SALE'
    GROUP BY 1
    ORDER BY 1
  `)) as any[];
  console.table(stateCounts);

  // ── 2. Zero/null SALE rows by location ─────────────────────────────────
  console.log("\n2. Zero/null SALE rows by location (the velocity-inflating subset):");
  const byLoc = (await db.execute(sql`
    SELECT
      location_name,
      SUM(CASE WHEN net_sales IS NULL THEN 1 ELSE 0 END)::int AS null_rows,
      SUM(CASE WHEN net_sales = 0     THEN 1 ELSE 0 END)::int AS zero_rows,
      COUNT(*)::int AS combined
    FROM historical_sales
    WHERE org_id = ${ORG_ID}
    AND reason_type = 'SALE'
    AND (net_sales IS NULL OR net_sales = 0)
    GROUP BY location_name
    ORDER BY combined DESC
  `)) as any[];
  if (byLoc.length === 0) {
    console.log("   (none — table has no zero/null SALE rows)");
  } else {
    console.table(byLoc);
  }

  // ── 3. CUSTOMER COUNT count ────────────────────────────────────────────
  console.log("\n3. CUSTOMER COUNT row count:");
  const [cc] = (await db.execute(sql`
    SELECT COUNT(*)::int AS n
    FROM historical_sales
    WHERE org_id = ${ORG_ID}
    AND product_name ILIKE '%CUSTOMER COUNT%'
  `)) as any[];
  console.log(`   ${cc.n.toLocaleString()} rows`);
  console.log(`   (Expected post-restore: > 0. The bad cleanup deleted 1,017.`);
  console.log(`    After Loyverse re-import with skipCustomerCount=false, this`);
  console.log(`    should be back at the pre-cleanup level or higher.)`);

  // ── 4. CUSTOMER COUNT breakdown by SKU ─────────────────────────────────
  if (cc.n > 0) {
    console.log("\n4. CUSTOMER COUNT breakdown by SKU:");
    const ccBySku = (await db.execute(sql`
      SELECT sku, product_name, COUNT(*)::int AS n
      FROM historical_sales
      WHERE org_id = ${ORG_ID}
      AND product_name ILIKE '%CUSTOMER COUNT%'
      GROUP BY sku, product_name
      ORDER BY n DESC
    `)) as any[];
    console.table(ccBySku);
  }

  // ── 5. Sample receipts with zero/null lines ───────────────────────────
  console.log("\n5. Sample receipts containing at least one zero/null SALE line:");
  console.log("   (compare these against Receipt Detail in the UI to confirm");
  console.log("    they match what the user sees as \"₱0 lines still showing\")");
  const sampleReceipts = (await db.execute(sql`
    SELECT DISTINCT reason_reference, location_name
    FROM historical_sales
    WHERE org_id = ${ORG_ID}
    AND reason_type = 'SALE'
    AND (net_sales IS NULL OR net_sales = 0)
    AND product_name NOT ILIKE '%CUSTOMER COUNT%'
    LIMIT 10
  `)) as any[];
  if (sampleReceipts.length === 0) {
    console.log("   (none)");
  } else {
    console.table(sampleReceipts);

    // For the first sample receipt, dump its full line list so the user
    // can see exactly what Receipt Detail would show.
    const firstRef = sampleReceipts[0].reason_reference;
    console.log(`\n   Full line list for receipt ${firstRef}:`);
    const lines = (await db.execute(sql`
      SELECT
        sku,
        product_name,
        quantity,
        unit_price,
        net_sales,
        location_name
      FROM historical_sales
      WHERE org_id = ${ORG_ID}
      AND reason_reference = ${firstRef}
      ORDER BY id
    `)) as any[];
    console.table(lines);
  }

  // ── 6. Total expected restoration target ───────────────────────────────
  console.log("\n6. Restoration target (pre-bad-cleanup state):");
  console.log("   The bad cleanup deleted 5,930 rows total:");
  console.log("     • 4,913 rows with net_sales = 0 from storage locations");
  console.log("     •   1,017 CUSTOMER COUNT rows");
  console.log(`   Pre-cleanup total was 707,606 rows.`);
  console.log(`   Current total is ${total.n.toLocaleString()} rows.`);
  console.log(`   Deficit: ${(707606 - total.n).toLocaleString()} rows.`);
  if (total.n >= 707606) {
    console.log(`   ✓ Restoration appears complete.`);
  } else {
    console.log(`   ✗ Re-import from Loyverse needed.`);
  }

  console.log("\n=== Audit complete (no rows modified) ===");
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
