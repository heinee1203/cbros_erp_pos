import { db } from "@apex/database";
import { brands, products } from "@apex/database/schema";
import { eq, and, sql, ilike, type SQL } from "drizzle-orm";
import type { CreateBrandInput, UpdateBrandInput } from "@apex/types";

export interface BrandRow {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  productCount: number;
  createdAt: string;
  updatedAt: string;
}

export async function listBrands(opts: {
  orgId: string;
  search?: string;
}): Promise<BrandRow[]> {
  const { orgId, search } = opts;
  const conditions: SQL[] = [eq(brands.orgId, orgId)];

  if (search && search.length >= 2) {
    conditions.push(ilike(brands.name, `%${search}%`));
  }

  const rows = await db
    .select({
      id: brands.id,
      name: brands.name,
      slug: brands.slug,
      isActive: brands.isActive,
      createdAt: brands.createdAt,
      updatedAt: brands.updatedAt,
      productCount: sql<number>`COALESCE(
        (SELECT COUNT(*)::int FROM products p
         WHERE p.brand_id = brands.id
         AND p.is_active = true),
        0
      )`,
    })
    .from(brands)
    .where(and(...conditions))
    .orderBy(brands.name);

  return rows.map((r) => ({
    ...r,
    productCount: Number(r.productCount),
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }));
}

export async function createBrand(
  input: CreateBrandInput,
  orgId: string,
): Promise<BrandRow> {
  const existing = await db
    .select({ id: brands.id })
    .from(brands)
    .where(and(eq(brands.orgId, orgId), eq(brands.slug, input.slug)));

  if (existing.length > 0) {
    throw new Error(`Brand with slug "${input.slug}" already exists`);
  }

  const [row] = await db
    .insert(brands)
    .values({
      orgId,
      name: input.name,
      slug: input.slug,
    })
    .returning();

  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    isActive: row.isActive,
    productCount: 0,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function updateBrand(
  brandId: string,
  input: UpdateBrandInput,
  orgId: string,
): Promise<BrandRow> {
  const existing = await db
    .select({ id: brands.id })
    .from(brands)
    .where(and(eq(brands.id, brandId), eq(brands.orgId, orgId)));

  if (existing.length === 0) {
    throw new Error("Brand not found");
  }

  if (input.slug) {
    const slugTaken = await db
      .select({ id: brands.id })
      .from(brands)
      .where(
        and(
          eq(brands.orgId, orgId),
          eq(brands.slug, input.slug),
          sql`${brands.id} != ${brandId}`,
        ),
      );

    if (slugTaken.length > 0) {
      throw new Error(`Brand with slug "${input.slug}" already exists`);
    }
  }

  const updateValues: Record<string, unknown> = {};
  if (input.name !== undefined) updateValues.name = input.name;
  if (input.slug !== undefined) updateValues.slug = input.slug;
  if (input.isActive !== undefined) updateValues.isActive = input.isActive;

  if (Object.keys(updateValues).length === 0) {
    throw new Error("No fields to update");
  }

  await db
    .update(brands)
    .set(updateValues)
    .where(and(eq(brands.id, brandId), eq(brands.orgId, orgId)));

  // Re-fetch with product count
  const [row] = await db
    .select({
      id: brands.id,
      name: brands.name,
      slug: brands.slug,
      isActive: brands.isActive,
      createdAt: brands.createdAt,
      updatedAt: brands.updatedAt,
      productCount: sql<number>`COALESCE(
        (SELECT COUNT(*)::int FROM products p
         WHERE p.brand_id = brands.id
         AND p.is_active = true),
        0
      )`,
    })
    .from(brands)
    .where(and(eq(brands.id, brandId), eq(brands.orgId, orgId)));

  return {
    ...row,
    productCount: Number(row.productCount),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function deleteBrand(
  brandId: string,
  orgId: string,
): Promise<void> {
  const existing = await db
    .select({ id: brands.id })
    .from(brands)
    .where(and(eq(brands.id, brandId), eq(brands.orgId, orgId)));

  if (existing.length === 0) {
    throw new Error("Brand not found");
  }

  const [{ count }] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(products)
    .where(eq(products.brandId, brandId));

  if (Number(count) > 0) {
    throw new Error(
      `Cannot delete brand with ${count} products assigned. Reassign products first.`,
    );
  }

  await db
    .delete(brands)
    .where(and(eq(brands.id, brandId), eq(brands.orgId, orgId)));
}
