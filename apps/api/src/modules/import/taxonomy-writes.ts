import { type DbOrTx } from "@apex/database";
import { brands, categories } from "@apex/database/schema";
import { and, eq } from "drizzle-orm";
import { isProtectedUpdateImportMode, type ImportMode } from "./execution-utils";

export interface ImportCategoryMapping {
  action: "create" | "map" | "skip";
  targetCategoryId?: string;
  targetSubcategoryId?: string;
  familyId?: string;
  createSubcategory?: boolean;
}

export function buildImportSlug(name: string, fallbackPrefix: string, now = Date.now): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return slug || `${fallbackPrefix}-${now()}`;
}

export interface ResolveImportCategoryOptions {
  tx: DbOrTx;
  orgId: string;
  categoryName: string;
  mode: ImportMode;
  categoryMapping?: Record<string, ImportCategoryMapping>;
  createNewCategories?: boolean;
  categoryCache: Map<string, string>;
}

export async function resolveImportCategory({
  tx,
  orgId,
  categoryName,
  mode,
  categoryMapping,
  createNewCategories,
  categoryCache,
}: ResolveImportCategoryOptions): Promise<string | null> {
  if (!categoryName || isProtectedUpdateImportMode(mode)) return null;

  const catMapping = categoryMapping?.[categoryName];
  if (catMapping) {
    if (catMapping.action === "map" && catMapping.targetCategoryId) {
      return catMapping.targetCategoryId;
    }
    if (catMapping.action !== "create") {
      return null;
    }

    let categoryId = categoryCache.get(categoryName.toLowerCase()) ?? null;
    if (categoryId) return categoryId;

    if (!catMapping.familyId) {
      throw new Error(
        `Cannot create category "${categoryName}" without a family. Please select a family in the category mapping.`,
      );
    }

    const catSlugVal = buildImportSlug(categoryName, "cat");
    const [newCat] = await tx
      .insert(categories)
      .values({
        orgId,
        name: categoryName,
        slug: catSlugVal,
        familyId: catMapping.familyId,
      })
      .onConflictDoNothing()
      .returning({ id: categories.id });

    if (newCat) {
      categoryId = newCat.id;
    } else {
      const [existCat] = await tx
        .select({ id: categories.id })
        .from(categories)
        .where(and(eq(categories.orgId, orgId), eq(categories.slug, catSlugVal)))
        .limit(1);
      categoryId = existCat?.id ?? null;
    }

    if (categoryId) categoryCache.set(categoryName.toLowerCase(), categoryId);
    return categoryId;
  }

  let categoryId = categoryCache.get(categoryName.toLowerCase()) ?? null;
  if (categoryId || !createNewCategories) return categoryId;

  const autoSlugVal = buildImportSlug(categoryName, "cat");
  const [newCat] = await tx
    .insert(categories)
    .values({
      orgId,
      name: categoryName,
      slug: autoSlugVal,
    })
    .onConflictDoNothing()
    .returning({ id: categories.id });

  if (newCat) {
    categoryId = newCat.id;
  } else {
    const [existCat] = await tx
      .select({ id: categories.id })
      .from(categories)
      .where(and(eq(categories.orgId, orgId), eq(categories.slug, autoSlugVal)))
      .limit(1);
    categoryId = existCat?.id ?? null;
  }

  if (categoryId) categoryCache.set(categoryName.toLowerCase(), categoryId);
  return categoryId;
}

export function resolveImportSubcategory(
  categoryName: string,
  mode: ImportMode,
  categoryMapping?: Record<string, ImportCategoryMapping>,
): string | null {
  if (!categoryName || isProtectedUpdateImportMode(mode)) return null;
  return categoryMapping?.[categoryName]?.targetSubcategoryId ?? null;
}

export interface ResolveImportBrandOptions {
  tx: DbOrTx;
  orgId: string;
  brandName: string;
  mode: ImportMode;
  brandCache: Map<string, string>;
}

export async function resolveImportBrand({
  tx,
  orgId,
  brandName,
  mode,
  brandCache,
}: ResolveImportBrandOptions): Promise<string | null> {
  if (!brandName || isProtectedUpdateImportMode(mode)) return null;

  let brandId = brandCache.get(brandName.toLowerCase()) ?? null;
  if (brandId) return brandId;

  const slug = brandName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const [newBrand] = await tx
    .insert(brands)
    .values({
      orgId,
      name: brandName,
      slug: slug || `brand-${Date.now()}`,
    })
    .onConflictDoNothing()
    .returning({ id: brands.id });

  if (newBrand) {
    brandId = newBrand.id;
  } else {
    const [existing] = await tx
      .select({ id: brands.id })
      .from(brands)
      .where(and(eq(brands.orgId, orgId), eq(brands.slug, slug || `brand-${Date.now()}`)))
      .limit(1);
    brandId = existing?.id ?? null;
  }

  if (brandId) brandCache.set(brandName.toLowerCase(), brandId);
  return brandId;
}
