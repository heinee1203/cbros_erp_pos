/**
 * Check allocation state for PAY-2026-0041 and Q3173.
 * Run: npx tsx apps/api/scripts/check-allocations.ts
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
  console.log("=== Check Allocations ===\n");

  // Find PAY-2026-0041
  const [payTxn] = await db.execute(sql`SELECT id, payment_number, amount, customer_id FROM customer_transactions WHERE payment_number = 'PAY-2026-0041'`) as any[];
  if (!payTxn) { console.log("PAY-2026-0041 not found"); process.exit(0); }
  console.log(`Payment: ${payTxn.payment_number} (${payTxn.id}) — ₱${payTxn.amount}`);

  // Find Q3173
  const [q3173] = await db.execute(sql`SELECT id, reference_number, amount, customer_id FROM customer_transactions WHERE reference_number = 'Q3173' AND customer_id = ${payTxn.customer_id}`) as any[];
  if (q3173) console.log(`Q3173: (${q3173.id}) — ₱${q3173.amount}`);
  else console.log("Q3173 not found for this customer");

  // Check allocations for this payment
  const allocs = await db.execute(sql`
    SELECT pa.id, pa.payment_transaction_id, pa.charge_transaction_id, pa.allocated_amount,
      ct.reference_number as charge_ref, ct.amount as charge_amount
    FROM ar_payment_allocations pa
    JOIN customer_transactions ct ON ct.id = pa.charge_transaction_id
    WHERE pa.payment_transaction_id = ${payTxn.id}
  `) as any[];

  console.log(`\nAllocations for PAY-2026-0041: ${allocs.length} rows`);
  for (const a of allocs) {
    console.log(`  → ${a.charge_ref || a.charge_transaction_id.slice(0, 8)}  ₱${a.allocated_amount} (charge total: ₱${a.charge_amount})`);
  }

  // Check all allocations against Q3173 specifically
  if (q3173) {
    const q3173Allocs = await db.execute(sql`
      SELECT pa.allocated_amount, ct.payment_number
      FROM ar_payment_allocations pa
      JOIN customer_transactions ct ON ct.id = pa.payment_transaction_id
      WHERE pa.charge_transaction_id = ${q3173.id}
    `) as any[];
    console.log(`\nAllocations against Q3173: ${q3173Allocs.length} rows`);
    let total = 0;
    for (const a of q3173Allocs) {
      console.log(`  ← ${a.payment_number}  ₱${a.allocated_amount}`);
      total += parseFloat(a.allocated_amount);
    }
    console.log(`  Total allocated: ₱${total.toFixed(2)} of ₱${q3173.amount} → ${total >= parseFloat(q3173.amount) ? "PAID" : total > 0 ? "PARTIAL" : "UNPAID"}`);
  }

  // Check total allocations in table
  const [totalAllocs] = await db.execute(sql`SELECT COUNT(*) AS cnt FROM ar_payment_allocations`) as any[];
  console.log(`\nTotal allocation records in table: ${totalAllocs.cnt}`);

  process.exit(0);
}
main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
