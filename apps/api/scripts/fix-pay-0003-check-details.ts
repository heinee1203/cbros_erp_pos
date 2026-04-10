/**
 * Update PAY-2026-0003 with check payment details.
 * Run: npx tsx apps/api/scripts/fix-pay-0003-check-details.ts
 */
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, "../../../.env") });

import { db } from "@apex/database";
import { sql } from "drizzle-orm";

async function main() {
  console.log("=== Fix PAY-2026-0003 Check Details ===\n");

  const [txn] = await db.execute(sql`SELECT id, payment_number, payment_method, payment_lines FROM customer_transactions WHERE payment_number = 'PAY-2026-0003' LIMIT 1`) as any[];
  if (!txn) { console.error("PAY-2026-0003 not found!"); process.exit(1); }

  console.log(`Found: ${txn.payment_number} (${txn.id})`);
  console.log(`  Current method: ${txn.payment_method}`);
  console.log(`  Current lines: ${JSON.stringify(txn.payment_lines)}`);

  await db.execute(sql`
    UPDATE customer_transactions
    SET payment_method = 'CHECK',
        payment_lines = '[{"method":"CHECK","amount":9065,"bank":"AUB","checkNumber":"630498","checkDate":"2026-02-18"}]'::jsonb
    WHERE payment_number = 'PAY-2026-0003'
  `);

  console.log(`\nUpdated: method=CHECK, lines=[CHECK AUB #630498 Feb 18, 2026]`);
  process.exit(0);
}
main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
