/**
 * Rename "3n Bakery" to "Santamaria Bakery & Foods CORP / 3N Bakery".
 * Run: npx tsx apps/api/scripts/rename-3n-bakery.ts
 */
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, "../../../.env") });

import { db } from "@apex/database";
import { customers } from "@apex/database/schema";
import { eq, and, ilike } from "drizzle-orm";

const ORG_ID = "556e350a-7180-4ec9-9e1e-ea0ca1937f40";

async function main() {
  console.log("=== Rename 3n Bakery ===\n");

  const [customer] = await db
    .select({ id: customers.id, name: customers.name })
    .from(customers)
    .where(and(eq(customers.orgId, ORG_ID), ilike(customers.name, "%3n bakery%")))
    .limit(1);

  if (!customer) { console.error("Customer not found!"); process.exit(1); }
  console.log(`Found: ${customer.name} (${customer.id})`);

  await db.update(customers)
    .set({ name: "Santamaria Bakery & Foods CORP / 3N Bakery" })
    .where(eq(customers.id, customer.id));

  console.log(`Renamed to: Santamaria Bakery & Foods CORP / 3N Bakery`);
  process.exit(0);
}
main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
