/**
 * Diagnose false PAID status on SOA-2026-0149 invoices.
 * Run: npx tsx apps/api/scripts/diagnose-false-paid.ts
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
  console.log("=== Diagnose False PAID on SOA-0149 ===\n");

  // Find customer (RT Montana = AR-0032)
  const [cust] = await db.execute(sql`SELECT id, name FROM customers WHERE phone = 'AR-0032' OR name ILIKE '%rt montana%' LIMIT 1`) as any[];
  if (!cust) { console.log("Customer not found"); process.exit(1); }
  console.log(`Customer: ${cust.name} (${cust.id})\n`);

  // Query 1: What allocations exist for Q2502, Q2514, Q2513, Q2519?
  console.log("=== Q1: Allocations for Q2502, Q2514, Q2513, Q2519 ===");
  const q1 = await db.execute(sql`
    SELECT pa.id, ct_pay.payment_number as payment_ref, ct_charge.reference_number as invoice_ref,
      pa.allocated_amount::text
    FROM ar_payment_allocations pa
    JOIN customer_transactions ct_pay ON ct_pay.id = pa.payment_transaction_id
    JOIN customer_transactions ct_charge ON ct_charge.id = pa.charge_transaction_id
    WHERE ct_charge.reference_number IN ('Q2502', 'Q2514', 'Q2513', 'Q2519')
    AND ct_charge.customer_id = ${cust.id}
  `) as any[];
  if (q1.length === 0) console.log("  (none)");
  for (const r of q1) console.log(`  ${r.invoice_ref} ← ${r.payment_ref}  ₱${r.allocated_amount}`);

  // Query 2: What SOAs do the payments belong to (from notes)?
  console.log("\n=== Q2: Payment SOA associations ===");
  const payments = await db.execute(sql`
    SELECT payment_number, notes, amount::text
    FROM customer_transactions
    WHERE customer_id = ${cust.id} AND type = 'PAYMENT'
    ORDER BY recorded_at
  `) as any[];
  for (const p of payments) {
    const soaMatch = (p.notes || "").match(/\[SOA:\s*([^\]]+)\]/);
    console.log(`  ${p.payment_number}  ₱${p.amount}  SOA: ${soaMatch ? soaMatch[1] : "none"}`);
  }

  // Query 3: SOA-2026-0149 invoices and their allocations
  console.log("\n=== Q3: SOA-2026-0149 invoices + allocations ===");
  const [soa149] = await db.execute(sql`SELECT id FROM soa_records WHERE soa_number = 'SOA-2026-0149'`) as any[];
  if (!soa149) { console.log("  SOA-2026-0149 not found"); } else {
    const q3 = await db.execute(sql`
      SELECT ct.reference_number, ct.type, ct.amount::text,
        COALESCE((SELECT SUM(pa.allocated_amount::numeric) FROM ar_payment_allocations pa WHERE pa.charge_transaction_id = ct.id), 0)::text as allocated
      FROM soa_line_items sli
      JOIN customer_transactions ct ON ct.id = sli.transaction_id
      WHERE sli.soa_id = ${soa149.id}
      ORDER BY ct.recorded_at
    `) as any[];
    for (const r of q3) {
      const status = r.type !== 'CHARGE' ? '-' : parseFloat(r.allocated) >= parseFloat(r.amount) ? 'PAID' : parseFloat(r.allocated) > 0 ? 'PARTIAL' : 'UNPAID';
      console.log(`  ${r.reference_number}  ${r.type}  amount:₱${r.amount}  allocated:₱${r.allocated}  → ${status}`);
    }
  }

  // Query 4: SOA-2026-0147 invoices and their allocations (for comparison)
  console.log("\n=== Q4: SOA-2026-0147 invoices + allocations ===");
  const [soa147] = await db.execute(sql`SELECT id FROM soa_records WHERE soa_number = 'SOA-2026-0147'`) as any[];
  if (!soa147) { console.log("  SOA-2026-0147 not found"); } else {
    const q4 = await db.execute(sql`
      SELECT ct.reference_number, ct.type, ct.amount::text,
        COALESCE((SELECT SUM(pa.allocated_amount::numeric) FROM ar_payment_allocations pa WHERE pa.charge_transaction_id = ct.id), 0)::text as allocated
      FROM soa_line_items sli
      JOIN customer_transactions ct ON ct.id = sli.transaction_id
      WHERE sli.soa_id = ${soa147.id}
      ORDER BY ct.recorded_at
    `) as any[];
    for (const r of q4) {
      const status = r.type !== 'CHARGE' ? '-' : parseFloat(r.allocated) >= parseFloat(r.amount) ? 'PAID' : parseFloat(r.allocated) > 0 ? 'PARTIAL' : 'UNPAID';
      console.log(`  ${r.reference_number}  ${r.type}  amount:₱${r.amount}  allocated:₱${r.allocated}  → ${status}`);
    }
  }

  // Query 5: Total allocations for this customer
  console.log("\n=== Q5: All allocations for this customer ===");
  const allAllocs = await db.execute(sql`
    SELECT ct_pay.payment_number, ct_charge.reference_number as invoice,
      pa.allocated_amount::text
    FROM ar_payment_allocations pa
    JOIN customer_transactions ct_pay ON ct_pay.id = pa.payment_transaction_id
    JOIN customer_transactions ct_charge ON ct_charge.id = pa.charge_transaction_id
    WHERE ct_charge.customer_id = ${cust.id}
    ORDER BY ct_pay.payment_number, ct_charge.recorded_at
  `) as any[];
  console.log(`  Total: ${allAllocs.length} allocation rows`);
  for (const r of allAllocs) console.log(`  ${r.payment_number} → ${r.invoice}  ₱${r.allocated_amount}`);

  process.exit(0);
}
main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
