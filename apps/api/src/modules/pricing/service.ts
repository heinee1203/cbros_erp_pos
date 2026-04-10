import { db, type DbOrTx } from "@apex/database";
import { priceChanges, products, brands, users } from "@apex/database/schema";
import {
  eq,
  and,
  gt,
  lt,
  gte,
  lte,
  asc,
  desc,
  sql,
  type SQL,
} from "drizzle-orm";
import { randomUUID } from "crypto";

// ── In-memory preview cache ──

interface PreviewCacheEntry {
  data: PreviewResult;
  expiresAt: number;
}

const previewCache = new Map<string, PreviewCacheEntry>();

const PREVIEW_TTL_MS = 30 * 60 * 1000; // 30 minutes

function cleanExpiredPreviews() {
  const now = Date.now();
  for (const [key, entry] of previewCache) {
    if (entry.expiresAt <= now) {
      previewCache.delete(key);
    }
  }
}

// ── Types ──

export interface BulkPriceRow {
  sku: string;
  newCost?: string;
  newSell?: string;
}

export interface PreviewChange {
  productId: string;
  productName: string;
  sku: string;
  currentCost: string;
  currentSell: string;
  newCost: string | null;
  newSell: string | null;
  suggestedSell: string | null;
  currentMarginPct: string;
  projectedMarginPct: string;
  marginChange: string;
  marginAlert: boolean;
}

export interface PreviewResult {
  matched: number;
  unmatched: string[];
  changes: PreviewChange[];
  marginAlerts: number;
  previewToken: string;
}

export interface ApplyResult {
  applied: number;
  skipped: number;
  batchId: string;
}

export interface PriceHistoryRow {
  id: string;
  productId: string;
  productName: string;
  productSku: string;
  field: string;
  oldValue: string;
  newValue: string;
  changeReason: string | null;
  source: string;
  batchId: string | null;
  changedBy: string | null;
  changedByName: string | null;
  changedAt: string;
  pctChange: number | null;
}

export interface MarginAlertRow {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  brandName: string | null;
  categoryName: string | null;
  costPrice: string;
  sellPrice: string;
  marginPct: string;
  stock: number;
}

// ── Helpers ──

function computeMarginPct(sell: number, cost: number): number {
  if (sell === 0) return 0;
  return ((sell - cost) / sell) * 100;
}

// ── Service Functions ──

/**
 * Record a single price change audit row.
 * Called by all price update paths.
 */
export async function recordPriceChange(
  tx: DbOrTx,
  orgId: string,
  productId: string,
  field: "SELL_PRICE" | "COST_PRICE",
  oldValue: string,
  newValue: string,
  changedBy: string,
  changeReason?: string,
  batchId?: string,
) {
  await tx.insert(priceChanges).values({
    orgId,
    productId,
    field,
    oldValue,
    newValue,
    changedBy,
    changeReason: changeReason ?? null,
    batchId: batchId ?? null,
  });
}

/**
 * Parse CSV rows and compute price change impact preview.
 */
