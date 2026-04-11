/**
 * Insert 13 backdated CHARGE rows + 1 CREDIT_NOTE (CM-3027) for
 * Princeton Marketing (AR-0039) covering Aug 15 – Dec 30, 2025.
 *
 * CM-3027 is a ₱2,500 credit applied against Q3004 — stored with
 * notes="Credit against Q3004" for traceability. Its position on
 * Dec 26 is AFTER Q3004 (Dec 20) and BEFORE Q3037 (Dec 30).
 *
 * Princeton's existing ledger starts 2026-01-12, so all 14 new rows
 * land before the entire existing timeline. The 17 existing rows are
 * rewound by the net insert total (+13,985), and current_balance is
 * bumped 17,935 → 31,920.
 *
 * Same-day ordering: Dec 13 has two entries (Q2849 at 16:00:00,
 * Q2850 at 16:00:01) preserving the listed order.
 *
 * Atomic single transaction. Dry-run by default.
 *
 * Run:
 *   Dry run:  npx tsx apps/api/scripts/insert-princeton-2025.ts
 *   Apply:    npx tsx apps/api/scripts/insert-princeton-2025.ts --apply
 */
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
dotenv.config({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../../../.env") });

import { db } from "@apex/database";
import { sql } from "drizzle-orm";

const APPLY = process.argv.includes("--apply");

const CUSTOMER_ID = "c468f3bd-25ab-4b76-825e-eeebe4296da8"; // Princeton Marketing
const ORG_ID = "556e350a-7180-4ec9-9e1e-ea0ca1937f40";
const EXPECTED_AR = "AR-0039";
const EXPECTED_NAME_FRAGMENT = "princeton";

// Day boundary for "anything strictly after the last insert must be rewound"
const LAST_INSERT_TS = "2025-12-30T16:00:00Z";

interface NewTxn {
  ref: string;
  date: string;
  type: "CHARGE" | "CREDIT_NOTE";
  amount: number;
  notes?: string;
}

// Ordered chronologically. Same-day rows use :00 and :01 to preserve listed order.
const txns: NewTxn[] = [
  { ref: "Q1756",   date: "2025-08-15T16:00:00Z", type: "CHARGE",      amount: 300 },
  { ref: "Q1774",   date: "2025-08-18T16:00:00Z", type: "CHARGE",      amount: 450 },
  { ref: "Q2534",   date: "2025-12-05T16:00:00Z", type: "CHARGE",      amount: 2800 },
  { ref: "Q2806",   date: "2025-12-08T16:00:00Z", type: "CHARGE",      amount: 180 },
  { ref: "Q2046",   date: "2025-12-09T16:00:00Z", type: "CHARGE",      amount: 2215 },
  { ref: "Q2822",   date: "2025-12-10T16:00:00Z", type: "CHARGE",      amount: 440 },
  { ref: "Q2849",   date: "2025-12-13T16:00:00Z", type: "CHARGE",      amount: 200 },
  { ref: "Q2850",   date: "2025-12-13T16:00:01Z", type: "CHARGE",      amount: 250 },
  { ref: "Q2922",   date: "2025-12-17T16:00:00Z", type: "CHARGE",      amount: 900 },
  { ref: "Q2937",   date: "2025-12-18T16:00:00Z", type: "CHARGE",      amount: 1650 },
  { ref: "Q3004",   date: "2025-12-20T16:00:00Z", type: "CHARGE",      amount: 2750 },
  { ref: "Q3009",   date: "2025-12-22T16:00:00Z", type: "CHARGE",      amount: 550 },
  { ref: "CM-3027", date: "2025-12-26T16:00:00Z", type: "CREDIT_NOTE", amount: 2500, notes: "Credit against Q3004" },
  { ref: "Q3037",   date: "2025-12-30T16:00:00Z", type: "CHARGE",      amount: 3800 },
];

async function main() {
  console.log(`=== Insert 14 backdated txns for Princeton Marketing (${APPLY ? "APPLY" : "DRY RUN"}) ===\n`);

  // ── Guard 1: customer matches ──
  const [cust] = (await db.execute(sql`
    SELECT id, name, phone, current_balance::text
    FROM customers WHERE id = ${CUSTOMER_ID}
  `)) as any[];
  if (!cust) {
    console.error(`ABORT: customer id ${CUSTOMER_ID} not found`);
    process.exit(1);
  }
  if (cust.phone !== EXPECTED_AR || !cust.name.toLowerCase().includes(EXPECTED_NAME_FRAGMENT)) {
    console.error(
      `ABORT: guard failed. Expected phone=${EXPECTED_AR} + name containing "${EXPECTED_NAME_FRAGMENT}", ` +
        `got phone="${cust.phone}", name="${cust.name}"`,
    );
    process.exit(1);
  }
  console.log(`target: ${cust.name}  (${cust.id})  phone=${cust.phone}`);
  const balanceBefore = parseFloat(cust.current_balance);
  console.log(`balance before: ${balanceBefore.toFixed(2)}\n`);

  // ── Guard 2: no duplicate reference_number for any of the 14 refs ──
  const dup = (await db.execute(sql`
    SELECT reference_number, customer_id
    FROM customer_transactions
    WHERE reference_number IN (
      'Q1756','Q1774','Q2046','Q2534','Q2806','Q2822','Q2849','Q2850',
      'Q2922','Q2937','Q3004','Q3009','Q3037','CM-3027'
    )
  `)) as any[];
  if (dup.length > 0) {
    console.error("ABORT: one or more reference numbers already exist:");
    console.table(dup);
    process.exit(1);
  }

  // ── Guard 3: no existing Princeton rows in the insert window ──
  const [interleave] = (await db.execute(sql`
    SELECT COUNT(*)::int AS n FROM customer_transactions
    WHERE customer_id = ${CUSTOMER_ID}
      AND recorded_at >= '2025-08-15'::timestamptz
      AND recorded_at <= '2025-12-31'::timestamptz
  `)) as any[];
  if (interleave.n > 0) {
    console.error(
      `ABORT: Princeton has ${interleave.n} existing row(s) in the insert window ` +
        "(2025-08-15..2025-12-31). This script only handles the clean-slate case.",
    );
    process.exit(1);
  }

  // ── Guard 4: resolve admin user ──
  const [admin] = (await db.execute(sql`
    SELECT id, email FROM users WHERE email = 'admin@apex.com' LIMIT 1
  `)) as any[];
  if (!admin) {
    console.error("ABORT: admin@apex.com user not found");
    process.exit(1);
  }
  console.log(`admin user: ${admin.email}  (${admin.id})\n`);

  // ── Build the running balance chain ──
  // Opening = balance_after of the last txn strictly BEFORE the first insert time.
  const [openRow] = (await db.execute(sql`
    SELECT balance_after::text FROM customer_transactions
    WHERE customer_id = ${CUSTOMER_ID}
      AND recorded_at < ${txns[0].date}::timestamptz
    ORDER BY recorded_at DESC, id DESC
    LIMIT 1
  `)) as any[];
  const opening = openRow ? parseFloat(openRow.balance_after) : 0;
  console.log(`opening balance (from predecessor): ${opening.toFixed(2)}`);

  let running = opening;
  const planned = txns.map((t) => {
    const delta = t.type === "CHARGE" ? t.amount : -t.amount;
    running += delta;
    return { ...t, balanceAfter: running };
  });
  const finalRunning = running;
  const netDelta = finalRunning - opening;
  const totalCharges = txns.filter((t) => t.type === "CHARGE").reduce((s, t) => s + t.amount, 0);
  const totalCredits = txns.filter((t) => t.type === "CREDIT_NOTE").reduce((s, t) => s + t.amount, 0);

  console.log(`\nInserts (${planned.length}):`);
  console.table(
    planned.map((r) => ({
      ref: r.ref,
      type: r.type,
      date: r.date,
      delta: (r.type === "CHARGE" ? `+${r.amount.toFixed(2)}` : `-${r.amount.toFixed(2)}`),
      balance_after: r.balanceAfter.toFixed(2),
    })),
  );

  console.log(`\nTotal charges: ${totalCharges.toFixed(2)}`);
  console.log(`Total credits: ${totalCredits.toFixed(2)}`);
  console.log(`Net delta:     ${netDelta.toFixed(2)}`);

  // ── Later rows to rewind (strictly after LAST_INSERT_TS) ──
  const later = (await db.execute(sql`
    SELECT id, type, reference_number, balance_after::text AS old_ba, recorded_at::text
    FROM customer_transactions
    WHERE customer_id = ${CUSTOMER_ID}
      AND recorded_at > ${LAST_INSERT_TS}::timestamptz
    ORDER BY recorded_at ASC, id ASC
  `)) as any[];
  console.log(`\n${later.length} later rows will be rewound (+${netDelta.toFixed(2)}):`);
  console.table(
    later.slice(0, 20).map((r: any) => ({
      ref: r.reference_number ?? `(${r.type})`,
      type: r.type,
      old_ba: r.old_ba,
      new_ba: (parseFloat(r.old_ba) + netDelta).toFixed(2),
      recorded_at: r.recorded_at,
    })),
  );
  if (later.length > 20) console.log(`  ... and ${later.length - 20} more`);

  const newCustomerBalance = balanceBefore + netDelta;
  console.log(`\ncustomer current_balance: ${balanceBefore.toFixed(2)} \u2192 ${newCustomerBalance.toFixed(2)}`);

  if (!APPLY) {
    console.log("\nDry run. Re-run with --apply to write changes.");
    process.exit(0);
  }

  // ── Apply ──
  console.log("\nApplying in a single transaction...");
  const result = await db.transaction(async (tx) => {
    // 1. Rewind every later row by netDelta
    const rewound = (await tx.execute(sql`
      UPDATE customer_transactions
      SET balance_after = balance_after + ${netDelta}
      WHERE customer_id = ${CUSTOMER_ID}
        AND recorded_at > ${LAST_INSERT_TS}::timestamptz
      RETURNING id
    `)) as any[];

    // 2. Insert the 14 new rows in chronological order
    for (const r of planned) {
      await tx.execute(sql`
        INSERT INTO customer_transactions (
          org_id, customer_id, type, amount, balance_after,
          reference_number, notes, recorded_by, recorded_at, billed
        ) VALUES (
          ${ORG_ID}, ${CUSTOMER_ID}, ${r.type}, ${r.amount.toFixed(2)},
          ${r.balanceAfter.toFixed(2)}, ${r.ref}, ${r.notes ?? null},
          ${admin.id}, ${r.date}::timestamptz, false
        )
      `);
    }

    // 3. Bump customer current_balance
    await tx.execute(sql`
      UPDATE customers SET current_balance = ${newCustomerBalance.toFixed(2)}
      WHERE id = ${CUSTOMER_ID}
    `);

    // 4. Reconciliation check: last balance_after must equal customer.current_balance
    const [tail] = (await tx.execute(sql`
      SELECT COALESCE(balance_after, 0)::text AS bal
      FROM customer_transactions
      WHERE customer_id = ${CUSTOMER_ID}
      ORDER BY recorded_at DESC, id DESC
      LIMIT 1
    `)) as any[];
    const tailBalance = parseFloat(tail.bal);
    if (Math.abs(tailBalance - newCustomerBalance) > 0.005) {
      throw new Error(
        `Balance reconciliation failed: tail balance_after=${tailBalance} vs ` +
          `customer.current_balance=${newCustomerBalance}`,
      );
    }

    return {
      insertedRows: planned.length,
      rewoundRows: rewound.length,
      newBalance: newCustomerBalance,
    };
  });

  console.log("APPLIED:");
  console.table([result]);

  // ── Verification ──
  const [custAfter] = (await db.execute(sql`
    SELECT current_balance::text FROM customers WHERE id = ${CUSTOMER_ID}
  `)) as any[];
  console.log(`\ncustomer current_balance after: ${custAfter.current_balance}`);

  // Show the inserted Aug/Dec window
  const inserted = (await db.execute(sql`
    SELECT type, reference_number, amount::text, balance_after::text,
           recorded_at::text, notes
    FROM customer_transactions
    WHERE customer_id = ${CUSTOMER_ID}
      AND recorded_at >= '2025-08-15'::timestamptz
      AND recorded_at <= '2025-12-31'::timestamptz
    ORDER BY recorded_at ASC, id ASC
  `)) as any[];
  console.log("\nInserted rows (Aug 15 – Dec 30, 2025):");
  console.table(inserted);

  // First 3 rewound rows — sanity check
  const firstRewound = (await db.execute(sql`
    SELECT type, reference_number, balance_after::text, recorded_at::text
    FROM customer_transactions
    WHERE customer_id = ${CUSTOMER_ID}
      AND recorded_at > ${LAST_INSERT_TS}::timestamptz
    ORDER BY recorded_at ASC, id ASC
    LIMIT 3
  `)) as any[];
  console.log("\nFirst 3 rewound rows (sanity — should start at 13,985 + first_old_ba):");
  console.table(firstRewound);

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
