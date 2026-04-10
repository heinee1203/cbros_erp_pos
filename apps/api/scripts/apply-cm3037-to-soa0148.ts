/**
 * Apply CM-3037 to SOA-2026-0148 for RT Montana.
 * Run: npx tsx apps/api/scripts/apply-cm3037-to-soa0148.ts
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
  console.log("=== Apply CM-3037 to SOA-2026-0148 ===\n");

  // Step 1: Find SOA
  const [soa] = await db.execute(sql`SELECT id, soa_number FROM soa_records WHERE soa_number = 'SOA-2026-0148'`) as any[];
  if (!soa) { console.error("SOA-2026-0148 not found"); process.exit(1); }
  console.log(`Step 1: SOA ${soa.soa_number} (${soa.id})`);

  // Step 2: Find CM-3037
  const [cm] = await db.execute(sql`
    SELECT id, reference_number, type, amount, billed FROM customer_transactions
    WHERE reference_number = 'CM-3037' AND customer_id = (SELECT id FROM customers WHERE name ILIKE '%rt montana%' LIMIT 1)
  `) as any[];
  if (!cm) { console.error("CM-3037 not found"); process.exit(1); }
  console.log(`Step 2: ${cm.reference_number} ${cm.type} ₱${cm.amount} billed=${cm.billed}`);

  // Check if already linked
  const [existing] = await db.execute(sql`SELECT id FROM soa_line_items WHERE soa_id = ${soa.id} AND transaction_id = ${cm.id}`) as any[];
  if (existing) { console.log("Already in SOA line items. Skipping."); process.exit(0); }

  // Step 3: Add to line items
  await db.execute(sql`INSERT INTO soa_line_items (soa_id, transaction_id) VALUES (${soa.id}, ${cm.id})`);
  console.log("Step 3: Added to soa_line_items");

  // Step 4: Mark as billed
  await db.execute(sql`UPDATE customer_transactions SET billed = true, billed_soa_id = ${soa.id} WHERE id = ${cm.id}`);
  console.log("Step 4: Marked as billed");

  // Step 5: Verify
  const [verify] = await db.execute(sql`
    SELECT ct.reference_number, ct.amount, ct.billed
    FROM soa_line_items sli
    JOIN customer_transactions ct ON ct.id = sli.transaction_id
    WHERE sli.soa_id = ${soa.id} AND ct.reference_number = 'CM-3037'
  `) as any[];
  console.log(`Step 5: ${verify.reference_number} ₱${verify.amount} billed=${verify.billed}`);

  process.exit(0);
}
main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
