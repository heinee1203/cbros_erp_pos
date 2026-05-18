import { db } from "@apex/database";
import {
  locations,
  poLines,
  poReceiptEvents,
  poReceipts,
  products,
  purchaseOrders,
  stockJournal,
  suppliers,
  users,
} from "@apex/database/schema";
import { and, asc, desc, eq, inArray, sql, type SQL } from "drizzle-orm";

export async function getPOReceipts(poId: string, orgId: string) {
  const receipts = await db
    .select({
      id: poReceipts.id,
      supplierDrNo: poReceipts.supplierDrNo,
      receivedByUserId: poReceipts.receivedByUserId,
      lineCount: poReceipts.lineCount,
      totalAcceptedQty: poReceipts.totalAcceptedQty,
      totalRejectedQty: poReceipts.totalRejectedQty,
      notes: poReceipts.notes,
      createdAt: poReceipts.createdAt,
      receivedByName: users.fullName,
    })
    .from(poReceipts)
    .innerJoin(users, eq(users.id, poReceipts.receivedByUserId))
    .where(
      and(
        eq(poReceipts.purchaseOrderId, poId),
        eq(poReceipts.orgId, orgId),
      ),
    )
    .orderBy(desc(poReceipts.createdAt));

  if (receipts.length === 0) return [];

  const receiptIds = receipts.map((r) => r.id);

  const events = await db
    .select({
      id: poReceiptEvents.id,
      poReceiptId: poReceiptEvents.poReceiptId,
      poLineId: poReceiptEvents.poLineId,
      productId: poReceiptEvents.productId,
      receivedAcceptedQty: poReceiptEvents.receivedAcceptedQty,
      rejectedQty: poReceiptEvents.rejectedQty,
      unitCost: poReceiptEvents.unitCost,
      notes: poReceiptEvents.notes,
      createdAt: poReceiptEvents.createdAt,
      productName: products.name,
      sku: products.sku,
      mnemonicSku: products.mnemonicSku,
    })
    .from(poReceiptEvents)
    .innerJoin(products, eq(products.id, poReceiptEvents.productId))
    .where(inArray(poReceiptEvents.poReceiptId, receiptIds))
    .orderBy(asc(poReceiptEvents.createdAt));

  const eventsByReceiptId = new Map<string, typeof events>();
  for (const event of events) {
    const key = event.poReceiptId!;
    if (!eventsByReceiptId.has(key)) {
      eventsByReceiptId.set(key, []);
    }
    eventsByReceiptId.get(key)!.push(event);
  }

  return receipts.map((r) => ({
    ...r,
    lines: eventsByReceiptId.get(r.id) ?? [],
  }));
}

export async function getPO(poId: string, orgId: string) {
  const [po] = await db
    .select()
    .from(purchaseOrders)
    .where(
      and(eq(purchaseOrders.id, poId), eq(purchaseOrders.orgId, orgId)),
    )
    .limit(1);

  if (!po) return null;
  return buildPODetail(po);
}

export async function getPOByNumber(poNo: string, orgId: string) {
  const [po] = await db
    .select()
    .from(purchaseOrders)
    .where(
      and(eq(purchaseOrders.poNo, poNo), eq(purchaseOrders.orgId, orgId)),
    )
    .limit(1);

  if (!po) return null;
  return buildPODetail(po);
}

async function buildPODetail(po: typeof purchaseOrders.$inferSelect) {
  const [supplier] = await db
    .select({
      id: suppliers.id,
      name: suppliers.name,
      contactEmail: suppliers.contactEmail,
      contactPhone: suppliers.contactPhone,
      mnemonicCode: suppliers.mnemonicCode,
    })
    .from(suppliers)
    .where(eq(suppliers.id, po.supplierId))
    .limit(1);

  const [location] = await db
    .select({
      id: locations.id,
      name: locations.name,
      code: locations.code,
      type: locations.type,
    })
    .from(locations)
    .where(eq(locations.id, po.destinationLocationId))
    .limit(1);

  const rawLines = await db
    .select({
      id: poLines.id,
      productId: poLines.productId,
      orderedQty: poLines.orderedQty,
      receivedAcceptedQty: poLines.receivedAcceptedQty,
      rejectedQty: poLines.rejectedQty,
      unitCost: poLines.unitCost,
      listPrice: poLines.listPrice,
      discountChain: poLines.discountChain,
      unit: poLines.unit,
      poConversionFactor: poLines.poConversionFactor,
      createdAt: poLines.createdAt,
      productName: products.name,
      sellingUnit: products.sellingUnit,
      sku: products.sku,
      mnemonicSku: products.mnemonicSku,
      category: products.category,
      barcode: products.barcode,
      unitPrice: products.unitPrice,
      mnemonicCostCode: products.mnemonicCostCode,
      parentProductId: products.parentProductId,
      parentName:
        sql<string | null>`(SELECT pp.name FROM products pp WHERE pp.id = ${products.parentProductId})`.as(
          "parent_name",
        ),
      isSerialized: products.isSerialized,
      isTire: products.isTire,
    })
    .from(poLines)
    .innerJoin(products, eq(products.id, poLines.productId))
    .where(eq(poLines.purchaseOrderId, po.id))
    .orderBy(asc(poLines.createdAt));

  const receiptEvents = await db
    .select()
    .from(poReceiptEvents)
    .where(eq(poReceiptEvents.purchaseOrderId, po.id))
    .orderBy(asc(poReceiptEvents.createdAt));

  return {
    ...po,
    supplier,
    destination: location,
    lines: rawLines.sort((a, b) => {
      const nameA = a.parentName
        ? `${a.parentName} (${a.productName})`
        : a.productName;
      const nameB = b.parentName
        ? `${b.parentName} (${b.productName})`
        : b.productName;
      return nameA.localeCompare(nameB);
    }),
    receiptEvents,
  };
}

