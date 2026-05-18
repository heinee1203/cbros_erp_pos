import { brands, categories } from "@apex/database/schema";
import { eq } from "drizzle-orm";

export interface TaxonomyNameRecord {
  id: string;
  name: string;
}

export interface ImportTaxonomyCaches {
  categoryCache: Map<string, string>;
  brandCache: Map<string, string>;
}

export function buildNameIdCache(records: TaxonomyNameRecord[]): Map<string, string> {
  const cache = new Map<string, string>();

  for (const record of records) {
    cache.set(record.name.toLowerCase(), record.id);
  }

  return cache;
}

export async function loadOrgCategoryNames(orgId: string): Promise<TaxonomyNameRecord[]> {
  const { db } = await import("@apex/database");
  return db
    .select({ id: categories.id, name: categories.name })
    .from(categories)
    .where(eq(categories.orgId, orgId));
}

export async function loadImportTaxonomyCaches(orgId: string): Promise<ImportTaxonomyCaches> {
  const { db } = await import("@apex/database");
  const [orgCategories, orgBrands] = await Promise.all([
    loadOrgCategoryNames(orgId),
    db
      .select({ id: brands.id, name: brands.name })
      .from(brands)
      .where(eq(brands.orgId, orgId)),
  ]);

  return {
    categoryCache: buildNameIdCache(orgCategories),
    brandCache: buildNameIdCache(orgBrands),
  };
}
