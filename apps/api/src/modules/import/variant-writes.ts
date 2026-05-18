import type { DbOrTx } from "@apex/database";
import {
  products,
  productOptionTypes,
  productOptionValues,
  productVariantOptions,
} from "@apex/database/schema";
import { and, eq } from "drizzle-orm";
import { isProtectedUpdateImportMode, type ImportMode } from "./execution-utils";
import {
  buildParentImportSku,
  buildParentProductInsert,
} from "./product-field-builders";

export interface VariantParentRow {
  isVariant: boolean;
  handle: string;
  parentName: string;
  name: string;
  categoryName: string;
  brandName: string;
}

export interface VariantOptionRow {
  option1Name: string;
  option1Value: string;
  option2Name: string;
  option2Value: string;
  option3Name: string;
  option3Value: string;
}

export function collectVariantHandles(rows: VariantParentRow[]): string[] {
  return [...new Set(rows.filter((row) => row.isVariant && row.handle).map((row) => row.handle))];
}

export function selectVariantParentRow(rows: VariantParentRow[]): VariantParentRow {
  return rows.find((row) => row.parentName) || rows[0];
}

export function resolveParentTaxonomyIds(
  parentRow: VariantParentRow,
  mode: ImportMode,
  categoryCache: Map<string, string>,
  brandCache: Map<string, string>,
): { parentCategoryId: string | null; parentBrandId: string | null } {
  if (isProtectedUpdateImportMode(mode)) {
    return { parentCategoryId: null, parentBrandId: null };
  }

  return {
    parentCategoryId: parentRow.categoryName
      ? categoryCache.get(parentRow.categoryName.toLowerCase()) ?? null
      : null,
    parentBrandId: parentRow.brandName ? brandCache.get(parentRow.brandName.toLowerCase()) ?? null : null,
  };
}

export function buildVariantOptionPairs(
  row: VariantOptionRow,
): Array<{ name: string; value: string; sort: number }> {
  const optionPairs: Array<{ name: string; value: string; sort: number }> = [];
  if (row.option1Name && row.option1Value)
    optionPairs.push({ name: row.option1Name, value: row.option1Value, sort: 0 });
  if (row.option2Name && row.option2Value)
    optionPairs.push({ name: row.option2Name, value: row.option2Value, sort: 1 });
  if (row.option3Name && row.option3Value)
    optionPairs.push({ name: row.option3Name, value: row.option3Value, sort: 2 });
  return optionPairs;
}

export interface PrecreateVariantParentsOptions {
  orgId: string;
  rows: VariantParentRow[];
  mode: ImportMode;
  categoryCache: Map<string, string>;
  brandCache: Map<string, string>;
  generateMnemonicSku: (orgId: string, productName: string, dbOrTx: DbOrTx) => Promise<string>;
}

export async function precreateVariantParents({
  orgId,
  rows,
  mode,
  categoryCache,
  brandCache,
  generateMnemonicSku,
}: PrecreateVariantParentsOptions): Promise<Map<string, string>> {
  const parentProductMap = new Map<string, string>();
  if (mode === "update_only") return parentProductMap;

  const variantHandles = collectVariantHandles(rows);

  if (variantHandles.length === 0) return parentProductMap;

  const { db } = await import("@apex/database");
  await db.transaction(async (tx) => {
    for (const handle of variantHandles) {
      const groupRows = rows.filter((row) => row.handle === handle);
      const parentRow = selectVariantParentRow(groupRows);
      const parentName = parentRow.parentName || parentRow.name;

      const [existingParent] = await tx
        .select({ id: products.id })
        .from(products)
        .where(
          and(
            eq(products.orgId, orgId),
            eq(products.name, parentName),
            eq(products.isParent, true),
          ),
        )
        .limit(1);

      if (existingParent) {
        parentProductMap.set(handle, existingParent.id);
        continue;
      }

      const parentMnemonic = await generateMnemonicSku(orgId, parentName, tx as unknown as DbOrTx);
      const parentSku = buildParentImportSku();
      const { parentCategoryId, parentBrandId } = resolveParentTaxonomyIds(
        parentRow,
        mode,
        categoryCache,
        brandCache,
      );

      const [newParent] = await tx
        .insert(products)
        .values(
          buildParentProductInsert({
            orgId,
            parentName,
            parentSku,
            parentMnemonic,
            parentCategoryId,
            parentBrandId,
          }),
        )
        .returning({ id: products.id });

      if (newParent) {
        parentProductMap.set(handle, newParent.id);
      }
    }
  });

  return parentProductMap;
}

export async function upsertOptionLinks(
  tx: DbOrTx,
  orgId: string,
  parentProductId: string,
  variantProductId: string,
  row: VariantOptionRow,
): Promise<void> {
  const optionPairs = buildVariantOptionPairs(row);

  for (const { name, value, sort } of optionPairs) {
    const [existingType] = await tx
      .select({ id: productOptionTypes.id })
      .from(productOptionTypes)
      .where(
        and(
          eq(productOptionTypes.orgId, orgId),
          eq(productOptionTypes.productId, parentProductId),
          eq(productOptionTypes.name, name),
        ),
      )
      .limit(1);

    let optTypeId: string;
    if (existingType) {
      optTypeId = existingType.id;
    } else {
      const [newType] = await tx
        .insert(productOptionTypes)
        .values({
          orgId,
          productId: parentProductId,
          name,
          sortOrder: sort,
        })
        .returning({ id: productOptionTypes.id });
      optTypeId = newType.id;
    }

    const [existingVal] = await tx
      .select({ id: productOptionValues.id })
      .from(productOptionValues)
      .where(and(eq(productOptionValues.optionTypeId, optTypeId), eq(productOptionValues.value, value)))
      .limit(1);

    let optValId: string;
    if (existingVal) {
      optValId = existingVal.id;
    } else {
      const [newVal] = await tx
        .insert(productOptionValues)
        .values({
          optionTypeId: optTypeId,
          value,
          sortOrder: 0,
        })
        .returning({ id: productOptionValues.id });
      optValId = newVal.id;
    }

    await tx
      .insert(productVariantOptions)
      .values({
        productId: variantProductId,
        optionValueId: optValId,
      })
      .onConflictDoNothing();
  }
}
