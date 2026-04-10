import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
dotenv.config({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../../../.env") });

import { db } from "@apex/database";
import { sql } from "drizzle-orm";

// Look up DIARCCO CORP candidates
const cust = (await db.execute(sql`
  SELECT id, org_id, name, current_balance::text, is_active
  FROM customers
  WHERE name ILIKE '%diarcco%' OR name ILIKE '%diarco%'
`)) as any[];
console.log("DIARCCO CORP candidates:");
console.table(cust);

// Check for the 10 Q-numbers from the request on ANY customer
const refs = [
  "Q2512", "Q2538", "Q2246", "Q2805", "Q2840",
  "Q2841", "Q2846", "Q2927", "Q3002", "Q3007",
];
const existing = (await db.execute(sql`
  SELECT ct.reference_number, ct.type, ct.amount::text,
         ct.recorded_at::text, c.name AS customer
  FROM customer_transactions ct
  JOIN customers c ON c.id = ct.customer_id
  WHERE ct.reference_number IN (
    'Q2512','Q2538','Q2246','Q2805','Q2840',
    'Q2841','Q2846','Q2927','Q3002','Q3007'
  )
  ORDER BY ct.reference_number
`)) as any[];
console.log("\nExisting rows for the 10 Q-numbers:");
console.table(existing);

// If customer exists, show their recent txns for balance continuity
if (cust.length > 0) {
  const c = cust[0];
  const last = (await db.execute(sql`
    SELECT type, reference_number, amount::text, balance_after::text,
           recorded_at::text, billed
    FROM customer_transactions
    WHERE customer_id = ${c.id}
    ORDER BY recorded_at DESC, id DESC
    LIMIT 10
  `)) as any[];
  console.log(`\n${c.name} last 10 transactions:`);
  console.table(last);
}

process.exit(0);
