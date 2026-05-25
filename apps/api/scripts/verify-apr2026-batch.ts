import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, "../../../.env") });

import { db } from "@apex/database";
import { sql } from "drizzle-orm";

async function main() {
  console.log("=== Verification: Apr2026 batch ===\n");

  console.log("1. Spot-check refs land correctly:");
  const spot = (await db.execute(sql`
    SELECT c.name, ct.reference_number, ct.amount, ct.recorded_at::date AS recorded_at
    FROM customer_transactions ct
    JOIN customers c ON c.id = ct.customer_id
    WHERE ct.reference_number IN ('Q3899','Q3951','Q4012','Q4016','Q0862','Q3942')
    ORDER BY ct.reference_number
  `)) as any[];
  for (const r of spot) {
    console.log(`   ${r.reference_number}  ${r.name}  ₱${r.amount}  ${r.recorded_at}`);
  }
  console.log(`   → ${spot.length} rows (expected 6)\n`);

  console.log("2. Balance integrity check:");
  for (const name of ["CBS", "Lass Automotive"]) {
    const [cust] = (await db.execute(sql`
      SELECT id, name, current_balance, total_purchases
      FROM customers WHERE name = ${name} LIMIT 1
    `)) as any[];
    if (!cust) {
      console.log(`   NOT FOUND: ${name}`);
      continue;
    }
    const [sums] = (await db.execute(sql`
      SELECT
        COALESCE(SUM(CASE WHEN type='CHARGE' OR (type='ADJUSTMENT' AND amount > 0) THEN amount ELSE -ABS(amount) END),0) AS computed_balance,
        COALESCE(SUM(CASE WHEN type='CHARGE' THEN amount ELSE 0 END),0) AS computed_purchases
      FROM customer_transactions WHERE customer_id = ${cust.id}
    `)) as any[];
    const okBal = parseFloat(cust.current_balance).toFixed(2) === parseFloat(sums.computed_balance).toFixed(2);
    const okPur = parseFloat(cust.total_purchases).toFixed(2) === parseFloat(sums.computed_purchases).toFixed(2);
    console.log(
      `   ${cust.name}: stored bal ₱${cust.current_balance} vs computed ₱${parseFloat(sums.computed_balance).toFixed(2)} ${okBal ? "✓" : "✗"} | ` +
        `stored purch ₱${cust.total_purchases} vs computed ₱${parseFloat(sums.computed_purchases).toFixed(2)} ${okPur ? "✓" : "✗"}`,
    );
  }

  console.log("\n3. Total charges inserted for Mar 30 – Apr 16, 2026 window:");
  const [win] = (await db.execute(sql`
    SELECT COUNT(*)::int AS n, COALESCE(SUM(amount::numeric),0) AS total
    FROM customer_transactions
    WHERE type = 'CHARGE'
      AND reference_type = 'credit_sale'
      AND recorded_at::date BETWEEN '2026-03-30' AND '2026-04-16'
  `)) as any[];
  console.log(`   rows in window: ${win.n}, total ₱${parseFloat(win.total).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`);

  process.exit(0);
}
main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