export async function previewBulkPriceUpdate(
  orgId: string,
  rows: BulkPriceRow[],
): Promise<PreviewResult> {
  cleanExpiredPreviews();

  // Collect unique SKUs
  const skus = [...new Set(rows.map((r) => r.sku))];

  // Fetch matching products
  const matchedProducts = await db
    .select({
      id: products.id,
      name: sql<string>`CASE WHEN ${products.parentProductId} IS NOT NULL
        THEN (SELECT p2.name FROM products p2 WHERE p2.id = ${products.parentProductId}) || ' \u2014 ' || ${products.name}
        ELSE ${products.name} END`.as("display_name"),
      sku: products.sku,
      costPrice: products.costPrice,
      unitPrice: products.unitPrice,
    })
    .from(products)
    .where(
      and(
        eq(products.orgId, orgId),
        sql`${products.sku} = ANY(${skus})`,
      ),
    );

  const productBySku = new Map(matchedProducts.map((p) => [p.sku, p]));

  const changes: PreviewChange[] = [];
  const unmatchedSkus: string[] = [];
  let marginAlerts = 0;

  for (const row of rows) {
    const product = productBySku.get(row.sku);
    if (!product) {
      unmatchedSkus.push(row.sku);
      continue;
    }

    const currentCost = parseFloat(product.costPrice);
    const currentSell = parseFloat(product.unitPrice);
    const currentMarginPct = computeMarginPct(currentSell, currentCost);

    const newCost = row.newCost ? parseFloat(row.newCost) : null;
    const newSell = row.newSell ? parseFloat(row.newSell) : null;

    // If only cost changed, compute suggested sell to maintain current margin
    let suggestedSell: number | null = null;
    if (newCost !== null && newSell === null && currentMarginPct > 0) {
      suggestedSell = newCost / (1 - currentMarginPct / 100);
    }

    const projectedCost = newCost ?? currentCost;
    const projectedSell = newSell ?? currentSell;
    const projectedMarginPct = computeMarginPct(projectedSell, projectedCost);
    const marginChange = projectedMarginPct - currentMarginPct;

    const alert = projectedMarginPct < 15;
    if (alert) marginAlerts++;

    changes.push({
      productId: product.id,
      productName: product.name,
      sku: product.sku,
      currentCost: product.costPrice,
      currentSell: product.unitPrice,
      newCost: row.newCost ?? null,
      newSell: row.newSell ?? null,
      suggestedSell: suggestedSell !== null ? suggestedSell.toFixed(2) : null,
      currentMarginPct: currentMarginPct.toFixed(2),
      projectedMarginPct: projectedMarginPct.toFixed(2),
      marginChange: marginChange.toFixed(2),
      marginAlert: alert,
    });
  }

  const previewToken = randomUUID();

  const result: PreviewResult = {
    matched: changes.length,
    unmatched: unmatchedSkus,
    changes,
    marginAlerts,
    previewToken,
  };

  previewCache.set(previewToken, {
    data: result,
    expiresAt: Date.now() + PREVIEW_TTL_MS,
  });

  return result;
}

/**
 * Apply a previously previewed bulk price update.
 */
export async function applyBulkPriceUpdate(
  orgId: string,
  userId: string,
  previewToken: string,
  overrides?: Record<string, { newCost?: string; newSell?: string }>,
  autoAdjustSell?: boolean,
  reason?: string,
): Promise<ApplyResult> {
  cleanExpiredPreviews();

  const cached = previewCache.get(previewToken);
  if (!cached || cached.expiresAt <= Date.now()) {
    previewCache.delete(previewToken);
    throw new Error("Preview token expired or not found. Please re-preview.");
  }

  const { changes } = cached.data;
  const batchId = randomUUID();
  let applied = 0;
  let skipped = 0;

  // Process in transaction batches of 500
  const BATCH_SIZE = 500;
  for (let i = 0; i < changes.length; i += BATCH_SIZE) {
    const batch = changes.slice(i, i + BATCH_SIZE);

    await db.transaction(async (tx) => {
      for (const change of batch) {
        const override = overrides?.[change.productId];
        let finalCost = override?.newCost ?? change.newCost;
        let finalSell = override?.newSell ?? change.newSell;

        // Auto-adjust sell price to maintain margin if only cost changed
        if (autoAdjustSell && finalCost && !finalSell && change.suggestedSell) {
          finalSell = change.suggestedSell;
        }

        if (!finalCost && !finalSell) {
          skipped++;
          continue;
        }

        // Update cost price
        if (finalCost && finalCost !== change.currentCost) {
          await tx
            .update(products)
            .set({ costPrice: finalCost })
            .where(and(eq(products.id, change.productId), eq(products.orgId, orgId)));

          await recordPriceChange(
            tx,
            orgId,
            change.productId,
            "COST_PRICE",
            change.currentCost,
            finalCost,
            userId,
            reason,
            batchId,
          );
        }

        // Update sell price
        if (finalSell && finalSell !== change.currentSell) {
          await tx
            .update(products)
            .set({ unitPrice: finalSell })
            .where(and(eq(products.id, change.productId), eq(products.orgId, orgId)));

          await recordPriceChange(
            tx,
            orgId,
            change.productId,
            "SELL_PRICE",
            change.currentSell,
            finalSell,
            userId,
            reason,
            batchId,
          );
        }

        applied++;
      }
    });
  }

  // Clean up the used preview token
  previewCache.delete(previewToken);

  return { applied, skipped, batchId };
}

