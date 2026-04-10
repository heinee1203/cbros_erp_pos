/**
 * Add Q2044 and Q2549 for Dy, Alain Dave.
 * Run: npx tsx apps/api/scripts/add-dy-alain-dave-2.ts
 */
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, "../../../.env") });

import { db } from "@apex/database";
import { customers, customerTransactions } from "@apex/database/schema";
import { eq, and, sql, asc, ilike } from "drizzle-orm";

const ORG_ID = "556e350a-7180-4ec9-9e1e-ea0ca1937f40";
const CUSTOMER_ID = "9375f542-6de9-45fd-88ec-519e3787e847";

const NEW_ENTRIES = [
  { date: "2025-12-05T00:00:00Z", ref: "Q2044", amount: "4000.00" },
  { date: "2025-12-08T00:00:00Z", ref: "Q2549", amount: "342.80" },
];

async function main() {
  console.log("=== Add Dy, Alain Dave Q2044 + Q2549 ===\n");

  const existing = await db.execute(
    sql`SELECT reference_number FROM customer_transactions WHERE customer_id = ${CUSTOMER_ID} AND reference_number IN ('Q2044','Q2549')`
  ) as any[];
  const existingRefs = new Set(existing.map((r: any) => r.reference_number));

  let inserted = 0;
  for (const entry of NEW_ENTRIES) {
    if (existingRefs.has(entry.ref)) { console.log(`  SKIP ${entry.ref}`); continue; }
    await db.insert(customerTransactions).values({
      orgId: ORG_ID, customerId: CUSTOMER_ID, type: "CHARGE", amount: entry.amount,
      balanceAfter: "0", referenceType: "credit_sale", referenceNumber: entry.ref,
      notes: "Credit Sale", recordedAt: new Date(entry.date),
    });
    console.log(`  ADD ${entry.ref}  ${entry.date.slice(0, 10)}  ₱${parseFloat(entry.amount).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`);
    inserted++;
  }

  if (inserted === 0) { console.log("\nNothing to insert."); process.exit(0); }

  const allTxns = await db.select({ id: customerTransactions.id, amount: customerTransactions.amount, type: customerTransactions.type })
    .from(customerTransactions).where(eq(customerTransactions.customerId, CUSTOMER_ID))
    .orderBy(asc(customerTransactions.recordedAt), asc(customerTransactions.id));

  let running = 0;
  for (const t of allTxns) {
    const amt = parseFloat(t.amount);
    if (t.type === "CHARGE" || (t.type === "ADJUSTMENT" && amt > 0)) running += amt;
    else running -= Math.abs(amt);
    await db.update(customerTransactions).set({ balanceAfter: running.toFixed(2) }).where(eq(customerTransactions.id, t.id));
  }

  const [totals] = await db.execute(sql`SELECT COALESCE(SUM(amount::numeric),0) AS total FROM customer_transactions WHERE customer_id = ${CUSTOMER_ID} AND type = 'CHARGE'`) as any[];
  await db.update(customers).set({ currentBalance: running.toFixed(2), totalPurchases: parseFloat(totals.total).toFixed(2) }).where(eq(customers.id, CUSTOMER_ID));

  console.log(`\nRecalculated ${allTxns.length} txns — balance: ₱${running.toFixed(2)}, totalPurchases: ₱${parseFloat(totals.total).toFixed(2)}`);
  process.exit(0);
}
main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
