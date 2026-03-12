import { randomUUID } from "crypto";
import { db, BATCH_SIZE, getOrgId } from "./config";
import { sql } from "drizzle-orm";
import { generateCostCode } from "@apex/types";

// ── Phase 4: Promote ──
// Inserts validated staging rows into live tables in strict dependency order:
//   1. Locations & Suppliers
//   2. Products (with KINGSCOBRA regeneration)
//   3. Customers
//   4. Customer Vehicles
//   5. Opening Balances (inventory rows + OPENING_BALANCE journal entries)

export interface PromotionResult {
  batchId: string;
  entityType: string;
  promotedCount: number;
  skippedCount: number;
}

// ═══════════════════════════════════════════════
// 1. Promote Locations
// ═══════════════════════════════════════════════
export async function promoteLocations(batchId: string): Promise<PromotionResult> {
  const orgId = await getOrgId();
  let promoted = 0;
  let skipped = 0;

  const rows = await db.execute(sql`
    SELECT id, name, code, type, address
    FROM stg_locations
    WHERE batch_id = ${batchId} AND validation_status = 'VALID'
    ORDER BY row_number
  `);

  for (const row of rows as any[]) {
    const liveId = randomUUID();

    try {
      await db.execute(sql`
        INSERT INTO locations (id, org_id, name, code, type, address)
        VALUES (${liveId}, ${orgId}, ${row.name}, ${row.code}, ${row.type}::location_type, ${row.address})
      `);

      await db.execute(sql`
        UPDATE stg_locations SET validation_status = 'PROMOTED', promoted_id = ${liveId}
        WHERE id = ${row.id}
      `);
      promoted++;
    } catch (err: any) {
      console.error(`  Failed to promote location row ${row.id}: ${err.message}`);
      skipped++;
    }
  }

  await updatePromotedCount(batchId, promoted);
  console.log(`  Promoted ${promoted} locations (${skipped} skipped)`);
  return { batchId, entityType: "locations", promotedCount: promoted, skippedCount: skipped };
}

// ═══════════════════════════════════════════════
// 1. Promote Suppliers
// ═══════════════════════════════════════════════
export async function promoteSuppliers(batchId: string): Promise<PromotionResult> {
  const orgId = await getOrgId();
  let promoted = 0;
  let skipped = 0;

  const rows = await db.execute(sql`
    SELECT id, name, contact_email, contact_phone, address, avg_lead_time_days
    FROM stg_suppliers
    WHERE batch_id = ${batchId} AND validation_status = 'VALID'
    ORDER BY row_number
  `);

  for (const row of rows as any[]) {
    const liveId = randomUUID();
    const leadTime = row.avg_lead_time_days ? parseInt(row.avg_lead_time_days, 10) : 7;

    try {
      await db.execute(sql`
        INSERT INTO suppliers (id, org_id, name, contact_email, contact_phone, address, avg_lead_time_days)
        VALUES (${liveId}, ${orgId}, ${row.name}, ${row.contact_email}, ${row.contact_phone}, ${row.address}, ${leadTime})
      `);

      await db.execute(sql`
        UPDATE stg_suppliers SET validation_status = 'PROMOTED', promoted_id = ${liveId}
        WHERE id = ${row.id}
      `);
      promoted++;
    } catch (err: any) {
      console.error(`  Failed to promote supplier row ${row.id}: ${err.message}`);
      skipped++;
    }
  }

  await updatePromotedCount(batchId, promoted);
  console.log(`  Promoted ${promoted} suppliers (${skipped} skipped)`);
  return { batchId, entityType: "suppliers", promotedCount: promoted, skippedCount: skipped };
}

