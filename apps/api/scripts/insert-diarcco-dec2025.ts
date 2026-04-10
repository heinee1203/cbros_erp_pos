/**
 * Insert 10 backdated December 2025 CHARGE rows for Diarcco CORP.
 *
 * Per lookup-diarcco-dec2025: customer has 37 existing transactions, all
 * dated 2026-01-05 or later — so every new row lands before the existing
 * ledger and the full ledger gets rewound by the insert total (₱37,315).
 *
 * Same-day invoices use 16:00:00 and 16:00:01 to preserve listed order.
 * All rows: billed=false, recorded_by=admin@apex.com.
 *
 * Run:
 *   Dry run:  npx tsx apps/api/scripts/insert-diarcco-dec2025.ts
 *   Apply:    npx tsx apps/api/scripts/insert-diarcco-dec2025.ts --apply
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

interface NewCharge {
  ref: string;
  date: string; // ISO with explicit timestamp
  amount: number;
}

// Order matters — same-day entries rely on list position.
const charges: NewCharge[] = [
  { ref: "Q2512", date: "2025-12-03T16:00:00Z", amount: 6000 },
  { ref: "Q2538", date: "2025-12-05T16:00:00Z", amount: 17800 },
  { ref: "Q2246", date: "2025-12-08T16:00:00Z", amount: 350 },
  { ref: "Q2805", date: "2025-12-08T16:00:01Z", amount: 3105 },
  { ref: "Q2840", date: "2025-12-12T16:00:00Z", amount: 1550 },
  { ref: "Q2841", date: "2025-12-12T16:00:01Z", amount: 3455 },
  { ref: "Q2846", date: "2025-12-13T16:00:00Z", amount: 1000 },
  { ref: "Q2927", date: "2025-12-17T16:00:00Z", amount: 2000 },
  { ref: "Q3002", date: "2025-12-20T16:00:00Z", amount: 130 },
  { ref: "Q3007", date: "2025-12-22T16:00:00Z", amount: 1925 },
];

async function main() {
  console.log(`=== Insert 10 Dec 2025 charges for Diarcco CORP (${APPLY ? "APPLY" : "DRY RUN"}) ===\n`);

  const totalInsert = charges.reduce((s, c) => s + c.amount, 0);
  console.log(`Total being added: ${totalInsert.toFixed(2)}`);

  // Guard 1: no duplicate refs anywhere
  const refs = charges.map((c) => c.ref);
  const dup = (await db.execute(sql`
    SELECT reference_number, customer_id FROM customer_transactions
    WHERE reference_number IN (
      'Q2512','Q2538','Q2246','Q2805','Q2840',
      'Q2841','Q2846','Q2927','Q3002','Q3007'
    )
  `)) as any[];
  if (dup.length > 0) {
    console.error("ABORT: one or more reference numbers already exist:");
    console.table(dup);
    process.exit(1);
  }

  // Guard 2: no existing Diarcco transactions on or before 2026-01-01
  // (the assumption that makes this a clean backdated insert)
  const [pre] = (await db.execute(sql`
    SELECT COUNT(*)::int AS n FROM customer_transactions
    WHERE customer_id = ${CUSTOMER_ID}
      AND recorded_at <= '2026-01-01'::timestamptz
  `)) as any[];
  if (pre.n > 0) {
    console.error(
      `ABORT: Diarcco CORP has ${pre.n} transaction(s) on or before 2026-01-01. ` +
        "This script only handles the clean-slate case where new rows precede the entire ledger.",
    );
    process.exit(1);
  }

  // Guard 3: resolve admin user
  const [admin] = (await db.execute(sql`
    SELECT id, email FROM users WHERE email = 'admin@apex.com' LIMIT 1
  `)) as any[];
  if (!admin) {
    console.error("ABORT: admin@apex.com user not found");
    process.exit(1);
  }
  console.log(`admin user: ${admin.email}  (${admin.id})\n`);

  // Snapshot current balance
  const [custBefore] = (await db.execute(sql`
    SELECT current_balance::text FROM customers WHERE id = ${CUSTOMER_ID}
  `)) as any[];
  const balanceBefore = parseFloat(custBefore.current_balance);
  console.log(`customer current_balance before: ${balanceBefore.toFixed(2)}`);

  // Build running balance starting from 0 (no predecessor before 2026-01-01)
  let running = 0;
  const inserts = charges.map((c) => {
    running += c.amount;
    return { ...c, balanceAfter: running };
  });

  console.log("\nInserts (in order):");
  console.table(
    inserts.map((r) => ({
      ref: r.ref,
      date: r.date,
      amount: r.amount.toFixed(2),
      balance_after: r.balanceAfter.toFixed(2),
    })),
  );

  // All 37 existing rows will have balance_after bumped by totalInsert
  const [existingCount] = (await db.execute(sql`
    SELECT COUNT(*)::int AS n FROM customer_transactions
    WHERE customer_id = ${CUSTOMER_ID}
      AND recorded_at > '2026-01-01'::timestamptz
  `)) as any[];
  console.log(
    `\n${existingCount.n} existing later rows will be rewound +${totalInsert.toFixed(2)}`,
  );

  const newCustomerBalance = balanceBefore + totalInsert;
  console.log(
    `customer current_balance: ${balanceBefore.toFixed(2)} \u2192 ${newCustomerBalance.toFixed(2)}`,
  );

  if (!APPLY) {
    console.log("\nDry run. Re-run with --apply to write changes.");
    process.exit(0);
  }

  console.log("\nApplying in a single transaction...");
  await db.transaction(async (tx) => {
    // 1. Rewind every existing row by the full insert total
    const rewound = (await tx.execute(sql`
      UPDATE customer_transactions
      SET balance_after = balance_after + ${totalInsert}
      WHERE customer_id = ${CUSTOMER_ID}
        AND recorded_at > '2026-01-01'::timestamptz
      RETURNING id
    `)) as any[];
    console.log(`rewound ${rewound.length} later rows`);

    // 2. Insert the 10 new CHARGE rows
    for (const r of inserts) {
      await tx.execute(sql`
        INSERT INTO customer_transactions (
          org_id, customer_id, type, amount, balance_after,
          reference_number, recorded_by, recorded_at, billed
        ) VALUES (
          ${ORG_ID}, ${CUSTOMER_ID}, 'CHARGE', ${r.amount.toFixed(2)},
          ${r.balanceAfter.toFixed(2)}, ${r.ref}, ${admin.id},
          ${r.date}::timestamptz, false
        )
      `);
    }
    console.log(`inserted ${inserts.length} new CHARGE rows`);

    // 3. Bump customer balance
    await tx.execute(sql`
      UPDATE customers
      SET current_balance = ${newCustomerBalance.toFixed(2)}
      WHERE id = ${CUSTOMER_ID}
    `);
  });

  // Verify final state
  const [custAfter] = (await db.execute(sql`
    SELECT current_balance::text FROM customers WHERE id = ${CUSTOMER_ID}
  `)) as any[];
  console.log(`\ncustomer current_balance after: ${custAfter.current_balance}`);

  const chain = (await db.execute(sql`
    SELECT type, reference_number, amount::text, balance_after::text,
           recorded_at::text, billed
    FROM customer_transactions
    WHERE customer_id = ${CUSTOMER_ID}
    ORDER BY recorded_at ASC, id ASC
    LIMIT 12
  `)) as any[];
  console.log("First 12 transactions (should be 10 Dec 2025 + 2 early 2026):");
  console.table(chain);

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
