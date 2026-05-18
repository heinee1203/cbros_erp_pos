import { db, type DbOrTx } from "@apex/database";
import { auditLogs, inventory, products } from "@apex/database/schema";
import { and, desc, eq } from "drizzle-orm";
import {
  ITEM_IMPORT_AUDIT_ACTION,
  ITEM_IMPORT_AUDIT_ENTITY,
  type ImportAuditInventoryRowSnapshot,
  type ImportAuditMetadata,
  type ImportAuditRowSnapshot,
} from "./import-audit";
import type { ImportMode } from "./execution-utils";

export const ITEM_IMPORT_ROLLBACK_ACTION = "ITEM_IMPORT_ROLLBACK";

const PRODUCT_RESTORE_FIELDS = [
  "name",
  "sku",
  "mnemonicSku",
  "barcode",
  "unitPrice",
  "costPrice",
  "isVariablePrice",
  "category",
  "categoryId",
  "subcategoryId",
  "familyId",
  "brandId",
  "parentProductId",
  "isParent",
  "oemNumber",
  "description",
  "sellingUnit",
  "isActive",
  "isSerialized",
  "isTire",
  "specialOrder",
  "discontinued",
] as const;

const INVENTORY_RESTORE_FIELDS = [
  "stockLevel",
  "reorderPoint",
  "optimalStock",
  "availableForSale",
] as const;

type Snapshot = Record<string, unknown> | null;

export type ImportRollbackConflict = {
  rowIndex: number;
  sku: string;
  name: string;
  entity: "product" | "inventory";
  field: string;
  reason: string;
  beforeValue: unknown;
  expectedAfterValue: unknown;
  currentValue: unknown;
};

export type ImportRollbackSkippedRow = {
  rowIndex: number;
  sku: string;
  name: string;
  reason: string;
};

export type ImportRollbackSummary = {
  rowsScanned: number;
  updatedRows: number;
  createdRowsSkipped: number;
  restorableFields: number;
  restoredFields: number;
  alreadyRestoredFields: number;
  conflictedFields: number;
  skippedRows: number;
};

export type ImportRollbackResult = {
  dryRun: boolean;
  audit: ImportAuditMetadata | null;
  summary: ImportRollbackSummary;
  conflicts: ImportRollbackConflict[];
  skipped: ImportRollbackSkippedRow[];
  appliedAt?: string;
};

type ItemImportAuditDetails = {
  mode?: ImportMode;
  fileName?: string | null;
  rowSnapshotCount?: number;
  rowSnapshots?: ImportAuditRowSnapshot[];
};

type LoadedImportAudit = {
  id: string;
  entityId: string | null;
  createdAt: Date;
  details: ItemImportAuditDetails;
};

type FieldRestorePlan = {
  updates: Record<string, unknown>;
  conflicts: Array<{
    field: string;
    beforeValue: unknown;
    expectedAfterValue: unknown;
    currentValue: unknown;
    reason: string;
  }>;
  restorableFields: number;
  alreadyRestoredFields: number;
};

export function buildFieldRestorePlan({
  before,
  after,
  current,
  fields,
}: {
  before: Snapshot;
  after: Snapshot;
  current: Snapshot;
  fields: readonly string[];
}): FieldRestorePlan {
  const plan: FieldRestorePlan = {
    updates: {},
    conflicts: [],
    restorableFields: 0,
    alreadyRestoredFields: 0,
  };

  if (!before || !after || !current) return plan;

  for (const field of fields) {
    if (!(field in before) || !(field in after) || !(field in current)) continue;

    const beforeValue = before[field];
    const afterValue = after[field];
    const currentValue = current[field];

    if (valuesEqual(beforeValue, afterValue)) continue;

    if (valuesEqual(currentValue, afterValue)) {
      plan.updates[field] = beforeValue;
      plan.restorableFields++;
      continue;
    }

    if (valuesEqual(currentValue, beforeValue)) {
      plan.alreadyRestoredFields++;
      continue;
    }

    plan.conflicts.push({
      field,
      beforeValue,
      expectedAfterValue: afterValue,
      currentValue,
      reason: "Current value changed after the import.",
    });
  }

  return plan;
}

export async function rollbackLatestItemImport({
  orgId,
  userId,
  ipAddress,
  dryRun = true,
}: {
  orgId: string;
  userId?: string | null;
  ipAddress?: string | null;
  dryRun?: boolean;
}): Promise<ImportRollbackResult> {
  const audit = await loadLatestItemImportAudit(orgId);
  if (!audit) return emptyRollbackResult(dryRun);

  if (dryRun) {
    return buildRollbackResult({
      tx: db,
      audit,
      orgId,
      dryRun,
    });
  }

  let result: ImportRollbackResult | undefined;
  await db.transaction(async (tx) => {
    const txAsDb = tx as unknown as DbOrTx;
    result = await buildRollbackResult({
      tx: txAsDb,
      audit,
      orgId,
      dryRun,
    });

    await txAsDb.insert(auditLogs).values({
      orgId,
      userId: isUuid(userId) ? userId : null,
      action: ITEM_IMPORT_ROLLBACK_ACTION,
      entityType: ITEM_IMPORT_AUDIT_ENTITY,
      entityId: audit.id,
      ipAddress: ipAddress ?? null,
      details: {
        targetAuditId: audit.id,
        targetEntityId: audit.entityId,
        dryRun: false,
        summary: result.summary,
        conflicts: result.conflicts,
        skipped: result.skipped,
        appliedAt: result.appliedAt,
      },
    });
  });

  return result!;
}

