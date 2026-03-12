import { db } from "@apex/database";
import { categories, products } from "@apex/database/schema";
import { eq, and, sql, ilike, type SQL } from "drizzle-orm";
import type { CreateCategoryInput, UpdateCategoryInput } from "@apex/types";

// ── Types ──

export interface CategoryRow {
  id: string;
  name: string;
  slug: string;
  code: string | null;
  description: string | null;
  color: string | null;
  sortOrder: number;
  isActive: boolean;
  parentId: string | null;
  productCount: number;
  createdAt: string;
  updatedAt: string;
}

// ── List categories with product counts ──

export async function listCategories(opts: {
  orgId: string;
  search?: string;
  activeOnly?: boolean;
}): Promise<CategoryRow[]> {
  const { orgId, search, activeOnly } = opts;

  const conditions: SQL[] = [eq(categories.orgId, orgId)];

  if (activeOnly) {
    conditions.push(eq(categories.isActive, true));
  }

  if (search && search.length >= 2) {
    conditions.push(
      sql`(${ilike(categories.name, `%${search}%`)} OR ${ilike(categories.slug, `%${search}%`)})`,
    );
  }

  // Left join products to get counts per category code
  const rows = await db
    .select({
      id: categories.id,
      name: categories.name,
      slug: categories.slug,
      code: categories.code,
      description: categories.description,
      color: categories.color,
      sortOrder: categories.sortOrder,
      isActive: categories.isActive,
      parentId: categories.parentId,
      createdAt: categories.createdAt,
      updatedAt: categories.updatedAt,
      productCount: sql<number>`COALESCE(
        (SELECT COUNT(*)::int FROM ${products}
         WHERE ${products.orgId} = ${categories.orgId}
         AND ${products.category}::text = ${categories.code}),
        0
      )`,
    })
    .from(categories)
    .where(and(...conditions))
    .orderBy(categories.sortOrder, categories.name);

  return rows.map((r) => ({
    ...r,
    productCount: Number(r.productCount),
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }));
}

// ── Get single category ──

export async function getCategoryById(
  categoryId: string,
  orgId: string,
): Promise<CategoryRow | null> {
  const rows = await db
    .select({
      id: categories.id,
      name: categories.name,
      slug: categories.slug,
      code: categories.code,
      description: categories.description,
      color: categories.color,
      sortOrder: categories.sortOrder,
      isActive: categories.isActive,
      parentId: categories.parentId,
      createdAt: categories.createdAt,
      updatedAt: categories.updatedAt,
      productCount: sql<number>`COALESCE(
        (SELECT COUNT(*)::int FROM ${products}
         WHERE ${products.orgId} = ${categories.orgId}
         AND ${products.category}::text = ${categories.code}),
        0
      )`,
    })
    .from(categories)
    .where(and(eq(categories.id, categoryId), eq(categories.orgId, orgId)));

  if (rows.length === 0) return null;

  const r = rows[0];
  return {
    ...r,
    productCount: Number(r.productCount),
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

// ── Create category ──

export async function createCategory(
  input: CreateCategoryInput,
  orgId: string,
): Promise<CategoryRow> {
  // Check slug uniqueness
  const existing = await db
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.orgId, orgId), eq(categories.slug, input.slug)));

  if (existing.length > 0) {
    throw new Error(`Category with slug "${input.slug}" already exists`);
  }

  // Check code uniqueness (if provided)
  if (input.code) {
    const existingCode = await db
      .select({ id: categories.id })
      .from(categories)
      .where(and(eq(categories.orgId, orgId), eq(categories.code, input.code)));

    if (existingCode.length > 0) {
      throw new Error(`Category with code "${input.code}" already exists`);
    }
  }

  const [row] = await db
    .insert(categories)
    .values({
      orgId,
      name: input.name,
      slug: input.slug,
      code: input.code ?? null,
      description: input.description ?? null,
      color: input.color ?? null,
      sortOrder: input.sortOrder ?? 0,
      isActive: input.isActive ?? true,
      parentId: input.parentId ?? null,
    })
    .returning();

  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    code: row.code,
    description: row.description,
    color: row.color,
    sortOrder: row.sortOrder,
    isActive: row.isActive,
    parentId: row.parentId,
    productCount: 0,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// ── Update category ──

export async function updateCategory(
  categoryId: string,
  input: UpdateCategoryInput,
  orgId: string,
): Promise<CategoryRow> {
  // Verify category exists & belongs to org
  const existing = await db
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.id, categoryId), eq(categories.orgId, orgId)));

  if (existing.length === 0) {
    throw new Error("Category not found");
  }

  // Check slug uniqueness if changing
  if (input.slug) {
    const slugTaken = await db
      .select({ id: categories.id })
      .from(categories)
      .where(
        and(
          eq(categories.orgId, orgId),
          eq(categories.slug, input.slug),
          sql`${categories.id} != ${categoryId}`,
        ),
      );

    if (slugTaken.length > 0) {
      throw new Error(`Category with slug "${input.slug}" already exists`);
    }
  }

  const updateValues: Record<string, unknown> = {};
  if (input.name !== undefined) updateValues.name = input.name;
  if (input.slug !== undefined) updateValues.slug = input.slug;
  if (input.description !== undefined) updateValues.description = input.description;
  if (input.color !== undefined) updateValues.color = input.color;
  if (input.sortOrder !== undefined) updateValues.sortOrder = input.sortOrder;
  if (input.isActive !== undefined) updateValues.isActive = input.isActive;
  if (input.parentId !== undefined) updateValues.parentId = input.parentId;

  if (Object.keys(updateValues).length === 0) {
    throw new Error("No fields to update");
  }

  await db
    .update(categories)
    .set(updateValues)
    .where(and(eq(categories.id, categoryId), eq(categories.orgId, orgId)));

  const result = await getCategoryById(categoryId, orgId);
  if (!result) throw new Error("Category not found after update");
  return result;
}

// ── Delete category ──

export async function deleteCategory(
  categoryId: string,
  orgId: string,
): Promise<void> {
  // Verify category exists
  const existing = await db
    .select({ id: categories.id, code: categories.code })
    .from(categories)
    .where(and(eq(categories.id, categoryId), eq(categories.orgId, orgId)));

  if (existing.length === 0) {
    throw new Error("Category not found");
  }

  const cat = existing[0];

  // Check for products using this category's code
  if (cat.code) {
    const productCount = await db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(products)
      .where(
        and(
          eq(products.orgId, orgId),
          sql`${products.category}::text = ${cat.code}`,
        ),
      );

    if (Number(productCount[0].count) > 0) {
      throw new Error(
        `Cannot delete category with ${productCount[0].count} products assigned. Reassign products first.`,
      );
    }
  }

  await db
    .delete(categories)
    .where(and(eq(categories.id, categoryId), eq(categories.orgId, orgId)));
}
