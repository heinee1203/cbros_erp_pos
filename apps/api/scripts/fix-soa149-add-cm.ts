/**
 * Add CM-3024 to SOA-2026-0149 line items.
 * Run: npx tsx apps/api/scripts/fix-soa149-add-cm.ts
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
  console.log("=== Add CM-3024 to SOA-0149 ===\n");
  const [soa] = await db.execute(sql`SELECT id FROM soa_records WHERE soa_number = 'SOA-2026-0149'`) as any[];
  if (!soa) { console.log("SOA not found"); process.exit(1); }

  // Find CM-3024 for RT Montana
  const [cm] = await db.execute(sql`
    SELECT id, reference_number, type, amount FROM customer_transactions
    WHERE reference_number = 'CM-3024' AND customer_id = (SELECT id FROM customers WHERE name ILIKE '%rt montana%' LIMIT 1)
  `) as any[];
  if (!cm) { console.log("CM-3024 not found"); process.exit(1); }
  console.log(`Found: ${cm.reference_number} ${cm.type} ₱${cm.amount}`);

  // Check if already in soa_line_items
  const [existing] = await db.execute(sql`SELECT id FROM soa_line_items WHERE soa_id = ${soa.id} AND transaction_id = ${cm.id}`) as any[];
  if (existing) { console.log("Already in SOA line items"); process.exit(0); }

  // Add it
  await db.execute(sql`INSERT INTO soa_line_items (soa_id, transaction_id) VALUES (${soa.id}, ${cm.id})`);
  // Mark as billed
  await db.execute(sql`UPDATE customer_transactions SET billed = true, billed_soa_id = ${soa.id} WHERE id = ${cm.id}`);
  console.log("Added CM-3024 to SOA-0149 line items and marked as billed");

  // Verify
  const lines = await db.execute(sql`
    SELECT ct.reference_number, ct.type FROM soa_line_items sli
    JOIN customer_transactions ct ON ct.id = sli.transaction_id WHERE sli.soa_id = ${soa.id}
    AND ct.type = 'CREDIT_NOTE'
  `) as any[];
  console.log(`Credit notes in SOA: ${lines.length}`);
  for (const l of lines) console.log(`  ${l.reference_number} ${l.type}`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
