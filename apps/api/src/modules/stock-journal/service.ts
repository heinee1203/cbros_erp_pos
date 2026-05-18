import { db } from "@apex/database";
import { stockJournal, products, locations, users, purchaseOrders, stockTransfers, sales, poReceiptEvents, historicalSales } from "@apex/database/schema";
import { eq, and, gt, lt, gte, lte, ilike, or, sql, inArray, type SQL } from "drizzle-orm";

// ── Types ──

export interface JournalQueryParams {
  orgId: string;
  /** Default location from store context. Used unless allLocations is true. */
  defaultLocationId: string;
  /** If true, ignore defaultLocationId and show all org locations. */
  allLocations?: boolean;
  /** Override to a specific location (takes precedence over defaultLocationId). */
  locationId?: string;
  /** Product name ILIKE / SKU exact match */
  search?: string;
  /** Filter by reference type (SALE, RECEIVING, ADJUSTMENT, etc.) */
  referenceType?: string;
  /** Filter by direction: positive (IN) or negative (OUT) change_quantity */
  direction?: "IN" | "OUT";
  /** effective_at >= dateFrom */
  dateFrom?: string;
  /** effective_at <= dateTo */
  dateTo?: string;
  /** Filter by adjustment reason code */
  reasonCode?: string;
  /** Filter by specific product ID */
  productId?: string;
  /** Keyset cursor — ID of last entry from previous page */
  cursor?: string;
  /** Page size (1–100, default 50) */
  limit?: number;
}

export interface JournalEntry {
  id: string;
  effectiveAt: Date;
  productId: string;
  productName: string;
  productSku: string;
  mnemonicSku: string;
  locationId: string;
  locationName: string;
  locationType: string;
  changeQuantity: number;
  balanceAfter: number;
  referenceType: string;
  referenceId: string;
  referenceNumber: string | null;
  referenceDocId: string | null;
  referenceLineId: string | null;
  reasonCode: string | null;
  notes: string | null;
  actorType: string;
  actorName: string | null;
  reversalOfJournalId: string | null;
  lineAmount: string | null; // ₱ amount for sales/refunds (net_sales or qty × unit_price)
  unitPrice: string | null;  // Per-unit price for sales/refunds
  createdAt: Date;
}

export interface JournalPage {
  data: JournalEntry[];
  nextCursor: string | null;
  hasMore: boolean;
}

// ── Service ──

/**
 * Reusable stock journal query builder.
 *
 * Designed to serve:
 *  - Inventory History page (all reference types)
 *  - Stock Adjustments history (referenceType = ADJUSTMENT)
 *  - Product detail movement timelines (productId filter)
 *  - Future exports / reporting
 */
