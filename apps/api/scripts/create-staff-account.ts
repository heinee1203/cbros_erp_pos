/**
 * Add STAFF role to user_role enum and create staff account.
 * Run: npx tsx apps/api/scripts/create-staff-account.ts
 */
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, "../../../.env") });

import { db } from "@apex/database";
import { sql } from "drizzle-orm";
import bcrypt from "bcryptjs";

const ORG_ID = "556e350a-7180-4ec9-9e1e-ea0ca1937f40";
const EMAIL = "cbrosautoparts@cbros.com.ph";
const PASSWORD = "***REMOVED***";
const FULL_NAME = "CBROS Staff";

async function main() {
  console.log("=== Create Staff Account ===\n");

  // 1. Add STAFF to user_role enum (idempotent)
  try {
    await db.execute(sql`ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'STAFF'`);
    console.log("Added STAFF to user_role enum");
  } catch (err: any) {
    if (err.message?.includes("already exists")) {
      console.log("STAFF already in user_role enum");
    } else {
      throw err;
    }
  }

  // 2. Check if user already exists
  const [existing] = await db.execute(sql`SELECT id, email, role FROM users WHERE email = ${EMAIL}`) as any[];
  if (existing) {
    console.log(`User already exists: ${existing.email} (${existing.role})`);
    // Update role to STAFF if needed
    if (existing.role !== "STAFF") {
      await db.execute(sql`UPDATE users SET role = 'STAFF' WHERE id = ${existing.id}`);
      console.log(`Updated role to STAFF`);
    }
    process.exit(0);
  }

  // 3. Hash password
  const passwordHash = await bcrypt.hash(PASSWORD, 12);

  // 4. Create user
  const [user] = await db.execute(sql`
    INSERT INTO users (org_id, full_name, email, password_hash, role)
    VALUES (${ORG_ID}, ${FULL_NAME}, ${EMAIL}, ${passwordHash}, 'STAFF')
    RETURNING id, email, role, full_name
  `) as any[];

  console.log(`Created: ${user.full_name} (${user.email}) — Role: ${user.role}`);
  console.log(`ID: ${user.id}`);
  process.exit(0);
}
main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
