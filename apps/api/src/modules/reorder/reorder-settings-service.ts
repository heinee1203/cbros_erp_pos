import { db } from "@apex/database";
import { reorderSettings } from "@apex/database/schema";
import { eq, sql } from "drizzle-orm";

export async function getReorderSettings(orgId: string) {
  const rows = await db
    .select()
    .from(reorderSettings)
    .where(eq(reorderSettings.orgId, orgId));

  const map: Record<string, string> = {};
  for (const row of rows) {
    map[row.settingKey] = row.settingValue;
  }

  return map;
}

export async function updateReorderSettings(
  orgId: string,
  settings: Record<string, string>,
) {
  for (const [key, value] of Object.entries(settings)) {
    await db.execute(sql`
      INSERT INTO reorder_settings (id, org_id, setting_key, setting_value, updated_at)
      VALUES (gen_random_uuid(), ${orgId}, ${key}, ${value}, NOW())
      ON CONFLICT (org_id, setting_key) DO UPDATE SET setting_value = ${value}, updated_at = NOW()
    `);
  }
}
