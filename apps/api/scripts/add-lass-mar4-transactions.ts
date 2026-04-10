/**
 * Add 4 missing March 4, 2026 CHARGE transactions for Lass Automotive.
 * Run: npx tsx apps/api/scripts/add-lass-mar4-transactions.ts
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

const NEW_ENTRIES = [
  { date: "2026-03-04T00:00:00Z", ref: "Q3641", amount: "25750.00" },
  { date: "2026-03-04T00:00:00Z", ref: "Q3642", amount: "2950.00" },
  { date: "2026-03-04T00:00:00Z", ref: "Q3643", amount: "4000.00" },
  { date: "2026-03-04T00:00:00Z", ref: "Q3665", amount: "14500.00" },
];
const TOTAL_NEW = 47200;

async function main() {
  console.log("=== Add Lass Automotive March 4 Transactions ===\n");

  const [cust] = await db.select({ id: customers.id, balance: customers.currentBalance, total: customers.totalPurchases })
    .from(customers).where(and(eq(customers.orgId, ORG_ID), sql`UPPER(${customers.name}) = 'LASS AUTOMOTIVE'`));

  if (!cust) { console.error("Lass Automotive not found"); process.exit(1); }
  console.log(`Found: balance=\u20B1${cust.balance}, total=\u20B1${cust.total}`);

  // Idempotency check
  const refs = NEW_ENTRIES.map((e) => e.ref);
  const existing = await db.execute(
    sql`SELECT reference_number FROM customer_transactions WHERE customer_id = ${cust.id} AND reference_number IN (${sql.join(refs.map((r) => sql`${r}`), sql`,`)})`
  ) as any[];

  if (existing.length === refs.length) {
    console.log(`All ${refs.length} entries already exist. Skipping.`);
    process.exit(0);
  }
  const existingRefs = new Set(existing.map((r: any) => r.reference_number));

  // Insert new entries
  let inserted = 0;
  for (const entry of NEW_ENTRIES) {
    if (existingRefs.has(entry.ref)) { console.log(`  Skip ${entry.ref} (exists)`); continue; }
    await db.insert(customerTransactions).values({
      orgId: ORG_ID, customerId: cust.id, type: "CHARGE",
      amount: entry.amount, balanceAfter: "0",
      referenceType: "credit_sale", referenceNumber: entry.ref,
      notes: "Credit Sale", recordedAt: new Date(entry.date),
    });
    console.log(`  Inserted CHARGE ${entry.ref} \u20B1${entry.amount}`);
    inserted++;
  }

  // Recalculate all balance_after
  const txns = await db
    .select({ id: customerTransactions.id, amount: customerTransactions.amount, type: customerTransactions.type })
    .from(customerTransactions)
    .where(and(eq(customerTransactions.customerId, cust.id), eq(customerTransactions.orgId, ORG_ID)))
    .orderBy(asc(customerTransactions.recordedAt), asc(customerTransactions.id));

  let bal = 0;
  for (const txn of txns) {
    const amt = parseFloat(txn.amount);
    if (txn.type === "CHARGE" || (txn.type === "ADJUSTMENT" && amt > 0)) bal += amt;
    else bal -= Math.abs(amt);
    await db.update(customerTransactions).set({ balanceAfter: bal.toFixed(2) }).where(eq(customerTransactions.id, txn.id));
  }

  const newTotal = (parseFloat(cust.total ?? "0") + TOTAL_NEW).toFixed(2);
  await db.update(customers).set({ currentBalance: bal.toFixed(2), totalPurchases: newTotal }).where(eq(customers.id, cust.id));

  console.log(`\nInserted: ${inserted}, Recalculated: ${txns.length} transactions`);
  console.log(`Balance: \u20B1${parseFloat(cust.balance ?? "0").toLocaleString("en-PH", { minimumFractionDigits: 2 })} \u2192 \u20B1${bal.toLocaleString("en-PH", { minimumFractionDigits: 2 })}`);
  console.log(`Total purchases: \u20B1${parseFloat(cust.total ?? "0").toLocaleString("en-PH", { minimumFractionDigits: 2 })} \u2192 \u20B1${parseFloat(newTotal).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`);

  process.exit(0);
}

main().catch((err) => { console.error("Fatal:", err); process.exit(1); });
