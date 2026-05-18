import { sql } from "drizzle-orm";

export interface ImportLocationMappingRow {
  csv_location_name: string;
  apex_location_id: string;
}

export interface SaveImportLocationMappingsResult {
  success: true;
  saved: number;
}

async function getDatabase() {
  const { db } = await import("@apex/database");
  return db;
}

export function buildImportLocationMappings(
  rows: Iterable<ImportLocationMappingRow>,
): Record<string, string> {
  const mappings: Record<string, string> = {};

  for (const row of rows) {
    mappings[row.csv_location_name] = row.apex_location_id;
  }

  return mappings;
}

export function countRequestedLocationMappings(mappings: Record<string, string>): number {
  return Object.keys(mappings).length;
}

export async function listImportLocationMappings(
  orgId: string,
): Promise<Record<string, string>> {
  const db = await getDatabase();
  const rows = await db.execute(
    sql`SELECT csv_location_name, apex_location_id FROM import_location_mappings WHERE org_id = ${orgId} ORDER BY csv_location_name`,
  );

  return buildImportLocationMappings(rows as Iterable<ImportLocationMappingRow>);
}

export async function saveImportLocationMappings(
  orgId: string,
  mappings: Record<string, string>,
): Promise<SaveImportLocationMappingsResult> {
  const db = await getDatabase();

  for (const [csvName, apexLocationId] of Object.entries(mappings)) {
    if (!csvName || !apexLocationId) continue;
    await db.execute(
      sql`INSERT INTO import_location_mappings (org_id, csv_location_name, apex_location_id)
          VALUES (${orgId}, ${csvName}, ${apexLocationId})
          ON CONFLICT (org_id, csv_location_name)
          DO UPDATE SET apex_location_id = ${apexLocationId}, updated_at = NOW()`,
    );
  }

  return { success: true, saved: countRequestedLocationMappings(mappings) };
}
