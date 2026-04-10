/**
 * Seed 15 credit memo (CREDIT_NOTE) transactions.
 * Run: npx tsx apps/api/scripts/seed-credit-memos.ts
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

const CREDIT_MEMOS = [
  { date: "January 6, 2026",    cm: "CM-3028", invoice: "Q3081", customer: "CHENG AUTO SUPPLY",        amount: "440.00" },
  { date: "January 16, 2026",   cm: "CM-3029", invoice: "Q3184", customer: "CBS",                      amount: "2500.00" },
  { date: "January 19, 2026",   cm: "CM-3031", invoice: "Q3219", customer: "CBS",                      amount: "750.00" },
  { date: "January 21, 2026",   cm: "CM-3032", invoice: "Q3226", customer: "LASS AUTOMOTIVE",          amount: "680.00" },
  { date: "January 23, 2026",   cm: "CM-3033", invoice: "Q3258", customer: "LASS AUTOMOTIVE",          amount: "7000.00" },
  { date: "January 26, 2026",   cm: "CM-3034", invoice: "Q3306", customer: "PHILWORKS CONSTRUCTION",   amount: "360.00" },
  { date: "January 28, 2026",   cm: "CM-3035", invoice: "Q3325", customer: "PHILWORKS CONSTRUCTION",   amount: "1300.00" },
  { date: "February 10, 2026",  cm: "CM-3036", invoice: "Q3444", customer: "MESCO",                    amount: "7000.00" },
  { date: "February 20, 2026",  cm: "CM-3037", invoice: "Q3489", customer: "RT MONTANA",               amount: "180.00" },
  { date: "February 27, 2026",  cm: "CM-3038", invoice: "Q3615", customer: "AKY COCO LUMBER",          amount: "450.00" },
  { date: "March 5, 2026",      cm: "CM-3040", invoice: "Q3642", customer: "LASS AUTOMOTIVE",          amount: "450.00" },
  { date: "March 10, 2026",     cm: "CM-3041", invoice: "Q3644", customer: "BODEGA GLASSWARE",         amount: "1500.00" },
  { date: "March 10, 2026",     cm: "CM-3042", invoice: "Q3649", customer: "BODEGA GLASSWARE",         amount: "1200.00" },
  { date: "March 28, 2026",     cm: "CM-3044", invoice: "Q3738", customer: "PRINCETON MARKETING",      amount: "2200.00" },
  { date: "February 7, 2026",   cm: "CM-3457", invoice: "Q2884", customer: "DY, ALAIN DAVE",           amount: "110.00" },
];

async function main() {
  console.log("=== Seed Credit Memo Transactions ===\n");

  // Build customer name→id map
  const allCust = await db.select({ id: customers.id, name: customers.name, balance: customers.currentBalance })
    .from(customers).where(eq(customers.orgId, ORG_ID));
  const nameMap = new Map<string, { id: string; balance: string }>();
  for (const c of allCust) nameMap.set(c.name.toUpperCase(), { id: c.id, balance: c.balance ?? "0" });

  let inserted = 0;
  let skipped = 0;
  const affectedIds = new Set<string>();
  const changes: Array<{ name: string; cmTotal: number }> = [];

  for (const cm of CREDIT_MEMOS) {
    const cust = nameMap.get(cm.customer.toUpperCase());
    if (!cust) {
      // Try title case lookup
      const titleName = cm.customer.toLowerCase().replace(/(^|\s|[-/])(\w)/g, (_, p, c) => p + c.toUpperCase());
      const cust2 = nameMap.get(titleName.toUpperCase());
      if (!cust2) { console.log(`  WARNING: Customer not found: ${cm.customer}`); continue; }
      Object.assign(cust ?? {}, cust2);
    }
    const custId = (cust ?? nameMap.get(cm.customer.toLowerCase().replace(/(^|\s|[-/])(\w)/g, (_, p, c) => p + c.toUpperCase()).toUpperCase()))!.id;

    // Check idempotency
    const existing = await db.execute(
      sql`SELECT id FROM customer_transactions WHERE customer_id = ${custId} AND reference_number = ${cm.cm} AND org_id = ${ORG_ID}`
    ) as any[];
    if (existing.length > 0) { skipped++; continue; }

    await db.insert(customerTransactions).values({
      orgId: ORG_ID,
      customerId: custId,
      type: "CREDIT_NOTE",
      amount: cm.amount,
      balanceAfter: "0",
      referenceType: "credit_memo",
      referenceNumber: cm.cm,
      notes: `Credit Memo against invoice ${cm.invoice}`,
      recordedAt: new Date(cm.date),
    });
    inserted++;
    affectedIds.add(custId);

    // Track for logging
    const existing_change = changes.find((c) => c.name === cm.customer);
    if (existing_change) existing_change.cmTotal += parseFloat(cm.amount);
    else changes.push({ name: cm.customer, cmTotal: parseFloat(cm.amount) });
  }

  console.log(`Inserted: ${inserted} credit memo transactions`);
  console.log(`Skipped: ${skipped} (already existed)`);
  console.log(`Customers affected: ${affectedIds.size}\n`);

  // Recalculate balance_after for affected customers
  for (const custId of affectedIds) {
    const txns = await db
      .select({ id: customerTransactions.id, amount: customerTransactions.amount, type: customerTransactions.type })
      .from(customerTransactions)
      .where(and(eq(customerTransactions.customerId, custId), eq(customerTransactions.orgId, ORG_ID)))
      .orderBy(asc(customerTransactions.recordedAt), asc(customerTransactions.id));

    let running = 0;
    for (const txn of txns) {
      const amt = parseFloat(txn.amount);
      if (txn.type === "CHARGE" || (txn.type === "ADJUSTMENT" && amt > 0)) running += amt;
      else running -= Math.abs(amt);
    }

    // Update all balance_after values
    let bal = 0;
    for (const txn of txns) {
      const amt = parseFloat(txn.amount);
      if (txn.type === "CHARGE" || (txn.type === "ADJUSTMENT" && amt > 0)) bal += amt;
      else bal -= Math.abs(amt);
      await db.update(customerTransactions).set({ balanceAfter: bal.toFixed(2) }).where(eq(customerTransactions.id, txn.id));
    }

    // Update customer balance
    const custName = allCust.find((c) => c.id === custId)?.name ?? "?";
    const oldBal = allCust.find((c) => c.id === custId)?.balance ?? "0";
    await db.update(customers).set({ currentBalance: bal.toFixed(2) }).where(eq(customers.id, custId));
    const change = changes.find((c) => c.name.toUpperCase() === custName.toUpperCase());
    console.log(`  ${custName}: was \u20B1${parseFloat(oldBal).toLocaleString("en-PH", { minimumFractionDigits: 2 })} \u2192 now \u20B1${bal.toLocaleString("en-PH", { minimumFractionDigits: 2 })} (CM: -\u20B1${(change?.cmTotal ?? 0).toLocaleString("en-PH", { minimumFractionDigits: 2 })})`);
  }

  // Total
  const totalCM = CREDIT_MEMOS.reduce((s, cm) => s + parseFloat(cm.amount), 0);
  console.log(`\nTotal credit memos: \u20B1${totalCM.toLocaleString("en-PH", { minimumFractionDigits: 2 })}`);

  const [totalAR] = await db.execute(sql`SELECT SUM(current_balance::numeric)::numeric(14,2) AS total FROM customers WHERE org_id = ${ORG_ID}`) as any[];
  console.log(`Total receivables after: \u20B1${parseFloat(totalAR.total).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`);

  process.exit(0);
}

main().catch((err) => { console.error("Fatal:", err); process.exit(1); });