/**
 * Get products below a margin threshold (margin alerts).
 */
export async function getMarginAlerts(
  orgId: string,
  threshold: number,
  inStockOnly: boolean = true,
  cursor?: string,
  limit: number = 100,
): Promise<{ data: MarginAlertRow[]; nextCursor: string | null; hasMore: boolean }> {
  const cursorCond = cursor ? sql`AND p.id > ${cursor}` : sql``;
  const havingCond = inStockOnly ? sql`HAVING COALESCE(SUM(i.stock_level), 0) > 0` : sql``;

  const rows = await db.execute(sql`
    SELECT
      p.id AS product_id,
      CASE WHEN p.parent_product_id IS NOT NULL
        THEN (SELECT p2.name FROM products p2 WHERE p2.id = p.parent_product_id) || ' — ' || p.name
        ELSE p.name END AS product_name,
      p.sku,
      b.name AS brand_name,
      c.name AS category_name,
      p.cost_price,
      p.unit_price,
      COALESCE(SUM(i.stock_level), 0)::int AS stock,
      CASE WHEN p.unit_price::numeric > 0
        THEN ROUND((p.unit_price::numeric - p.cost_price::numeric) / p.unit_price::numeric * 100, 2)
        ELSE 0 END AS margin_pct
    FROM products p
    LEFT JOIN products parent ON parent.id = p.parent_product_id
    LEFT JOIN brands b ON b.id = COALESCE(p.brand_id, parent.brand_id)
    LEFT JOIN categories c ON c.id = COALESCE(p.category_id, parent.category_id)
    LEFT JOIN inventory i ON i.product_id = p.id
    WHERE p.org_id = ${orgId}
      AND p.is_active = true
      AND p.unit_price::numeric > 0
      AND (p.unit_price::numeric - p.cost_price::numeric) / p.unit_price::numeric * 100 < ${threshold}
      ${cursorCond}
    GROUP BY p.id, p.name, p.parent_product_id, p.sku, p.cost_price, p.unit_price, parent.brand_id, parent.category_id, b.name, c.name
    ${havingCond}
    ORDER BY (p.unit_price::numeric - p.cost_price::numeric) / p.unit_price::numeric * 100 ASC, p.id ASC
    LIMIT ${limit + 1}
  `);

  const hasMore = (rows as any[]).length > limit;
  const data = hasMore ? (rows as any[]).slice(0, limit) : (rows as any[]);
  const nextCursor = hasMore ? data[data.length - 1]!.product_id : null;

  const enriched: MarginAlertRow[] = data.map((r: any) => ({
    id: r.product_id,
    productId: r.product_id,
    productName: r.product_name,
    sku: r.sku,
    brandName: r.brand_name ?? null,
    categoryName: r.category_name ?? null,
    costPrice: r.cost_price ?? "0",
    sellPrice: r.unit_price ?? "0",
    marginPct: String(r.margin_pct ?? "0"),
    stock: r.stock ?? 0,
  }));

  return { data: enriched, nextCursor, hasMore };
}

/**
 * Price change audit trail with filters and cursor pagination.
 */
