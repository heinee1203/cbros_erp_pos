import { db } from "@apex/database";
import {
  productOptionTypes,
  productOptionValues,
  productVariantOptions,
  products,
} from "@apex/database/schema";
import { eq, and, sql } from "drizzle-orm";

export interface OptionValueRow {
  id: string;
  value: string;
  sortOrder: number;
}

export interface OptionTypeRow {
  id: string;
  name: string;
  sortOrder: number;
  values: OptionValueRow[];
}

export async function listOptionTypes(
  productId: string,
  orgId: string,
): Promise<OptionTypeRow[]> {
  const types = await db
    .select({
      id: productOptionTypes.id,
      name: productOptionTypes.name,
      sortOrder: productOptionTypes.sortOrder,
    })
    .from(productOptionTypes)
    .where(
      and(
        eq(productOptionTypes.productId, productId),
        eq(productOptionTypes.orgId, orgId),
      ),
    )
    .orderBy(productOptionTypes.sortOrder);

  const result: OptionTypeRow[] = [];
  for (const type of types) {
    const values = await db
      .select({
        id: productOptionValues.id,
        value: productOptionValues.value,
        sortOrder: productOptionValues.sortOrder,
      })
      .from(productOptionValues)
      .where(eq(productOptionValues.optionTypeId, type.id))
      .orderBy(productOptionValues.sortOrder);

    result.push({ ...type, values });
  }

  return result;
}

export async function createOptionType(
  productId: string,
  orgId: string,
  name: string,
  values: string[],
): Promise<OptionTypeRow> {
  // Verify product exists
  const [product] = await db
    .select({ id: products.id, isParent: products.isParent })
    .from(products)
    .where(and(eq(products.id, productId), eq(products.orgId, orgId)));

  if (!product) throw new Error("Product not found");

  // Auto-promote to parent if not already
  if (!product.isParent) {
    await db
      .update(products)
      .set({ isParent: true })
      .where(eq(products.id, productId));
  }

  // Get next sort order
  const [maxSort] = await db
    .select({ max: sql<number>`COALESCE(MAX(${productOptionTypes.sortOrder}), -1)` })
    .from(productOptionTypes)
    .where(eq(productOptionTypes.productId, productId));

  const [type] = await db
    .insert(productOptionTypes)
    .values({
      orgId,
      productId,
      name,
      sortOrder: (maxSort?.max ?? -1) + 1,
    })
    .returning();

  const valueRows: OptionValueRow[] = [];
  for (let i = 0; i < values.length; i++) {
    const [val] = await db
      .insert(productOptionValues)
      .values({
        optionTypeId: type.id,
        value: values[i],
        sortOrder: i,
      })
      .returning();
    valueRows.push({ id: val.id, value: val.value, sortOrder: val.sortOrder });
  }

  return { id: type.id, name: type.name, sortOrder: type.sortOrder, values: valueRows };
}

export async function updateOptionType(
  typeId: string,
  orgId: string,
  name: string,
): Promise<void> {
  const [existing] = await db
    .select({ id: productOptionTypes.id })
    .from(productOptionTypes)
    .where(and(eq(productOptionTypes.id, typeId), eq(productOptionTypes.orgId, orgId)));

  if (!existing) throw new Error("Option type not found");

  await db
    .update(productOptionTypes)
    .set({ name })
    .where(eq(productOptionTypes.id, typeId));
}

export async function deleteOptionType(typeId: string, orgId: string): Promise<void> {
  const [existing] = await db
    .select({ id: productOptionTypes.id })
    .from(productOptionTypes)
    .where(and(eq(productOptionTypes.id, typeId), eq(productOptionTypes.orgId, orgId)));

  if (!existing) throw new Error("Option type not found");

  await db.delete(productOptionTypes).where(eq(productOptionTypes.id, typeId));
}

export async function addOptionValue(
  typeId: string,
  orgId: string,
  value: string,
): Promise<OptionValueRow> {
  const [type] = await db
    .select({ id: productOptionTypes.id })
    .from(productOptionTypes)
    .where(and(eq(productOptionTypes.id, typeId), eq(productOptionTypes.orgId, orgId)));

  if (!type) throw new Error("Option type not found");

  const [maxSort] = await db
    .select({ max: sql<number>`COALESCE(MAX(${productOptionValues.sortOrder}), -1)` })
    .from(productOptionValues)
    .where(eq(productOptionValues.optionTypeId, typeId));

  const [val] = await db
    .insert(productOptionValues)
    .values({
      optionTypeId: typeId,
      value,
      sortOrder: (maxSort?.max ?? -1) + 1,
    })
    .returning();

  return { id: val.id, value: val.value, sortOrder: val.sortOrder };
}

export async function updateOptionValue(
  valueId: string,
  orgId: string,
  value: string,
): Promise<void> {
  const rows = await db
    .select({ id: productOptionValues.id })
    .from(productOptionValues)
    .innerJoin(productOptionTypes, eq(productOptionValues.optionTypeId, productOptionTypes.id))
    .where(and(eq(productOptionValues.id, valueId), eq(productOptionTypes.orgId, orgId)));

  if (rows.length === 0) throw new Error("Option value not found");

  await db
    .update(productOptionValues)
    .set({ value })
    .where(eq(productOptionValues.id, valueId));
}

export async function deleteOptionValue(valueId: string, orgId: string): Promise<void> {
  const rows = await db
    .select({ id: productOptionValues.id })
    .from(productOptionValues)
    .innerJoin(productOptionTypes, eq(productOptionValues.optionTypeId, productOptionTypes.id))
    .where(and(eq(productOptionValues.id, valueId), eq(productOptionTypes.orgId, orgId)));

  if (rows.length === 0) throw new Error("Option value not found");

  const [usage] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(productVariantOptions)
    .where(eq(productVariantOptions.optionValueId, valueId));

  if (Number(usage.count) > 0) {
    throw new Error(`Cannot delete option value used by ${usage.count} variant(s)`);
  }

  await db.delete(productOptionValues).where(eq(productOptionValues.id, valueId));
}
