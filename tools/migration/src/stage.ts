import { randomUUID } from "crypto";
import { db, BATCH_SIZE } from "./config";
import { sql } from "drizzle-orm";
import type { RawRow } from "./extract";

// ── Phase 2: Stage ──
// Insert extracted rows into stg_ tables with batch IDs.
// All values stored as-is (VARCHAR) for validation in the next phase.

export interface StagingResult {
  batchId: string;
  entityType: string;
  totalRows: number;
  sourceFile: string;
}

/**
 * Stage locations from extracted rows.
 */
export async function stageLocations(
  rows: RawRow[],
  sourceFile: string,
): Promise<StagingResult> {
  const batchId = randomUUID();
  const entityType = "locations";

  await createBatchRecord(batchId, entityType, sourceFile, rows.length);

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const values = batch.map((row, idx) => ({
      batchId,
      rowNumber: i + idx + 1,
      name: row.name || row.location_name || null,
      code: row.code || row.location_code || null,
      type: (row.type || row.location_type || "").toUpperCase() || null,
      address: row.address || null,
    }));

    await db.execute(sql`
      INSERT INTO stg_locations (batch_id, row_number, name, code, type, address)
      SELECT * FROM jsonb_to_recordset(${JSON.stringify(values)}::jsonb)
      AS t(batch_id uuid, row_number int, name varchar, code varchar, type varchar, address varchar)
    `);
  }

  console.log(`  Staged ${rows.length} locations (batch: ${batchId.substring(0, 8)})`);
  return { batchId, entityType, totalRows: rows.length, sourceFile };
}

/**
 * Stage suppliers from extracted rows.
 */
export async function stageSuppliers(
  rows: RawRow[],
  sourceFile: string,
): Promise<StagingResult> {
  const batchId = randomUUID();
  const entityType = "suppliers";

  await createBatchRecord(batchId, entityType, sourceFile, rows.length);

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const values = batch.map((row, idx) => ({
      batchId,
      rowNumber: i + idx + 1,
      name: row.name || row.supplier_name || null,
      contactEmail: row.contact_email || row.email || null,
      contactPhone: row.contact_phone || row.phone || null,
      address: row.address || null,
      avgLeadTimeDays: row.avg_lead_time_days || row.lead_time || null,
    }));

    await db.execute(sql`
      INSERT INTO stg_suppliers (batch_id, row_number, name, contact_email, contact_phone, address, avg_lead_time_days)
      SELECT * FROM jsonb_to_recordset(${JSON.stringify(values)}::jsonb)
      AS t(batch_id uuid, row_number int, name varchar, contact_email varchar, contact_phone varchar, address varchar, avg_lead_time_days varchar)
    `);
  }

  console.log(`  Staged ${rows.length} suppliers (batch: ${batchId.substring(0, 8)})`);
  return { batchId, entityType, totalRows: rows.length, sourceFile };
}

/**
 * Stage products from extracted rows (46k+ SKUs).
 */
export async function stageProducts(
  rows: RawRow[],
  sourceFile: string,
): Promise<StagingResult> {
  const batchId = randomUUID();
  const entityType = "products";

  await createBatchRecord(batchId, entityType, sourceFile, rows.length);

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const values = batch.map((row, idx) => ({
      batchId,
      rowNumber: i + idx + 1,
      name: row.name || row.product_name || null,
      sku: row.sku || row.part_number || null,
      mnemonicSku: row.mnemonic_sku || row.mnemonic || null,
      category: (row.category || row.product_category || "").toUpperCase() || null,
      unitPrice: row.unit_price || row.sell_price || row.retail_price || null,
      costPrice: row.cost_price || row.base_cost || null,
      currentCostPrice: row.current_cost_price || row.latest_cost || row.cost_price || row.base_cost || null,
      familyName: row.family_name || row.family || row.product_family || null,
    }));

    await db.execute(sql`
      INSERT INTO stg_products (batch_id, row_number, name, sku, mnemonic_sku, category, unit_price, cost_price, current_cost_price, family_name)
      SELECT * FROM jsonb_to_recordset(${JSON.stringify(values)}::jsonb)
      AS t(batch_id uuid, row_number int, name varchar, sku varchar, mnemonic_sku varchar, category varchar, unit_price varchar, cost_price varchar, current_cost_price varchar, family_name varchar)
    `);

    if ((i + BATCH_SIZE) % 5000 === 0 || i + BATCH_SIZE >= rows.length) {
      console.log(`    Products staged: ${Math.min(i + BATCH_SIZE, rows.length)} / ${rows.length}`);
    }
  }

  console.log(`  Staged ${rows.length} products (batch: ${batchId.substring(0, 8)})`);
  return { batchId, entityType, totalRows: rows.length, sourceFile };
}

