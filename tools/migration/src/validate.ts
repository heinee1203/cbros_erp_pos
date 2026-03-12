import { db, VALID_CATEGORIES, VALID_LOCATION_TYPES } from "./config";
import { sql } from "drizzle-orm";

// ── Phase 3: Validate / Cleanse ──
// Validates staged rows against business rules.
// Marks each row as VALID or REJECTED with error messages.
// Never silently merges duplicates — flags them for review.

export interface ValidationResult {
  batchId: string;
  entityType: string;
  totalRows: number;
  validRows: number;
  rejectedRows: number;
}

/**
 * Validate staged locations.
 */
export async function validateLocations(batchId: string): Promise<ValidationResult> {
  const entityType = "locations";
  let validCount = 0;
  let rejectedCount = 0;

  const rows = await db.execute(sql`
    SELECT id, row_number, name, code, type
    FROM stg_locations
    WHERE batch_id = ${batchId} AND validation_status = 'PENDING'
    ORDER BY row_number
  `);

  for (const row of rows as any[]) {
    const errors: string[] = [];

    if (!row.name || row.name.trim() === "") errors.push("Missing location name");
    if (!row.code || row.code.trim() === "") errors.push("Missing location code");
    if (!row.type || !VALID_LOCATION_TYPES.includes(row.type as any)) {
      errors.push(`Invalid location type: "${row.type}" (expected: ${VALID_LOCATION_TYPES.join(", ")})`);
    }

    // Check for duplicate code within batch
    const dupeCheck = await db.execute(sql`
      SELECT COUNT(*)::int AS cnt FROM stg_locations
      WHERE batch_id = ${batchId} AND code = ${row.code} AND id != ${row.id}
    `);
    if ((dupeCheck[0] as any).cnt > 0) {
      errors.push(`Duplicate location code "${row.code}" in batch`);
    }

    // Check against existing live locations
    const liveCheck = await db.execute(sql`
      SELECT COUNT(*)::int AS cnt FROM locations WHERE code = ${row.code}
    `);
    if ((liveCheck[0] as any).cnt > 0) {
      errors.push(`Location code "${row.code}" already exists in live data`);
    }

    if (errors.length === 0) {
      await markValid(batchId, "stg_locations", row.id);
      validCount++;
    } else {
      await markRejected(batchId, "stg_locations", row.id, errors);
      rejectedCount++;
    }
  }

  await updateBatchCounts(batchId, validCount, rejectedCount);
  return { batchId, entityType, totalRows: rows.length, validRows: validCount, rejectedRows: rejectedCount };
}

/**
 * Validate staged suppliers.
 */
export async function validateSuppliers(batchId: string): Promise<ValidationResult> {
  const entityType = "suppliers";
  let validCount = 0;
  let rejectedCount = 0;

  const rows = await db.execute(sql`
    SELECT id, row_number, name, contact_email, contact_phone, avg_lead_time_days
    FROM stg_suppliers
    WHERE batch_id = ${batchId} AND validation_status = 'PENDING'
    ORDER BY row_number
  `);

  for (const row of rows as any[]) {
    const errors: string[] = [];

    if (!row.name || row.name.trim() === "") errors.push("Missing supplier name");

    if (row.avg_lead_time_days && isNaN(parseInt(row.avg_lead_time_days, 10))) {
      errors.push(`Invalid lead time days: "${row.avg_lead_time_days}" (expected integer)`);
    }

    if (row.contact_email && !row.contact_email.includes("@")) {
      errors.push(`Invalid email format: "${row.contact_email}"`);
    }

    // Duplicate name check within batch
    const dupeCheck = await db.execute(sql`
      SELECT COUNT(*)::int AS cnt FROM stg_suppliers
      WHERE batch_id = ${batchId} AND LOWER(name) = LOWER(${row.name}) AND id != ${row.id}
    `);
    if ((dupeCheck[0] as any).cnt > 0) {
      errors.push(`Duplicate supplier name "${row.name}" in batch — review for merge`);
    }

    if (errors.length === 0) {
      await markValid(batchId, "stg_suppliers", row.id);
      validCount++;
    } else {
      await markRejected(batchId, "stg_suppliers", row.id, errors);
      rejectedCount++;
    }
  }

  await updateBatchCounts(batchId, validCount, rejectedCount);
  return { batchId, entityType, totalRows: rows.length, validRows: validCount, rejectedRows: rejectedCount };
}

/**
 * Validate staged products (46k SKUs).
 */