export async function queryJournal(params: JournalQueryParams): Promise<JournalPage> {
  const limit = Math.min(Math.max(params.limit ?? 50, 1), 100);

  const conditions: SQL[] = [
    eq(stockJournal.orgId, params.orgId),
  ];

  // ── Location scoping ──
  if (params.allLocations) {
    // Show all org locations — no location filter
    // If an explicit locationId override is provided, use it even with allLocations
    if (params.locationId) {
      conditions.push(eq(stockJournal.locationId, params.locationId));
    }
  } else if (params.locationId) {
    // Explicit location override
    conditions.push(eq(stockJournal.locationId, params.locationId));
  } else {
    // Default: scope to store context location
    conditions.push(eq(stockJournal.locationId, params.defaultLocationId));
  }

  // ── Product filter ──
  if (params.productId) {
    conditions.push(eq(stockJournal.productId, params.productId));
  }

  // ── Product search (name ILIKE or exact SKU/mnemonic) ──
  if (params.search && params.search.length >= 2) {
    const term = params.search.trim();
    conditions.push(
      or(
        ilike(products.name, `%${term}%`),
        ilike(products.sku, `%${term}%`),
        ilike(products.mnemonicSku, `%${term}%`),
      )!,
    );
  }

  // ── Reference type ──
  if (params.referenceType) {
    conditions.push(eq(stockJournal.referenceType, params.referenceType as any));
  }

  // ── Direction ──
  if (params.direction === "IN") {
    conditions.push(gt(stockJournal.changeQuantity, 0));
  } else if (params.direction === "OUT") {
    conditions.push(lt(stockJournal.changeQuantity, 0));
  }

  // ── Date range ──
  if (params.dateFrom) {
    conditions.push(gte(stockJournal.effectiveAt, new Date(params.dateFrom)));
  }
  if (params.dateTo) {
    const to = new Date(params.dateTo);
    to.setHours(23, 59, 59, 999);
    conditions.push(lte(stockJournal.effectiveAt, to));
  }

  // ── Reason code ──
  if (params.reasonCode) {
    conditions.push(eq(stockJournal.reasonCode, params.reasonCode as any));
  }

  // ── Keyset cursor ──
  // Compound cursor on (effective_at DESC, id DESC).
  // Look up the cursor entry's effective_at, then filter for rows "before" it.
  if (params.cursor) {
    const [cursorRow] = await db
      .select({
        effectiveAt: stockJournal.effectiveAt,
        id: stockJournal.id,
      })
      .from(stockJournal)
      .where(eq(stockJournal.id, params.cursor))
      .limit(1);

    if (cursorRow) {
      conditions.push(
        sql`(${stockJournal.effectiveAt}, ${stockJournal.id}) < (${cursorRow.effectiveAt}, ${cursorRow.id})`,
      );
    }
  }

  // ── Query ──
  const rows = await db
    .select({
      id: stockJournal.id,
      effectiveAt: stockJournal.effectiveAt,
      productId: stockJournal.productId,
      productName: sql<string>`CASE WHEN ${products.parentProductId} IS NOT NULL THEN (SELECT pp.name FROM products pp WHERE pp.id = ${products.parentProductId}) || ' (' || ${products.name} || ')' ELSE ${products.name} END`.as("product_name"),
      productSku: products.sku,
      mnemonicSku: products.mnemonicSku,
      locationId: stockJournal.locationId,
      locationName: locations.name,
      locationType: locations.type,
      changeQuantity: stockJournal.changeQuantity,
      balanceAfter: stockJournal.balanceAfter,
      referenceType: stockJournal.referenceType,
      referenceId: stockJournal.referenceId,
      referenceNumber: sql<string | null>`COALESCE(${purchaseOrders.poNo}, ${stockTransfers.transferNo}, ${sales.saleNo})`.as("reference_number"),
      referenceDocId: sql<string | null>`COALESCE(${purchaseOrders.id}, ${stockTransfers.id}, ${sales.id})`.as("reference_doc_id"),
      referenceLineId: stockJournal.referenceLineId,
      reasonCode: stockJournal.reasonCode,
      notes: stockJournal.notes,
      actorType: stockJournal.actorType,
      actorName: users.fullName,
      reversalOfJournalId: stockJournal.reversalOfJournalId,
      lineAmount: stockJournal.unitCostSnapshot, // unit cost for POS journal entries
      unitPrice: sql<string | null>`NULL`.as("unit_price"),
      createdAt: stockJournal.createdAt,
    })
    .from(stockJournal)
    .innerJoin(products, eq(stockJournal.productId, products.id))
    .innerJoin(locations, eq(stockJournal.locationId, locations.id))
    .leftJoin(users, eq(stockJournal.userId, users.id))
    .leftJoin(poReceiptEvents, eq(stockJournal.referenceId, poReceiptEvents.id))
    .leftJoin(purchaseOrders, eq(poReceiptEvents.purchaseOrderId, purchaseOrders.id))
    .leftJoin(stockTransfers, eq(stockJournal.referenceId, stockTransfers.id))
    .leftJoin(sales, eq(stockJournal.referenceId, sales.id))
    .where(and(...conditions))
    .orderBy(sql`${stockJournal.effectiveAt} DESC, ${stockJournal.id} DESC`)
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore && data.length > 0 ? data[data.length - 1]!.id : null;

  return { data, nextCursor, hasMore };
}

/**
 * Query historical_sales (imported Loyverse receipts) for a specific product.
 * Returns entries shaped like JournalEntry for unified display.
 */
