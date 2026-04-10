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
  { date: "2025-12-01", ref: "Q2503", amount: "9500.00" },
  { date: "2025-12-04", ref: "Q2527", amount: "450.00" },
  { date: "2025-12-06", ref: "Q2547", amount: "3400.00" },
  { date: "2025-12-09", ref: "Q2811", amount: "1580.00" },
  { date: "2025-12-10", ref: "Q2816", amount: "11640.00" },
  { date: "2025-12-15", ref: "Q2906", amount: "6000.00" },
  { date: "2025-12-16", ref: "Q2913", amount: "1950.00" },
  { date: "2025-12-19", ref: "Q2942", amount: "14450.00" },
  { date: "2025-12-22", ref: "Q3014", amount: "3110.00" },
  { date: "2025-12-23", ref: "Q2857", amount: "2400.00" },
];

async function main() {
  const [cust] = await db.select({ id: customers.id, name: customers.name })
    .from(customers).where(and(eq(customers.orgId, ORG_ID), sql`UPPER(${customers.name}) = 'CBS'`));
  if (!cust) { console.error("Not found"); process.exit(1); }

  let inserted = 0;
  for (const e of ENTRIES) {
    const ex = await db.execute(sql`SELECT id FROM customer_transactions WHERE customer_id = ${cust.id} AND reference_number = ${e.ref}`) as any[];
    if (ex.length > 0) { console.log(`${e.ref} exists, skip`); continue; }
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
