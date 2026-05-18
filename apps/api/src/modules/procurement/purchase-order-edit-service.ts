import { db } from "@apex/database";
import { poLines, purchaseOrders } from "@apex/database/schema";
import { and, eq } from "drizzle-orm";
import { getPOByNumber } from "./purchase-order-read-service";

export class PurchaseOrderEditError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
    this.name = "PurchaseOrderEditError";
  }
}

function toEditError(message: string, statusCode: number) {
  return new PurchaseOrderEditError(message, statusCode);
}

async function findPurchaseOrder(id: string, orgId: string) {
  const [po] = await db
    .select()
    .from(purchaseOrders)
    .where(and(eq(purchaseOrders.id, id), eq(purchaseOrders.orgId, orgId)))
    .limit(1);

  return po;
}

export async function updatePurchaseOrderHeader(
  id: string,
  orgId: string,
  body: any,
) {
  const po = await findPurchaseOrder(id, orgId);
  if (!po) throw toEditError("PO not found", 404);

  const editableStatuses = ["DRAFT", "SUBMITTED", "PARTIALLY_RECEIVED"];
  if (!editableStatuses.includes(po.status)) {
    throw toEditError(`Cannot edit PO in ${po.status} status`, 400);
  }

  const updates: Record<string, any> = {};

  if (body.supplierId !== undefined && po.status !== "PARTIALLY_RECEIVED") {
    updates.supplierId = body.supplierId;
  }
  if (
    body.destinationLocationId !== undefined &&
    po.status !== "PARTIALLY_RECEIVED"
  ) {
    updates.destinationLocationId = body.destinationLocationId;
  }
  if (body.expectedDeliveryDate !== undefined) {
    updates.expectedDeliveryDate = body.expectedDeliveryDate
      ? new Date(body.expectedDeliveryDate)
      : null;
  }
  if (body.notes !== undefined) {
    updates.notes = body.notes;
  }

  if (Object.keys(updates).length > 0) {
    await db
      .update(purchaseOrders)
      .set(updates)
      .where(eq(purchaseOrders.id, id));
  }

  return getPOByNumber(po.poNo, orgId);
}

export async function addPurchaseOrderLine(
  id: string,
  orgId: string,
  body: any,
) {
  const po = await findPurchaseOrder(id, orgId);
  if (!po) throw toEditError("PO not found", 404);

  if (!["DRAFT", "SUBMITTED"].includes(po.status)) {
    throw toEditError(`Cannot add lines to PO in ${po.status} status`, 400);
  }

  if (!body.productId || !body.orderedQty || !body.unitCost) {
    throw toEditError(
      "productId, orderedQty, and unitCost are required",
      400,
    );
  }

  const [line] = await db
    .insert(poLines)
    .values({
      purchaseOrderId: id,
      orgId,
      productId: body.productId,
      orderedQty: body.orderedQty,
      unitCost: body.unitCost,
      listPrice: body.listPrice ?? null,
      discountChain: body.discountChain ?? null,
    })
    .returning();

  return line;
}

export async function updatePurchaseOrderLine(
  id: string,
  lineId: string,
  orgId: string,
  body: any,
) {
  const po = await findPurchaseOrder(id, orgId);
  if (!po) throw toEditError("PO not found", 404);

  if (!["DRAFT", "SUBMITTED", "PARTIALLY_RECEIVED"].includes(po.status)) {
    throw toEditError(`Cannot edit lines on PO in ${po.status} status`, 400);
  }

  const [line] = await db
    .select()
    .from(poLines)
    .where(and(eq(poLines.id, lineId), eq(poLines.purchaseOrderId, id)))
    .limit(1);

  if (!line) throw toEditError("PO line not found", 404);

  if (po.status === "PARTIALLY_RECEIVED") {
    if (line.receivedAcceptedQty > 0 || line.rejectedQty > 0) {
      throw toEditError("Cannot edit a line that has already been received", 400);
    }
  }

  const updates: Record<string, any> = {};
  if (body.orderedQty !== undefined) updates.orderedQty = body.orderedQty;
  if (body.unitCost !== undefined) updates.unitCost = body.unitCost;
  if (body.productId !== undefined) updates.productId = body.productId;
  if (body.listPrice !== undefined) updates.listPrice = body.listPrice;
  if (body.discountChain !== undefined)
    updates.discountChain = body.discountChain;

  if (Object.keys(updates).length === 0) {
    return line;
  }

  const [updated] = await db
    .update(poLines)
    .set(updates)
    .where(eq(poLines.id, lineId))
    .returning();

  return updated;
}

export async function deletePurchaseOrderLine(
  id: string,
  lineId: string,
  orgId: string,
) {
  const po = await findPurchaseOrder(id, orgId);
  if (!po) throw toEditError("PO not found", 404);

  if (!["DRAFT", "SUBMITTED"].includes(po.status)) {
    throw toEditError(`Cannot remove lines from PO in ${po.status} status`, 400);
  }

  const [line] = await db
    .select()
    .from(poLines)
    .where(and(eq(poLines.id, lineId), eq(poLines.purchaseOrderId, id)))
    .limit(1);

  if (!line) throw toEditError("PO line not found", 404);

  if (line.receivedAcceptedQty > 0 || line.rejectedQty > 0) {
    throw toEditError(
      "Cannot delete a line that has been partially received",
      400,
    );
  }

  await db.delete(poLines).where(eq(poLines.id, lineId));
}
