import { db } from "@apex/database";
import {
  products,
  inventory,
  productVariantOptions,
  productOptionValues,
  productOptionTypes,
  brands,
} from "@apex/database/schema";
import { eq, and, sql, asc } from "drizzle-orm";
import { generateEan13 } from "@apex/types";

export interface VariantRow {
  id: string;
  name: string;
  sku: string;
  mnemonicSku: string;
  unitPrice: string;
  costPrice: string;
  barcode: string | null;
  isVariablePrice: boolean;
  isActive: boolean;
  options: Array<{ typeName: string; value: string }>;
  stockLevel: number;
}

function generateMnemonicSku(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let result = "";
  for (let i = 0; i < 10; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

export async function listVariants(
  parentId: string,
  orgId: string,
  locationId?: string,
): Promise<VariantRow[]> {
  const variants = await db
    .select({
      id: products.id,
      name: products.name,
      sku: products.sku,
      mnemonicSku: products.mnemonicSku,
      unitPrice: products.unitPrice,
      costPrice: products.costPrice,
      barcode: products.barcode,
      isVariablePrice: products.isVariablePrice,
      isActive: products.isActive,
    })
    .from(products)
    .where(
      and(
        eq(products.parentProductId, parentId),
        eq(products.orgId, orgId),
      ),
    )
    .orderBy(asc(products.sku));

  const result: VariantRow[] = [];
  for (const v of variants) {
    const options = await db
      .select({
        typeName: productOptionTypes.name,
        value: productOptionValues.value,
      })
      .from(productVariantOptions)
      .innerJoin(productOptionValues, eq(productVariantOptions.optionValueId, productOptionValues.id))
      .innerJoin(productOptionTypes, eq(productOptionValues.optionTypeId, productOptionTypes.id))
      .where(eq(productVariantOptions.productId, v.id))
      .orderBy(productOptionTypes.sortOrder);

    const [inv] = await db
      .select({ stockLevel: inventory.stockLevel })
      .from(inventory)
      .where(and(
        eq(inventory.productId, v.id),
        ...(locationId ? [eq(inventory.locationId, locationId)] : []),
      ))
      .limit(1);

    result.push({
      ...v,
      options,
      stockLevel: inv?.stockLevel ?? 0,
    });
  }

  return result;
}

export async function createVariant(
  parentId: string,
  orgId: string,
  input: {
    sku: string;
    name?: string;
    mnemonicSku?: string;
    unitPrice?: string;
    costPrice?: string;
    barcode?: string;
    isVariablePrice?: boolean;
    optionValueIds: string[];
  },
): Promise<{ id: string; sku: string }> {
  const [parent] = await db
    .select({
      id: products.id,
      isParent: products.isParent,
      category: products.category,
      categoryId: products.categoryId,
      subcategoryId: products.subcategoryId,
      familyId: products.familyId,
      name: products.name,
    })
    .from(products)
    .where(and(eq(products.id, parentId), eq(products.orgId, orgId)));

  if (!parent) throw new Error("Parent product not found");
  if (!parent.isParent) throw new Error("Product is not a parent product");

  // Check SKU uniqueness
  const [existingSku] = await db
    .select({ id: products.id })
    .from(products)
    .where(and(eq(products.orgId, orgId), eq(products.sku, input.sku)));

  if (existingSku) throw new Error(`SKU "${input.sku}" already exists`);

  // Generate mnemonic SKU if not provided
  let mnemonicSku = input.mnemonicSku;
  if (!mnemonicSku) {
    for (let attempt = 0; attempt < 20; attempt++) {
      const candidate = generateMnemonicSku();
      const [dup] = await db
        .select({ id: products.id })
        .from(products)
        .where(and(eq(products.orgId, orgId), eq(products.mnemonicSku, candidate)));
      if (!dup) {
        mnemonicSku = candidate;
        break;
      }
    }
    if (!mnemonicSku) throw new Error("Failed to generate unique mnemonic SKU");
  }

  // Generate barcode if not provided
  let barcode = input.barcode;
  if (!barcode) {
    for (let attempt = 0; attempt < 10; attempt++) {
      const candidate = generateEan13();
      const [dup] = await db
        .select({ id: products.id })
        .from(products)
        .where(and(eq(products.orgId, orgId), eq(products.barcode, candidate)));
      if (!dup) {
        barcode = candidate;
        break;
      }
    }
  }

  // Build a descriptive name from parent name + option values
  let variantName = input.name || parent.name;
  if (!input.name && input.optionValueIds.length > 0) {
    const optionVals = await db
      .select({ value: productOptionValues.value })
      .from(productOptionValues)
      .innerJoin(productOptionTypes, eq(productOptionValues.optionTypeId, productOptionTypes.id))
      .where(sql`${productOptionValues.id} IN ${input.optionValueIds}`)
      .orderBy(productOptionTypes.sortOrder);
    if (optionVals.length > 0) {
      variantName = `${parent.name} — ${optionVals.map((v) => v.value).join(" / ")}`;
    }
  }

  return await db.transaction(async (tx) => {
    const [variant] = await tx
      .insert(products)
      .values({
        orgId,
        name: variantName,
        sku: input.sku,
        mnemonicSku,
        category: parent.category,
        categoryId: parent.categoryId,
        subcategoryId: parent.subcategoryId,
        familyId: parent.familyId,
        unitPrice: input.unitPrice || "0.00",
        costPrice: input.costPrice || "0.00",
        barcode: barcode || null,
        isVariablePrice: input.isVariablePrice || false,
        parentProductId: parentId,
        isParent: false,
      })
      .returning();

    for (const valueId of input.optionValueIds) {
      await tx.insert(productVariantOptions).values({
        productId: variant.id,
        optionValueId: valueId,
      });
    }

    // Auto-set brand_id when one of the option types is "Brand"
    const variantOptions = await tx
      .select({
        typeName: productOptionTypes.name,
        value: productOptionValues.value,
      })
      .from(productVariantOptions)
      .innerJoin(productOptionValues, eq(productVariantOptions.optionValueId, productOptionValues.id))
      .innerJoin(productOptionTypes, eq(productOptionValues.optionTypeId, productOptionTypes.id))
      .where(eq(productVariantOptions.productId, variant.id));

    const brandOption = variantOptions.find(
      (o) => o.typeName.toLowerCase() === "brand",
    );

    if (brandOption) {
      // Look up existing brand (case-insensitive)
      let [matchedBrand] = await tx
        .select({ id: brands.id })
        .from(brands)
        .where(
          and(
            eq(brands.orgId, orgId),
            sql`LOWER(${brands.name}) = LOWER(${brandOption.value})`,
          ),
        )
        .limit(1);

      // Auto-create brand if it doesn't exist
      if (!matchedBrand) {
        const slug = brandOption.value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
        const [created] = await tx
          .insert(brands)
          .values({ orgId, name: brandOption.value, slug })
          .onConflictDoNothing()
          .returning();

        if (created) {
          matchedBrand = created;
        } else {
          // Concurrent insert race — re-query
          [matchedBrand] = await tx
            .select({ id: brands.id })
            .from(brands)
            .where(
              and(
                eq(brands.orgId, orgId),
                sql`LOWER(${brands.name}) = LOWER(${brandOption.value})`,
              ),
            )
            .limit(1);
        }
      }

      if (matchedBrand) {
        await tx
          .update(products)
          .set({ brandId: matchedBrand.id })
          .where(eq(products.id, variant.id));
      }
    }

    // Create inventory rows at all locations where parent has available_for_sale
    const parentLocations = await tx
      .select({ locationId: inventory.locationId })
      .from(inventory)
      .where(
        and(
          eq(inventory.productId, parentId),
          eq(inventory.availableForSale, true),
        ),
      );

    for (const loc of parentLocations) {
      await tx.insert(inventory).values({
        orgId,
        productId: variant.id,
        locationId: loc.locationId,
        stockLevel: 0,
        reorderPoint: 10,
        leadTimeDays: 7,
      });
    }

    return { id: variant.id, sku: variant.sku };
  });
}

export async function createVariantBatch(
  parentId: string,
  orgId: string,
  variants: Array<{
    sku: string;
    name?: string;
    mnemonicSku?: string;
    unitPrice?: string;
    costPrice?: string;
    barcode?: string;
    isVariablePrice?: boolean;
    optionValueIds: string[];
  }>,
): Promise<Array<{ id: string; sku: string }>> {
  const results: Array<{ id: string; sku: string }> = [];
  for (const v of variants) {
    const result = await createVariant(parentId, orgId, v);
    results.push(result);
  }
  return results;
}

export async function deleteVariant(
  variantId: string,
  orgId: string,
): Promise<void> {
  const [variant] = await db
    .select({ id: products.id, parentProductId: products.parentProductId })
    .from(products)
    .where(and(eq(products.id, variantId), eq(products.orgId, orgId)));

  if (!variant) throw new Error("Variant not found");
  if (!variant.parentProductId) throw new Error("Product is not a variant");

  await db.delete(products).where(eq(products.id, variantId));
}

/**
 * Convert a parent product back to a regular (non-parent) product.
 * Deletes all variants, option types (cascade deletes values + variant options), and sets isParent = false.
 */
export async function convertToRegular(
  productId: string,
  orgId: string,
): Promise<void> {
  const [product] = await db
    .select({ id: products.id, isParent: products.isParent })
    .from(products)
    .where(and(eq(products.id, productId), eq(products.orgId, orgId)));

  if (!product) throw new Error("Product not found");
  if (!product.isParent) throw new Error("Product is not a parent product");

  await db.transaction(async (tx) => {
    // 1. Delete all variant products (children) — CASCADE handles inventory, variant_options
    await tx
      .delete(products)
      .where(and(eq(products.parentProductId, productId), eq(products.orgId, orgId)));

    // 2. Delete all option types (CASCADE handles option values via FK)
    await tx
      .delete(productOptionTypes)
      .where(and(eq(productOptionTypes.productId, productId), eq(productOptionTypes.orgId, orgId)));

    // 3. Set isParent = false
    await tx
      .update(products)
      .set({ isParent: false })
      .where(eq(products.id, productId));
  });
}
