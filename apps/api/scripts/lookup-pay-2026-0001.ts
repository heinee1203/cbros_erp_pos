import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
dotenv.config({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../../../.env") });

import { db } from "@apex/database";
import { sql } from "drizzle-orm";

console.log("=== Lookup PAY-2026-0001 ===\n");

// Try both columns — in this codebase, payments usually store the PAY-... code
// in the payment_number column, with reference_number holding an external ref.
const byPaymentNumber = (await db.execute(sql`
  SELECT id, customer_id, type, amount::text, balance_after::text,
         reference_number, payment_number, notes, recorded_at::text,
         payment_method
  FROM customer_transactions
  WHERE payment_number = 'PAY-2026-0001'
`)) as any[];
console.log("by payment_number = 'PAY-2026-0001':");
console.table(byPaymentNumber);

const byReferenceNumber = (await db.execute(sql`
  SELECT id, customer_id, type, amount::text, balance_after::text,
         reference_number, payment_number, notes, recorded_at::text
  FROM customer_transactions
  WHERE reference_number = 'PAY-2026-0001'
`)) as any[];
console.log("\nby reference_number = 'PAY-2026-0001':");
console.table(byReferenceNumber);

// Whichever matched, resolve the single row
const payment = byPaymentNumber[0] ?? byReferenceNumber[0];
if (!payment) {
  console.error("ABORT: PAY-2026-0001 not found in either column");
  process.exit(1);
}

console.log(`\nResolved payment: id=${payment.id}, amount=${payment.amount}, ` +
  `customer_id=${payment.customer_id}, recorded_at=${payment.recorded_at}`);

// Customer detail
const [cust] = (await db.execute(sql`
  SELECT id, name, phone, current_balance::text, is_active
  FROM customers WHERE id = ${payment.customer_id}
`)) as any[];
console.log("\nCustomer:");
console.table([cust]);

// Allocations on this payment — which charges were allocated?
const allocs = (await db.execute(sql`
  SELECT pa.id AS alloc_id, pa.charge_transaction_id,
         pa.allocated_amount::text,
         ct.reference_number AS charge_ref, ct.type AS charge_type,
         ct.amount::text AS charge_amount, ct.billed, ct.billed_soa_id
  FROM ar_payment_allocations pa
  JOIN customer_transactions ct ON ct.id = pa.charge_transaction_id
  WHERE pa.payment_transaction_id = ${payment.id}
  ORDER BY ct.recorded_at
`)) as any[];
console.log(`\nAllocations on PAY-2026-0001 (${allocs.length}):`);
console.table(allocs);

// Which SOAs contain any of the allocated charges?
// These are the SOAs that will need recompute after the allocations are deleted.
if (allocs.length > 0) {
  const chargeIds = allocs.map((a: any) => `'${a.charge_transaction_id}'`).join(",");
  const affectedSoas = (await db.execute(
    sql.raw(`
      SELECT DISTINCT sr.id, sr.soa_number, sr.status,
             sr.total_payable::text, sr.paid_amount::text
      FROM soa_line_items sli
      JOIN soa_records sr ON sr.id = sli.soa_id
      WHERE sli.transaction_id IN (${chargeIds})
      ORDER BY sr.soa_number
    `),
  )) as any[];
  console.log(`\nSOAs containing these charges (will need recompute) — ${affectedSoas.length}:`);
  console.table(affectedSoas);
} else {
  console.log("\nNo allocations — nothing to recompute.");
}

// Transactions chronologically AFTER this payment (need balance_after rewind)
const later = (await db.execute(sql`
  SELECT id, type, reference_number, amount::text, balance_after::text, recorded_at::text
  FROM customer_transactions
  WHERE customer_id = ${payment.customer_id}
    AND recorded_at > ${payment.recorded_at}::timestamptz
  ORDER BY recorded_at ASC, id ASC
`)) as any[];
console.log(`\n${later.length} transactions chronologically after PAY-2026-0001 (will be rewound +${payment.amount}):`);
console.table(later);

process.exit(0);
