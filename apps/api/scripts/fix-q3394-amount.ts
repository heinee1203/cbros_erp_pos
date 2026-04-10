/**
 * Fix Q3394 amount for Five Starex Commercial.
 * Run: npx tsx apps/api/scripts/fix-q3394-amount.ts
 */
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, "../../../.env") });

import { db } from "@apex/database";
import { customers, customerTransactions } from "@apex/database/schema";
import { eq, and, sql, asc } from "drizzle-orm";

const ORG_ID = "556e350a-7180-4ec9-9e1e-ea0ca1937f40";

async function main() {
  console.log("=== Fix Q3394 for Five Starex Commercial ===\n");

  const [cust] = await db.select({ id: customers.id, name: customers.name })
    .from(customers).where(and(eq(customers.orgId, ORG_ID), sql`UPPER(${customers.name}) = 'FIVE STAREX COMMERCIAL'`));
  if (!cust) { console.error("Not found"); process.exit(1); }

  const [txn] = await db.execute(sql`SELECT id, amount FROM customer_transactions WHERE customer_id = ${cust.id} AND reference_number = 'Q3394'`) as any[];
  if (!txn) { console.log("Q3394 not found"); process.exit(0); }
  if (parseFloat(txn.amount) === 5200) { console.log("Already 5200.00"); process.exit(0); }

  await db.execute(sql`UPDATE customer_transactions SET amount = '5200.00' WHERE id = ${txn.id}`);
  console.log(`Q3394: ${txn.amount} → 5200.00`);

  const txns = await db.select({ id: customerTransactions.id, amount: customerTransactions.amount, type: customerTransactions.type })
    .from(customerTransactions)
    .where(and(eq(customerTransactions.customerId, cust.id), eq(customerTransactions.orgId, ORG_ID)))
    .orderBy(asc(customerTransactions.recordedAt), asc(customerTransactions.id));

  let bal = 0, tot = 0;
  for (const t of txns) {
    const a = parseFloat(t.amount);
    if (t.type === "CHARGE" || (t.type === "ADJUSTMENT" && a > 0)) { bal += a; tot += a; } else bal -= Math.abs(a);
    await db.update(customerTransactions).set({ balanceAfter: bal.toFixed(2) }).where(eq(customerTransactions.id, t.id));
  }
  await db.update(customers).set({ currentBalance: bal.toFixed(2), totalPurchases: tot.toFixed(2) }).where(eq(customers.id, cust.id));
  console.log(`Balance: \u20B1${bal.toLocaleString("en-PH", { minimumFractionDigits: 2 })}, Total: \u20B1${tot.toLocaleString("en-PH", { minimumFractionDigits: 2 })}`);
  process.exit(0);
}
main().catch((err) => { console.error("Fatal:", err); process.exit(1); });
