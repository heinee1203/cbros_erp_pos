/**
 * Insert 4 backdated CHARGE rows for Elecol Engineering (AR-0094)
 * covering Oct 6 – Dec 9, 2025. Customer had only 2 existing transactions
 * (both March 2026), so the new rows land before the entire existing
 * ledger and the 2 later rows get rewound by +28,805.
 *
 * Atomic single transaction. Dry-run by default.
 *
 * Run:
 *   Dry run:  npx tsx apps/api/scripts/insert-elecol-2025.ts
 *   Apply:    npx tsx apps/api/scripts/insert-elecol-2025.ts --apply
 */
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
dotenv.config({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../../../.env") });

import { db } from "@apex/database";
import { sql } from "drizzle-orm";

const APPLY = process.argv.includes("--apply");

const CUSTOMER_ID = "d85bae07-5e21-4b34-a7d6-bf6124e3b642"; // Elecol Engineering
const ORG_ID = "556e350a-7180-4ec9-9e1e-ea0ca1937f40";
const EXPECTED_AR = "AR-0094";
const EXPECTED_NAME_FRAGMENT = "elecol";
const LAST_INSERT_TS = "2025-12-09T16:00:00Z";

interface NewCharge {
  ref: string;
  date: string;
  amount: number;
}

const charges: NewCharge[] = [
  { ref: "Q2274", date: "2025-10-06T16:00:00Z", amount: 13100 },
  { ref: "Q2293", date: "2025-10-08T16:00:00Z", amount: 1195 },
  { ref: "Q2792", date: "2025-11-28T16:00:00Z", amount: 7200 },
  { ref: "Q2815", date: "2025-12-09T16:00:00Z", amount: 7310 },
];

async function main() {
  console.log(`=== Insert 4 Oct-Dec 2025 charges for Elecol Engineering (${APPLY ? "APPLY" : "DRY RUN"}) ===\n`);

  const totalInsert = charges.reduce((s, c) => s + c.amount, 0);

  // ── Guard 1: customer matches id + phone + name ──
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
      `ABORT: guard failed. Expected phone=${EXPECTED_AR}, name containing "${EXPECTED_NAME_FRAGMENT}", ` +
        `got phone="${cust.phone}", name="${cust.name}"`,
    );
    process.exit(1);
  }
  console.log(`target: ${cust.name}  (${cust.id})  phone=${cust.phone}`);
  const balanceBefore = parseFloat(cust.current_balance);
  console.log(`balance before: ${balanceBefore.toFixed(2)}\n`);

  // ── Guard 2: no duplicate refs ──
  const dup = (await db.execute(sql`
    SELECT reference_number, customer_id FROM customer_transactions
    WHERE reference_number IN ('Q2274','Q2293','Q2792','Q2815')
  `)) as any[];
  if (dup.length > 0) {
    console.error("ABORT: one or more reference numbers already exist:");
    console.table(dup);
    process.exit(1);
  }

  // ── Guard 3: no existing rows in the insert window ──
  const [interleave] = (await db.execute(sql`
    SELECT COUNT(*)::int AS n FROM customer_transactions
    WHERE customer_id = ${CUSTOMER_ID}
      AND recorded_at >= '2025-10-06'::timestamptz
      AND recorded_at <= '2025-12-10'::timestamptz
  `)) as any[];
  if (interleave.n > 0) {
    console.error(
      `ABORT: ${cust.name} has ${interleave.n} existing row(s) in the insert window. ` +
        "This script only handles the clean-slate case.",
    );
    process.exit(1);
  }

  // ── Guard 4: admin user ──
  const [admin] = (await db.execute(sql`
    SELECT id, email FROM users WHERE email = 'admin@apex.com' LIMIT 1
  `)) as any[];
  if (!admin) {
    console.error("ABORT: admin@apex.com user not found");
    process.exit(1);
  }
  console.log(`admin user: ${admin.email}  (${admin.id})\n`);

  // ── Build running balance chain (opening = 0 since no predecessors) ──
  const [openRow] = (await db.execute(sql`
    SELECT balance_after::text FROM customer_transactions
    WHERE customer_id = ${CUSTOMER_ID}
      AND recorded_at < ${charges[0].date}::timestamptz
    ORDER BY recorded_at DESC, id DESC
    LIMIT 1
  `)) as any[];
  const opening = openRow ? parseFloat(openRow.balance_after) : 0;
  console.log(`opening balance: ${opening.toFixed(2)}`);

  let running = opening;
  const planned = charges.map((c) => {
    running += c.amount;
    return { ...c, balanceAfter: running };
  });

  console.log("\nInserts:");
  console.table(
    planned.map((r) => ({
      ref: r.ref,
      date: r.date,
      amount: r.amount.toFixed(2),
      balance_after: r.balanceAfter.toFixed(2),
    })),
  );
  console.log(`\nTotal insert: ${totalInsert.toFixed(2)}`);

  // ── Later rows to rewind ──
  const later = (await db.execute(sql`
    SELECT id, type, reference_number, balance_after::text AS old_ba, recorded_at::text
    FROM customer_transactions
    WHERE customer_id = ${CUSTOMER_ID}
      AND recorded_at > ${LAST_INSERT_TS}::timestamptz
    ORDER BY recorded_at ASC, id ASC
  `)) as any[];
  console.log(`\n${later.length} later rows will be rewound (+${totalInsert.toFixed(2)}):`);
  console.table(
    later.map((r: any) => ({
      ref: r.reference_number ?? `(${r.type})`,
      type: r.type,
      old_ba: r.old_ba,
      new_ba: (parseFloat(r.old_ba) + totalInsert).toFixed(2),
      recorded_at: r.recorded_at,
    })),
  );

  const newCustomerBalance = balanceBefore + totalInsert;
  console.log(
    `\ncustomer current_balance: ${balanceBefore.toFixed(2)} \u2192 ${newCustomerBalance.toFixed(2)}`,
  );

  if (!APPLY) {
    console.log("\nDry run. Re-run with --apply to write changes.");
    process.exit(0);
  }

  // ── Apply ──
  console.log("\nApplying in a single transaction...");
  const result = await db.transaction(async (tx) => {
    // 1. Rewind later rows
    const rewound = (await tx.execute(sql`
      UPDATE customer_transactions
      SET balance_after = balance_after + ${totalInsert}
      WHERE customer_id = ${CUSTOMER_ID}
        AND recorded_at > ${LAST_INSERT_TS}::timestamptz
      RETURNING id
    `)) as any[];

    // 2. Insert 4 new CHARGE rows
    for (const r of planned) {
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

    // 3. Bump customer current_balance
    await tx.execute(sql`
      UPDATE customers SET current_balance = ${newCustomerBalance.toFixed(2)}
      WHERE id = ${CUSTOMER_ID}
    `);

    // 4. Reconciliation: tail balance_after must equal customer.current_balance
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

  const finalChain = (await db.execute(sql`
    SELECT type, reference_number, amount::text, balance_after::text,
           recorded_at::text, billed
    FROM customer_transactions
    WHERE customer_id = ${CUSTOMER_ID}
    ORDER BY recorded_at ASC, id ASC
  `)) as any[];
  console.log("\nFinal Elecol ledger:");
  console.table(finalChain);

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
