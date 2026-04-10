/**
 * Find and fix ALL orphan FIFO backfill allocations across ALL customers.
 * Run: npx tsx apps/api/scripts/fix-all-orphan-allocations.ts
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
  console.log("=== Find ALL Orphan FIFO Allocations ===\n");

  // Step 1: Find ALL allocations from payments with no payment_number (orphan backfill)
  console.log("--- Step 1: ALL orphan allocations (payment_number IS NULL) ---");
  const orphans = await db.execute(sql`
    SELECT
      pa.id AS alloc_id,
      c.name AS customer,
      ct_pay.payment_number,
      ct_pay.type AS pay_type,
      ct_charge.reference_number AS invoice_ref,
      pa.allocated_amount::text
    FROM ar_payment_allocations pa
    JOIN customer_transactions ct_pay ON ct_pay.id = pa.payment_transaction_id
    JOIN customer_transactions ct_charge ON ct_charge.id = pa.charge_transaction_id
    JOIN customers c ON c.id = ct_charge.customer_id
    WHERE ct_pay.payment_number IS NULL
    ORDER BY c.name, ct_charge.reference_number
  `) as any[];

  console.log(`Found ${orphans.length} orphan allocations:`);
  for (const o of orphans) {
    console.log(`  ${o.customer.padEnd(30)} ${(o.invoice_ref || "").padEnd(10)} ₱${o.allocated_amount.padStart(10)}  pay_type=${o.pay_type}  pay#=${o.payment_number || "NULL"}`);
  }

  // Step 2: Also check Mesco Q3342 specifically
  console.log("\n--- Step 2: Mesco Q3342 allocations (ALL, not just orphans) ---");
  const q3342 = await db.execute(sql`
    SELECT
      pa.id AS alloc_id,
      ct_pay.payment_number,
      ct_pay.notes,
      ct_charge.reference_number,
      pa.allocated_amount::text
    FROM ar_payment_allocations pa
    JOIN customer_transactions ct_pay ON ct_pay.id = pa.payment_transaction_id
    JOIN customer_transactions ct_charge ON ct_charge.id = pa.charge_transaction_id
    WHERE ct_charge.reference_number = 'Q3342'
    ORDER BY pa.created_at
  `) as any[];

  console.log(`Q3342 allocations: ${q3342.length}`);
  for (const a of q3342) {
    console.log(`  pay#=${a.payment_number || "NULL"}  ₱${a.allocated_amount}  notes=${(a.notes || "").slice(0, 60)}`);
  }

  // Step 3: Check ALL allocations for Mesco SOA-0084 invoices
  console.log("\n--- Step 3: ALL allocations for Mesco invoices ---");
  const mescoAllocs = await db.execute(sql`
    SELECT
      pa.id AS alloc_id,
      ct_pay.payment_number,
      ct_charge.reference_number AS invoice,
      pa.allocated_amount::text,
      ct_pay.notes
    FROM ar_payment_allocations pa
    JOIN customer_transactions ct_pay ON ct_pay.id = pa.payment_transaction_id
    JOIN customer_transactions ct_charge ON ct_charge.id = pa.charge_transaction_id
    WHERE ct_charge.customer_id = (SELECT id FROM customers WHERE name ILIKE '%mesco%' LIMIT 1)
    ORDER BY ct_charge.reference_number
  `) as any[];

  console.log(`Mesco total allocations: ${mescoAllocs.length}`);
  for (const a of mescoAllocs) {
    console.log(`  ${(a.invoice || "").padEnd(10)} ← pay#=${(a.payment_number || "NULL").padEnd(16)} ₱${a.allocated_amount}`);
  }

  if (orphans.length === 0) {
    console.log("\nNo orphan allocations found. Nothing to delete.");
    process.exit(0);
  }

  // Step 4: DELETE all orphan allocations
  console.log(`\n--- Step 4: Deleting ${orphans.length} orphan allocations ---`);
  const ids = orphans.map((o: any) => o.alloc_id);
  for (const id of ids) {
    await db.execute(sql`DELETE FROM ar_payment_allocations WHERE id = ${id}`);
  }
  console.log(`Deleted ${ids.length} rows`);

  // Step 5: Verify Q3342
  console.log("\n--- Step 5: Verify Q3342 ---");
  const [verify] = await db.execute(sql`
    SELECT ct.reference_number, ct.amount::text,
      COALESCE((SELECT SUM(pa.allocated_amount::numeric) FROM ar_payment_allocations pa WHERE pa.charge_transaction_id = ct.id), 0)::text AS allocated
    FROM customer_transactions ct
    WHERE ct.reference_number = 'Q3342'
    LIMIT 1
  `) as any[];
  if (verify) {
    const remaining = parseFloat(verify.amount) - parseFloat(verify.allocated);
    console.log(`  ${verify.reference_number}: amount=₱${verify.amount}  allocated=₱${verify.allocated}  remaining=₱${remaining.toFixed(2)}  → ${parseFloat(verify.allocated) > 0 ? "STILL HAS ALLOCATIONS" : "UNPAID ✓"}`);
  }

  // Step 6: Verify no more orphans
  const [finalCheck] = await db.execute(sql`
    SELECT COUNT(*) AS cnt FROM ar_payment_allocations pa
    JOIN customer_transactions ct ON ct.id = pa.payment_transaction_id
    WHERE ct.payment_number IS NULL
  `) as any[];
  console.log(`\nRemaining orphan allocations: ${finalCheck.cnt}`);

  process.exit(0);
}
main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
