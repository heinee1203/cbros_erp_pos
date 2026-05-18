import { db } from "@apex/database";
import { inventory, products } from "@apex/database/schema";
import { and, eq } from "drizzle-orm";

export {
  getProductLocations,
  queryProductStockLevels,
  queryStockLevels,
  updateAvailability,
} from "./service";
export type { SortDir, SortField } from "./service";

export async function updateReorderPoint(
  orgId: string,
  scopedLocationId: string | undefined,
  productId: string,
  reorderPoint: number,
) {
  const [product] = await db
    .select({ id: products.id })
    .from(products)
    .where(and(eq(products.id, productId), eq(products.orgId, orgId)))
    .limit(1);

  if (!product) return null;

  const conditions = [eq(inventory.productId, productId)];
  if (scopedLocationId) {
    conditions.push(eq(inventory.locationId, scopedLocationId));
  }

  const result = await db
    .update(inventory)
    .set({ reorderPoint })
    .where(and(...conditions))
    .returning({ id: inventory.id });

  return { updated: result.length };
}