export async function getPriceHistory(
  orgId: string,
  params: {
    productId?: string;
    dateFrom?: string;
    dateTo?: string;
    field?: "SELL_PRICE" | "COST_PRICE";
    source?: string;
    search?: string;
    batchId?: string;
    cursor?: string;
    limit?: number;
  },
): Promise<{ data: PriceHistoryRow[]; nextCursor: string | null; hasMore: boolean }> {
  const limit = params.limit ?? 50;

  const conditions: SQL[] = [eq(priceChanges.orgId, orgId)];

  if (params.productId) {
    conditions.push(eq(priceChanges.productId, params.productId));
  }

  if (params.dateFrom) {
    conditions.push(gte(priceChanges.changedAt, new Date(params.dateFrom)));
  }

  if (params.dateTo) {
    conditions.push(lte(priceChanges.changedAt, new Date(params.dateTo)));
  }

  if (params.field) {
    conditions.push(eq(priceChanges.field, params.field));
  }

  if (params.source) {
    conditions.push(eq(priceChanges.source, params.source));
  }

  if (params.search && params.search.length >= 2) {
    const pat = `%${params.search}%`;
    conditions.push(sql`(${products.name} ILIKE ${pat} OR ${products.sku} ILIKE ${pat})`);
  }

  if (params.batchId) {
    conditions.push(eq(priceChanges.batchId, params.batchId));
  }

  if (params.cursor) {
    conditions.push(gt(priceChanges.id, params.cursor));
  }

  const rows = await db
    .select({
      id: priceChanges.id,
      productId: priceChanges.productId,
      productName: sql<string>`CASE WHEN ${products.parentProductId} IS NOT NULL
        THEN (SELECT p2.name FROM products p2 WHERE p2.id = ${products.parentProductId}) || ' \u2014 ' || ${products.name}
        ELSE ${products.name} END`.as("product_name"),
      productSku: products.sku,
      field: priceChanges.field,
      oldValue: priceChanges.oldValue,
      newValue: priceChanges.newValue,
      changeReason: priceChanges.changeReason,
      source: priceChanges.source,
      batchId: priceChanges.batchId,
      changedBy: priceChanges.changedBy,
      changedByName: users.fullName,
      changedAt: priceChanges.changedAt,
    })
    .from(priceChanges)
    .innerJoin(products, eq(priceChanges.productId, products.id))
    .leftJoin(users, eq(priceChanges.changedBy, users.id))
    .where(and(...conditions))
    .orderBy(desc(priceChanges.changedAt), asc(priceChanges.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? data[data.length - 1]!.id : null;

  const enriched: PriceHistoryRow[] = data.map((r) => {
    const oldVal = parseFloat(r.oldValue ?? "0");
    const newVal = parseFloat(r.newValue ?? "0");
    const pctChange = oldVal > 0 ? Math.round(((newVal - oldVal) / oldVal) * 1000) / 10 : null;
    return {
      id: r.id,
      productId: r.productId,
      productName: r.productName,
      productSku: r.productSku,
      field: r.field,
      oldValue: r.oldValue,
      newValue: r.newValue,
      changeReason: r.changeReason,
      source: r.source ?? "manual",
      batchId: r.batchId,
      changedBy: r.changedBy,
      changedByName: r.changedByName ?? null,
      changedAt: r.changedAt instanceof Date ? r.changedAt.toISOString() : String(r.changedAt),
      pctChange,
    };
  });

  return { data: enriched, nextCursor, hasMore };
}

/**
 * Price history for a single product, ordered by changedAt desc.
 */
export async function getProductPriceHistory(
  orgId: string,
  productId: string,
  cursor?: string,
  limit: number = 50,
): Promise<{ data: PriceHistoryRow[]; nextCursor: string | null; hasMore: boolean }> {
  return getPriceHistory(orgId, { productId, cursor, limit });
}

/**
 * Update a single product's price (cost and/or sell) with audit trail.
 */
export async function updateSingleProductPrice(
  orgId: string,
  userId: string,
  productId: string,
  params: {
    newCost?: string;
    newSell?: string;
    reason?: string;
  },
): Promise<{ success: boolean; productId: string }> {
  // Fetch current product
  const [product] = await db
    .select({
      id: products.id,
      costPrice: products.costPrice,
      unitPrice: products.unitPrice,
    })
    .from(products)
    .where(and(eq(products.id, productId), eq(products.orgId, orgId)));

  if (!product) {
    throw new Error("Product not found");
  }

  await db.transaction(async (tx) => {
    if (params.newCost && params.newCost !== product.costPrice) {
      await tx
        .update(products)
        .set({ costPrice: params.newCost })
        .where(and(eq(products.id, productId), eq(products.orgId, orgId)));

      await recordPriceChange(
        tx,
        orgId,
        productId,
        "COST_PRICE",
        product.costPrice,
        params.newCost,
        userId,
        params.reason,
      );
    }

    if (params.newSell && params.newSell !== product.unitPrice) {
      await tx
        .update(products)
        .set({ unitPrice: params.newSell })
        .where(and(eq(products.id, productId), eq(products.orgId, orgId)));

      await recordPriceChange(
        tx,
        orgId,
        productId,
        "SELL_PRICE",
        product.unitPrice,
        params.newSell,
        userId,
        params.reason,
      );
    }
  });

  return { success: true, productId };
}
