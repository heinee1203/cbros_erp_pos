import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
dotenv.config({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../../../.env") });

import { db } from "@apex/database";
import { sql } from "drizzle-orm";

const custId = "730a74fc-47ae-4b61-ad7d-237f4b0aa70a"; // Lucky Se7en, INC

// Which SOAs contain Q3481 / Q3622 / Q3651 / Q3746?
const billed = (await db.execute(sql`
  SELECT ct.reference_number, ct.billed, ct.billed_soa_id,
         sr.soa_number, sr.date_from::text, sr.date_to::text, sr.status
  FROM customer_transactions ct
  LEFT JOIN soa_records sr ON sr.id = ct.billed_soa_id
  WHERE ct.customer_id = ${custId}
    AND ct.reference_number IN ('Q3481','Q3622','Q3651','Q3668','Q3746')
  ORDER BY ct.recorded_at
`)) as any[];
console.log("Post-SOA-0161 charges:");
console.table(billed);

// All SOAs for this customer
const soas = (await db.execute(sql`
  SELECT soa_number, status, date_from::text, date_to::text,
         total_payable::text, paid_amount::text
  FROM soa_records
  WHERE customer_id = ${custId}
  ORDER BY soa_number
`)) as any[];
console.log("All SOAs for Lucky Se7en:");
console.table(soas);

process.exit(0);