export async function queryHistoricalForProduct(
  orgId: string,
  productId: string,
  opts: { locationId?: string; dateFrom?: string; dateTo?: string; limit?: number; cursor?: string; variantProductId?: string } = {},
): Promise<JournalPage> {
  const limit = opts.limit ?? 50;

  // Get the product's SKU and check if it's a parent with variants
  const [product] = await db
    .select({ sku: products.sku, name: products.name, isParent: products.isParent })
    .from(products)
    .where(eq(products.id, productId))
    .limit(1);
  if (!product) return { data: [], nextCursor: null, hasMore: false };

  // Collect all SKUs to match: own SKU + variant SKUs (if parent product)
  const matchSkus: string[] = [];
  const matchProductIds: string[] = [productId];
  if (product.sku) matchSkus.push(product.sku);

  // Track variant info for display
  const variantSkuToName = new Map<string, string>();

  if (product.isParent) {
    const variants = await db
      .select({ id: products.id, sku: products.sku, name: products.name })
      .from(products)
      .where(eq(products.parentProductId, productId));

    // If filtering by a specific variant, only match that variant
    if (opts.variantProductId) {
      const targetVariant = variants.find(v => v.id === opts.variantProductId);
      if (targetVariant) {
        matchProductIds.length = 0; // Clear parent
        matchProductIds.push(targetVariant.id);
        matchSkus.length = 0; // Clear parent SKU
        if (targetVariant.sku) matchSkus.push(targetVariant.sku);
        variantSkuToName.set(targetVariant.sku || "", targetVariant.name);
      }
    } else {
      // Include all variants
      for (const v of variants) {
        matchProductIds.push(v.id);
        if (v.sku) {
          matchSkus.push(v.sku);
          variantSkuToName.set(v.sku, v.name);
        }
      }
    }
  }

  const conditions: SQL[] = [
    eq(historicalSales.orgId, orgId),
    sql`${historicalSales.reasonType} IN ('SALE', 'REFUND')`,
  ];

  // Match by productId(s) OR by SKU(s) — includes variants
  const orClauses: SQL[] = [];
  if (matchProductIds.length === 1) {
    orClauses.push(eq(historicalSales.productId, matchProductIds[0]));
  } else if (matchProductIds.length > 1) {
    orClauses.push(inArray(historicalSales.productId, matchProductIds));
  }
  if (matchSkus.length === 1) {
    orClauses.push(eq(historicalSales.sku, matchSkus[0]));
  } else if (matchSkus.length > 1) {
    orClauses.push(inArray(historicalSales.sku, matchSkus));
  }
  conditions.push(or(...orClauses)!);

  if (opts.locationId) conditions.push(eq(historicalSales.locationId, opts.locationId));
  if (opts.dateFrom) conditions.push(gte(historicalSales.movementDate, new Date(opts.dateFrom)));
  if (opts.dateTo) {
    const to = new Date(opts.dateTo);
    to.setHours(23, 59, 59, 999);
    conditions.push(lte(historicalSales.movementDate, to));
  }
  if (opts.cursor) {
    conditions.push(sql`${historicalSales.id} < ${opts.cursor}`);
  }

  const rows = await db
    .select()
    .from(historicalSales)
    .where(and(...conditions))
    .orderBy(sql`${historicalSales.movementDate} DESC, ${historicalSales.id} DESC`)
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore && data.length > 0 ? data[data.length - 1].id : null;

  // Map to JournalEntry-compatible shape
  const entries: JournalEntry[] = data.map((r) => {
    // Extract variant name: try SKU→name map first, then parse from product name "Parent (Variant)"
    let variantName: string | null = null;
    if (r.sku && variantSkuToName.has(r.sku)) {
      variantName = variantSkuToName.get(r.sku) || null;
    } else {
      const match = r.productName?.match(/\(([^)]+)\)$/);
      if (match) variantName = match[1];
    }

    return {
      id: `hist-${r.id}`,
      effectiveAt: r.movementDate,
      productId: r.productId || productId,
      productName: r.productName,
      productSku: r.sku,
      mnemonicSku: variantName || "",
      locationId: r.locationId || "",
      locationName: r.locationName,
      locationType: variantName ? "VARIANT" : "",
      changeQuantity: r.direction === "OUT" ? -r.quantity : r.quantity,
      balanceAfter: 0,
      referenceType: r.reasonType === "REFUND" ? "RETURN" : "SALE",
      referenceId: r.id,
      referenceNumber: r.reasonReference,
      referenceDocId: null,
      referenceLineId: null,
      reasonCode: null,
      notes: `Imported${r.employeeName ? ` · Cashier: ${r.employeeName}` : ""}`,
      actorType: "INTEGRATION",
      actorName: r.employeeName,
      reversalOfJournalId: null,
      lineAmount: r.netSales || null,
      unitPrice: r.unitPrice || null,
      createdAt: r.importedAt,
    };
  });

  return { data: entries, nextCursor, hasMore };
}
