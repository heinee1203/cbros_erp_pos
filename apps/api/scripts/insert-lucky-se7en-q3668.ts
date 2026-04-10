/**
 * Insert backdated CHARGE Q3668 for Lucky Se7en, INC.
 *   Date:    2026-03-04
 *   Amount:  470.00
 *   billed:  false (will be captured by next SOA generation)
 *
 * Since the charge is backdated between existing transactions, we also
 * rewind balance_after on all chronologically-later rows and bump the
 * customer's current_balance. Whole thing runs in a single transaction
 * so a failure anywhere rolls back cleanly.
 *
 * Run:
 *   Dry run:  npx tsx apps/api/scripts/insert-lucky-se7en-q3668.ts
 *   Apply:    npx tsx apps/api/scripts/insert-lucky-se7en-q3668.ts --apply
 */
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
dotenv.config({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../../../.env") });

import { db } from "@apex/database";
import { sql } from "drizzle-orm";

const APPLY = process.argv.includes("--apply");

const CUSTOMER_ID = "730a74fc-47ae-4b61-ad7d-237f4b0aa70a"; // Lucky Se7en, INC
const ORG_ID = "556e350a-7180-4ec9-9e1e-ea0ca1937f40";
const AMOUNT = 470;
const REFERENCE = "Q3668";
const RECORDED_AT = "2026-03-04T16:00:00Z"; // match existing charges' +00:00 time

async function main() {
  console.log(`=== Insert ${REFERENCE} for Lucky Se7en, INC (${APPLY ? "APPLY" : "DRY RUN"}) ===\n`);

  // Guard 1: no duplicate reference_number
  const dup = (await db.execute(sql`
    SELECT id FROM customer_transactions
    WHERE customer_id = ${CUSTOMER_ID} AND reference_number = ${REFERENCE}
  `)) as any[];
  if (dup.length > 0) {
    console.error(`ABORT: ${REFERENCE} already exists on this customer (id=${dup[0].id})`);
    process.exit(1);
  }

  // Guard 2: resolve admin user
  const [admin] = (await db.execute(sql`
    SELECT id, email FROM users WHERE email = 'admin@apex.com' LIMIT 1
  `)) as any[];
  if (!admin) {
    console.error("ABORT: admin@apex.com user not found");
    process.exit(1);
  }
  const ADMIN_ID = admin.id;
  console.log(`admin user: ${admin.email}  (${ADMIN_ID})`);

  // Snapshot current balance
  const [custBefore] = (await db.execute(sql`
    SELECT current_balance::text FROM customers WHERE id = ${CUSTOMER_ID}
  `)) as any[];
  console.log(`customer current_balance before: ${custBefore.current_balance}`);

  // Preview affected later rows
  const later = (await db.execute(sql`
    SELECT id, type, reference_number, amount::text,
           balance_after::text AS old_ba, recorded_at::text
    FROM customer_transactions
    WHERE customer_id = ${CUSTOMER_ID}
      AND recorded_at > ${RECORDED_AT}::timestamptz
    ORDER BY recorded_at ASC, id ASC
  `)) as any[];

  // Find the predecessor (most recent row at or before the insert time)
  const [predecessor] = (await db.execute(sql`
    SELECT reference_number, balance_after::text AS ba, recorded_at::text
    FROM customer_transactions
    WHERE customer_id = ${CUSTOMER_ID}
      AND recorded_at <= ${RECORDED_AT}::timestamptz
    ORDER BY recorded_at DESC, id DESC
    LIMIT 1
  `)) as any[];
  if (!predecessor) {
    console.error("ABORT: no predecessor transaction found — timeline is empty before insert date");
    process.exit(1);
  }
  const predecessorBalance = parseFloat(predecessor.ba);
  const newChargeBalanceAfter = predecessorBalance + AMOUNT;

  console.log(
    `predecessor: ${predecessor.reference_number ?? "(untagged)"}  ` +
      `balance_after=${predecessor.ba}  recorded_at=${predecessor.recorded_at}`,
  );
  console.log(
    `\ninsert: CHARGE ${REFERENCE}  amount=${AMOUNT.toFixed(2)}  ` +
      `balance_after=${newChargeBalanceAfter.toFixed(2)}  recorded_at=${RECORDED_AT}\n`,
  );

  console.log("later rows to be rewound (+470.00 to each balance_after):");
  console.table(
    later.map((r) => ({
      ref: r.reference_number ?? `(${r.type})`,
      type: r.type,
      amount: r.amount,
      old_ba: r.old_ba,
      new_ba: (parseFloat(r.old_ba) + AMOUNT).toFixed(2),
      recorded_at: r.recorded_at,
    })),
  );

  const newCustomerBalance = (parseFloat(custBefore.current_balance) + AMOUNT).toFixed(2);
  console.log(`\ncustomer current_balance: ${custBefore.current_balance} \u2192 ${newCustomerBalance}`);

  if (!APPLY) {
    console.log("\nDry run. Re-run with --apply to write changes.");
    process.exit(0);
  }

  console.log("\nApplying in a single transaction...");
  await db.transaction(async (tx) => {
    // 1. Insert the new CHARGE
    const [inserted] = (await tx.execute(sql`
      INSERT INTO customer_transactions (
        org_id, customer_id, type, amount, balance_after,
        reference_number, recorded_by, recorded_at, billed
      ) VALUES (
        ${ORG_ID}, ${CUSTOMER_ID}, 'CHARGE', ${AMOUNT.toFixed(2)},
        ${newChargeBalanceAfter.toFixed(2)}, ${REFERENCE}, ${ADMIN_ID},
        ${RECORDED_AT}::timestamptz, false
      )
      RETURNING id, reference_number, amount::text, balance_after::text,
                recorded_at::text, billed
    `)) as any[];
    console.log("inserted:", inserted);

    // 2. Rewind balance_after on every later row (column is numeric)
    const rewound = (await tx.execute(sql`
      UPDATE customer_transactions
      SET balance_after = balance_after + ${AMOUNT}
      WHERE customer_id = ${CUSTOMER_ID}
        AND recorded_at > ${RECORDED_AT}::timestamptz
      RETURNING id, reference_number, type, balance_after::text
    `)) as any[];
    console.log(`rewound ${rewound.length} later rows`);

    // 3. Bump customer current_balance
    await tx.execute(sql`
      UPDATE customers
      SET current_balance = ${newCustomerBalance}
      WHERE id = ${CUSTOMER_ID}
    `);
  });

  // Verify
  const [custAfter] = (await db.execute(sql`
    SELECT current_balance::text FROM customers WHERE id = ${CUSTOMER_ID}
  `)) as any[];
  const chain = (await db.execute(sql`
    SELECT type, reference_number, amount::text, balance_after::text, recorded_at::text, billed
    FROM customer_transactions
    WHERE customer_id = ${CUSTOMER_ID}
    ORDER BY recorded_at DESC, id DESC
    LIMIT 10
  `)) as any[];
  console.log(`\ncustomer current_balance after: ${custAfter.current_balance}`);
  console.log("last 10 transactions:");
  console.table(chain);

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
