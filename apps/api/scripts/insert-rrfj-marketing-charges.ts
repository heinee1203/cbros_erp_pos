/**
 * Insert 9 backdated CHARGE rows for RRFJ Marketing (AR-0010).
 *
 * Existing: 9 transactions from 2026-01-02 onward, balance ₱15,810.
 * New: 9 charges dated October–December 2025 (₱39,295 total).
 * All new rows predate existing ledger → existing rows get rewound.
 *
 * Run:
 *   Dry run:  npx tsx apps/api/scripts/insert-rrfj-marketing-charges.ts
 *   Apply:    npx tsx apps/api/scripts/insert-rrfj-marketing-charges.ts --apply
 */
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
dotenv.config({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../../../.env") });

import { db } from "@apex/database";
import { sql } from "drizzle-orm";

const APPLY = process.argv.includes("--apply");
const CUSTOMER_ID = "8aaa1357-ac0d-4343-96f5-f76a213a06dc";
const ORG_ID = "556e350a-7180-4ec9-9e1e-ea0ca1937f40";

const charges = [
  { ref: "Q1393", date: "2025-10-02T16:00:00Z", amount: 2540 },
  { ref: "Q2279", date: "2025-10-07T16:00:00Z", amount: 2970 },
  { ref: "Q2202", date: "2025-10-14T16:00:00Z", amount: 3800 },
  { ref: "Q2362", date: "2025-10-17T16:00:00Z", amount: 5090 },
  { ref: "Q2379", date: "2025-10-20T16:00:00Z", amount: 2350 },
  { ref: "Q2702", date: "2025-11-18T16:00:00Z", amount: 4430 },
  { ref: "Q2772", date: "2025-11-24T16:00:00Z", amount: 4320 },
  { ref: "Q2808", date: "2025-12-08T16:00:00Z", amount: 11740 },
  { ref: "Q2930", date: "2025-12-17T16:00:00Z", amount: 2055 },
];

async function main() {
  console.log(`=== Insert 9 charges for RRFJ Marketing (${APPLY ? "APPLY" : "DRY RUN"}) ===\n`);
  const totalInsert = charges.reduce((s, c) => s + c.amount, 0);
  console.log(`Total: ₱${totalInsert.toFixed(2)}`);

  const refList = charges.map(c => `'${c.ref}'`).join(",");
  const dup = (await db.execute(sql.raw(`SELECT reference_number FROM customer_transactions WHERE reference_number IN (${refList})`))) as any[];
  if (dup.length > 0) { console.error("ABORT: duplicate refs"); process.exit(1); }

  const [pre] = (await db.execute(sql`SELECT COUNT(*)::int AS n FROM customer_transactions WHERE customer_id = ${CUSTOMER_ID} AND recorded_at <= '2026-01-01'::timestamptz`)) as any[];
  if (pre.n > 0) { console.error(`ABORT: ${pre.n} pre-2026 transactions exist`); process.exit(1); }

  const [admin] = (await db.execute(sql`SELECT id FROM users WHERE email = 'admin@apex.com' LIMIT 1`)) as any[];
  if (!admin) { console.error("ABORT: admin not found"); process.exit(1); }

  const [cust] = (await db.execute(sql`SELECT current_balance::text FROM customers WHERE id = ${CUSTOMER_ID}`)) as any[];
  const balBefore = parseFloat(cust.current_balance);
  console.log(`Balance before: ₱${balBefore.toFixed(2)}`);

  let running = 0;
  const inserts = charges.map(c => { running += c.amount; return { ...c, balanceAfter: running }; });
  console.table(inserts.map(r => ({ ref: r.ref, date: r.date.slice(0, 10), amount: r.amount, bal: r.balanceAfter })));

  const [ec] = (await db.execute(sql`SELECT COUNT(*)::int AS n FROM customer_transactions WHERE customer_id = ${CUSTOMER_ID} AND recorded_at > '2026-01-01'::timestamptz`)) as any[];
  console.log(`${ec.n} later rows will be rewound +₱${totalInsert}`);
  console.log(`Balance: ₱${balBefore} → ₱${(balBefore + totalInsert).toFixed(2)}`);

  if (!APPLY) { console.log("\nDry run."); process.exit(0); }

  await db.transaction(async (tx) => {
    await tx.execute(sql`UPDATE customer_transactions SET balance_after = balance_after + ${totalInsert} WHERE customer_id = ${CUSTOMER_ID} AND recorded_at > '2026-01-01'::timestamptz`);
    for (const r of inserts) {
      await tx.execute(sql`INSERT INTO customer_transactions (org_id, customer_id, type, amount, balance_after, reference_number, recorded_by, recorded_at, billed) VALUES (${ORG_ID}, ${CUSTOMER_ID}, 'CHARGE', ${r.amount.toFixed(2)}, ${r.balanceAfter.toFixed(2)}, ${r.ref}, ${admin.id}, ${r.date}::timestamptz, false)`);
    }
    await tx.execute(sql`UPDATE customers SET current_balance = ${(balBefore + totalInsert).toFixed(2)} WHERE id = ${CUSTOMER_ID}`);
  });

  const [after] = (await db.execute(sql`SELECT current_balance::text FROM customers WHERE id = ${CUSTOMER_ID}`)) as any[];
  console.log(`\nFinal balance: ₱${after.current_balance}`);
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
