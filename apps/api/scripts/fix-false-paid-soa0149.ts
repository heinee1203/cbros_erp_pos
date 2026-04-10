/**
 * Fix false PAID status on SOA-0149 invoices.
 * Delete FIFO backfill allocations that incorrectly allocated old payments to SOA-0149 charges.
 * Run: npx tsx apps/api/scripts/fix-false-paid-soa0149.ts
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
  console.log("=== Fix False PAID on SOA-0149 ===\n");

  // Find allocations where payment_transaction has no payment_number (old FIFO backfill)
  // These are the orphan allocations from pre-SOA payments
  const badAllocs = await db.execute(sql`
    SELECT pa.id, ct_pay.payment_number, ct_charge.reference_number as invoice,
      pa.allocated_amount::text
    FROM ar_payment_allocations pa
    JOIN customer_transactions ct_pay ON ct_pay.id = pa.payment_transaction_id
    JOIN customer_transactions ct_charge ON ct_charge.id = pa.charge_transaction_id
    WHERE ct_charge.customer_id = (SELECT id FROM customers WHERE name ILIKE '%rt montana%' LIMIT 1)
    AND ct_pay.payment_number IS NULL
  `) as any[];

  console.log(`Found ${badAllocs.length} allocations from payments with no payment_number:`);
  for (const a of badAllocs) {
    console.log(`  ${a.id}  ${a.invoice}  ₱${a.allocated_amount}  (payment: ${a.payment_number || 'NULL'})`);
  }

  if (badAllocs.length === 0) {
    console.log("Nothing to fix.");
    process.exit(0);
  }

  // Delete them
  const ids = badAllocs.map((a: any) => a.id);
  for (const id of ids) {
    await db.execute(sql`DELETE FROM ar_payment_allocations WHERE id = ${id}`);
  }
  console.log(`\nDeleted ${ids.length} bad allocations.`);

  // Verify SOA-0149 invoices are now UNPAID
  const [soa149] = await db.execute(sql`SELECT id FROM soa_records WHERE soa_number = 'SOA-2026-0149'`) as any[];
  if (soa149) {
    const invs = await db.execute(sql`
      SELECT ct.reference_number, ct.amount::text,
        COALESCE((SELECT SUM(pa.allocated_amount::numeric) FROM ar_payment_allocations pa WHERE pa.charge_transaction_id = ct.id), 0)::text as allocated
      FROM soa_line_items sli
      JOIN customer_transactions ct ON ct.id = sli.transaction_id
      WHERE sli.soa_id = ${soa149.id} AND ct.type = 'CHARGE'
      ORDER BY ct.recorded_at LIMIT 6
    `) as any[];
    console.log("\nSOA-0149 first 6 invoices after fix:");
    for (const r of invs) {
      const status = parseFloat(r.allocated) >= parseFloat(r.amount) ? "PAID" : parseFloat(r.allocated) > 0 ? "PARTIAL" : "UNPAID";
      console.log(`  ${r.reference_number}  ₱${r.amount}  allocated:₱${r.allocated}  → ${status}`);
    }
  }

  process.exit(0);
}
main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
