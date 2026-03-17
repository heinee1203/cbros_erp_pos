import { db } from "@apex/database";
import { productSubcategories, products } from "@apex/database/schema";
import { eq, and, sql, type SQL } from "drizzle-orm";
import type { CreateSubcategoryInput, UpdateSubcategoryInput } from "@apex/types";

export interface SubcategoryRow {
  id: string;
  categoryId: string;
  name: string;
  slug: string;
  sortOrder: number;
  isActive: boolean;
  productCount: number;
  createdAt: string;
  updatedAt: string;
}

export async function listSubcategories(opts: {
  orgId: string;
  categoryId?: string;
}): Promise<SubcategoryRow[]> {
  const conditions: SQL[] = [eq(productSubcategories.orgId, opts.orgId)];
  if (opts.categoryId) {
    conditions.push(eq(productSubcategories.categoryId, opts.categoryId));
  }

  const rows = await db
    .select({
      id: productSubcategories.id,
      categoryId: productSubcategories.categoryId,
      name: productSubcategories.name,
      slug: productSubcategories.slug,
      sortOrder: productSubcategories.sortOrder,
      isActive: productSubcategories.isActive,
      createdAt: productSubcategories.createdAt,
      updatedAt: productSubcategories.updatedAt,
      productCount: sql<number>`COALESCE(
        (SELECT COUNT(*)::int FROM ${products}
         WHERE ${products.subcategoryId} = ${productSubcategories.id}),
        0
      )`,
    })
    .from(productSubcategories)
    .where(and(...conditions))
    .orderBy(productSubcategories.sortOrder, productSubcategories.name);

  return rows.map((r) => ({
    ...r,
    productCount: Number(r.productCount),
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }));
}

export async function createSubcategory(
  input: CreateSubcategoryInput,
  orgId: string,
): Promise<SubcategoryRow> {
  const existing = await db
    .select({ id: productSubcategories.id })
    .from(productSubcategories)
    .where(
      and(
        eq(productSubcategories.orgId, orgId),
        eq(productSubcategories.categoryId, input.categoryId),
        eq(productSubcategories.slug, input.slug),
      ),
    );

  if (existing.length > 0) {
    throw new Error(`Subcategory with slug "${input.slug}" already exists in this category`);
  }

  const [row] = await db
    .insert(productSubcategories)
    .values({
      orgId,
      categoryId: input.categoryId,
      name: input.name,
      slug: input.slug,
      sortOrder: input.sortOrder ?? 0,
      isActive: input.isActive ?? true,
    })
    .returning();

  return {
    id: row.id,
    categoryId: row.categoryId,
    name: row.name,
    slug: row.slug,
    sortOrder: row.sortOrder,
    isActive: row.isActive,
    productCount: 0,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function updateSubcategory(
  id: string,
  input: UpdateSubcategoryInput,
  orgId: string,
): Promise<SubcategoryRow> {
  const existing = await db
    .select({ id: productSubcategories.id })
    .from(productSubcategories)
    .where(and(eq(productSubcategories.id, id), eq(productSubcategories.orgId, orgId)));

  if (existing.length === 0) {
    throw new Error("Subcategory not found");
  }

  if (input.slug) {
    const slugTaken = await db
      .select({ id: productSubcategories.id })
      .from(productSubcategories)
      .where(
        and(
          eq(productSubcategories.orgId, orgId),
          eq(productSubcategories.slug, input.slug),
          sql`${productSubcategories.id} != ${id}`,
        ),
      );
    if (slugTaken.length > 0) {
      throw new Error(`Subcategory with slug "${input.slug}" already exists`);
    }
  }

  const updateValues: Record<string, unknown> = {};
  if (input.name !== undefined) updateValues.name = input.name;
  if (input.slug !== undefined) updateValues.slug = input.slug;
  if (input.categoryId !== undefined) updateValues.categoryId = input.categoryId;
  if (input.sortOrder !== undefined) updateValues.sortOrder = input.sortOrder;
  if (input.isActive !== undefined) updateValues.isActive = input.isActive;

  if (Object.keys(updateValues).length === 0) {
    throw new Error("No fields to update");
  }

  await db
    .update(productSubcategories)
    .set(updateValues)
    .where(and(eq(productSubcategories.id, id), eq(productSubcategories.orgId, orgId)));

  const rows = await listSubcategories({ orgId });
  const updated = rows.find((r) => r.id === id);
  if (!updated) throw new Error("Subcategory not found after update");
  return updated;
}

export async function deleteSubcategory(id: string, orgId: string): Promise<void> {
  const existing = await db
    .select({ id: productSubcategories.id })
    .from(productSubcategories)
    .where(and(eq(productSubcategories.id, id), eq(productSubcategories.orgId, orgId)));

  if (existing.length === 0) {
    throw new Error("Subcategory not found");
  }

  const productCount = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(products)
    .where(eq(products.subcategoryId, id));

  if (Number(productCount[0].count) > 0) {
    throw new Error(
      `Cannot delete subcategory with ${productCount[0].count} items assigned. Reassign items first.`,
    );
  }

  await db
    .delete(productSubcategories)
    .where(and(eq(productSubcategories.id, id), eq(productSubcategories.orgId, orgId)));
}
