import { db } from "./config";
import { locations } from "@apex/database/schema";
import { eq, and } from "drizzle-orm";

interface LocationDef {
  code: string;
  type: "WAREHOUSE" | "RETAIL_STORE";
  name: string;
}

const LOCATION_MAP: Record<string, LocationDef> = {
  "C Autoparts": {
    code: "CA01",
    type: "RETAIL_STORE",
    name: "C Autoparts",
  },
  "OLD A/P": {
    code: "OA01",
    type: "RETAIL_STORE",
    name: "Old Auto Parts",
  },
  "Stock - Accessories": {
    code: "AC01",
    type: "WAREHOUSE",
    name: "Accessories Storage",
  },
  WAREHOUSE: {
    code: "WH01",
    type: "WAREHOUSE",
    name: "Central Warehouse",
  },
  TIRES: {
    code: "TR01",
    type: "WAREHOUSE",
    name: "Tire Storage",
  },
  JUNIOR: {
    code: "JR01",
    type: "RETAIL_STORE",
    name: "Junior Branch",
  },
};

export const LOYVERSE_LOCATIONS = Object.keys(LOCATION_MAP);

export async function ensureLocations(
  orgId: string,
): Promise<Map<string, string>> {
  const map = new Map<string, string>();

  for (const [loyverseName, def] of Object.entries(LOCATION_MAP)) {
    // Try to find existing by org+code
    const existing = await db
      .select({ id: locations.id })
      .from(locations)
      .where(and(eq(locations.orgId, orgId), eq(locations.code, def.code)))
      .limit(1);

    if (existing.length > 0) {
      map.set(loyverseName, existing[0].id);
    } else {
      const [inserted] = await db
        .insert(locations)
        .values({
          orgId,
          name: def.name,
          code: def.code,
          type: def.type,
          isActive: true,
        })
        .returning({ id: locations.id });
      map.set(loyverseName, inserted.id);
    }
    console.log(
      `  Location: ${loyverseName} → ${def.code} (${map.get(loyverseName)!.substring(0, 8)})`,
    );
  }

  return map;
}