async function buildRollbackResult({
  tx,
  audit,
  orgId,
  dryRun,
}: {
  tx: DbOrTx;
  audit: LoadedImportAudit;
  orgId: string;
  dryRun: boolean;
}): Promise<ImportRollbackResult> {
  const rowSnapshots = Array.isArray(audit.details.rowSnapshots)
    ? audit.details.rowSnapshots
    : [];
  const summary = createRollbackSummary(rowSnapshots.length);
  const conflicts: ImportRollbackConflict[] = [];
  const skipped: ImportRollbackSkippedRow[] = [];

  for (const row of rowSnapshots) {
    if (row.result === "created") {
      summary.createdRowsSkipped++;
      skipped.push({
        rowIndex: row.rowIndex,
        sku: row.sku,
        name: row.name,
        reason: "Created products are not deleted by rollback v1.",
      });
      continue;
    }

    summary.updatedRows++;

    if (!row.productId || !row.product.before || !row.product.after) {
      summary.skippedRows++;
      skipped.push({
        rowIndex: row.rowIndex,
        sku: row.sku,
        name: row.name,
        reason: "Missing product snapshot data for rollback.",
      });
      continue;
    }

    const currentProduct = await selectCurrentProductSnapshot(tx, orgId, row.productId);
    if (!currentProduct) {
      conflicts.push(toConflict(row, "product", "*", {
        reason: "Product no longer exists.",
        beforeValue: row.product.before,
        expectedAfterValue: row.product.after,
        currentValue: null,
      }));
      continue;
    }

    const productPlan = buildFieldRestorePlan({
      before: row.product.before,
      after: row.product.after,
      current: currentProduct,
      fields: PRODUCT_RESTORE_FIELDS,
    });
    applyFieldPlan(summary, conflicts, row, "product", productPlan);

    if (!dryRun && Object.keys(productPlan.updates).length > 0) {
      await tx
        .update(products)
        .set(productPlan.updates as Partial<typeof products.$inferInsert>)
        .where(and(eq(products.orgId, orgId), eq(products.id, row.productId)));
      summary.restoredFields += Object.keys(productPlan.updates).length;
    }

    for (const inventorySnapshot of row.inventory) {
      await processInventoryRollback({
        tx,
        orgId,
        row,
        inventorySnapshot,
        dryRun,
        summary,
        conflicts,
        skipped,
      });
    }
  }

  return {
    dryRun,
    audit: toAuditMetadata(audit),
    summary,
    conflicts,
    skipped,
    appliedAt: dryRun ? undefined : new Date().toISOString(),
  };
}

async function processInventoryRollback({
  tx,
  orgId,
  row,
  inventorySnapshot,
  dryRun,
  summary,
  conflicts,
  skipped,
}: {
  tx: DbOrTx;
  orgId: string;
  row: ImportAuditRowSnapshot;
  inventorySnapshot: ImportAuditInventoryRowSnapshot;
  dryRun: boolean;
  summary: ImportRollbackSummary;
  conflicts: ImportRollbackConflict[];
  skipped: ImportRollbackSkippedRow[];
}): Promise<void> {
  if (!row.productId) return;

  if (!inventorySnapshot.before && inventorySnapshot.after) {
    summary.skippedRows++;
    skipped.push({
      rowIndex: row.rowIndex,
      sku: row.sku,
      name: row.name,
      reason: `Inventory row for ${inventorySnapshot.csvLocationName} was created by import and is not deleted by rollback v1.`,
    });
    return;
  }

  if (!inventorySnapshot.before || !inventorySnapshot.after) return;

  const currentInventory = await selectCurrentInventorySnapshot(
    tx,
    orgId,
    row.productId,
    inventorySnapshot.locationId,
  );
  if (!currentInventory) {
    conflicts.push(toConflict(row, "inventory", "*", {
      reason: `Inventory row for ${inventorySnapshot.csvLocationName} no longer exists.`,
      beforeValue: inventorySnapshot.before,
      expectedAfterValue: inventorySnapshot.after,
      currentValue: null,
    }));
    return;
  }

  const inventoryPlan = buildFieldRestorePlan({
    before: inventorySnapshot.before,
    after: inventorySnapshot.after,
    current: currentInventory,
    fields: INVENTORY_RESTORE_FIELDS,
  });
  applyFieldPlan(summary, conflicts, row, "inventory", inventoryPlan);

  if (!dryRun && Object.keys(inventoryPlan.updates).length > 0) {
    await tx
      .update(inventory)
      .set(inventoryPlan.updates as Partial<typeof inventory.$inferInsert>)
      .where(
        and(
          eq(inventory.orgId, orgId),
          eq(inventory.productId, row.productId),
          eq(inventory.locationId, inventorySnapshot.locationId),
        ),
      );
    summary.restoredFields += Object.keys(inventoryPlan.updates).length;
  }
}

