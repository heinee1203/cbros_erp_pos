/**
 * Diagnose invalid store names in historical_sales.
 * Run: npx tsx apps/api/scripts/diagnose-invalid-stores.ts
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
  console.log("=== Diagnose Invalid Stores in historical_sales ===\n");

  // Step 1: All distinct location_name values
  console.log("--- Step 1: All distinct location names ---");
  const stores = await db.execute(sql`
    SELECT DISTINCT location_name, COUNT(*) as row_count
    FROM historical_sales
    GROUP BY location_name
    ORDER BY location_name
  `) as any[];
  for (const s of stores) {
    console.log(`  ${String(s.row_count).padStart(8)} rows  "${s.location_name}"`);
  }

  // Valid stores from locations table
  console.log("\n--- Valid locations from DB ---");
  const locations = await db.execute(sql`
    SELECT name FROM locations WHERE org_id = '556e350a-7180-4ec9-9e1e-ea0ca1937f40' ORDER BY name
  `) as any[];
  const validNames = new Set(locations.map((l: any) => l.name));
  for (const l of locations) console.log(`  "${l.name}"`);

  // Step 2: Invalid stores
  console.log("\n--- Step 2: Invalid location names (not in locations table) ---");
  let totalInvalid = 0;
  for (const s of stores) {
    if (!validNames.has(s.location_name)) {
      console.log(`  ${String(s.row_count).padStart(8)} rows  "${s.location_name}"  ← INVALID`);
      totalInvalid += parseInt(s.row_count);
    }
  }
  console.log(`\n  Total invalid rows: ${totalInvalid}`);

  // Step 3: Check receipt 38-1697 specifically
  console.log("\n--- Receipt 38-1697 ---");
  const r38 = await db.execute(sql`
    SELECT reason_reference, location_name, COUNT(*) as items
    FROM historical_sales
    WHERE reason_reference = '38-1697'
    GROUP BY reason_reference, location_name
  `) as any[];
  for (const r of r38) console.log(`  ${r.reason_reference}  "${r.location_name}"  ${r.items} items`);

  process.exit(0);
}
main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
