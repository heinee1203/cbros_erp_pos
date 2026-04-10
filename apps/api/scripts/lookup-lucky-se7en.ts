import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
dotenv.config({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../../../.env") });

import { db } from "@apex/database";
import { sql } from "drizzle-orm";

const cust = (await db.execute(sql`
  SELECT id, org_id, name, current_balance::text, is_active
  FROM customers
  WHERE name ILIKE '%lucky%se7en%' OR name ILIKE '%lucky seven%'
`)) as any[];
console.log("Customer candidates:");
console.table(cust);

if (cust.length === 0) {
  console.log("No customer found");
  process.exit(1);
}

const c = cust[0];

// Look for existing Q3668 (on ANY customer, to catch cross-customer duplicates)
const dup = (await db.execute(sql`
  SELECT ct.id, ct.customer_id, c.name, ct.type,
         ct.amount::text, ct.reference_number, ct.recorded_at
  FROM customer_transactions ct
  JOIN customers c ON c.id = ct.customer_id
  WHERE ct.reference_number = 'Q3668'
`)) as any[];
console.log("Existing Q3668 anywhere:");
console.table(dup);

// Recent transactions for this customer
const last = (await db.execute(sql`
  SELECT type, amount::text, balance_after::text, reference_number,
         recorded_at::text, billed
  FROM customer_transactions
  WHERE customer_id = ${c.id}
  ORDER BY recorded_at DESC, id DESC
  LIMIT 8
`)) as any[];
console.log("Lucky Se7en last 8 transactions:");
console.table(last);

process.exit(0);
