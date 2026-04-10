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
  { date: "2025-09-01", ref: "Q1867", amount: "85.00" },
  { date: "2025-09-01", ref: "Q1906", amount: "14400.00" },
  { date: "2025-09-02", ref: "Q1908", amount: "4400.00" },
  { date: "2025-09-03", ref: "Q1887", amount: "3730.00" },
  { date: "2025-09-03", ref: "Q1897", amount: "3730.00" },
  { date: "2025-09-06", ref: "Q1972", amount: "750.00" },
  { date: "2025-09-10", ref: "Q2000", amount: "2800.00" },
  { date: "2025-09-11", ref: "Q2063", amount: "2250.00" },
  { date: "2025-09-22", ref: "Q2133", amount: "1380.00" },
  { date: "2025-09-22", ref: "Q2135", amount: "15750.00" },
  { date: "2025-09-23", ref: "Q2149", amount: "2300.00" },
  { date: "2025-09-23", ref: "Q2150", amount: "1040.00" },
  { date: "2025-09-24", ref: "Q2162", amount: "5400.00" },
  { date: "2025-09-29", ref: "Q2185", amount: "3365.00" },
  { date: "2025-09-30", ref: "Q2189", amount: "2370.00" },
  { date: "2025-10-04", ref: "Q2258", amount: "2000.00" },
  { date: "2025-10-06", ref: "Q2269", amount: "950.00" },
  { date: "2025-10-07", ref: "Q2284", amount: "2750.00" },
  { date: "2025-10-09", ref: "Q2295", amount: "2800.00" },
  { date: "2025-10-11", ref: "Q2313", amount: "808.00" },
  { date: "2025-10-15", ref: "Q2350", amount: "2850.00" },
  { date: "2025-10-16", ref: "Q2355", amount: "640.00" },
  { date: "2025-10-16", ref: "Q2356", amount: "450.00" },
  { date: "2025-10-17", ref: "Q2360", amount: "1776.00" },
  { date: "2025-10-17", ref: "Q2361", amount: "6750.00" },
  { date: "2025-10-20", ref: "Q2381", amount: "8170.00" },
  { date: "2025-10-21", ref: "Q2387", amount: "3750.00" },
  { date: "2025-10-21", ref: "Q2388", amount: "907.00" },
  { date: "2025-10-21", ref: "Q2403", amount: "1500.00" },
  { date: "2025-10-24", ref: "Q2407", amount: "2300.00" },
  { date: "2025-10-24", ref: "Q2409", amount: "8100.00" },
  { date: "2025-11-04", ref: "Q2620", amount: "1600.00" },
  { date: "2025-11-05", ref: "Q2626", amount: "2800.00" },
  { date: "2025-11-07", ref: "Q2649", amount: "1100.00" },
  { date: "2025-11-08", ref: "Q2652", amount: "890.00" },
  { date: "2025-11-15", ref: "Q2684", amount: "4720.00" },
  { date: "2025-11-17", ref: "Q2694", amount: "900.00" },
  { date: "2025-11-17", ref: "Q2695", amount: "1500.00" },
  { date: "2025-11-19", ref: "Q2756", amount: "43450.00" },
  { date: "2025-11-19", ref: "Q2761", amount: "17680.00" },
  { date: "2025-11-20", ref: "Q2727", amount: "1000.00" },
  { date: "2025-11-20", ref: "Q2728", amount: "1200.00" },
  { date: "2025-11-22", ref: "Q2766", amount: "2300.00" },
  { date: "2025-11-24", ref: "Q2773", amount: "2775.00" },
  { date: "2025-11-27", ref: "Q0853", amount: "8000.00" },
  { date: "2025-11-27", ref: "Q2781", amount: "1100.00" },
  { date: "2025-11-27", ref: "Q2782", amount: "550.00" },
  { date: "2025-11-29", ref: "Q2795", amount: "4800.00" },
  { date: "2025-12-01", ref: "Q2506", amount: "590.00" },
  { date: "2025-12-03", ref: "Q2042", amount: "4750.00" },
  { date: "2025-12-04", ref: "Q2521", amount: "1260.00" },
  { date: "2025-12-04", ref: "Q2531", amount: "1340.00" },
  { date: "2025-12-05", ref: "Q2539", amount: "4665.00" },
  { date: "2025-12-08", ref: "Q2802", amount: "2290.00" },
  { date: "2025-12-10", ref: "Q2821", amount: "2300.00" },
  { date: "2025-12-11", ref: "Q2598", amount: "8400.00" },
  { date: "2025-12-11", ref: "Q2830", amount: "90.00" },
  { date: "2025-12-11", ref: "Q2831", amount: "2050.00" },
  { date: "2025-12-11", ref: "Q2832", amount: "2410.00" },
  { date: "2025-12-12", ref: "Q2844", amount: "560.00" },
  { date: "2025-12-16", ref: "Q2911", amount: "650.00" },
];

async function main() {
  const [cust] = await db.select({ id: customers.id, name: customers.name })
    .from(customers).where(and(eq(customers.orgId, ORG_ID), sql`UPPER(${customers.name}) = 'PHILWORKS CONSTRUCTION'`));
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
