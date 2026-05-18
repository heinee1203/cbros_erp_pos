import { db } from "@apex/database";
import { sql } from "drizzle-orm";

export async function assertDatabaseConnected() {
  await db.execute(sql`SELECT 1`);
}
