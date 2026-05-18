import { sql } from "drizzle-orm";

export interface BackfillOrphanedSalesResult {
  linked: number;
}

export function countBackfilledRows(result: { length?: number | null } | null | undefined): number {
  return result?.length ?? 0;
}

async function getDatabase() {
  const { db } = await import("@apex/database");
  return db;
}

export async function backfillOrphanedSales(
  orgId: string,
): Promise<BackfillOrphanedSalesResult> {
  const db = await getDatabase();
  const result = await db.execute(sql`
    UPDATE historical_sales hs
    SET product_id = p.id
    FROM products p
    WHERE hs.product_id IS NULL
      AND hs.org_id = p.org_id
      AND hs.org_id = ${orgId}
      AND hs.sku IS NOT NULL
      AND hs.sku != ''
      AND LOWER(TRIM(hs.sku)) = LOWER(TRIM(p.sku))
  `);

  return { linked: countBackfilledRows(result) };
}
