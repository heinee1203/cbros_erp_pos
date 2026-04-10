import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
dotenv.config({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../../../.env") });

import { db } from "@apex/database";
import { sql } from "drizzle-orm";

const CUSTOMER_ID = "f9dde83a-4a75-4b1d-92f2-da6a92035c04"; // Diarcco CORP

// Check duplicate
const dup = (await db.execute(sql`
  SELECT ct.reference_number, ct.type, ct.amount::text, c.name
  FROM customer_transactions ct
  JOIN customers c ON c.id = ct.customer_id
  WHERE ct.reference_number = 'CM-3025'
`)) as any[];
console.log("Existing CM-3025 rows:");
console.table(dup);

// Sample existing CREDIT_NOTE rows to see the ref format convention
const sample = (await db.execute(sql`
  SELECT reference_number, type, amount::text, balance_after::text,
         recorded_at::text
  FROM customer_transactions
  WHERE type = 'CREDIT_NOTE'
  ORDER BY recorded_at DESC
  LIMIT 5
`)) as any[];
console.log("\nSample existing CREDIT_NOTE rows (any customer):");
console.table(sample);

// Diarcco Dec 13 state after Q2846 insert
const dec13 = (await db.execute(sql`
  SELECT type, reference_number, amount::text, balance_after::text,
         recorded_at::text
  FROM customer_transactions
  WHERE customer_id = ${CUSTOMER_ID}
    AND recorded_at >= '2025-12-13'::timestamptz
    AND recorded_at <  '2025-12-14'::timestamptz
  ORDER BY recorded_at ASC
`)) as any[];
console.log("\nDiarcco Dec 13, 2025 entries:");
console.table(dec13);

// Count rows that would need rewinding (Dec 13 after 16:00:00 and later)
const [laterCnt] = (await db.execute(sql`
  SELECT COUNT(*)::int AS n FROM customer_transactions
  WHERE customer_id = ${CUSTOMER_ID}
    AND recorded_at > '2025-12-13T16:00:02Z'::timestamptz
`)) as any[];
console.log(`\nRows chronologically after the proposed CM-3025 insert slot: ${laterCnt.n}`);

// Customer current balance
const [cust] = (await db.execute(sql`
  SELECT current_balance::text FROM customers WHERE id = ${CUSTOMER_ID}
`)) as any[];
console.log(`\nCurrent balance: ${cust.current_balance}`);

process.exit(0);
