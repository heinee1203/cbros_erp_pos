import type { DbOrTx } from "@apex/database";
import { auditLogs, inventory, products } from "@apex/database/schema";
import { and, desc, eq, inArray } from "drizzle-orm";
import type { ImportMode } from "./execution-utils";
import type { ParsedRow } from "./types";

export const ITEM_IMPORT_AUDIT_ACTION = "ITEM_IMPORT_EXECUTE";
export const ITEM_IMPORT_AUDIT_ENTITY = "item_import";
export const ITEM_IMPORT_FIELD_SCOPE_VERSION = "item-import-field-scope-v1";

export type ImportAuditMetadata = {
  id: string;
  action: typeof ITEM_IMPORT_AUDIT_ACTION;
  entityType: typeof ITEM_IMPORT_AUDIT_ENTITY;
  entityId: string;
  mode: ImportMode;
  fileName: string | null;
  rowSnapshotCount: number;
  createdAt: string;
};

export type ImportAuditProductSnapshot = Record<string, unknown> | null;
export type ImportAuditInventorySnapshot = Record<string, unknown> | null;

export type ImportAuditInventoryRowSnapshot = {
  locationId: string;
  csvLocationName: string;
  before: ImportAuditInventorySnapshot;
  after: ImportAuditInventorySnapshot;
};

export type ImportAuditRowSnapshot = {
  rowIndex: number;
  sku: string;
  name: string;
  action: ParsedRow["action"];
  result: "created" | "updated";
  productId: string | null;
  changes: string[];
  product: {
    before: ImportAuditProductSnapshot;
    after: ImportAuditProductSnapshot;
  };
  inventory: ImportAuditInventoryRowSnapshot[];
};

export function getItemImportFieldScope(mode: ImportMode) {
  if (mode === "update_only") {
    return {
      version: ITEM_IMPORT_FIELD_SCOPE_VERSION,
      mode,
      allowedFields: ["barcode", "quantity", "selling_price"],
      lockedFields: [
        "brand",
        "category",
        "subcategory",
        "name",
        "description",
        "variants",
        "availability_flags",
        "reorder_fields",
        "cost_price",
        "oem_number",
        "selling_unit",
        "serialized_flags",
        "special_order_flags",
      ],
    };
  }

  if (mode === "inventory_sync") {
    return {
      version: ITEM_IMPORT_FIELD_SCOPE_VERSION,
      mode,
      allowedFields: [
        "selling_price",
        "cost_price",
        "variable_price_flag",
        "quantity",
        "availability_flags",
        "reorder_fields",
      ],
      lockedFields: [
        "brand",
        "category",
        "subcategory",
        "name",
        "description",
        "barcode",
        "variants",
        "oem_number",
        "selling_unit",
        "serialized_flags",
        "special_order_flags",
      ],
    };
  }

  if (mode === "create_only") {
    return {
      version: ITEM_IMPORT_FIELD_SCOPE_VERSION,
      mode,
      allowedFields: ["new_product_identity", "new_product_taxonomy", "new_product_prices", "new_product_stock"],
      lockedFields: ["all_existing_product_fields", "all_existing_inventory_fields"],
    };
  }

  return {
    version: ITEM_IMPORT_FIELD_SCOPE_VERSION,
    mode,
    allowedFields: ["catalog_fields", "taxonomy_fields", "pricing_fields", "inventory_fields", "variant_fields"],
    lockedFields: ["fields_not_present_in_csv", "rows_blocked_by_validation_or_preview_toggles"],
  };
}

export function isUuid(value: string | null | undefined): value is string {
  return Boolean(
    value &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value),
  );
}

export function sanitizeImportFileName(fileName: string | null | undefined): string | null {
  const trimmed = fileName?.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, 255);
}