export async function validateProducts(batchId: string): Promise<ValidationResult> {
  const entityType = "products";
  let validCount = 0;
  let rejectedCount = 0;

  // Process in chunks for 46k rows
  const total = await db.execute(sql`
    SELECT COUNT(*)::int AS cnt FROM stg_products
    WHERE batch_id = ${batchId} AND validation_status = 'PENDING'
  `);
  const totalRows = (total[0] as any).cnt;

  const CHUNK = 1000;
  let offset = 0;

  while (offset < totalRows) {
    const rows = await db.execute(sql`
      SELECT id, row_number, name, sku, mnemonic_sku, category, unit_price, cost_price, current_cost_price
      FROM stg_products
      WHERE batch_id = ${batchId} AND validation_status = 'PENDING'
      ORDER BY row_number
      LIMIT ${CHUNK} OFFSET ${offset}
    `);

    for (const row of rows as any[]) {
      const errors: string[] = [];

      if (!row.name || row.name.trim() === "") errors.push("Missing product name");
      if (!row.sku || row.sku.trim() === "") errors.push("Missing SKU");

      if (!row.mnemonic_sku || row.mnemonic_sku.length !== 10) {
        errors.push(`Invalid mnemonic SKU length: "${row.mnemonic_sku}" (must be exactly 10 chars)`);
      }

      if (!row.category || !VALID_CATEGORIES.includes(row.category as any)) {
        errors.push(`Invalid category: "${row.category}" (expected: ${VALID_CATEGORIES.join(", ")})`);
      }

      // Numeric validation
      if (row.unit_price && isNaN(parseFloat(row.unit_price))) {
        errors.push(`Invalid unit price: "${row.unit_price}"`);
      }
      if (row.cost_price && isNaN(parseFloat(row.cost_price))) {
        errors.push(`Invalid cost price: "${row.cost_price}"`);
      }
      if (row.current_cost_price && isNaN(parseFloat(row.current_cost_price))) {
        errors.push(`Invalid current cost price: "${row.current_cost_price}"`);
      }

      // Duplicate SKU check within batch
      const dupeCheck = await db.execute(sql`
        SELECT COUNT(*)::int AS cnt FROM stg_products
        WHERE batch_id = ${batchId} AND sku = ${row.sku} AND id != ${row.id}
      `);
      if ((dupeCheck[0] as any).cnt > 0) {
        errors.push(`Duplicate SKU "${row.sku}" in batch — review before promoting`);
      }

      // Duplicate SKU check against live data
      const liveCheck = await db.execute(sql`
        SELECT COUNT(*)::int AS cnt FROM products WHERE sku = ${row.sku}
      `);
      if ((liveCheck[0] as any).cnt > 0) {
        errors.push(`SKU "${row.sku}" already exists in live products table`);
      }

      if (errors.length === 0) {
        await markValid(batchId, "stg_products", row.id);
        validCount++;
      } else {
        await markRejected(batchId, "stg_products", row.id, errors);
        rejectedCount++;
      }
    }

    offset += CHUNK;
    if (offset % 5000 === 0 || offset >= totalRows) {
      console.log(`    Products validated: ${Math.min(offset, totalRows)} / ${totalRows}`);
    }
  }

  await updateBatchCounts(batchId, validCount, rejectedCount);
  return { batchId, entityType, totalRows, validRows: validCount, rejectedRows: rejectedCount };
}

/**
 * Validate staged customers.
 */
export async function validateCustomers(batchId: string): Promise<ValidationResult> {
  const entityType = "customers";
  let validCount = 0;
  let rejectedCount = 0;

  const rows = await db.execute(sql`
    SELECT id, row_number, name, phone
    FROM stg_customers
    WHERE batch_id = ${batchId} AND validation_status = 'PENDING'
    ORDER BY row_number
  `);

  for (const row of rows as any[]) {
    const errors: string[] = [];

    if (!row.name || row.name.trim() === "") errors.push("Missing customer name");
    if (!row.phone || row.phone.trim() === "") errors.push("Missing customer phone");

    // Duplicate phone check within batch (ambiguous matches)
    if (row.phone) {
      const dupeCheck = await db.execute(sql`
        SELECT id, name FROM stg_customers
        WHERE batch_id = ${batchId} AND phone = ${row.phone} AND id != ${row.id}
      `);
      if ((dupeCheck as any[]).length > 0) {
        const dupeNames = (dupeCheck as any[]).map((d) => d.name).join(", ");
        errors.push(`Duplicate phone "${row.phone}" in batch (also: ${dupeNames}) — review for merge`);
      }

      // Check against live customers
      const liveCheck = await db.execute(sql`
        SELECT COUNT(*)::int AS cnt FROM customers WHERE phone = ${row.phone}
      `);
      if ((liveCheck[0] as any).cnt > 0) {
        errors.push(`Phone "${row.phone}" already exists in live customers — review for merge`);
      }
    }

    if (errors.length === 0) {
      await markValid(batchId, "stg_customers", row.id);
      validCount++;
    } else {
      await markRejected(batchId, "stg_customers", row.id, errors);
      rejectedCount++;
    }
  }

  await updateBatchCounts(batchId, validCount, rejectedCount);
  return { batchId, entityType, totalRows: rows.length, validRows: validCount, rejectedRows: rejectedCount };
}

/**
 * Validate staged customer vehicles.
 * Checks that customer_phone references a promoted or live customer.
 */
