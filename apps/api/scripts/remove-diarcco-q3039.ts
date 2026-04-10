/**
 * Remove Q3039 from Diarcco CORP and recalculate.
 * Run: npx tsx apps/api/scripts/remove-diarcco-q3039.ts
 */
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, "../../../.env") });

import { db } from "@apex/database";
import { customers, customerTransactions } from "@apex/database/schema";
import { eq, asc, sql } from "drizzle-orm";

const CUSTOMER_ID = "f9dde83a-4a75-4b1d-92f2-da6a92035c04";

async function main() {
  console.log("=== Remove Q3039 from Diarcco CORP ===\n");

  const [txn] = await db.execute(sql`SELECT id, amount FROM customer_transactions WHERE customer_id = ${CUSTOMER_ID} AND reference_number = 'Q3039' LIMIT 1`) as any[];
  if (!txn) { console.log("Q3039 not found. Nothing to do."); process.exit(0); }

  await db.execute(sql`DELETE FROM customer_transactions WHERE id = ${txn.id}`);
  console.log(`Deleted Q3039 (₱${txn.amount})`);

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

  console.log(`Recalculated ${allTxns.length} txns — balance: ₱${running.toFixed(2)}`);
  process.exit(0);
}
main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
