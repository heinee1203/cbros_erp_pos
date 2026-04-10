/**
 * Fix Q3342 wrong allocation — PAY-2026-0049 belongs to SOA-0085, not SOA-0084.
 * Run: npx tsx apps/api/scripts/fix-q3342-allocation.ts
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
  console.log("=== Fix Q3342 Wrong Allocation ===\n");

  const [mesco] = await db.execute(sql`SELECT id FROM customers WHERE name ILIKE '%mesco%' LIMIT 1`) as any[];
  if (!mesco) { console.error("Mesco not found"); process.exit(1); }

  // Step 1: Show Q3342 allocations
  console.log("--- Step 1: Q3342 allocations ---");
  const allocs = await db.execute(sql`
    SELECT pa.id, pa.allocated_amount::text, ct_pay.payment_number, ct_pay.notes
    FROM ar_payment_allocations pa
    JOIN customer_transactions ct_pay ON ct_pay.id = pa.payment_transaction_id
    JOIN customer_transactions ct_charge ON ct_charge.id = pa.charge_transaction_id
    WHERE ct_charge.reference_number = 'Q3342' AND ct_charge.customer_id = ${mesco.id}
  `) as any[];
  for (const a of allocs) console.log(`  id=${a.id}  pay#=${a.payment_number}  ₱${a.allocated_amount}  notes=${(a.notes || "").slice(0, 80)}`);

  // Step 2: Which SOA does Q3342 belong to?
  console.log("\n--- Step 2: Q3342 SOA membership ---");
  const q3342Soas = await db.execute(sql`
    SELECT sr.soa_number FROM soa_line_items sli
    JOIN soa_records sr ON sr.id = sli.soa_id
    JOIN customer_transactions ct ON ct.id = sli.transaction_id
    WHERE ct.reference_number = 'Q3342' AND ct.customer_id = ${mesco.id}
  `) as any[];
  for (const s of q3342Soas) console.log(`  Q3342 is in: ${s.soa_number}`);

  // Step 3: Which SOA was PAY-2026-0049 applied to?
  console.log("\n--- Step 3: PAY-2026-0049 details ---");
  const [pay49] = await db.execute(sql`
    SELECT id, payment_number, notes, amount::text FROM customer_transactions WHERE payment_number = 'PAY-2026-0049'
  `) as any[];
  if (pay49) console.log(`  ${pay49.payment_number}  ₱${pay49.amount}  notes=${pay49.notes}`);
  else console.log("  NOT FOUND");

  // Step 4: Delete wrong allocation
  console.log("\n--- Step 4: Delete wrong allocations ---");
  if (allocs.length > 0) {
    for (const a of allocs) {
      // Check if payment's SOA matches Q3342's SOA
      const payNotes = a.notes || "";
      const q3342Soa = q3342Soas[0]?.soa_number || "";
      const paymentSoa = (payNotes.match(/\[SOA:\s*([^\]]+)\]/)?.[1] || "").trim();
      const isWrong = paymentSoa && paymentSoa !== q3342Soa;
      console.log(`  ${a.id}: pay#=${a.payment_number} paySOA=${paymentSoa} invoiceSOA=${q3342Soa} → ${isWrong ? "WRONG — deleting" : "matches"}`);
      if (isWrong) {
        await db.execute(sql`DELETE FROM ar_payment_allocations WHERE id = ${a.id}`);
        console.log(`    DELETED`);
      }
    }
  }

  // Step 5: Verify Q3342
  console.log("\n--- Step 5: Verify Q3342 ---");
  const [verify] = await db.execute(sql`
    SELECT ct.reference_number, ct.amount::text,
      COALESCE((SELECT SUM(pa.allocated_amount::numeric) FROM ar_payment_allocations pa WHERE pa.charge_transaction_id = ct.id), 0)::text AS allocated
    FROM customer_transactions ct WHERE ct.reference_number = 'Q3342' AND ct.customer_id = ${mesco.id}
  `) as any[];
  if (verify) {
    const rem = parseFloat(verify.amount) - parseFloat(verify.allocated);
    console.log(`  Q3342: amount=₱${verify.amount} allocated=₱${verify.allocated} remaining=₱${rem.toFixed(2)} → ${parseFloat(verify.allocated) > 0 ? "STILL ALLOCATED" : "UNPAID ✓"}`);
  }

  // Step 6: Check SOA-0085 invoices and re-allocate PAY-2026-0049 correctly
  console.log("\n--- Step 6: SOA-0085 invoices ---");
  const [soa85] = await db.execute(sql`SELECT id FROM soa_records WHERE soa_number = 'SOA-2026-0085'`) as any[];
  if (soa85 && pay49) {
    const soa85Invs = await db.execute(sql`
      SELECT ct.id, ct.reference_number, ct.amount::text, ct.type
      FROM soa_line_items sli JOIN customer_transactions ct ON ct.id = sli.transaction_id
      WHERE sli.soa_id = ${soa85.id} AND ct.type = 'CHARGE'
      ORDER BY ct.recorded_at
    `) as any[];
    console.log(`  SOA-0085 has ${soa85Invs.length} charge invoices:`);
    for (const inv of soa85Invs) console.log(`    ${inv.reference_number} ₱${inv.amount}`);

    // Check existing allocations for PAY-2026-0049
    const existingPay49Allocs = await db.execute(sql`
      SELECT ct.reference_number, pa.allocated_amount::text
      FROM ar_payment_allocations pa
      JOIN customer_transactions ct ON ct.id = pa.charge_transaction_id
      WHERE pa.payment_transaction_id = ${pay49.id}
    `) as any[];
    console.log(`\n  Existing PAY-2026-0049 allocations: ${existingPay49Allocs.length}`);
    for (const a of existingPay49Allocs) console.log(`    ${a.reference_number} ₱${a.allocated_amount}`);

    // FIFO allocate PAY-2026-0049 to SOA-0085 invoices (only if no existing allocs)
    if (existingPay49Allocs.length === 0) {
      console.log("\n  Re-allocating PAY-2026-0049 to SOA-0085 invoices (FIFO)...");
      let rem = parseFloat(pay49.amount);
      for (const inv of soa85Invs) {
        if (rem <= 0.005) break;
        const invAmt = parseFloat(inv.amount);
        // Check existing allocations on this charge
        const [existing] = await db.execute(sql`
          SELECT COALESCE(SUM(allocated_amount::numeric), 0) AS total FROM ar_payment_allocations WHERE charge_transaction_id = ${inv.id}
        `) as any[];
        const unpaid = invAmt - parseFloat(existing.total);
        if (unpaid <= 0.005) continue;
        const alloc = Math.min(rem, unpaid);
        await db.execute(sql`
          INSERT INTO ar_payment_allocations (org_id, payment_transaction_id, charge_transaction_id, allocated_amount)
          VALUES ('556e350a-7180-4ec9-9e1e-ea0ca1937f40', ${pay49.id}, ${inv.id}, ${alloc.toFixed(2)})
        `);
        console.log(`    → ${inv.reference_number} ₱${alloc.toFixed(2)}`);
        rem -= alloc;
      }
      console.log(`  Remaining unallocated: ₱${rem.toFixed(2)}`);
    }
  }

  process.exit(0);
}
main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