// ═══════════════════════════════════════════════
// 2. Promote Products (with KINGSCOBRA generation)
// ═══════════════════════════════════════════════
export async function promoteProducts(batchId: string): Promise<PromotionResult> {
  const orgId = await getOrgId();
  let promoted = 0;
  let skipped = 0;

  // Build family name → ID lookup cache
  const familyRows = await db.execute(sql`
    SELECT id, name FROM product_families WHERE org_id = ${orgId}
  `);
  const familyMap = new Map<string, string>();
  for (const f of familyRows as any[]) {
    familyMap.set(f.name.toLowerCase(), f.id);
  }

  // Process in chunks for 46k rows
  const total = await db.execute(sql`
    SELECT COUNT(*)::int AS cnt FROM stg_products
    WHERE batch_id = ${batchId} AND validation_status = 'VALID'
  `);
  const totalRows = (total[0] as any).cnt;

  let offset = 0;
  while (offset < totalRows) {
    const rows = await db.execute(sql`
      SELECT id, name, sku, mnemonic_sku, category, unit_price, cost_price, current_cost_price, family_name
      FROM stg_products
      WHERE batch_id = ${batchId} AND validation_status = 'VALID'
      ORDER BY row_number
      LIMIT ${BATCH_SIZE} OFFSET ${offset}
    `);

    for (const row of rows as any[]) {
      const liveId = randomUUID();
      const unitPrice = row.unit_price ? parseFloat(row.unit_price) : 0;
      const costPrice = row.cost_price ? parseFloat(row.cost_price) : 0;
      const currentCost = row.current_cost_price ? parseFloat(row.current_cost_price) : costPrice;

      // KINGSCOBRA rule: NEVER trust legacy mnemonic cost codes.
      // Regenerate from authoritative current_cost_price.
      let mnemonicCostCode: string | null = null;
      try {
        mnemonicCostCode = generateCostCode(currentCost);
      } catch {
        // Non-fatal: cost might be 0 or unusual
        mnemonicCostCode = generateCostCode(0);
      }

      // Resolve family
      const familyId = row.family_name
        ? familyMap.get(row.family_name.toLowerCase()) ?? null
        : null;

      // If family doesn't exist, create it
      let resolvedFamilyId = familyId;
      if (row.family_name && !familyId) {
        const newFamilyId = randomUUID();
        const slug = row.family_name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
        try {
          await db.execute(sql`
            INSERT INTO product_families (id, org_id, name, slug)
            VALUES (${newFamilyId}, ${orgId}, ${row.family_name}, ${slug})
            ON CONFLICT (org_id, slug) DO NOTHING
          `);
          // Re-lookup in case ON CONFLICT hit
          const existing = await db.execute(sql`
            SELECT id FROM product_families WHERE org_id = ${orgId} AND slug = ${slug} LIMIT 1
          `);
          resolvedFamilyId = (existing[0] as any)?.id ?? newFamilyId;
          familyMap.set(row.family_name.toLowerCase(), resolvedFamilyId);
        } catch {
          resolvedFamilyId = null;
        }
      }

      try {
        await db.execute(sql`
          INSERT INTO products (id, org_id, name, sku, mnemonic_sku, category, unit_price, cost_price, current_cost_price, mnemonic_cost_code, family_id)
          VALUES (
            ${liveId}, ${orgId}, ${row.name}, ${row.sku}, ${row.mnemonic_sku},
            ${row.category}::product_category,
            ${unitPrice.toFixed(2)}, ${costPrice.toFixed(2)}, ${currentCost.toFixed(2)},
            ${mnemonicCostCode}, ${resolvedFamilyId}
          )
        `);

        await db.execute(sql`
          UPDATE stg_products SET validation_status = 'PROMOTED', promoted_id = ${liveId}
          WHERE id = ${row.id}
        `);
        promoted++;
      } catch (err: any) {
        console.error(`  Failed to promote product SKU ${row.sku}: ${err.message}`);
        skipped++;
      }
    }

    offset += BATCH_SIZE;
    if (offset % 5000 === 0 || offset >= totalRows) {
      console.log(`    Products promoted: ${Math.min(offset, totalRows)} / ${totalRows}`);
    }
  }

  await updatePromotedCount(batchId, promoted);
  console.log(`  Promoted ${promoted} products (${skipped} skipped)`);
  return { batchId, entityType: "products", promotedCount: promoted, skippedCount: skipped };
}

