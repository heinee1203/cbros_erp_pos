import { db, type DbOrTx } from "@apex/database";
import { dotBatches } from "@apex/database/schema";
import { eq, and, sql, desc, asc, gt } from "drizzle-orm";
import { parseDotCode, DOT_BLOCK_MONTHS } from "../serials/dot-utils";

// ── Types ──

export interface DotBatchInput {
  dotCode: string;
  quantity: number;
}

export interface ReceiveDotBatchParams {
  orgId: string;
  productId: string;
  locationId: string;
  purchaseOrderId: string;
  poNumber: string;
  supplierId: string;
  supplierName: string;
  costPrice: string;
  userId: string;
  batches: DotBatchInput[];
}

// ── Service Functions ──

/**
 * Receive DOT batches during PO receiving.
 * Upserts: if same (org, product, location, dotCode, PO) exists, increment qty.
 * Must be called inside a transaction.
 */
export async function receiveDotBatches(
  tx: DbOrTx,
  params: ReceiveDotBatchParams,
) {
  const results: { dotCode: string; quantity: number; isNew: boolean; warning?: string }[] = [];

  for (const batch of params.batches) {
    // Parse and validate DOT code
    const lastFour = batch.dotCode.replace(/[^0-9]/g, "").slice(-4);
    const dot = parseDotCode(lastFour);

    if (!dot.valid) {
      throw new Error(`Invalid DOT code "${batch.dotCode}": ${dot.warning}`);
    }

    if (dot.ageMonths && dot.ageMonths >= DOT_BLOCK_MONTHS) {
      throw new Error(`DOT code "${batch.dotCode}" is expired (${(dot.ageMonths / 12).toFixed(1)} years old). Cannot receive.`);
    }

    // Check for existing batch (same product + location + dot code + PO)
    const [existing] = await tx
      .select({ id: dotBatches.id, quantityReceived: dotBatches.quantityReceived, quantityInStock: dotBatches.quantityInStock })
      .from(dotBatches)
      .where(and(
        eq(dotBatches.orgId, params.orgId),
        eq(dotBatches.productId, params.productId),
        eq(dotBatches.locationId, params.locationId),
        eq(dotBatches.dotCode, batch.dotCode),
        eq(dotBatches.purchaseOrderId, params.purchaseOrderId),
      ))
      .limit(1);

    if (existing) {
      // Upsert: increment quantities
      await tx
        .update(dotBatches)
        .set({
          quantityReceived: existing.quantityReceived + batch.quantity,
          quantityInStock: existing.quantityInStock + batch.quantity,
        })
        .where(eq(dotBatches.id, existing.id));

      results.push({ dotCode: batch.dotCode, quantity: batch.quantity, isNew: false, warning: dot.warning });
    } else {
      // Insert new batch
      await tx.insert(dotBatches).values({
        orgId: params.orgId,
        productId: params.productId,
        locationId: params.locationId,
        dotCode: batch.dotCode,
        manufactureWeek: dot.week ?? null,
        manufactureYear: dot.year ?? null,
        manufactureDate: dot.manufactureDate ?? null,
        quantityReceived: batch.quantity,
        quantityInStock: batch.quantity,
        purchaseOrderId: params.purchaseOrderId,
        poNumber: params.poNumber,
        receivedAt: new Date(),
        receivedBy: params.userId,
        supplierId: params.supplierId,
        supplierName: params.supplierName,
        costPrice: params.costPrice,
      });

      results.push({ dotCode: batch.dotCode, quantity: batch.quantity, isNew: true, warning: dot.warning });
    }
  }

  return results;
}

/**
 * Sell tires using FIFO allocation (oldest batch first).
 */
export async function sellDotBatchesFIFO(
  tx: DbOrTx,
  orgId: string,
  productId: string,
  locationId: string,
  quantity: number,
) {
  // Get batches sorted by manufacture date ASC (oldest first), with stock > 0
  const batches = await tx
    .select()
    .from(dotBatches)
    .where(and(
      eq(dotBatches.orgId, orgId),
      eq(dotBatches.productId, productId),
      eq(dotBatches.locationId, locationId),
      gt(dotBatches.quantityInStock, 0),
    ))
    .orderBy(asc(dotBatches.manufactureDate), asc(dotBatches.createdAt));

  let remaining = quantity;
  const allocation: { dotBatchId: string; dotCode: string; quantity: number }[] = [];

  for (const batch of batches) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, batch.quantityInStock);

    await tx
      .update(dotBatches)
      .set({
        quantityInStock: batch.quantityInStock - take,
        quantitySold: batch.quantitySold + take,
      })
      .where(eq(dotBatches.id, batch.id));

    allocation.push({ dotBatchId: batch.id, dotCode: batch.dotCode, quantity: take });
    remaining -= take;
  }

  if (remaining > 0) {
    throw new Error(`Insufficient DOT batch stock: needed ${quantity}, allocated ${quantity - remaining}`);
  }

  return allocation;
}

/**
 * List DOT batches for a product at a location.
 */
export async function listDotBatches(
  orgId: string,
  opts: { productId?: string; locationId?: string; inStock?: boolean; limit?: number; cursor?: string },
) {
  const conditions = [eq(dotBatches.orgId, orgId)];
  if (opts.productId) conditions.push(eq(dotBatches.productId, opts.productId));
  if (opts.locationId) conditions.push(eq(dotBatches.locationId, opts.locationId));
  if (opts.inStock) conditions.push(gt(dotBatches.quantityInStock, 0));

  const limit = opts.limit ?? 50;
  const rows = await db
    .select()
    .from(dotBatches)
    .where(and(...conditions))
    .orderBy(asc(dotBatches.manufactureDate), asc(dotBatches.createdAt))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? data[data.length - 1].id : null;

  return { data, nextCursor, hasMore };
}

