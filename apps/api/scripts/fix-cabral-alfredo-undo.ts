/**
 * Undo wrong Q0370/Q0378 inserts on Cabral, Alfredo Jr and recalc.
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

const WRONG_CUSTOMER_ID = "21604e6f-1275-4187-86fe-571044f2774d";

async function main() {
  console.log("=== Undo wrong Q0370/Q0378 on Cabral, Alfredo Jr ===\n");

  await db.execute(sql`DELETE FROM customer_transactions WHERE customer_id = ${WRONG_CUSTOMER_ID} AND reference_number IN ('Q0370','Q0378')`);
  console.log("Deleted Q0370 and Q0378");

  const allTxns = await db.select({ id: customerTransactions.id, amount: customerTransactions.amount, type: customerTransactions.type })
    .from(customerTransactions).where(eq(customerTransactions.customerId, WRONG_CUSTOMER_ID))
    .orderBy(asc(customerTransactions.recordedAt), asc(customerTransactions.id));

  let running = 0;
  for (const t of allTxns) {
    const amt = parseFloat(t.amount);
    if (t.type === "CHARGE" || (t.type === "ADJUSTMENT" && amt > 0)) running += amt;
    else running -= Math.abs(amt);
    await db.update(customerTransactions).set({ balanceAfter: running.toFixed(2) }).where(eq(customerTransactions.id, t.id));
  }

  const [totals] = await db.execute(sql`SELECT COALESCE(SUM(amount::numeric),0) AS total FROM customer_transactions WHERE customer_id = ${WRONG_CUSTOMER_ID} AND type = 'CHARGE'`) as any[];
  await db.update(customers).set({ currentBalance: running.toFixed(2), totalPurchases: parseFloat(totals.total).toFixed(2) }).where(eq(customers.id, WRONG_CUSTOMER_ID));

  console.log(`Recalculated ${allTxns.length} txns — balance: ₱${running.toFixed(2)}`);
  process.exit(0);
}
main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
