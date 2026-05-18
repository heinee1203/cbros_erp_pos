import { db } from "@apex/database";
import { products } from "@apex/database/schema";
import { and, eq, sql } from "drizzle-orm";

export {
  backfillHistoricalTechnicians,
  batchUpdateTechnicians,
  calculateCommissions,
  createTechnician,
  deactivateTechnician,
  getTechnician,
  listTechnicians,
  seedFromProducts,
  seedTechnicians,
  updateTechnician,
} from "./service";

export async function listCommissionRateProducts(orgId: string) {
  return db.execute(sql`
    SELECT p.id, p.name,
      COALESCE(parent.name, '') AS parent_name,
      p.parent_product_id IS NOT NULL AS is_variant,
      p.commission_amount::numeric AS commission_amount
    FROM products p
    LEFT JOIN products parent ON p.parent_product_id = parent.id
    WHERE p.org_id = ${orgId}
      AND p.commission_amount IS NOT NULL
    ORDER BY COALESCE(parent.name, p.name), p.name
  `);
}

export async function updateProductCommissionRate(
  orgId: string,
  productId: string,
  commissionAmount: number | null,
) {
  const [updated] = await db
    .update(products)
    .set({ commissionAmount: commissionAmount != null ? String(commissionAmount) : null })
    .where(and(eq(products.id, productId), eq(products.orgId, orgId)))
    .returning({
      id: products.id,
      name: products.name,
      commissionAmount: products.commissionAmount,
    });

  return updated;
}