/**
 * Get DOT batch summary for a product.
 */
export async function getDotBatchSummary(orgId: string, productId: string) {
  const rows = await db.execute(sql`
    SELECT
      COALESCE(SUM(quantity_in_stock), 0)::int AS "totalInStock",
      COUNT(*)::int AS "batchCount",
      COUNT(*) FILTER (WHERE quantity_in_stock > 0)::int AS "activeBatches",
      MIN(manufacture_date) AS "oldestDate",
      MAX(manufacture_date) AS "newestDate"
    FROM dot_batches
    WHERE org_id = ${orgId} AND product_id = ${productId} AND quantity_in_stock > 0
  `);

  const row = (rows as any[])[0] ?? { totalInStock: 0, batchCount: 0, activeBatches: 0, oldestDate: null, newestDate: null };

  let ageMonths: number | null = null;
  let ageWarning: string | undefined;
  if (row.oldestDate) {
    const oldest = new Date(row.oldestDate);
    const now = new Date();
    ageMonths = (now.getFullYear() - oldest.getFullYear()) * 12 + (now.getMonth() - oldest.getMonth());
  }

  return {
    totalInStock: row.totalInStock,
    batchCount: row.batchCount,
    activeBatches: row.activeBatches,
    oldestDate: row.oldestDate,
    newestDate: row.newestDate,
    oldestAgeMonths: ageMonths,
  };
}

// ── DOT Entry (manual bulk entry for existing inventory) ──

export async function getTiresForDotEntry(orgId: string, locationId: string) {
  const rows = await db.execute(sql`
    SELECT
      p.id AS product_id,
      p.name AS product_name,
      p.sku,
      i.stock_level,
      COALESCE(
        (SELECT SUM(db.quantity_in_stock)::int FROM dot_batches db WHERE db.product_id = p.id AND db.location_id = ${locationId} AND db.quantity_in_stock > 0),
        0
      ) AS tagged_count
    FROM products p
    INNER JOIN inventory i ON i.product_id = p.id AND i.location_id = ${locationId}
    WHERE p.org_id = ${orgId}
      AND p.is_tire = true
      AND i.stock_level > 0
    ORDER BY p.name ASC
  `);

  let totalTires = 0;
  let taggedTires = 0;

  const products = (rows as any[]).map((r: any) => {
    const stock = r.stock_level;
    const tagged = r.tagged_count;
    totalTires += stock;
    taggedTires += Math.min(tagged, stock);
    return {
      productId: r.product_id,
      productName: r.product_name,
      sku: r.sku,
      stockAtLocation: stock,
      taggedCount: tagged,
      untaggedCount: Math.max(0, stock - tagged),
    };
  });

  return {
    products,
    summary: { totalTires, taggedTires, untaggedTires: totalTires - taggedTires },
  };
}

export async function getDotBatchesForProduct(orgId: string, productId: string, locationId: string) {
  const rows = await db.execute(sql`
    SELECT id, dot_code, quantity_in_stock, manufacture_date, manufacture_week, manufacture_year, notes
    FROM dot_batches
    WHERE org_id = ${orgId} AND product_id = ${productId} AND location_id = ${locationId} AND quantity_in_stock > 0
    ORDER BY dot_code ASC
  `);
  return (rows as any[]).map((r: any) => ({
    id: r.id,
    dotCode: r.dot_code,
    quantity: r.quantity_in_stock,
    manufactureDate: r.manufacture_date,
    manufactureWeek: r.manufacture_week,
    manufactureYear: r.manufacture_year,
    notes: r.notes,
  }));
}

export async function saveDotEntry(
  orgId: string,
  productId: string,
  locationId: string,
  dotCode: string,
  quantity: number,
) {
  const parsed = parseDotCode(dotCode);
  if (!parsed.valid) throw new Error(parsed.warning || "Invalid DOT code");

  // Upsert: if same product + location + dotCode (no PO), increment
  const existing = await db.execute(sql`
    SELECT id, quantity_in_stock, quantity_received FROM dot_batches
    WHERE org_id = ${orgId} AND product_id = ${productId} AND location_id = ${locationId}
      AND dot_code = ${dotCode} AND purchase_order_id IS NULL
    LIMIT 1
  `);

  if ((existing as any[]).length > 0) {
    const row = (existing as any[])[0];
    await db.execute(sql`
      UPDATE dot_batches
      SET quantity_in_stock = quantity_in_stock + ${quantity},
          quantity_received = quantity_received + ${quantity},
          updated_at = now()
      WHERE id = ${row.id}
    `);
    return { id: row.id, action: "incremented" };
  }

  // Insert new batch
  const [batch] = await db.insert(dotBatches).values({
    orgId,
    productId,
    locationId,
    dotCode,
    manufactureWeek: parsed.week,
    manufactureYear: parsed.year,
    manufactureDate: parsed.manufactureDate ?? null,
    quantityReceived: quantity,
    quantityInStock: quantity,
    quantitySold: 0,
    quantityReturned: 0,
    receivedAt: new Date(),
    notes: "Manual DOT entry",
  }).returning({ id: dotBatches.id });

  return { id: batch.id, action: "created" };
}

export async function removeDotEntry(id: string, orgId: string) {
  await db.execute(sql`DELETE FROM dot_batches WHERE id = ${id} AND org_id = ${orgId}`);
}
