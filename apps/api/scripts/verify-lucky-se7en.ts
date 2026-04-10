import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, "../../../.env") });

import { db } from "@apex/database";
import { sql } from "drizzle-orm";

const rows = (await db.execute(sql`
  SELECT soa_number, status, total_payable::text, paid_amount::text
  FROM soa_records
  WHERE soa_number IN ('SOA-2026-0161','SOA-2026-0162')
  ORDER BY soa_number
`)) as any[];
console.log("Lucky Se7en SOAs after repair:");
console.table(rows);
process.exit(0);