export async function captureImportRowBeforeSnapshot({
  tx,
  orgId,
  row,
}: {
  tx: DbOrTx;
  orgId: string;
  row: ParsedRow;
}): Promise<Pick<ImportAuditRowSnapshot, "product" | "inventory">> {
  const productId = row.existingProductId;
  const productBefore = productId ? await selectProductSnapshot(tx, orgId, productId) : null;
  const inventoryBefore = productId
    ? await selectInventorySnapshots(tx, orgId, productId, row)
    : emptyInventorySnapshots(row);

  return {
    product: { before: productBefore, after: null },
    inventory: inventoryBefore.map((snapshot) => ({ ...snapshot, after: null })),
  };
}

export async function captureImportRowAfterSnapshot({
  tx,
  orgId,
  row,
  before,
  result,
}: {
  tx: DbOrTx;
  orgId: string;
  row: ParsedRow;
  before: Pick<ImportAuditRowSnapshot, "product" | "inventory"> | null;
  result: "created" | "updated";
}): Promise<ImportAuditRowSnapshot> {
  const productId = row.existingProductId ?? (await findProductIdBySku(tx, orgId, row.sku));
  const productAfter = productId ? await selectProductSnapshot(tx, orgId, productId) : null;
  const inventoryAfter = productId
    ? await selectInventorySnapshots(tx, orgId, productId, row)
    : emptyInventorySnapshots(row);
  const beforeInventory = before?.inventory ?? emptyInventorySnapshots(row);

  return {
    rowIndex: row.rowIndex,
    sku: row.sku,
    name: row.name,
    action: row.action,
    result,
    productId,
    changes: row.changes,
    product: {
      before: before?.product.before ?? null,
      after: productAfter,
    },
    inventory: mergeInventorySnapshots(beforeInventory, inventoryAfter),
  };
}

export async function insertItemImportAuditLog({
  db,
  orgId,
  userId,
  ipAddress,
  previewToken,
  mode,
  fileName,
  startedAt,
  completedAt,
  durationMs,
  counts,
  selectedMappings,
  rowSnapshots,
}: {
  db: DbOrTx;
  orgId: string;
  userId?: string | null;
  ipAddress?: string | null;
  previewToken: string;
  mode: ImportMode;
  fileName?: string | null;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  counts: {
    totalRows: number;
    created: number;
    updated: number;
    skipped: number;
    noChange: number;
    errors: number;
  };
  selectedMappings: {
    locationMapping?: Record<string, string>;
    categoryMapping?: unknown;
    createNewCategories?: boolean;
  };
  rowSnapshots: ImportAuditRowSnapshot[];
}): Promise<ImportAuditMetadata> {
  const safeFileName = sanitizeImportFileName(fileName);
  const [created] = await db
    .insert(auditLogs)
    .values({
      orgId,
      userId: isUuid(userId) ? userId : null,
      action: ITEM_IMPORT_AUDIT_ACTION,
      entityType: ITEM_IMPORT_AUDIT_ENTITY,
      entityId: previewToken,
      ipAddress: ipAddress ?? null,
      details: {
        mode,
        fileName: safeFileName,
        startedAt,
        completedAt,
        durationMs,
        counts,
        selectedMappings,
        fieldScope: getItemImportFieldScope(mode),
        rowSnapshotCount: rowSnapshots.length,
        rowSnapshots,
      },
    })
    .returning({ id: auditLogs.id, createdAt: auditLogs.createdAt });

  return {
    id: created.id,
    action: ITEM_IMPORT_AUDIT_ACTION,
    entityType: ITEM_IMPORT_AUDIT_ENTITY,
    entityId: previewToken,
    mode,
    fileName: safeFileName,
    rowSnapshotCount: rowSnapshots.length,
    createdAt:
      created.createdAt instanceof Date
        ? created.createdAt.toISOString()
        : new Date(created.createdAt).toISOString(),
  };
}