/**
 * Stage customers from extracted rows.
 */
export async function stageCustomers(
  rows: RawRow[],
  sourceFile: string,
): Promise<StagingResult> {
  const batchId = randomUUID();
  const entityType = "customers";

  await createBatchRecord(batchId, entityType, sourceFile, rows.length);

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const values = batch.map((row, idx) => ({
      batchId,
      rowNumber: i + idx + 1,
      name: row.name || row.customer_name || null,
      phone: row.phone || row.contact_phone || row.mobile || null,
      notes: row.notes || null,
    }));

    await db.execute(sql`
      INSERT INTO stg_customers (batch_id, row_number, name, phone, notes)
      SELECT * FROM jsonb_to_recordset(${JSON.stringify(values)}::jsonb)
      AS t(batch_id uuid, row_number int, name varchar, phone varchar, notes varchar)
    `);
  }

  console.log(`  Staged ${rows.length} customers (batch: ${batchId.substring(0, 8)})`);
  return { batchId, entityType, totalRows: rows.length, sourceFile };
}

/**
 * Stage customer vehicles from extracted rows.
 */
export async function stageCustomerVehicles(
  rows: RawRow[],
  sourceFile: string,
): Promise<StagingResult> {
  const batchId = randomUUID();
  const entityType = "customer_vehicles";

  await createBatchRecord(batchId, entityType, sourceFile, rows.length);

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const values = batch.map((row, idx) => ({
      batchId,
      rowNumber: i + idx + 1,
      customerPhone: row.customer_phone || row.phone || row.owner_phone || null,
      make: row.make || row.vehicle_make || null,
      model: row.model || row.vehicle_model || null,
      year: row.year || row.vehicle_year || null,
      plateNo: row.plate_no || row.plate || row.registration || null,
      notes: row.notes || null,
    }));

    await db.execute(sql`
      INSERT INTO stg_customer_vehicles (batch_id, row_number, customer_phone, make, model, year, plate_no, notes)
      SELECT * FROM jsonb_to_recordset(${JSON.stringify(values)}::jsonb)
      AS t(batch_id uuid, row_number int, customer_phone varchar, make varchar, model varchar, year varchar, plate_no varchar, notes varchar)
    `);
  }

  console.log(`  Staged ${rows.length} customer vehicles (batch: ${batchId.substring(0, 8)})`);
  return { batchId, entityType, totalRows: rows.length, sourceFile };
}

/**
 * Stage opening balances from extracted rows.
 */
export async function stageOpeningBalances(
  rows: RawRow[],
  sourceFile: string,
): Promise<StagingResult> {
  const batchId = randomUUID();
  const entityType = "opening_balances";

  await createBatchRecord(batchId, entityType, sourceFile, rows.length);

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const values = batch.map((row, idx) => ({
      batchId,
      rowNumber: i + idx + 1,
      sku: row.sku || row.part_number || null,
      locationCode: row.location_code || row.location || row.store_code || null,
      openingQty: row.opening_qty || row.quantity || row.stock_level || row.qty || null,
    }));

    await db.execute(sql`
      INSERT INTO stg_opening_balances (batch_id, row_number, sku, location_code, opening_qty)
      SELECT * FROM jsonb_to_recordset(${JSON.stringify(values)}::jsonb)
      AS t(batch_id uuid, row_number int, sku varchar, location_code varchar, opening_qty varchar)
    `);
  }

  console.log(`  Staged ${rows.length} opening balances (batch: ${batchId.substring(0, 8)})`);
  return { batchId, entityType, totalRows: rows.length, sourceFile };
}

// ── Helpers ──

async function createBatchRecord(
  batchId: string,
  entityType: string,
  sourceFile: string,
  totalRows: number,
) {
  await db.execute(sql`
    INSERT INTO migration_batches (id, entity_type, source_file, total_rows, status)
    VALUES (${batchId}, ${entityType}, ${sourceFile}, ${totalRows}, 'STAGED')
  `);
}
