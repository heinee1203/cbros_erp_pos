import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
dotenv.config({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../../../.env") });

import { db } from "@apex/database";
import { sql } from "drizzle-orm";

const CUSTOMER_ID = "f9dde83a-4a75-4b1d-92f2-da6a92035c04"; // Diarcco CORP

// Count total rows for this customer
const [cnt] = (await db.execute(sql`
  SELECT COUNT(*)::int AS n FROM customer_transactions WHERE customer_id = ${CUSTOMER_ID}
`)) as any[];
console.log(`Total Diarcco CORP transactions: ${cnt.n}`);

// Anything on or before 2025-12-31 (predecessor territory for the Dec inserts)
const before = (await db.execute(sql`
  SELECT type, reference_number, amount::text, balance_after::text,
         recorded_at::text, billed
  FROM customer_transactions
  WHERE customer_id = ${CUSTOMER_ID}
    AND recorded_at <= '2026-01-01'::timestamptz
  ORDER BY recorded_at ASC, id ASC
`)) as any[];
console.log("\nTransactions on/before 2026-01-01:");
console.table(before);

// Earliest transaction overall
const [first] = (await db.execute(sql`
  SELECT type, reference_number, amount::text, balance_after::text,
         recorded_at::text
  FROM customer_transactions
  WHERE customer_id = ${CUSTOMER_ID}
  ORDER BY recorded_at ASC, id ASC
  LIMIT 1
`)) as any[];
console.log("\nEarliest transaction:");
console.table([first]);

process.exit(0);
