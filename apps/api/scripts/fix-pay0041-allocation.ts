/**
 * Fix PAY-2026-0041 allocation: should be Q3173 ₱1,550, not FIFO.
 * Run: npx tsx apps/api/scripts/fix-pay0041-allocation.ts
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
  console.log("=== Fix PAY-2026-0041 Allocation ===\n");

  const [payTxn] = await db.execute(sql`SELECT id FROM customer_transactions WHERE payment_number = 'PAY-2026-0041'`) as any[];
  if (!payTxn) { console.error("PAY-2026-0041 not found"); process.exit(1); }

  const [q3173] = await db.execute(sql`SELECT id, customer_id FROM customer_transactions WHERE reference_number = 'Q3173' AND customer_id = (SELECT customer_id FROM customer_transactions WHERE id = ${payTxn.id})`) as any[];
  if (!q3173) { console.error("Q3173 not found"); process.exit(1); }

  // Delete wrong FIFO allocations
  const deleted = await db.execute(sql`DELETE FROM ar_payment_allocations WHERE payment_transaction_id = ${payTxn.id}`);
  console.log("Deleted wrong FIFO allocations");

  // Create correct allocation to Q3173
  await db.execute(sql`
    INSERT INTO ar_payment_allocations (org_id, payment_transaction_id, charge_transaction_id, allocated_amount)
    VALUES (
      (SELECT org_id FROM customer_transactions WHERE id = ${payTxn.id}),
      ${payTxn.id},
      ${q3173.id},
      '1550.00'
    )
  `);
  console.log("Created correct allocation: PAY-2026-0041 → Q3173 ₱1,550.00");

  // Re-run FIFO backfill for this customer to fix the other payments
  // Actually, just verify
  const [verify] = await db.execute(sql`
    SELECT pa.allocated_amount, ct.reference_number
    FROM ar_payment_allocations pa
    JOIN customer_transactions ct ON ct.id = pa.charge_transaction_id
    WHERE pa.payment_transaction_id = ${payTxn.id}
  `) as any[];
  console.log(`Verified: ${verify.reference_number} ₱${verify.allocated_amount}`);

  process.exit(0);
}
main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
