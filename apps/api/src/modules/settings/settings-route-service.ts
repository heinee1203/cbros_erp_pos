import { db } from "@apex/database";
import { organizationSettings } from "@apex/database/schema";
import type { UpdateCompanySettingsInput } from "@apex/types";
import { eq } from "drizzle-orm";

export async function getCompanySettings(orgId: string) {
  const rows = await db
    .select()
    .from(organizationSettings)
    .where(eq(organizationSettings.orgId, orgId))
    .limit(1);

  return rows[0] ?? {};
}

export async function upsertCompanySettings(
  orgId: string,
  settings: UpdateCompanySettingsInput,
) {
  const [row] = await db
    .insert(organizationSettings)
    .values({
      orgId,
      ...settings,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: organizationSettings.orgId,
      set: {
        ...settings,
        updatedAt: new Date(),
      },
    })
    .returning();

  return row;
}
