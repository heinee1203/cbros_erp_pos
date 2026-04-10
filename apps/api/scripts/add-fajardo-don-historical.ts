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
const ENTRIES = [
  { date: "2025-07-29", ref: "Q1361", amount: "1500.00" },
  { date: "2025-08-03", ref: "Q1664", amount: "13245.00" },
  { date: "2025-08-13", ref: "Q1738", amount: "700.00" },
  { date: "2025-08-13", ref: "Q1739", amount: "5800.00" },
  { date: "2025-08-19", ref: "Q1785", amount: "2100.00" },
  { date: "2025-08-19", ref: "Q1786", amount: "1900.00" },
  { date: "2025-08-24", ref: "Q1827", amount: "1950.00" },
  { date: "2025-09-01", ref: "Q1871", amount: "1750.00" },
  { date: "2025-09-12", ref: "Q2076", amount: "2370.00" },
  { date: "2025-09-13", ref: "Q2084", amount: "2400.00" },
  { date: "2025-09-23", ref: "Q2145", amount: "4415.00" },
  { date: "2025-09-23", ref: "Q2152", amount: "1440.00" },
  { date: "2025-09-29", ref: "Q2182", amount: "12490.00" },
  { date: "2025-10-08", ref: "Q2286", amount: "14300.00" },
  { date: "2025-10-08", ref: "Q2287", amount: "3305.00" },
  { date: "2025-10-20", ref: "Q2380", amount: "3700.00" },
  { date: "2025-10-21", ref: "Q2404", amount: "3400.00" },
  { date: "2025-10-22", ref: "Q2394", amount: "7300.00" },
  { date: "2025-10-23", ref: "Q2397", amount: "5500.00" },
  { date: "2025-10-29", ref: "Q2443", amount: "2750.00" },
  { date: "2025-11-19", ref: "Q2711", amount: "3130.00" },
  { date: "2025-12-05", ref: "Q2533", amount: "3600.00" },
  { date: "2025-12-17", ref: "Q2924", amount: "7620.00" },
  { date: "2025-12-27", ref: "Q3031", amount: "2740.00" },
];

async function main() {
  const [cust] = await db.select({ id: customers.id, name: customers.name })
    .from(customers).where(and(eq(customers.orgId, ORG_ID), sql`UPPER(${customers.name}) = 'FAJARDO, DON'`));
  if (!cust) { console.error("Not found"); process.exit(1); }

  let inserted = 0;
  for (const e of ENTRIES) {
    const ex = await db.execute(sql`SELECT id FROM customer_transactions WHERE customer_id = ${cust.id} AND reference_number = ${e.ref}`) as any[];
    if (ex.length > 0) continue;
    await db.insert(customerTransactions).values({
      orgId: ORG_ID, customerId: cust.id, type: "CHARGE", amount: e.amount, balanceAfter: "0",
      referenceType: "credit_sale", referenceNumber: e.ref, notes: "Credit Sale", recordedAt: new Date(e.date),
    });
    inserted++;
  }

  const txns = await db.select({ id: customerTransactions.id, amount: customerTransactions.amount, type: customerTransactions.type })
    .from(customerTransactions).where(and(eq(customerTransactions.customerId, cust.id), eq(customerTransactions.orgId, ORG_ID)))
    .orderBy(asc(customerTransactions.recordedAt), asc(customerTransactions.id));

  let bal = 0, tot = 0;
  for (const t of txns) {
    const a = parseFloat(t.amount);
    if (t.type === "CHARGE" || (t.type === "ADJUSTMENT" && a > 0)) { bal += a; tot += a; } else bal -= Math.abs(a);
    await db.update(customerTransactions).set({ balanceAfter: bal.toFixed(2) }).where(eq(customerTransactions.id, t.id));
  }
  await db.update(customers).set({ currentBalance: bal.toFixed(2), totalPurchases: tot.toFixed(2) }).where(eq(customers.id, cust.id));
  console.log(`${cust.name}: inserted ${inserted}, ${txns.length} total txns, balance \u20B1${bal.toFixed(2)}, total \u20B1${tot.toFixed(2)}`);
  process.exit(0);
}
main().catch((err) => { console.error("Fatal:", err); process.exit(1); });
