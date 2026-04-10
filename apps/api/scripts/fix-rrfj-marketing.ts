/**
 * Fix RRFJ Marketing: rename + correct Q3655 amount.
 * Run: npx tsx apps/api/scripts/fix-rrfj-marketing.ts
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
  console.log("=== Fix RRFJ Marketing ===\n");

  const [cust] = await db.select({ id: customers.id, name: customers.name })
    .from(customers).where(and(eq(customers.orgId, ORG_ID), sql`UPPER(${customers.name}) = 'RRFJ MARKETING'`));

  if (!cust) { console.error("RRFJ Marketing not found"); process.exit(1); }

  // 1. Rename
  if (cust.name !== "RRFJ Marketing") {
    await db.update(customers).set({ name: "RRFJ Marketing" }).where(eq(customers.id, cust.id));
    console.log(`Renamed: ${cust.name} → RRFJ Marketing`);
  } else {
    console.log("Name already correct");
  }

  // 2. Fix Q3655 amount
  const [txn] = await db.execute(sql`SELECT id, amount FROM customer_transactions WHERE customer_id = ${cust.id} AND reference_number = 'Q3655'`) as any[];
  if (txn && parseFloat(txn.amount) !== 1220) {
    await db.execute(sql`UPDATE customer_transactions SET amount = '1220.00' WHERE id = ${txn.id}`);
    console.log(`Q3655: ${txn.amount} → 1220.00`);
  } else if (txn) {
    console.log("Q3655 amount already 1220.00");
  } else {
    console.log("Q3655 not found");
  }

  // 3. Recalculate
  const txns = await db.select({ id: customerTransactions.id, amount: customerTransactions.amount, type: customerTransactions.type })
    .from(customerTransactions)
    .where(and(eq(customerTransactions.customerId, cust.id), eq(customerTransactions.orgId, ORG_ID)))
    .orderBy(asc(customerTransactions.recordedAt), asc(customerTransactions.id));

  let bal = 0, totalCharges = 0;
  for (const t of txns) {
    const amt = parseFloat(t.amount);
    if (t.type === "CHARGE" || (t.type === "ADJUSTMENT" && amt > 0)) { bal += amt; totalCharges += amt; }
    else bal -= Math.abs(amt);
    await db.update(customerTransactions).set({ balanceAfter: bal.toFixed(2) }).where(eq(customerTransactions.id, t.id));
  }

  await db.update(customers).set({ currentBalance: bal.toFixed(2), totalPurchases: totalCharges.toFixed(2) }).where(eq(customers.id, cust.id));
  console.log(`Balance: \u20B1${bal.toLocaleString("en-PH", { minimumFractionDigits: 2 })}, Total: \u20B1${totalCharges.toLocaleString("en-PH", { minimumFractionDigits: 2 })}`);

  process.exit(0);
}

main().catch((err) => { console.error("Fatal:", err); process.exit(1); });
