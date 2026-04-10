/**
 * Fix invalid store names in historical_sales:
 * - April 1-9, 2026: DELETE (duplicates of entries already under correct names)
 * - Other dates: REMAP to correct store names
 *
 * Run: npx tsx apps/api/scripts/fix-invalid-stores.ts
 */
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, "../../../.env") });

import { db } from "@apex/database";
import { sql } from "drizzle-orm";

const REMAP: Record<string, string> = {
  "JUNIOR": "Junior Branch",
  "OLD A/P": "Old Auto Parts",
  "Stock - Accessories": "Accessories Storage",
  "TIRES": "Tire Storage",
  "WAREHOUSE": "Central Warehouse",
};

const INVALID_NAMES = Object.keys(REMAP);

async function main() {
  console.log("=== Fix Invalid Store Names ===\n");

  // Step 1: Count by date range
  console.log("--- Counts: April 1-9 vs other dates ---");
  for (const name of INVALID_NAMES) {
    const [apr] = await db.execute(sql`
      SELECT COUNT(*) AS cnt FROM historical_sales
      WHERE location_name = ${name} AND movement_date >= '2026-04-01' AND movement_date < '2026-04-10'
    `) as any[];
    const [other] = await db.execute(sql`
      SELECT COUNT(*) AS cnt FROM historical_sales
      WHERE location_name = ${name} AND (movement_date < '2026-04-01' OR movement_date >= '2026-04-10')
    `) as any[];
    console.log(`  "${name}": Apr 1-9 = ${apr.cnt} (DELETE), other = ${other.cnt} (REMAP → "${REMAP[name]}")`);
  }

  // Step 2: Option A — DELETE April 1-9 rows
  console.log("\n--- Option A: Deleting April 1-9 rows ---");
  for (const name of INVALID_NAMES) {
    const result = await db.execute(sql`
      DELETE FROM historical_sales
      WHERE location_name = ${name} AND movement_date >= '2026-04-01' AND movement_date < '2026-04-10'
    `);
    const [remaining] = await db.execute(sql`
      SELECT COUNT(*) AS cnt FROM historical_sales
      WHERE location_name = ${name} AND movement_date >= '2026-04-01' AND movement_date < '2026-04-10'
    `) as any[];
    console.log(`  "${name}": deleted, remaining=${remaining.cnt}`);
  }

  // Step 3: Option B — REMAP other dates
  console.log("\n--- Option B: Remapping other dates ---");
  for (const [oldName, newName] of Object.entries(REMAP)) {
    // Get the location_id for the correct store
    const [loc] = await db.execute(sql`
      SELECT id FROM locations WHERE name = ${newName} AND org_id = '556e350a-7180-4ec9-9e1e-ea0ca1937f40' LIMIT 1
    `) as any[];

    if (loc) {
      await db.execute(sql`
        UPDATE historical_sales
        SET location_name = ${newName}, location_id = ${loc.id}
        WHERE location_name = ${oldName}
      `);
    } else {
      // No location_id match — just update the name
      await db.execute(sql`
        UPDATE historical_sales SET location_name = ${newName}
        WHERE location_name = ${oldName}
      `);
    }
    const [check] = await db.execute(sql`SELECT COUNT(*) AS cnt FROM historical_sales WHERE location_name = ${oldName}`) as any[];
    console.log(`  "${oldName}" → "${newName}": remaining=${check.cnt}`);
  }

  // Step 4: Verify
  console.log("\n--- Verification ---");
  const stores = await db.execute(sql`
    SELECT DISTINCT location_name, COUNT(*) AS cnt
    FROM historical_sales GROUP BY location_name ORDER BY location_name
  `) as any[];
  for (const s of stores) console.log(`  ${String(s.cnt).padStart(8)} rows  "${s.location_name}"`);

  // Check receipt 38-1697
  console.log("\n--- Receipt 38-1697 ---");
  const r38 = await db.execute(sql`
    SELECT reason_reference, location_name, COUNT(*) AS items
    FROM historical_sales WHERE reason_reference = '38-1697'
    GROUP BY reason_reference, location_name
  `) as any[];
  for (const r of r38) console.log(`  ${r.reason_reference}  "${r.location_name}"  ${r.items} items`);

  const [invalidCount] = await db.execute(sql`
    SELECT COUNT(*) AS cnt FROM historical_sales
    WHERE location_name IN ('JUNIOR', 'OLD A/P', 'Stock - Accessories', 'TIRES', 'WAREHOUSE')
  `) as any[];
  console.log(`\nInvalid store rows remaining: ${invalidCount.cnt}`);

  process.exit(0);
}
main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
