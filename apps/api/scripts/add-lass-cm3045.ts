/**
 * Add credit memo CM-3045 for Lass Automotive.
 * Run: npx tsx apps/api/scripts/add-lass-cm3045.ts
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
  console.log("=== Add Lass Automotive CM-3045 ===\n");

  const [cust] = await db.select({ id: customers.id, balance: customers.currentBalance })
    .from(customers).where(and(eq(customers.orgId, ORG_ID), sql`UPPER(${customers.name}) = 'LASS AUTOMOTIVE'`));
  if (!cust) { console.error("Not found"); process.exit(1); }

  const existing = await db.execute(sql`SELECT id FROM customer_transactions WHERE customer_id = ${cust.id} AND reference_number = 'CM-3045'`) as any[];
  if (existing.length > 0) { console.log("CM-3045 already exists. Skipping."); process.exit(0); }

  await db.insert(customerTransactions).values({
    orgId: ORG_ID, customerId: cust.id, type: "CREDIT_NOTE",
    amount: "4500.00", balanceAfter: "0",
    referenceType: "credit_memo", referenceNumber: "CM-3045",
    notes: "Credit Memo against invoice Q3907", recordedAt: new Date("2026-04-06"),
  });
  console.log("Inserted CREDIT_NOTE CM-3045 \u20B14,500.00");

  const txns = await db.select({ id: customerTransactions.id, amount: customerTransactions.amount, type: customerTransactions.type })
    .from(customerTransactions)
    .where(and(eq(customerTransactions.customerId, cust.id), eq(customerTransactions.orgId, ORG_ID)))
    .orderBy(asc(customerTransactions.recordedAt), asc(customerTransactions.id));

  let bal = 0;
  for (const t of txns) {
    const amt = parseFloat(t.amount);
    if (t.type === "CHARGE" || (t.type === "ADJUSTMENT" && amt > 0)) bal += amt; else bal -= Math.abs(amt);
    await db.update(customerTransactions).set({ balanceAfter: bal.toFixed(2) }).where(eq(customerTransactions.id, t.id));
  }

  await db.update(customers).set({ currentBalance: bal.toFixed(2) }).where(eq(customers.id, cust.id));
  console.log(`Balance: \u20B1${parseFloat(cust.balance ?? "0").toLocaleString("en-PH", { minimumFractionDigits: 2 })} \u2192 \u20B1${bal.toLocaleString("en-PH", { minimumFractionDigits: 2 })}`);
  process.exit(0);
}

main().catch((err) => { console.error("Fatal:", err); process.exit(1); });