// ═══════════════════════════════════════════════
// 3. Promote Customers
// ═══════════════════════════════════════════════
export async function promoteCustomers(batchId: string): Promise<PromotionResult> {
  const orgId = await getOrgId();
  let promoted = 0;
  let skipped = 0;

  const rows = await db.execute(sql`
    SELECT id, name, phone, notes
    FROM stg_customers
    WHERE batch_id = ${batchId} AND validation_status = 'VALID'
    ORDER BY row_number
  `);

  for (const row of rows as any[]) {
    const liveId = randomUUID();

    try {
      await db.execute(sql`
        INSERT INTO customers (id, org_id, name, phone, notes)
        VALUES (${liveId}, ${orgId}, ${row.name}, ${row.phone}, ${row.notes})
      `);

      await db.execute(sql`
        UPDATE stg_customers SET validation_status = 'PROMOTED', promoted_id = ${liveId}
        WHERE id = ${row.id}
      `);
      promoted++;
    } catch (err: any) {
      console.error(`  Failed to promote customer "${row.name}": ${err.message}`);
      skipped++;
    }
  }

  await updatePromotedCount(batchId, promoted);
  console.log(`  Promoted ${promoted} customers (${skipped} skipped)`);
  return { batchId, entityType: "customers", promotedCount: promoted, skippedCount: skipped };
}

// ═══════════════════════════════════════════════
// 4. Promote Customer Vehicles
// ═══════════════════════════════════════════════
export async function promoteCustomerVehicles(batchId: string): Promise<PromotionResult> {
  const orgId = await getOrgId();
  let promoted = 0;
  let skipped = 0;

  const rows = await db.execute(sql`
    SELECT id, customer_phone, make, model, year, plate_no, notes
    FROM stg_customer_vehicles
    WHERE batch_id = ${batchId} AND validation_status = 'VALID'
    ORDER BY row_number
  `);

  for (const row of rows as any[]) {
    // Resolve customer by phone
    const customerResult = await db.execute(sql`
      SELECT id FROM customers WHERE org_id = ${orgId} AND phone = ${row.customer_phone} LIMIT 1
    `);

    if ((customerResult as any[]).length === 0) {
      console.error(`  Orphan vehicle: no customer with phone ${row.customer_phone}`);
      skipped++;
      continue;
    }

    const customerId = (customerResult[0] as any).id;
    const liveId = randomUUID();
    const year = row.year ? parseInt(row.year, 10) : null;

    try {
      await db.execute(sql`
        INSERT INTO customer_vehicles (id, org_id, customer_id, make, model, year, plate_no, notes)
        VALUES (${liveId}, ${orgId}, ${customerId}, ${row.make}, ${row.model}, ${year}, ${row.plate_no}, ${row.notes})
      `);

      await db.execute(sql`
        UPDATE stg_customer_vehicles SET validation_status = 'PROMOTED', promoted_id = ${liveId}
        WHERE id = ${row.id}
      `);
      promoted++;
    } catch (err: any) {
      console.error(`  Failed to promote vehicle ${row.make} ${row.model}: ${err.message}`);
      skipped++;
    }
  }

  await updatePromotedCount(batchId, promoted);
  console.log(`  Promoted ${promoted} customer vehicles (${skipped} skipped)`);
  return { batchId, entityType: "customer_vehicles", promotedCount: promoted, skippedCount: skipped };
}