export async function listPOs(
  orgId: string,
  opts: {
    cursor?: string;
    limit?: number;
    status?: string;
    supplierId?: string;
    destinationLocationId?: string;
    createdAfter?: string;
    createdBefore?: string;
  } = {},
) {
  const limit = opts.limit ?? 50;
  const conditions: SQL[] = [eq(purchaseOrders.orgId, orgId)];

  if (opts.status) {
    conditions.push(eq(purchaseOrders.status, opts.status as any));
  }
  if (opts.supplierId) {
    conditions.push(eq(purchaseOrders.supplierId, opts.supplierId));
  }
  if (opts.destinationLocationId) {
    conditions.push(
      eq(purchaseOrders.destinationLocationId, opts.destinationLocationId),
    );
  }
  if (opts.createdAfter) {
    conditions.push(sql`${purchaseOrders.createdAt} >= ${opts.createdAfter}`);
  }
  if (opts.createdBefore) {
    conditions.push(
      sql`${purchaseOrders.createdAt} <= ${opts.createdBefore}::date + INTERVAL '1 day'`,
    );
  }
  if (opts.cursor) {
    conditions.push(
      sql`${purchaseOrders.createdAt} < (SELECT created_at FROM purchase_orders WHERE id = ${opts.cursor})`,
    );
  }

  const results = await db
    .select({
      id: purchaseOrders.id,
      poNo: purchaseOrders.poNo,
      status: purchaseOrders.status,
      supplierId: purchaseOrders.supplierId,
      destinationLocationId: purchaseOrders.destinationLocationId,
      expectedDeliveryDate: purchaseOrders.expectedDeliveryDate,
      createdAt: purchaseOrders.createdAt,
      updatedAt: purchaseOrders.updatedAt,
      supplierName: suppliers.name,
      destinationLocationName: locations.name,
      receiptCount: sql<number>`(
        SELECT COUNT(*)::int FROM po_receipts pr
        WHERE pr.purchase_order_id = ${purchaseOrders.id}
      )`,
      totalReceiptValue: sql<string>`(
        SELECT COALESCE(SUM(pre.received_accepted_qty * pre.unit_cost), 0)::numeric(14,2)
        FROM po_receipt_events pre
        WHERE pre.purchase_order_id = ${purchaseOrders.id}
      )`,
    })
    .from(purchaseOrders)
    .innerJoin(suppliers, eq(suppliers.id, purchaseOrders.supplierId))
    .innerJoin(locations, eq(locations.id, purchaseOrders.destinationLocationId))
    .where(and(...conditions))
    .orderBy(desc(purchaseOrders.createdAt), desc(purchaseOrders.id))
    .limit(limit + 1);

  const hasMore = results.length > limit;
  const data = hasMore ? results.slice(0, limit) : results;
  const nextCursor = hasMore ? data[data.length - 1].id : null;

  return { data, nextCursor, hasMore };
}

