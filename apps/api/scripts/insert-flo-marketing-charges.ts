/**
 * Insert 10 backdated CHARGE rows for Flo Marketing.
 *
 * Customer: Flo Marketing (AR-0073)
 * Existing: 1 transaction (Q3603 on 2026-02-23, ₱5,300)
 * New rows: 10 charges dated November 2024 – October 2025 (₱60,910 total)
 * All new rows land before the existing ledger → the single existing
 * row gets its balance_after bumped by the insert total.
 *
 * Run:
 *   Dry run:  npx tsx apps/api/scripts/insert-flo-marketing-charges.ts
 *   Apply:    npx tsx apps/api/scripts/insert-flo-marketing-charges.ts --apply
 */
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
dotenv.config({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../../../.env") });

import { db } from "@apex/database";
import { sql } from "drizzle-orm";

const APPLY = process.argv.includes("--apply");

const CUSTOMER_ID = "40740122-1d61-4fa8-af67-d680be0d2f19"; // Flo Marketing
const ORG_ID = "556e350a-7180-4ec9-9e1e-ea0ca1937f40";

interface NewCharge {
  ref: string;
  date: string;
  amount: number;
}

// Sorted chronologically. Same-day entries use 16:00:00 / 16:00:01 for ordering.
const charges: NewCharge[] = [
  { ref: "NQ41153", date: "2024-11-12T16:00:00Z", amount: 1800 },
  { ref: "NQ41140", date: "2024-11-19T16:00:00Z", amount: 7400 },
  { ref: "NQ41143", date: "2024-11-21T16:00:00Z", amount: 8400 },
  { ref: "NQ39726", date: "2024-11-23T16:00:00Z", amount: 1910 },
  { ref: "NQ39707", date: "2024-11-27T16:00:00Z", amount: 3000 },
  { ref: "NQ44050", date: "2024-12-09T16:00:00Z", amount: 1350 },
  { ref: "NQ44323", date: "2024-12-27T16:00:00Z", amount: 4100 },
  { ref: "NQ43840", date: "2025-01-09T16:00:00Z", amount: 7500 },
  { ref: "Q1684",   date: "2025-08-06T16:00:00Z", amount: 3800 },
  { ref: "Q2423",   date: "2025-10-27T16:00:00Z", amount: 21650 },
];

async function main() {
  console.log(`=== Insert 10 charges for Flo Marketing (${APPLY ? "APPLY" : "DRY RUN"}) ===\n`);

  const totalInsert = charges.reduce((s, c) => s + c.amount, 0);
  console.log(`Total being added: ₱${totalInsert.toFixed(2)}`);

  // Guard 1: no duplicate refs
  const refList = charges.map((c) => `'${c.ref}'`).join(",");
  const dup = (await db.execute(
    sql.raw(`SELECT reference_number, customer_id FROM customer_transactions WHERE reference_number IN (${refList})`),
  )) as any[];
  if (dup.length > 0) {
    console.error("ABORT: one or more reference numbers already exist:");
    console.table(dup);
    process.exit(1);
  }
  console.log("No duplicate refs found ✓");

  // Guard 2: verify no existing transactions before 2026-01-01
  const [pre] = (await db.execute(sql`
    SELECT COUNT(*)::int AS n FROM customer_transactions
    WHERE customer_id = ${CUSTOMER_ID}
      AND recorded_at <= '2026-01-01'::timestamptz
  `)) as any[];
  if (pre.n > 0) {
    console.error(
      `ABORT: Flo Marketing has ${pre.n} transaction(s) on or before 2026-01-01. ` +
        "This script only handles the clean-slate case.",
    );
    process.exit(1);
  }
  console.log("No pre-2026 transactions ✓");

  // Admin user
  const [admin] = (await db.execute(sql`
    SELECT id, email FROM users WHERE email = 'admin@apex.com' LIMIT 1
  `)) as any[];
  if (!admin) {
    console.error("ABORT: admin@apex.com not found");
    process.exit(1);
  }
  console.log(`Admin: ${admin.email} (${admin.id})`);

  // Current balance
  const [custBefore] = (await db.execute(sql`
    SELECT current_balance::text FROM customers WHERE id = ${CUSTOMER_ID}
  `)) as any[];
  const balanceBefore = parseFloat(custBefore.current_balance);
  console.log(`Current balance: ₱${balanceBefore.toFixed(2)}\n`);

  // Build running balance (starts at 0 since no predecessor before cutoff)
  let running = 0;
  const inserts = charges.map((c) => {
    running += c.amount;
    return { ...c, balanceAfter: running };
  });

  console.log("Inserts (chronological order):");
  console.table(
    inserts.map((r) => ({
      ref: r.ref,
      date: r.date.slice(0, 10),
      amount: `₱${r.amount.toFixed(2)}`,
      balance_after: `₱${r.balanceAfter.toFixed(2)}`,
    })),
  );

  // Existing rows count
  const [existingCount] = (await db.execute(sql`
    SELECT COUNT(*)::int AS n FROM customer_transactions
    WHERE customer_id = ${CUSTOMER_ID}
      AND recorded_at > '2026-01-01'::timestamptz
  `)) as any[];
  console.log(`\n${existingCount.n} existing later row(s) will be rewound +₱${totalInsert.toFixed(2)}`);

  const newBalance = balanceBefore + totalInsert;
  console.log(`Customer balance: ₱${balanceBefore.toFixed(2)} → ₱${newBalance.toFixed(2)}`);

  if (!APPLY) {
    console.log("\nDry run. Re-run with --apply to write changes.");
    process.exit(0);
  }

  console.log("\nApplying in a single transaction...");
  await db.transaction(async (tx) => {
    // 1. Rewind existing later rows
    const rewound = (await tx.execute(sql`
      UPDATE customer_transactions
      SET balance_after = balance_after + ${totalInsert}
      WHERE customer_id = ${CUSTOMER_ID}
        AND recorded_at > '2026-01-01'::timestamptz
      RETURNING id
    `)) as any[];
    console.log(`Rewound ${rewound.length} later row(s)`);

    // 2. Insert new CHARGE rows
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
    console.log(`Inserted ${inserts.length} new CHARGE rows`);

    // 3. Update customer balance
    await tx.execute(sql`
      UPDATE customers
      SET current_balance = ${newBalance.toFixed(2)}
      WHERE id = ${CUSTOMER_ID}
    `);
  });

  // Verify
  const [custAfter] = (await db.execute(sql`
    SELECT current_balance::text FROM customers WHERE id = ${CUSTOMER_ID}
  `)) as any[];
  console.log(`\nFinal balance: ₱${custAfter.current_balance}`);

  const chain = (await db.execute(sql`
    SELECT type, reference_number, amount::text, balance_after::text,
           recorded_at::text
    FROM customer_transactions
    WHERE customer_id = ${CUSTOMER_ID}
    ORDER BY recorded_at ASC, id ASC
  `)) as any[];
  console.log("\nFull ledger:");
  console.table(chain);

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