function applyFieldPlan(
  summary: ImportRollbackSummary,
  conflicts: ImportRollbackConflict[],
  row: ImportAuditRowSnapshot,
  entity: ImportRollbackConflict["entity"],
  plan: FieldRestorePlan,
): void {
  summary.restorableFields += Object.keys(plan.updates).length;
  summary.alreadyRestoredFields += plan.alreadyRestoredFields;
  summary.conflictedFields += plan.conflicts.length;
  for (const conflict of plan.conflicts) {
    conflicts.push(toConflict(row, entity, conflict.field, conflict));
  }
}

async function loadLatestItemImportAudit(orgId: string): Promise<LoadedImportAudit | null> {
  const [audit] = await db
    .select({
      id: auditLogs.id,
      entityId: auditLogs.entityId,
      createdAt: auditLogs.createdAt,
      details: auditLogs.details,
    })
    .from(auditLogs)
    .where(
      and(
        eq(auditLogs.orgId, orgId),
        eq(auditLogs.action, ITEM_IMPORT_AUDIT_ACTION),
        eq(auditLogs.entityType, ITEM_IMPORT_AUDIT_ENTITY),
      ),
    )
    .orderBy(desc(auditLogs.createdAt))
    .limit(1);

  if (!audit) return null;

  return {
    id: audit.id,
    entityId: audit.entityId,
    createdAt: audit.createdAt,
    details: isAuditDetails(audit.details) ? audit.details : {},
  };
}

async function selectCurrentProductSnapshot(
  tx: DbOrTx,
  orgId: string,
  productId: string,
): Promise<Snapshot> {
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
    })
    .from(products)
    .where(and(eq(products.orgId, orgId), eq(products.id, productId)))
    .limit(1);

  return product ?? null;
}

async function selectCurrentInventorySnapshot(
  tx: DbOrTx,
  orgId: string,
  productId: string,
  locationId: string,
): Promise<Snapshot> {
  const [row] = await tx
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
    })
    .from(inventory)
    .where(
      and(
        eq(inventory.orgId, orgId),
        eq(inventory.productId, productId),
        eq(inventory.locationId, locationId),
      ),
    )
    .limit(1);

  return row ?? null;
}

function createRollbackSummary(rowsScanned: number): ImportRollbackSummary {
  return {
    rowsScanned,
    updatedRows: 0,
    createdRowsSkipped: 0,
    restorableFields: 0,
    restoredFields: 0,
    alreadyRestoredFields: 0,
    conflictedFields: 0,
    skippedRows: 0,
  };
}

function emptyRollbackResult(dryRun: boolean): ImportRollbackResult {
  return {
    dryRun,
    audit: null,
    summary: createRollbackSummary(0),
    conflicts: [],
    skipped: [{ rowIndex: 0, sku: "", name: "", reason: "No completed item import audit was found." }],
  };
}

function toAuditMetadata(audit: LoadedImportAudit): ImportAuditMetadata {
  return {
    id: audit.id,
    action: ITEM_IMPORT_AUDIT_ACTION,
    entityType: ITEM_IMPORT_AUDIT_ENTITY,
    entityId: audit.entityId ?? "",
    mode: audit.details.mode ?? "smart_sync",
    fileName: typeof audit.details.fileName === "string" ? audit.details.fileName : null,
    rowSnapshotCount: audit.details.rowSnapshotCount ?? audit.details.rowSnapshots?.length ?? 0,
    createdAt: audit.createdAt instanceof Date ? audit.createdAt.toISOString() : String(audit.createdAt),
  };
}

function toConflict(
  row: ImportAuditRowSnapshot,
  entity: ImportRollbackConflict["entity"],
  field: string,
  detail: Omit<ImportRollbackConflict, "rowIndex" | "sku" | "name" | "entity" | "field">,
): ImportRollbackConflict {
  return {
    rowIndex: row.rowIndex,
    sku: row.sku,
    name: row.name,
    entity,
    field,
    ...detail,
  };
}

function valuesEqual(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (left == null && right == null) return true;
  return JSON.stringify(left) === JSON.stringify(right);
}

function isAuditDetails(value: unknown): value is ItemImportAuditDetails {
  return Boolean(value && typeof value === "object");
}

function isUuid(value: string | null | undefined): value is string {
  return Boolean(
    value &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value),
  );
}
