import { db, BATCH_SIZE } from "./config";
import { categories } from "@apex/database/schema";
import { sql } from "drizzle-orm";

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 255);
}

export function classifyCategory(
  name: string,
): "TIRES" | "LUBRICANTS" | "HARD_PARTS" | "ACCESSORIES" | "LABOR_SERVICES" {
  const upper = name.toUpperCase();
  if (/TIRE|TYRE|RIM(?:\s|$)|WHEEL(?:\s|$)|VALVE.?STEM/.test(upper))
    return "TIRES";
  if (
    /OIL|LUBRI|GREASE|FLUID|COOLANT|ATF|GEAR.?OIL|BRAKE.?FLUID/.test(upper)
  )
    return "LUBRICANTS";
  if (
    /ACCESSOR|BULB|WIPER|MIRROR|LED|LIGHT|LAMP|MAT(?:TING)?|COVER|DASHCAM|FRESHENER|VISOR|CARGO|ROLLBAR|ROOF.?RACK|HORN(?:\s|$)/.test(
      upper,
    )
  )
    return "ACCESSORIES";
  if (/LABOR|SERVICE|INSTALL|ALIGNMENT|BALANCE|MOUNT/.test(upper))
    return "LABOR_SERVICES";
  return "HARD_PARTS";
}

export async function ensureCategories(
  orgId: string,
  uniqueNames: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();

  for (let i = 0; i < uniqueNames.length; i += BATCH_SIZE) {
    const batch = uniqueNames.slice(i, i + BATCH_SIZE);

    for (const name of batch) {
      const slug = slugify(name);

      const result = await db
        .insert(categories)
        .values({
          orgId,
          name,
          slug,
          // code is left null — many Loyverse categories map to the same enum,
          // and the unique index on (org_id, code) would conflict otherwise.
          // The enum classification lives on the product row via products.category.
          sortOrder: 0,
          isActive: true,
        })
        .onConflictDoNothing({
          target: [categories.orgId, categories.slug],
        })
        .returning({ id: categories.id, name: categories.name });

      if (result.length > 0) {
        map.set(name, result[0].id);
      } else {
        // Already exists — look it up
        const [existing] = await db
          .select({ id: categories.id })
          .from(categories)
          .where(
            sql`${categories.orgId} = ${orgId} AND ${categories.slug} = ${slug}`,
          )
          .limit(1);
        if (existing) map.set(name, existing.id);
      }
    }
  }

  console.log(`  Categories ensured: ${map.size}`);
  return map;
}
