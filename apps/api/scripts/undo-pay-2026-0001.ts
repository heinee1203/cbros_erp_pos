/**
 * Undo PAY-2026-0001 (₱3,100 CASH, notes="INV#1085") for Fajardo, Don.
 *
 * This is the payment that put SOA-2026-0072 into PARTIAL state with
 * paid_amount=3,100.00 (via an allocation on charge Q1664). Reversing it
 * should restore SOA-2026-0072 to GENERATED with paid_amount=0.
 *
 * Order of operations (single transaction):
 *   1. Capture affected SOA IDs from the allocations BEFORE deleting them
 *   2. Rewind balance_after on all txns chronologically after the payment
 *   3. Delete ar_payment_allocations for this payment
 *   4. Recompute status on affected SOAs (reads post-delete state)
 *   5. Delete the PAYMENT customer_transactions row
 *   6. Bump customer current_balance += 3,100
 *   7. Cross-check: last balance_after == customer.current_balance
 *
 * Hard-guarded by payment_number + expected amount + expected customer.
 * Dry run by default.
 *
 * Run:
 *   Dry run:  npx tsx apps/api/scripts/undo-pay-2026-0001.ts
 *   Apply:    npx tsx apps/api/scripts/undo-pay-2026-0001.ts --apply
 */
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
dotenv.config({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../../../.env") });

import { db } from "@apex/database";
import { sql } from "drizzle-orm";
import { recomputeSOAStatus } from "../src/modules/customers/service";

const APPLY = process.argv.includes("--apply");

const EXPECTED_PAYMENT_NUMBER = "PAY-2026-0001";
const EXPECTED_AMOUNT = 3100;
const EXPECTED_CUSTOMER_ID = "a7937016-83dd-413e-848d-4e7e91e61861"; // Fajardo, Don
const ORG_ID = "556e350a-7180-4ec9-9e1e-ea0ca1937f40";

async function main() {
  console.log(`=== Undo ${EXPECTED_PAYMENT_NUMBER} (${APPLY ? "APPLY" : "DRY RUN"}) ===\n`);

  // ── Resolve payment + guard ──
  const [payment] = (await db.execute(sql`
    SELECT id, customer_id, amount::text, balance_after::text,
           payment_number, notes, recorded_at::text, payment_method
    FROM customer_transactions
    WHERE payment_number = ${EXPECTED_PAYMENT_NUMBER}
      AND type = 'PAYMENT'
  `)) as any[];
  if (!payment) {
    console.error(`ABORT: ${EXPECTED_PAYMENT_NUMBER} not found`);
    process.exit(1);
  }
  const amt = parseFloat(payment.amount);
  if (Math.abs(amt - EXPECTED_AMOUNT) > 0.005) {
    console.error(`ABORT: expected amount ${EXPECTED_AMOUNT}, got ${amt}`);
    process.exit(1);
  }
  if (payment.customer_id !== EXPECTED_CUSTOMER_ID) {
    console.error(
      `ABORT: expected customer ${EXPECTED_CUSTOMER_ID}, got ${payment.customer_id}`,
    );
    process.exit(1);
  }
  console.log("payment:");
  console.table([payment]);

  // ── Customer before ──
  const [custBefore] = (await db.execute(sql`
    SELECT id, name, phone, current_balance::text
    FROM customers WHERE id = ${payment.customer_id}
  `)) as any[];
  console.log("customer BEFORE:");
  console.table([custBefore]);
  const balanceBefore = parseFloat(custBefore.current_balance);

  // ── Affected SOAs (captured now so we still have the link if cascade fires) ──
  const affected = (await db.execute(sql`
    SELECT DISTINCT sr.id, sr.soa_number, sr.status,
           sr.total_payable::text, COALESCE(sr.paid_amount,0)::text AS paid_amount
    FROM ar_payment_allocations pa
    JOIN soa_line_items sli ON sli.transaction_id = pa.charge_transaction_id
    JOIN soa_records sr ON sr.id = sli.soa_id
    WHERE pa.payment_transaction_id = ${payment.id}
    ORDER BY sr.soa_number
  `)) as any[];
  console.log(`Affected SOAs (will be recomputed): ${affected.length}`);
  console.table(affected);

  // ── Later rows to rewind ──
  const later = (await db.execute(sql`
    SELECT id, type, reference_number, amount::text,
           balance_after::text AS old_ba, recorded_at::text
    FROM customer_transactions
    WHERE customer_id = ${payment.customer_id}
      AND recorded_at > ${payment.recorded_at}::timestamptz
    ORDER BY recorded_at ASC, id ASC
  `)) as any[];
  console.log(`Rows to rewind (+${EXPECTED_AMOUNT}): ${later.length}`);
  console.table(
    later.map((r: any) => ({
      ref: r.reference_number ?? `(${r.type})`,
      type: r.type,
      amount: r.amount,
      old_ba: r.old_ba,
      new_ba: (parseFloat(r.old_ba) + EXPECTED_AMOUNT).toFixed(2),
      recorded_at: r.recorded_at,
    })),
  );

  console.log(
    `\ncustomer current_balance: ${balanceBefore.toFixed(2)} \u2192 ${(balanceBefore + EXPECTED_AMOUNT).toFixed(2)}`,
  );

  if (!APPLY) {
    console.log("\nDry run. Re-run with --apply to execute.");
    process.exit(0);
  }

  // ── Apply ──
  console.log("\nApplying in a single transaction...");
  const result = await db.transaction(async (tx) => {
    const affectedSoaIds = affected.map((r: any) => r.id) as string[];

    // 1. Rewind later rows
    const rewound = (await tx.execute(sql`
      UPDATE customer_transactions
      SET balance_after = balance_after + ${EXPECTED_AMOUNT}
      WHERE customer_id = ${payment.customer_id}
        AND recorded_at > ${payment.recorded_at}::timestamptz
      RETURNING id
    `)) as any[];

    // 2. Delete allocations for this payment
    const allocsDeleted = (await tx.execute(sql`
      DELETE FROM ar_payment_allocations
      WHERE payment_transaction_id = ${payment.id}
      RETURNING id
    `)) as any[];

    // 3. Recompute affected SOA statuses (reads post-delete allocation state)
    const recomputed: any[] = [];
    for (const soaId of affectedSoaIds) {
      const r = await recomputeSOAStatus(tx, ORG_ID, soaId);
      recomputed.push(r);
    }

    // 4. Delete the payment transaction
    const paymentDeleted = (await tx.execute(sql`
      DELETE FROM customer_transactions WHERE id = ${payment.id}
      RETURNING id
    `)) as any[];

    // 5. Bump customer balance
    const newBalance = balanceBefore + EXPECTED_AMOUNT;
    await tx.execute(sql`
      UPDATE customers SET current_balance = ${newBalance.toFixed(2)}
      WHERE id = ${payment.customer_id}
    `);

    // 6. Cross-check: last balance_after must equal customer.current_balance
    const [finalRow] = (await tx.execute(sql`
      SELECT COALESCE(balance_after, 0)::text AS bal
      FROM customer_transactions
      WHERE customer_id = ${payment.customer_id}
      ORDER BY recorded_at DESC, id DESC
      LIMIT 1
    `)) as any[];
    const tail = finalRow ? parseFloat(finalRow.bal) : 0;
    if (Math.abs(tail - newBalance) > 0.005) {
      throw new Error(
        `Balance reconciliation failed: tail balance_after=${tail} vs ` +
          `customer.current_balance=${newBalance}`,
      );
    }

    return {
      rewoundRows: rewound.length,
      allocsDeleted: allocsDeleted.length,
      paymentDeleted: paymentDeleted.length,
      recomputedSOAs: recomputed,
      newBalance,
    };
  });

  console.log("APPLIED:");
  console.log(`  rewoundRows:     ${result.rewoundRows}`);
  console.log(`  allocsDeleted:   ${result.allocsDeleted}`);
  console.log(`  paymentDeleted:  ${result.paymentDeleted}`);
  console.log(`  newBalance:      ${result.newBalance.toFixed(2)}`);
  console.log("\nRecomputed SOAs:");
  console.table(result.recomputedSOAs);

  // ── Verification ──
  console.log("\n=== Verification ===");

  // Payment should no longer exist
  const [payCheck] = (await db.execute(sql`
    SELECT COUNT(*)::int AS n FROM customer_transactions
    WHERE payment_number = ${EXPECTED_PAYMENT_NUMBER}
  `)) as any[];
  console.log(`PAY-2026-0001 rows remaining: ${payCheck.n} (expected 0)`);

  // No orphaned allocations
  const [allocCheck] = (await db.execute(sql`
    SELECT COUNT(*)::int AS n FROM ar_payment_allocations
    WHERE payment_transaction_id = ${payment.id}
  `)) as any[];
  console.log(`Allocations remaining for this payment: ${allocCheck.n} (expected 0)`);

  // Customer balance
  const [custAfter] = (await db.execute(sql`
    SELECT current_balance::text FROM customers WHERE id = ${payment.customer_id}
  `)) as any[];
  console.log(
    `Customer balance: ${balanceBefore.toFixed(2)} \u2192 ${custAfter.current_balance}`,
  );

  // Affected SOAs after recompute
  const soaAfter = (await db.execute(sql`
    SELECT soa_number, status, total_payable::text,
           COALESCE(paid_amount,0)::text AS paid_amount
    FROM soa_records
    WHERE soa_number IN ('SOA-2026-0072')
    ORDER BY soa_number
  `)) as any[];
  console.log("\nAffected SOAs after recompute:");
  console.table(soaAfter);

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
