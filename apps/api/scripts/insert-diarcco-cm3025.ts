/**
 * Insert backdated CREDIT_NOTE CM-3025 for Diarcco CORP.
 *   Date:    2025-12-13 16:00:02 UTC  (right after Q2846 @ 16:00:00)
 *   Amount:  2,200.00
 *   Type:    CREDIT_NOTE (decreases AR balance)
 *   billed:  false (will be captured by next SOA generation)
 *
 * CM-3025 sits chronologically between Q2846 (Dec 13) and Q2927 (Dec 17).
 * All 40 later rows have balance_after decreased by 2,200, customer
 * current_balance decreases by the same. Atomic single transaction.
 *
 * Run:
 *   Dry run:  npx tsx apps/api/scripts/insert-diarcco-cm3025.ts
 *   Apply:    npx tsx apps/api/scripts/insert-diarcco-cm3025.ts --apply
 */
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
dotenv.config({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../../../.env") });

import { db } from "@apex/database";
import { sql } from "drizzle-orm";

const APPLY = process.argv.includes("--apply");

const CUSTOMER_ID = "f9dde83a-4a75-4b1d-92f2-da6a92035c04"; // Diarcco CORP
const ORG_ID = "556e350a-7180-4ec9-9e1e-ea0ca1937f40";
const AMOUNT = 2200;
const REFERENCE = "CM-3025";
// 16:00:02 places CM-3025 after Q2846 (16:00:00) and any theoretical 16:00:01
// same-day CHARGE, while still landing well before Q2927 on Dec 17.
const RECORDED_AT = "2025-12-13T16:00:02Z";

async function main() {
  console.log(`=== Insert ${REFERENCE} (CREDIT_NOTE) for Diarcco CORP (${APPLY ? "APPLY" : "DRY RUN"}) ===\n`);

  // Guard 1: no duplicate reference_number
  const dup = (await db.execute(sql`
    SELECT id, customer_id FROM customer_transactions
    WHERE reference_number = ${REFERENCE}
  `)) as any[];
  if (dup.length > 0) {
    console.error(`ABORT: ${REFERENCE} already exists (id=${dup[0].id})`);
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
  console.log(`admin user: ${admin.email}  (${admin.id})`);

  // Snapshot customer
  const [custBefore] = (await db.execute(sql`
    SELECT current_balance::text FROM customers WHERE id = ${CUSTOMER_ID}
  `)) as any[];
  const balanceBefore = parseFloat(custBefore.current_balance);
  console.log(`customer current_balance before: ${balanceBefore.toFixed(2)}`);

  // Predecessor = most recent row at or before the insert time
  const [predecessor] = (await db.execute(sql`
    SELECT reference_number, balance_after::text AS ba, recorded_at::text
    FROM customer_transactions
    WHERE customer_id = ${CUSTOMER_ID}
      AND recorded_at <= ${RECORDED_AT}::timestamptz
    ORDER BY recorded_at DESC, id DESC
    LIMIT 1
  `)) as any[];
  if (!predecessor) {
    console.error("ABORT: no predecessor transaction found before insert date");
    process.exit(1);
  }
  const predecessorBalance = parseFloat(predecessor.ba);
  const newCMBalanceAfter = predecessorBalance - AMOUNT;
  console.log(
    `predecessor: ${predecessor.reference_number}  ` +
      `balance_after=${predecessor.ba}  recorded_at=${predecessor.recorded_at}`,
  );
  console.log(
    `\ninsert: CREDIT_NOTE ${REFERENCE}  amount=${AMOUNT.toFixed(2)}  ` +
      `balance_after=${newCMBalanceAfter.toFixed(2)}  recorded_at=${RECORDED_AT}\n`,
  );

  // Later rows that will be rewound
  const later = (await db.execute(sql`
    SELECT id, type, reference_number, amount::text,
           balance_after::text AS old_ba, recorded_at::text
    FROM customer_transactions
    WHERE customer_id = ${CUSTOMER_ID}
      AND recorded_at > ${RECORDED_AT}::timestamptz
    ORDER BY recorded_at ASC, id ASC
  `)) as any[];
  console.log(`${later.length} later rows will be rewound (\u2212${AMOUNT.toFixed(2)} each):`);
  console.table(
    later.slice(0, 15).map((r) => ({
      ref: r.reference_number ?? `(${r.type})`,
      type: r.type,
      amount: r.amount,
      old_ba: r.old_ba,
      new_ba: (parseFloat(r.old_ba) - AMOUNT).toFixed(2),
      recorded_at: r.recorded_at,
    })),
  );
  if (later.length > 15) console.log(`  ... and ${later.length - 15} more`);

  const newCustomerBalance = balanceBefore - AMOUNT;
  console.log(
    `\ncustomer current_balance: ${balanceBefore.toFixed(2)} \u2192 ${newCustomerBalance.toFixed(2)}`,
  );

  if (!APPLY) {
    console.log("\nDry run. Re-run with --apply to write changes.");
    process.exit(0);
  }

  console.log("\nApplying in a single transaction...");
  await db.transaction(async (tx) => {
    // 1. Insert the CREDIT_NOTE
    const [inserted] = (await tx.execute(sql`
      INSERT INTO customer_transactions (
        org_id, customer_id, type, amount, balance_after,
        reference_number, recorded_by, recorded_at, billed
      ) VALUES (
        ${ORG_ID}, ${CUSTOMER_ID}, 'CREDIT_NOTE', ${AMOUNT.toFixed(2)},
        ${newCMBalanceAfter.toFixed(2)}, ${REFERENCE}, ${admin.id},
        ${RECORDED_AT}::timestamptz, false
      )
      RETURNING id, reference_number, type, amount::text,
                balance_after::text, recorded_at::text, billed
    `)) as any[];
    console.log("inserted:", inserted);

    // 2. Decrease balance_after on every later row
    const rewound = (await tx.execute(sql`
      UPDATE customer_transactions
      SET balance_after = balance_after - ${AMOUNT}
      WHERE customer_id = ${CUSTOMER_ID}
        AND recorded_at > ${RECORDED_AT}::timestamptz
      RETURNING id
    `)) as any[];
    console.log(`rewound ${rewound.length} later rows`);

    // 3. Decrease customer current_balance
    await tx.execute(sql`
      UPDATE customers
      SET current_balance = ${newCustomerBalance.toFixed(2)}
      WHERE id = ${CUSTOMER_ID}
    `);
  });

  // Verify
  const [custAfter] = (await db.execute(sql`
    SELECT current_balance::text FROM customers WHERE id = ${CUSTOMER_ID}
  `)) as any[];
  console.log(`\ncustomer current_balance after: ${custAfter.current_balance}`);

  const chain = (await db.execute(sql`
    SELECT type, reference_number, amount::text, balance_after::text,
           recorded_at::text, billed
    FROM customer_transactions
    WHERE customer_id = ${CUSTOMER_ID}
      AND recorded_at >= '2025-12-12'::timestamptz
      AND recorded_at <= '2025-12-18'::timestamptz
    ORDER BY recorded_at ASC, id ASC
  `)) as any[];
  console.log("Dec 12-17 window (shows CM-3025 in place):");
  console.table(chain);

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
