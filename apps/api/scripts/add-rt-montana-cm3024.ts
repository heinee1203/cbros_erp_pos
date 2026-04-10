/**
 * Add CM-3024 CREDIT_NOTE for RT Montana.
 * Run: npx tsx apps/api/scripts/add-rt-montana-cm3024.ts
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
const CUSTOMER_ID = "190d0dd7-087e-4586-9153-5b391ad37bf8";

async function main() {
  console.log("=== Add RT Montana CM-3024 ===\n");

  const [existing] = await db.execute(sql`SELECT id FROM customer_transactions WHERE customer_id = ${CUSTOMER_ID} AND reference_number = 'CM-3024' LIMIT 1`) as any[];
  if (existing) { console.log("CM-3024 already exists. Skipping."); process.exit(0); }

  await db.insert(customerTransactions).values({
    orgId: ORG_ID, customerId: CUSTOMER_ID, type: "CREDIT_NOTE", amount: "1900.00",
    balanceAfter: "0", referenceNumber: "CM-3024",
    notes: "Credit Memo", recordedAt: new Date("2025-12-09T00:00:00Z"),
  });
  console.log("  ADD CREDIT_NOTE CM-3024  2025-12-09  ₱1,900.00");

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

  console.log(`\nRecalculated ${allTxns.length} txns — balance: ₱${running.toFixed(2)}`);
  process.exit(0);
}
main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
