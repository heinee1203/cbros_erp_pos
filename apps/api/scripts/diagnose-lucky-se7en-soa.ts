/**
 * Diagnose Lucky Se7en SOA-0161/0162 duplication + false PAID status.
 * Run: npx tsx apps/api/scripts/diagnose-lucky-se7en-soa.ts
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
  console.log("=== Diagnose Lucky Se7en SOA-0161 / SOA-0162 ===\n");

  // Find customer
  const custRows = await db.execute(sql`
    SELECT id, name, phone
    FROM customers
    WHERE name ILIKE '%lucky%se7en%' OR name ILIKE '%lucky seven%'
  `) as any[];
  if (custRows.length === 0) {
    console.log("Customer not found");
    process.exit(1);
  }
  console.log("Candidate customers:");
  for (const c of custRows) console.log(`  ${c.name}  (${c.id})  phone=${c.phone}`);
  const cust = custRows[0];
  console.log(`\nUsing: ${cust.name} (${cust.id})\n`);

  // Both SOA numbers
  const soaRows = await db.execute(sql`
    SELECT id, soa_number,
      total_charges::text, total_credits::text, total_payable::text,
      transaction_count, status, date_from, date_to, created_at
    FROM soa_records
    WHERE soa_number IN ('SOA-2026-0161', 'SOA-2026-0162')
    ORDER BY soa_number
  `) as any[];
  console.log("=== SOA Header Records ===");
  for (const s of soaRows) {
    console.log(
      `  ${s.soa_number}  id=${s.id}`,
    );
    console.log(
      `    charges=₱${s.total_charges}  credits=₱${s.total_credits}  payable=₱${s.total_payable}  txns=${s.transaction_count}  status=${s.status}  ${s.date_from}..${s.date_to}`,
    );
  }
  if (soaRows.length !== 2) {
    console.log(`\n(!) Expected 2 SOA records, found ${soaRows.length}. Aborting.`);
    process.exit(1);
  }
  const soa161 = soaRows.find((s: any) => s.soa_number === "SOA-2026-0161");
  const soa162 = soaRows.find((s: any) => s.soa_number === "SOA-2026-0162");

  // ═══════════════════════════════════════════════════════════════════
  // STEP 1: Check SOA line items for duplicates across both SOAs
  // ═══════════════════════════════════════════════════════════════════
  console.log("\n=== STEP 1: Line items in both SOAs ===");
  const step1 = await db.execute(sql`
    SELECT
      sh.soa_number,
      sli.transaction_id,
      ct.reference_number,
      ct.type,
      ct.amount::text,
      ct.recorded_at
    FROM soa_line_items sli
    JOIN soa_records sh ON sh.id = sli.soa_id
    JOIN customer_transactions ct ON ct.id = sli.transaction_id
    WHERE sh.soa_number IN ('SOA-2026-0161', 'SOA-2026-0162')
    ORDER BY sh.soa_number, ct.reference_number
  `) as any[];

  console.log(`Total line items across both SOAs: ${step1.length}`);
  for (const r of step1) {
    console.log(
      `  ${r.soa_number}  ${r.reference_number}  ${r.type}  ₱${r.amount}  txId=${r.transaction_id}`,
    );
  }

  // Find duplicates: same transaction_id in both SOAs
  console.log("\n=== STEP 1b: Transactions appearing in MULTIPLE SOAs ===");
  const dupes = await db.execute(sql`
    SELECT
      ct.reference_number,
      ct.type,
      ct.amount::text,
      COUNT(DISTINCT sh.soa_number) as soa_count,
      STRING_AGG(DISTINCT sh.soa_number, ', ' ORDER BY sh.soa_number) as soa_list
    FROM soa_line_items sli
    JOIN soa_records sh ON sh.id = sli.soa_id
    JOIN customer_transactions ct ON ct.id = sli.transaction_id
    WHERE sh.soa_number IN ('SOA-2026-0161', 'SOA-2026-0162')
    GROUP BY ct.id, ct.reference_number, ct.type, ct.amount
    HAVING COUNT(DISTINCT sh.soa_number) > 1
    ORDER BY ct.reference_number
  `) as any[];
  if (dupes.length === 0) {
    console.log("  (no duplicates — each transaction belongs to only one SOA)");
  } else {
    console.log(`  FOUND ${dupes.length} DUPLICATED TRANSACTIONS:`);
    for (const d of dupes) {
      console.log(`  ${d.reference_number}  ${d.type}  ₱${d.amount}  in: ${d.soa_list}`);
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // STEP 2: Check payment allocations
  // ═══════════════════════════════════════════════════════════════════
  console.log("\n=== STEP 2: Payments for this customer ===");
  const payments = await db.execute(sql`
    SELECT
      id,
      payment_number,
      reference_number,
      amount::text,
      notes,
      recorded_at
    FROM customer_transactions
    WHERE customer_id = ${cust.id} AND type = 'PAYMENT'
    ORDER BY recorded_at DESC
    LIMIT 20
  `) as any[];
  for (const p of payments) {
    const soaMatch = (p.notes || "").match(/\[SOA:\s*([^\]]+)\]/);
    console.log(
      `  ${p.payment_number ?? p.reference_number}  ₱${p.amount}  SOA=${soaMatch ? soaMatch[1] : "—"}  (${p.recorded_at})`,
    );
  }

  console.log("\n=== STEP 2b: Allocations for PAY-2026-0062 ===");
  const pay62Rows = await db.execute(sql`
    SELECT id, payment_number, reference_number, amount::text, notes, recorded_at
    FROM customer_transactions
    WHERE (payment_number = 'PAY-2026-0062' OR reference_number = 'PAY-2026-0062')
    AND type = 'PAYMENT'
  `) as any[];
  if (pay62Rows.length === 0) {
    console.log("  PAY-2026-0062 not found — checking all payments for this customer around SOA dates");
  } else {
    for (const p of pay62Rows) {
      console.log(`  Found: ${p.payment_number ?? p.reference_number}  id=${p.id}  ₱${p.amount}`);
    }
  }

  const step2 = await db.execute(sql`
    SELECT
      pa.id,
      pa.allocated_amount::text,
      ct_pay.payment_number as pay_num,
      ct_pay.reference_number as pay_ref,
      ct_charge.reference_number as invoice_ref,
      ct_charge.amount::text as invoice_amount,
      sh.soa_number
    FROM ar_payment_allocations pa
    JOIN customer_transactions ct_pay ON ct_pay.id = pa.payment_transaction_id
    JOIN customer_transactions ct_charge ON ct_charge.id = pa.charge_transaction_id
    LEFT JOIN soa_line_items sli ON sli.transaction_id = ct_charge.id
    LEFT JOIN soa_records sh ON sh.id = sli.soa_id
    WHERE (ct_pay.payment_number = 'PAY-2026-0062' OR ct_pay.reference_number = 'PAY-2026-0062')
    ORDER BY sh.soa_number NULLS LAST, ct_charge.reference_number
  `) as any[];
  console.log(`\n  Allocation rows for PAY-2026-0062: ${step2.length}`);
  for (const r of step2) {
    console.log(
      `  ${r.pay_num ?? r.pay_ref} → ${r.invoice_ref}  alloc=₱${r.allocated_amount}  inv=₱${r.invoice_amount}  SOA=${r.soa_number ?? "—"}`,
    );
  }

  // ═══════════════════════════════════════════════════════════════════
  // STEP 3: SOA line item totals vs header totals
  // ═══════════════════════════════════════════════════════════════════
  console.log("\n=== STEP 3: Header total vs line item sums ===");
  const step3 = await db.execute(sql`
    SELECT
      sh.soa_number,
      sh.total_charges::text as hdr_charges,
      sh.total_credits::text as hdr_credits,
      sh.total_payable::text as hdr_payable,
      sh.status,
      COUNT(sli.id) as line_count,
      COALESCE(SUM(CASE WHEN ct.type = 'CHARGE' THEN ct.amount ELSE 0 END), 0)::text as charges_sum,
      COALESCE(SUM(CASE WHEN ct.type = 'CREDIT_NOTE' THEN ct.amount ELSE 0 END), 0)::text as credits_sum
    FROM soa_records sh
    LEFT JOIN soa_line_items sli ON sli.soa_id = sh.id
    LEFT JOIN customer_transactions ct ON ct.id = sli.transaction_id
    WHERE sh.soa_number IN ('SOA-2026-0161', 'SOA-2026-0162')
    GROUP BY sh.id, sh.soa_number, sh.total_charges, sh.total_credits, sh.total_payable, sh.status
    ORDER BY sh.soa_number
  `) as any[];
  for (const r of step3) {
    console.log(
      `  ${r.soa_number}  HEADER: charges=₱${r.hdr_charges} credits=₱${r.hdr_credits} payable=₱${r.hdr_payable}  status=${r.status}`,
    );
    console.log(
      `    LINES: count=${r.line_count}  charges_sum=₱${r.charges_sum}  credits_sum=₱${r.credits_sum}`,
    );
  }

  // ═══════════════════════════════════════════════════════════════════
  // STEP 4: For each SOA, show allocation totals per line item
  // ═══════════════════════════════════════════════════════════════════
  for (const soa of [soa161, soa162]) {
    console.log(`\n=== STEP 4: ${soa.soa_number} invoices + allocations ===`);
    const rows = await db.execute(sql`
      SELECT
        ct.reference_number,
        ct.type,
        ct.amount::text,
        COALESCE((
          SELECT SUM(pa.allocated_amount::numeric)
          FROM ar_payment_allocations pa
          WHERE pa.charge_transaction_id = ct.id
        ), 0)::text as allocated,
        ct.recorded_at
      FROM soa_line_items sli
      JOIN customer_transactions ct ON ct.id = sli.transaction_id
      WHERE sli.soa_id = ${soa.id}
      ORDER BY ct.recorded_at, ct.reference_number
    `) as any[];
    let totalCharges = 0;
    let totalCredits = 0;
    let totalAllocated = 0;
    for (const r of rows) {
      const amt = parseFloat(r.amount);
      const alloc = parseFloat(r.allocated);
      const status = r.type !== "CHARGE"
        ? "-"
        : alloc >= amt ? "PAID" : alloc > 0 ? "PARTIAL" : "UNPAID";
      if (r.type === "CHARGE") totalCharges += amt;
      if (r.type === "CREDIT_NOTE") totalCredits += amt;
      totalAllocated += alloc;
      console.log(
        `  ${r.reference_number}  ${r.type}  amount=₱${r.amount}  alloc=₱${r.allocated}  → ${status}`,
      );
    }
    const net = totalCharges - totalCredits;
    console.log(
      `  ── TOTALS: charges=₱${totalCharges.toFixed(2)}  credits=₱${totalCredits.toFixed(2)}  net=₱${net.toFixed(2)}  allocated=₱${totalAllocated.toFixed(2)}`,
    );
  }

  // ═══════════════════════════════════════════════════════════════════
  // STEP 5: Customer payments around the period
  // ═══════════════════════════════════════════════════════════════════
  console.log("\n=== STEP 5: All payments for this customer ===");
  const allPay = await db.execute(sql`
    SELECT
      payment_number,
      reference_number,
      amount::text,
      notes,
      recorded_at
    FROM customer_transactions
    WHERE customer_id = ${cust.id} AND type = 'PAYMENT'
    ORDER BY recorded_at
  `) as any[];
  for (const p of allPay) {
    const soaMatch = (p.notes || "").match(/\[SOA:\s*([^\]]+)\]/);
    console.log(
      `  ${p.payment_number ?? p.reference_number}  ₱${p.amount}  SOA=${soaMatch ? soaMatch[1] : "—"}  at ${p.recorded_at}`,
    );
  }

  // ═══════════════════════════════════════════════════════════════════
  // STEP 6: All allocations for this customer
  // ═══════════════════════════════════════════════════════════════════
  console.log("\n=== STEP 6: All allocations for this customer ===");
  const allAlloc = await db.execute(sql`
    SELECT
      ct_pay.payment_number as pay_num,
      ct_pay.reference_number as pay_ref,
      ct_charge.reference_number as invoice,
      pa.allocated_amount::text
    FROM ar_payment_allocations pa
    JOIN customer_transactions ct_pay ON ct_pay.id = pa.payment_transaction_id
    JOIN customer_transactions ct_charge ON ct_charge.id = pa.charge_transaction_id
    WHERE ct_charge.customer_id = ${cust.id}
    ORDER BY ct_pay.payment_number, ct_charge.recorded_at
  `) as any[];
  console.log(`  Total ${allAlloc.length} allocations`);
  for (const r of allAlloc) {
    console.log(`  ${r.pay_num ?? r.pay_ref} → ${r.invoice}  ₱${r.allocated_amount}`);
  }

  process.exit(0);
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