export async function validateCustomerVehicles(batchId: string): Promise<ValidationResult> {
  const entityType = "customer_vehicles";
  let validCount = 0;
  let rejectedCount = 0;

  const rows = await db.execute(sql`
    SELECT id, row_number, customer_phone, make, model, year
    FROM stg_customer_vehicles
    WHERE batch_id = ${batchId} AND validation_status = 'PENDING'
    ORDER BY row_number
  `);

  for (const row of rows as any[]) {
    const errors: string[] = [];

    if (!row.customer_phone || row.customer_phone.trim() === "") {
      errors.push("Missing customer phone (required for vehicle-customer linkage)");
    }
    if (!row.make || row.make.trim() === "") errors.push("Missing vehicle make");
    if (!row.model || row.model.trim() === "") errors.push("Missing vehicle model");

    if (row.year && isNaN(parseInt(row.year, 10))) {
      errors.push(`Invalid year: "${row.year}"`);
    }

    // Orphan check: customer must exist in staged (PROMOTED) or live table
    if (row.customer_phone) {
      const stgCheck = await db.execute(sql`
        SELECT promoted_id FROM stg_customers
        WHERE phone = ${row.customer_phone} AND validation_status = 'PROMOTED'
        LIMIT 1
      `);
      const liveCheck = await db.execute(sql`
        SELECT id FROM customers WHERE phone = ${row.customer_phone} LIMIT 1
      `);

      if ((stgCheck as any[]).length === 0 && (liveCheck as any[]).length === 0) {
        errors.push(`Orphan: No customer found with phone "${row.customer_phone}" — cannot promote without parent`);
      }
    }

    if (errors.length === 0) {
      await markValid(batchId, "stg_customer_vehicles", row.id);
      validCount++;
    } else {
      await markRejected(batchId, "stg_customer_vehicles", row.id, errors);
      rejectedCount++;
    }
  }

  await updateBatchCounts(batchId, validCount, rejectedCount);
  return { batchId, entityType, totalRows: rows.length, validRows: validCount, rejectedRows: rejectedCount };
}

/**
 * Validate staged opening balances.
 * Checks that SKU and location_code reference existing promoted/live records.
 */
export async function validateOpeningBalances(batchId: string): Promise<ValidationResult> {
  const entityType = "opening_balances";
  let validCount = 0;
  let rejectedCount = 0;

  const rows = await db.execute(sql`
    SELECT id, row_number, sku, location_code, opening_qty
    FROM stg_opening_balances
    WHERE batch_id = ${batchId} AND validation_status = 'PENDING'
    ORDER BY row_number
  `);

  for (const row of rows as any[]) {
    const errors: string[] = [];

    if (!row.sku || row.sku.trim() === "") errors.push("Missing SKU");
    if (!row.location_code || row.location_code.trim() === "") errors.push("Missing location code");
    if (!row.opening_qty || isNaN(parseInt(row.opening_qty, 10))) {
      errors.push(`Invalid opening quantity: "${row.opening_qty}" (expected positive integer)`);
    }
    if (row.opening_qty && parseInt(row.opening_qty, 10) < 0) {
      errors.push(`Negative opening quantity: ${row.opening_qty}`);
    }

    // Orphan check: product must exist
    if (row.sku) {
      const productCheck = await db.execute(sql`
        SELECT id FROM products WHERE sku = ${row.sku} LIMIT 1
      `);
      if ((productCheck as any[]).length === 0) {
        errors.push(`Orphan: No product found with SKU "${row.sku}" — promote products first`);
      }
    }

    // Orphan check: location must exist
    if (row.location_code) {
      const locationCheck = await db.execute(sql`
        SELECT id FROM locations WHERE code = ${row.location_code} LIMIT 1
      `);
      if ((locationCheck as any[]).length === 0) {
        errors.push(`Orphan: No location found with code "${row.location_code}" — promote locations first`);
      }
    }

    if (errors.length === 0) {
      await markValid(batchId, "stg_opening_balances", row.id);
      validCount++;
    } else {
      await markRejected(batchId, "stg_opening_balances", row.id, errors);
      rejectedCount++;
    }
  }

  await updateBatchCounts(batchId, validCount, rejectedCount);
  return { batchId, entityType, totalRows: rows.length, validRows: validCount, rejectedRows: rejectedCount };
}

// ── Helpers ──

async function markValid(batchId: string, table: string, id: string) {
  await db.execute(sql.raw(`
    UPDATE ${table} SET validation_status = 'VALID', validation_errors = NULL
    WHERE id = '${id}' AND batch_id = '${batchId}'
  `));
}

async function markRejected(batchId: string, table: string, id: string, errors: string[]) {
  const errJson = JSON.stringify(errors);
  await db.execute(sql.raw(`
    UPDATE ${table} SET validation_status = 'REJECTED', validation_errors = '${errJson.replace(/'/g, "''")}'
    WHERE id = '${id}' AND batch_id = '${batchId}'
  `));
}

async function updateBatchCounts(batchId: string, validRows: number, rejectedRows: number) {
  await db.execute(sql`
    UPDATE migration_batches
    SET valid_rows = ${validRows},
        rejected_rows = ${rejectedRows},
        status = 'VALIDATED'
    WHERE id = ${batchId}
  `);
}