export async function getReceiptsSummary(poId: string, orgId: string) {
  const receipts = await db
    .select({
      id: poReceipts.id,
      receiptNumber: poReceipts.supplierDrNo,
      receivedAt: poReceipts.createdAt,
      receivedByName: users.fullName,
      lineCount: poReceipts.lineCount,
      totalAcceptedQty: poReceipts.totalAcceptedQty,
    })
    .from(poReceipts)
    .innerJoin(users, eq(users.id, poReceipts.receivedByUserId))
    .where(
      and(
        eq(poReceipts.purchaseOrderId, poId),
        eq(poReceipts.orgId, orgId),
      ),
    )
    .orderBy(desc(poReceipts.createdAt));

  if (receipts.length === 0) return [];

  const receiptIds = receipts.map((r) => r.id);
  const values = await db
    .select({
      poReceiptId: poReceiptEvents.poReceiptId,
      totalValue: sql<string>`SUM(${poReceiptEvents.receivedAcceptedQty} * ${poReceiptEvents.unitCost})::numeric(14,2)`,
    })
    .from(poReceiptEvents)
    .where(inArray(poReceiptEvents.poReceiptId, receiptIds))
    .groupBy(poReceiptEvents.poReceiptId);

  const valueMap = new Map(values.map((v) => [v.poReceiptId!, v.totalValue]));

  return receipts.map((r) => ({
    id: r.id,
    receiptNumber: r.receiptNumber,
    receivedAt: r.receivedAt.toISOString(),
    receivedByName: r.receivedByName,
    lineCount: r.lineCount,
    totalAcceptedQty: r.totalAcceptedQty,
    totalValue: parseFloat(valueMap.get(r.id) ?? "0"),
  }));
}

export async function listPOsReceivedAt(
  orgId: string,
  locationId: string,
  search?: string,
  limit: number = 20,
) {
  const conditions = [
    eq(purchaseOrders.orgId, orgId),
    eq(purchaseOrders.destinationLocationId, locationId),
    sql`${purchaseOrders.status} IN ('FULLY_RECEIVED', 'CLOSED_WITH_VARIANCE', 'PARTIALLY_RECEIVED')`,
  ];

  if (search?.trim()) {
    conditions.push(
      sql`${purchaseOrders.poNo} ILIKE ${"%" + search.trim() + "%"}`,
    );
  }

  const pos = await db
    .select({
      id: purchaseOrders.id,
      poNo: purchaseOrders.poNo,
      status: purchaseOrders.status,
      destinationLocationId: purchaseOrders.destinationLocationId,
      createdAt: purchaseOrders.createdAt,
      supplierName: suppliers.name,
      lineCount: sql<number>`(SELECT COUNT(*)::int FROM po_lines pl WHERE pl.purchase_order_id = ${purchaseOrders.id})`,
      totalReceivedQty: sql<number>`(SELECT COALESCE(SUM(pl.received_accepted_qty), 0)::int FROM po_lines pl WHERE pl.purchase_order_id = ${purchaseOrders.id})`,
    })
    .from(purchaseOrders)
    .innerJoin(suppliers, eq(suppliers.id, purchaseOrders.supplierId))
    .where(and(...conditions))
    .orderBy(desc(purchaseOrders.updatedAt))
    .limit(limit);

  const results = [];
  for (const po of pos) {
    const items = await db
      .select({
        productId: poLines.productId,
        productName: products.name,
        sku: products.sku,
        mnemonicSku: products.mnemonicSku,
        receivedQty: poLines.receivedAcceptedQty,
        orderedQty: poLines.orderedQty,
        unitCost: poLines.unitCost,
      })
      .from(poLines)
      .innerJoin(products, eq(products.id, poLines.productId))
      .where(
        and(
          eq(poLines.purchaseOrderId, po.id),
          sql`${poLines.receivedAcceptedQty} > 0`,
        ),
      )
      .orderBy(asc(poLines.createdAt));

    results.push({
      ...po,
      items: items.map((item) => ({
        ...item,
        unitCost: Number(item.unitCost),
      })),
    });
  }

  return { data: results };
}

export async function getPOReceiptEvents(poId: string, orgId: string) {
  const events = await db
    .select()
    .from(poReceiptEvents)
    .where(
      and(
        eq(poReceiptEvents.purchaseOrderId, poId),
        eq(poReceiptEvents.orgId, orgId),
      ),
    )
    .orderBy(asc(poReceiptEvents.createdAt));

  return events;
}

export async function getPOJournal(poId: string, orgId: string) {
  const events = await db
    .select({ id: poReceiptEvents.id })
    .from(poReceiptEvents)
    .where(
      and(
        eq(poReceiptEvents.purchaseOrderId, poId),
        eq(poReceiptEvents.orgId, orgId),
      ),
    );

  if (events.length === 0) return [];

  const eventIds = events.map((e) => e.id);

  const entries = await db
    .select()
    .from(stockJournal)
    .where(
      and(
        eq(stockJournal.orgId, orgId),
        eq(stockJournal.referenceType, "RECEIVING"),
        inArray(stockJournal.referenceId, eventIds),
      ),
    )
    .orderBy(asc(stockJournal.effectiveAt), asc(stockJournal.createdAt));

  return entries;
}
