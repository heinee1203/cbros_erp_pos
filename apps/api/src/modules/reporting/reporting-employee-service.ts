import { db } from "@apex/database";
import { sql } from "drizzle-orm";

export async function listReportingEmployees(orgId: string) {
  return db.execute(sql`
    SELECT id, full_name AS "fullName", role
    FROM users
    WHERE org_id = ${orgId}
    ORDER BY full_name
  `);
}
