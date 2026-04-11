import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
dotenv.config({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../../../.env") });

import { db } from "@apex/database";
import { sql } from "drizzle-orm";

// The user referenced "AR-0006" — in this codebase the AR account code
// appears to live in the customers.phone field (seen earlier as "AR-...").
// Verify that AR-0006 resolves uniquely to Lucky Se7en.
const byPhone = (await db.execute(sql`
  SELECT id, name, phone, current_balance::text, is_active
  FROM customers
  WHERE phone = 'AR-0006' OR phone ILIKE '%AR-0006%'
`)) as any[];
console.log("customers with phone = 'AR-0006':");
console.table(byPhone);

const byName = (await db.execute(sql`
  SELECT id, name, phone, current_balance::text, is_active
  FROM customers
  WHERE name ILIKE '%lucky%se7en%'
`)) as any[];
console.log("\ncustomers matching 'Lucky Se7en':");
console.table(byName);

process.exit(0);
