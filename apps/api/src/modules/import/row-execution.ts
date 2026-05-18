import type { DbOrTx } from "@apex/database";
import { products } from "@apex/database/schema";
import { generateEan13 } from "@apex/types";
import { eq } from "drizzle-orm";
import type { ParsedRow } from "./types";
import { shouldSkipForImportMode, type ImportMode } from "./execution-utils";
import {
  insertInventoryForProduct,
  upsertInventoryForProduct,
  upsertInventoryQuantityForProduct,
} from "./inventory-writes";
import {
  buildImportProductInsert,
  buildImportProductUpdateFields,
  buildInventorySyncPriceFields,
} from "./product-field-builders";
import {
  resolveImportBrand,
  resolveImportCategory,
  resolveImportSubcategory,
  type ImportCategoryMapping,
} from "./taxonomy-writes";
import { upsertOptionLinks } from "./variant-writes";

export type ImportRowExecutionResult = "created" | "updated" | "skipped" | "none";

export type GenerateImportMnemonicSku = (
  orgId: string,
  productName: string,
  dbOrTx: DbOrTx,
) => Promise<string>;

export interface ExecuteImportRowWriteOptions {
  tx: DbOrTx;
  orgId: string;
  row: ParsedRow;
  mode: ImportMode;
  categoryMapping?: Record<string, ImportCategoryMapping>;
  createNewCategories?: boolean;
  categoryCache: Map<string, string>;
  brandCache: Map<string, string>;
  parentProductMap: Map<string, string>;
  generateMnemonicSku: GenerateImportMnemonicSku;
  generateBarcode?: () => string;
}

export function shouldUseInventorySyncFastPath(
  row: Pick<ParsedRow, "action" | "existingProductId">,
  mode: ImportMode,
): boolean {
  return mode === "inventory_sync" && row.action === "UPDATE" && Boolean(row.existingProductId);
}

export function resolveVariantParentProductId(
  row: Pick<ParsedRow, "isVariant" | "handle">,
  parentProductMap: Map<string, string>,
): string | null {
  return row.isVariant && row.handle ? parentProductMap.get(row.handle) ?? null : null;
}

async function executeInventorySyncFastPath(
  tx: DbOrTx,
  orgId: string,
  row: ParsedRow,
): Promise<ImportRowExecutionResult> {
  const priceFields = buildInventorySyncPriceFields(row);
  if (Object.keys(priceFields).length > 0) {
    await tx.update(products).set(priceFields).where(eq(products.id, row.existingProductId!));
  }

  await upsertInventoryForProduct(tx, orgId, row.existingProductId!, row.locations);
  return "updated";
}

async function createImportRowProduct({
  tx,
  orgId,
  row,
  mode,
  categoryId,
  subcategoryId,
  brandId,
  parentProductMap,
  generateMnemonicSku,
  generateBarcode,
}: ExecuteImportRowWriteOptions & {
  categoryId: string | null;
  subcategoryId: string | null;
  brandId: string | null;
  generateBarcode: () => string;
}): Promise<ImportRowExecutionResult> {
  const mnemonicSku = await generateMnemonicSku(orgId, row.name, tx);
  const barcode = row.barcode || generateBarcode();
  const parentProductId = resolveVariantParentProductId(row, parentProductMap);

  const [product] = await tx
    .insert(products)
    .values(
      buildImportProductInsert({
        orgId,
        row,
        mnemonicSku,
        barcode,
        parentProductId,
        categoryId,
        subcategoryId,
        brandId,
        mode,
      }),
    )
    .returning({ id: products.id });

  await insertInventoryForProduct(tx, orgId, product.id, row.locations);

  if (row.isVariant && parentProductId) {
    await upsertOptionLinks(tx, orgId, parentProductId, product.id, row);
  }

  return "created";
}

async function updateImportRowProduct({
  tx,
  orgId,
  row,
  mode,
  parentProductMap,
}: Pick<ExecuteImportRowWriteOptions, "tx" | "orgId" | "row" | "mode" | "parentProductMap">): Promise<ImportRowExecutionResult> {
  if (row.action !== "UPDATE" || !row.existingProductId) return "none";

  const updateFields = buildImportProductUpdateFields(row, mode);
  if (Object.keys(updateFields).length > 0) {
    await tx.update(products).set(updateFields).where(eq(products.id, row.existingProductId));
  }

  if (mode === "update_only") {
    await upsertInventoryQuantityForProduct(tx, orgId, row.existingProductId, row.locations);
    return "updated";
  }

  await upsertInventoryForProduct(tx, orgId, row.existingProductId, row.locations);

  if (row.isVariant && row.handle) {
    const parentId = parentProductMap.get(row.handle);
    if (parentId) {
      await upsertOptionLinks(tx, orgId, parentId, row.existingProductId, row);
    }
  }

  return "updated";
}

export async function executeImportRowWrite({
  tx,
  orgId,
  row,
  mode,
  categoryMapping,
  createNewCategories,
  categoryCache,
  brandCache,
  parentProductMap,
  generateMnemonicSku,
  generateBarcode = generateEan13,
}: ExecuteImportRowWriteOptions): Promise<ImportRowExecutionResult> {
  if (shouldUseInventorySyncFastPath(row, mode)) {
    return executeInventorySyncFastPath(tx, orgId, row);
  }

  const categoryId = await resolveImportCategory({
    tx,
    orgId,
    categoryName: row.categoryName,
    mode,
    categoryMapping,
    createNewCategories,
    categoryCache,
  });
  const subcategoryId = resolveImportSubcategory(row.categoryName, mode, categoryMapping);
  const brandId = await resolveImportBrand({
    tx,
    orgId,
    brandName: row.brandName,
    mode,
    brandCache,
  });

  if (shouldSkipForImportMode(mode, row.action)) {
    return "skipped";
  }

  if (row.action === "CREATE") {
    return createImportRowProduct({
      tx,
      orgId,
      row,
      mode,
      categoryMapping,
      createNewCategories,
      categoryCache,
      brandCache,
      parentProductMap,
      generateMnemonicSku,
      generateBarcode,
      categoryId,
      subcategoryId,
      brandId,
    });
  }

  return updateImportRowProduct({ tx, orgId, row, mode, parentProductMap });
}