async function selectProductSnapshot(
  tx: DbOrTx,
  orgId: string,
  productId: string,
): Promise<ImportAuditProductSnapshot> {
  const [product] = await tx
    .select({
      id: products.id,
      orgId: products.orgId,
      name: products.name,
      sku: products.sku,
      mnemonicSku: products.mnemonicSku,
      barcode: products.barcode,
      unitPrice: products.unitPrice,
      costPrice: products.costPrice,
      isVariablePrice: products.isVariablePrice,
      category: products.category,
      categoryId: products.categoryId,
      subcategoryId: products.subcategoryId,
      familyId: products.familyId,
      brandId: products.brandId,
      parentProductId: products.parentProductId,
      isParent: products.isParent,
      oemNumber: products.oemNumber,
      description: products.description,
      sellingUnit: products.sellingUnit,
      isActive: products.isActive,
      isSerialized: products.isSerialized,
      isTire: products.isTire,
      specialOrder: products.specialOrder,
      discontinued: products.discontinued,
      updatedAt: products.updatedAt,
    })
    .from(products)
    .where(and(eq(products.id, productId), eq(products.orgId, orgId)))
    .limit(1);

  return product ? serializeDates(product) : null;
}

async function findProductIdBySku(
  tx: DbOrTx,
  orgId: string,
  sku: string,
): Promise<string | null> {
  const [product] = await tx
    .select({ id: products.id })
    .from(products)
    .where(and(eq(products.orgId, orgId), eq(products.sku, sku)))
    .orderBy(desc(products.createdAt))
    .limit(1);

  return product?.id ?? null;
}

async function selectInventorySnapshots(
  tx: DbOrTx,
  orgId: string,
  productId: string,
  row: ParsedRow,
): Promise<ImportAuditInventoryRowSnapshot[]> {
  const locationIds = row.locations
    .map((location) => location.apexLocationId)
    .filter((locationId): locationId is string => Boolean(locationId));

  if (locationIds.length === 0) return [];

  const rows = await tx
    .select({
      id: inventory.id,
      orgId: inventory.orgId,
      productId: inventory.productId,
      locationId: inventory.locationId,
      stockLevel: inventory.stockLevel,
      reservedLevel: inventory.reservedLevel,
      reorderPoint: inventory.reorderPoint,
      optimalStock: inventory.optimalStock,
      leadTimeDays: inventory.leadTimeDays,
      availableForSale: inventory.availableForSale,
      updatedAt: inventory.updatedAt,
    })
    .from(inventory)
    .where(
      and(
        eq(inventory.orgId, orgId),
        eq(inventory.productId, productId),
        inArray(inventory.locationId, locationIds),
      ),
    );

  const byLocationId = new Map(rows.map((snapshot) => [snapshot.locationId, serializeDates(snapshot)]));
  return row.locations
    .filter((location) => location.apexLocationId)
    .map((location) => ({
      locationId: location.apexLocationId!,
      csvLocationName: location.csvLocationName,
      before: byLocationId.get(location.apexLocationId!) ?? null,
      after: null,
    }));
}

function emptyInventorySnapshots(row: ParsedRow): ImportAuditInventoryRowSnapshot[] {
  return row.locations
    .filter((location) => location.apexLocationId)
    .map((location) => ({
      locationId: location.apexLocationId!,
      csvLocationName: location.csvLocationName,
      before: null,
      after: null,
    }));
}

function mergeInventorySnapshots(
  before: ImportAuditInventoryRowSnapshot[],
  after: ImportAuditInventoryRowSnapshot[],
): ImportAuditInventoryRowSnapshot[] {
  const afterByLocation = new Map(after.map((snapshot) => [snapshot.locationId, snapshot]));
  return before.map((snapshot) => ({
    ...snapshot,
    after: afterByLocation.get(snapshot.locationId)?.before ?? null,
  }));
}

function serializeDates<T extends Record<string, unknown>>(row: T): Record<string, unknown> {
  const serialized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    serialized[key] = value instanceof Date ? value.toISOString() : value;
  }
  return serialized;
}