// ═══════════════════════════════════════════════
// 5. Promote Opening Balances
// No fake POs — direct inventory row + OPENING_BALANCE journal entry
// ═══════════════════════════════════════════════
export async function promoteOpeningBalances(batchId: string): Promise<PromotionResult> {
  const orgId = await getOrgId();
  let promoted = 0;
  let skipped = 0;

  const rows = await db.execute(sql`
    SELECT id, sku, location_code, opening_qty
    FROM stg_opening_balances
    WHERE batch_id = ${batchId} AND validation_status = 'VALID'
    ORDER BY row_number
  `);

  for (const row of rows as any[]) {
    const qty = parseInt(row.opening_qty, 10);

    // Resolve product by SKU
    const productResult = await db.execute(sql`
      SELECT id, current_cost_price FROM products WHERE sku = ${row.sku} AND org_id = ${orgId} LIMIT 1
    `);
    if ((productResult as any[]).length === 0) {
      console.error(`  Orphan balance: no product with SKU ${row.sku}`);
      skipped++;
      continue;
    }
    const productId = (productResult[0] as any).id;
    const costSnapshot = (productResult[0] as any).current_cost_price ?? "0.00";

    // Resolve location by code
    const locationResult = await db.execute(sql`
      SELECT id FROM locations WHERE code = ${row.location_code} AND org_id = ${orgId} LIMIT 1
    `);
    if ((locationResult as any[]).length === 0) {
      console.error(`  Orphan balance: no location with code ${row.location_code}`);
      skipped++;
      continue;
    }
    const locationId = (locationResult[0] as any).id;

    try {
      // Upsert inventory row: create if missing, set stock_level = opening_qty
      const invId = randomUUID();
      await db.execute(sql`
        INSERT INTO inventory (id, org_id, product_id, location_id, stock_level, reserved_level)
        VALUES (${invId}, ${orgId}, ${productId}, ${locationId}, ${qty}, 0)
        ON CONFLICT (product_id, location_id)
        DO UPDATE SET stock_level = ${qty}
      `);

      // Retrieve the actual inventory ID (might be the existing one if conflict)
      const invResult = await db.execute(sql`
        SELECT id, stock_level FROM inventory
        WHERE product_id = ${productId} AND location_id = ${locationId}
        LIMIT 1
      `);
      const finalInvId = (invResult[0] as any).id;
      const balanceAfter = (invResult[0] as any).stock_level;

      // Write OPENING_BALANCE stock journal entry
      const journalId = randomUUID();
      const idempotencyKey = `opening-balance-${productId}-${locationId}-${batchId}`;

      await db.execute(sql`
        INSERT INTO stock_journal (
          id, org_id, product_id, location_id,
          actor_type, change_quantity, balance_after,
          reference_type, reference_id, reason_code,
          idempotency_key, unit_cost_snapshot, notes
        )
        VALUES (
          ${journalId}, ${orgId}, ${productId}, ${locationId},
          'SYSTEM'::actor_type, ${qty}, ${balanceAfter},
          'OPENING_BALANCE'::journal_reference_type, ${batchId}, 'OPENING_BALANCE'::adjustment_reason_code,
          ${idempotencyKey}, ${costSnapshot}, ${"Data migration opening balance"}
        )
      `);

      await db.execute(sql`
        UPDATE stg_opening_balances SET validation_status = 'PROMOTED', promoted_id = ${finalInvId}
        WHERE id = ${row.id}
      `);
      promoted++;
    } catch (err: any) {
      console.error(`  Failed to promote balance SKU=${row.sku} loc=${row.location_code}: ${err.message}`);
      skipped++;
    }
  }

  await updatePromotedCount(batchId, promoted);
  console.log(`  Promoted ${promoted} opening balances (${skipped} skipped)`);
  return { batchId, entityType: "opening_balances", promotedCount: promoted, skippedCount: skipped };
}

// ── Helpers ──

async function updatePromotedCount(batchId: string, promotedRows: number) {
  await db.execute(sql`
    UPDATE migration_batches
    SET promoted_rows = ${promotedRows}, status = 'PROMOTED'
    WHERE id = ${batchId}
  `);
}
