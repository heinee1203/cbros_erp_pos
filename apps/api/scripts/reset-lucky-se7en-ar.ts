/**
 * DESTRUCTIVE: Full AR reset for Lucky Se7en, INC (AR-0006) ONLY.
 *
 * Wipes all PAYMENT transactions, ar_payment_allocations, SOA records and
 * soa_line_items tied to this customer. Unbills every remaining charge and
 * credit note. Rebuilds balance_after chronologically from 0, then sets
 * customers.current_balance from the reconstructed ending balance.
 *
 * Hard-guarded to the Lucky Se7en customer id. Aborts if the target row
 * resolves to any other customer. Runs entirely in one transaction so
 * any failure rolls back cleanly.
 *
 * Run:
 *   Dry run:  npx tsx apps/api/scripts/reset-lucky-se7en-ar.ts
 *   Apply:    npx tsx apps/api/scripts/reset-lucky-se7en-ar.ts --apply
 */
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
dotenv.config({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../../../.env") });

import { db } from "@apex/database";
import { sql } from "drizzle-orm";

const APPLY = process.argv.includes("--apply");

// Hard-coded target — guarded below by name + phone lookup.
const EXPECTED_ID = "730a74fc-47ae-4b61-ad7d-237f4b0aa70a";
const EXPECTED_AR = "AR-0006";
const EXPECTED_NAME_FRAGMENT = "lucky se7en";

async function main() {
  console.log(`=== Reset AR for Lucky Se7en, INC (${APPLY ? "APPLY" : "DRY RUN"}) ===\n`);

  // ── Guard: target customer must match id + phone + name ──
  const [cust] = (await db.execute(sql`
    SELECT id, name, phone, current_balance::text
    FROM customers
    WHERE id = ${EXPECTED_ID}
  `)) as any[];
  if (!cust) {
    console.error(`ABORT: customer id ${EXPECTED_ID} not found`);
    process.exit(1);
  }
  if (cust.phone !== EXPECTED_AR || !cust.name.toLowerCase().includes(EXPECTED_NAME_FRAGMENT)) {
    console.error(
      `ABORT: guard failed. Expected phone=${EXPECTED_AR}, name containing "${EXPECTED_NAME_FRAGMENT}", ` +
        `got phone="${cust.phone}", name="${cust.name}"`,
    );
    process.exit(1);
  }
  console.log(`target: ${cust.name}  (${cust.id})  phone=${cust.phone}`);
  console.log(`balance before: ${cust.current_balance}\n`);

  // ── Pre-reset snapshot (counts) ──
  const [before] = (await db.execute(sql`
    SELECT
      (SELECT COUNT(*)::int FROM customer_transactions WHERE customer_id = ${EXPECTED_ID}) AS all_txns,
      (SELECT COUNT(*)::int FROM customer_transactions WHERE customer_id = ${EXPECTED_ID} AND type = 'PAYMENT') AS payments,
      (SELECT COUNT(*)::int FROM customer_transactions WHERE customer_id = ${EXPECTED_ID} AND type = 'CHARGE') AS charges,
      (SELECT COUNT(*)::int FROM customer_transactions WHERE customer_id = ${EXPECTED_ID} AND type = 'CREDIT_NOTE') AS credit_notes,
      (SELECT COUNT(*)::int FROM customer_transactions WHERE customer_id = ${EXPECTED_ID} AND type NOT IN ('PAYMENT','CHARGE','CREDIT_NOTE')) AS other_types,
      (SELECT COUNT(*)::int FROM customer_transactions WHERE customer_id = ${EXPECTED_ID} AND billed = true) AS billed_rows,
      (SELECT COUNT(*)::int FROM soa_records WHERE customer_id = ${EXPECTED_ID}) AS soas,
      (SELECT COUNT(*)::int FROM soa_line_items sli
         JOIN soa_records sr ON sr.id = sli.soa_id
         WHERE sr.customer_id = ${EXPECTED_ID}) AS soa_line_items,
      (SELECT COUNT(*)::int FROM ar_payment_allocations pa
         JOIN customer_transactions ct ON ct.id = pa.payment_transaction_id
         WHERE ct.customer_id = ${EXPECTED_ID}) AS allocations_by_payment,
      (SELECT COUNT(*)::int FROM ar_payment_allocations pa
         JOIN customer_transactions ct ON ct.id = pa.charge_transaction_id
         WHERE ct.customer_id = ${EXPECTED_ID}) AS allocations_by_charge
  `)) as any[];
  console.log("BEFORE state:");
  console.table(before);

  if (before.other_types > 0) {
    console.error(
      `ABORT: customer has ${before.other_types} transaction(s) with type not in (PAYMENT,CHARGE,CREDIT_NOTE). ` +
        "This script only handles those three types. Inspect manually before proceeding.",
    );
    process.exit(1);
  }

  // Preview the reconstructed chain
  const preserved = (await db.execute(sql`
    SELECT id, type, reference_number, amount::text, recorded_at::text
    FROM customer_transactions
    WHERE customer_id = ${EXPECTED_ID}
      AND type IN ('CHARGE','CREDIT_NOTE')
    ORDER BY recorded_at ASC, id ASC
  `)) as any[];

  let running = 0;
  const rebuilt = preserved.map((r: any) => {
    const amt = parseFloat(r.amount);
    if (r.type === "CHARGE") running += amt;
    else running -= amt; // CREDIT_NOTE
    return {
      ref: r.reference_number ?? `(${r.type})`,
      type: r.type,
      amount: amt.toFixed(2),
      new_balance_after: running.toFixed(2),
      recorded_at: r.recorded_at,
    };
  });
  const newCustomerBalance = running;
  console.log(`\n${preserved.length} CHARGE/CREDIT_NOTE rows will be preserved and renumbered:`);
  console.table(rebuilt);
  console.log(`\nreconstructed current_balance: ${newCustomerBalance.toFixed(2)}`);
  console.log(
    `delta vs stored: ${(newCustomerBalance - parseFloat(cust.current_balance)).toFixed(2)}`,
  );

  console.log("\nWILL DELETE:");
  console.log(`  ${before.allocations_by_payment} ar_payment_allocations (via payment txns)`);
  console.log(`  ${before.soa_line_items}         soa_line_items`);
  console.log(`  ${before.soas}                 soa_records`);
  console.log(`  ${before.payments}              PAYMENT customer_transactions`);
  console.log("WILL UPDATE:");
  console.log(`  ${before.billed_rows}           rows  billed = false`);
  console.log(`  ${preserved.length}            rows  balance_after rebuilt`);
  console.log(`  1            row   customers.current_balance`);

  if (!APPLY) {
    console.log("\nDry run. Re-run with --apply to execute.");
    process.exit(0);
  }

  // ── Apply: single transaction ──
  console.log("\nApplying in a single transaction...");
  const result = await db.transaction(async (tx) => {
    // 1. Delete ar_payment_allocations tied to payments (either side of the FK)
    const allocRows = (await tx.execute(sql`
      DELETE FROM ar_payment_allocations
      WHERE payment_transaction_id IN (
        SELECT id FROM customer_transactions
        WHERE customer_id = ${EXPECTED_ID} AND type = 'PAYMENT'
      )
         OR charge_transaction_id IN (
        SELECT id FROM customer_transactions
        WHERE customer_id = ${EXPECTED_ID}
      )
      RETURNING id
    `)) as any[];

    // 2. Delete soa_line_items for this customer's SOAs
    const lineRows = (await tx.execute(sql`
      DELETE FROM soa_line_items
      WHERE soa_id IN (
        SELECT id FROM soa_records WHERE customer_id = ${EXPECTED_ID}
      )
      RETURNING id
    `)) as any[];

    // 3. Unbill remaining charges FIRST — this clears the FK
    //    customer_transactions.billed_soa_id → soa_records.id so that
    //    the soa_records delete in step 4 doesn't violate the constraint.
    const unbilled = (await tx.execute(sql`
      UPDATE customer_transactions
      SET billed = false, billed_soa_id = NULL
      WHERE customer_id = ${EXPECTED_ID}
      RETURNING id
    `)) as any[];

    // 4. Delete soa_records (FK references now cleared)
    const soaRows = (await tx.execute(sql`
      DELETE FROM soa_records WHERE customer_id = ${EXPECTED_ID}
      RETURNING id
    `)) as any[];

    // 5. Delete PAYMENT transactions
    const payRows = (await tx.execute(sql`
      DELETE FROM customer_transactions
      WHERE customer_id = ${EXPECTED_ID} AND type = 'PAYMENT'
      RETURNING id
    `)) as any[];

    // 6. Rebuild balance_after chronologically on remaining rows.
    //    We use a CTE with window SUM to compute the running total, then
    //    UPDATE in place. Order: recorded_at ASC, id ASC (stable tiebreak).
    const rebuiltRows = (await tx.execute(sql`
      WITH ordered AS (
        SELECT
          id,
          SUM(
            CASE
              WHEN type = 'CHARGE'      THEN amount::numeric
              WHEN type = 'CREDIT_NOTE' THEN -amount::numeric
              ELSE 0
            END
          ) OVER (ORDER BY recorded_at ASC, id ASC
                  ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS new_ba
        FROM customer_transactions
        WHERE customer_id = ${EXPECTED_ID}
      )
      UPDATE customer_transactions ct
      SET balance_after = o.new_ba
      FROM ordered o
      WHERE ct.id = o.id
      RETURNING ct.id
    `)) as any[];

    // 7. Recompute customer current_balance from the final row of the chain
    const [finalRow] = (await tx.execute(sql`
      SELECT COALESCE(balance_after, 0)::text AS bal
      FROM customer_transactions
      WHERE customer_id = ${EXPECTED_ID}
      ORDER BY recorded_at DESC, id DESC
      LIMIT 1
    `)) as any[];
    const finalBalance = finalRow ? parseFloat(finalRow.bal) : 0;

    // Cross-check against the direct SUM — they must match.
    const [sumRow] = (await tx.execute(sql`
      SELECT COALESCE(SUM(
        CASE WHEN type = 'CHARGE' THEN amount::numeric
             WHEN type = 'CREDIT_NOTE' THEN -amount::numeric
             ELSE 0 END
      ), 0)::text AS total
      FROM customer_transactions
      WHERE customer_id = ${EXPECTED_ID}
    `)) as any[];
    const sumBalance = parseFloat(sumRow.total);

    if (Math.abs(finalBalance - sumBalance) > 0.005) {
      throw new Error(
        `Balance reconciliation failed: last balance_after=${finalBalance} vs SUM=${sumBalance}`,
      );
    }

    await tx.execute(sql`
      UPDATE customers
      SET current_balance = ${sumBalance.toFixed(2)}
      WHERE id = ${EXPECTED_ID}
    `);

    return {
      deletedAllocations: allocRows.length,
      deletedSoaLineItems: lineRows.length,
      deletedSoaRecords: soaRows.length,
      deletedPayments: payRows.length,
      unbilledRows: unbilled.length,
      rebuiltRows: rebuiltRows.length,
      finalBalance: sumBalance,
    };
  });

  console.log("\nAPPLIED:");
  console.table([result]);

  // ── Post-reset verification (exactly the spec's checks) ──
  console.log("\n=== Verification ===");
  const [verify] = (await db.execute(sql`
    SELECT
      (SELECT COUNT(*)::int FROM customer_transactions
        WHERE customer_id = ${EXPECTED_ID} AND type = 'PAYMENT') AS payments_remaining,
      (SELECT COUNT(*)::int FROM soa_records WHERE customer_id = ${EXPECTED_ID}) AS soas_remaining,
      (SELECT COUNT(*)::int FROM ar_payment_allocations pa
         JOIN customer_transactions ct ON ct.id = pa.payment_transaction_id
         WHERE ct.customer_id = ${EXPECTED_ID}) AS payment_side_allocations_remaining,
      (SELECT COUNT(*)::int FROM ar_payment_allocations pa
         JOIN customer_transactions ct ON ct.id = pa.charge_transaction_id
         WHERE ct.customer_id = ${EXPECTED_ID}) AS charge_side_allocations_remaining,
      (SELECT COUNT(*)::int FROM customer_transactions
        WHERE customer_id = ${EXPECTED_ID} AND billed = true) AS billed_remaining,
      (SELECT current_balance::text FROM customers WHERE id = ${EXPECTED_ID}) AS current_balance
  `)) as any[];
  console.table([verify]);

  // Show the reconstructed ledger
  const finalChain = (await db.execute(sql`
    SELECT type, reference_number, amount::text, balance_after::text,
           recorded_at::text, billed
    FROM customer_transactions
    WHERE customer_id = ${EXPECTED_ID}
    ORDER BY recorded_at ASC, id ASC
  `)) as any[];
  console.log("\nReconstructed Lucky Se7en ledger:");
  console.table(finalChain);

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
