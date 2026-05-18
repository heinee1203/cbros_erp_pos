import { db } from "@apex/database";
import { purchaseOrders } from "@apex/database/schema";
import { eq, sql } from "drizzle-orm";
import {
  isValidPOTransition,
  PROCUREMENT_ROLES,
  PurchaseOrderStatus,
} from "@apex/types";

function assertProcurementRole(userRole: string) {
  if (!PROCUREMENT_ROLES.includes(userRole as any)) {
    throw new Error(
      "Access denied: requires ADMIN, MANAGER, or WAREHOUSE_STAFF role",
    );
  }
}

export async function submitPO(
  poId: string,
  orgId: string,
  userId: string,
  userRole: string,
  idempotencyKey: string,
  notes?: string,
) {
  assertProcurementRole(userRole);

  return db.transaction(async (tx) => {
    const poRows = await tx.execute(
      sql`SELECT * FROM purchase_orders
          WHERE id = ${poId} AND org_id = ${orgId}
          FOR UPDATE`,
    );
    if (poRows.length === 0) throw new Error("Purchase Order not found");

    const po = poRows[0] as any;

    if (
      po.status === PurchaseOrderStatus.SUBMITTED &&
      po.idempotency_key === idempotencyKey
    ) {
      const [existing] = await tx
        .select()
        .from(purchaseOrders)
        .where(eq(purchaseOrders.id, poId))
        .limit(1);
      return existing;
    }

    if (
      !isValidPOTransition(
        po.status as PurchaseOrderStatus,
        PurchaseOrderStatus.SUBMITTED,
      )
    ) {
      throw new Error(`Cannot submit PO in ${po.status} status`);
    }

    const [updated] = await tx
      .update(purchaseOrders)
      .set({
        status: "SUBMITTED",
        submittedByUserId: userId,
        submittedAt: new Date(),
        idempotencyKey,
        notes: notes
          ? `${po.notes ?? ""}\n[Submitted] ${notes}`.trim()
          : po.notes,
      })
      .where(eq(purchaseOrders.id, poId))
      .returning();

    return updated;
  });
}

export async function closeWithVariance(
  poId: string,
  orgId: string,
  userId: string,
  userRole: string,
  idempotencyKey: string,
  notes?: string,
) {
  assertProcurementRole(userRole);

  return db.transaction(async (tx) => {
    const poRows = await tx.execute(
      sql`SELECT * FROM purchase_orders
          WHERE id = ${poId} AND org_id = ${orgId}
          FOR UPDATE`,
    );
    if (poRows.length === 0) throw new Error("Purchase Order not found");

    const po = poRows[0] as any;

    if (
      po.status === PurchaseOrderStatus.CLOSED_WITH_VARIANCE &&
      po.idempotency_key === idempotencyKey
    ) {
      const [existing] = await tx
        .select()
        .from(purchaseOrders)
        .where(eq(purchaseOrders.id, poId))
        .limit(1);
      return existing;
    }

    if (
      !isValidPOTransition(
        po.status as PurchaseOrderStatus,
        PurchaseOrderStatus.CLOSED_WITH_VARIANCE,
      )
    ) {
      throw new Error(
        `Cannot close PO with variance in ${po.status} status`,
      );
    }

    const [updated] = await tx
      .update(purchaseOrders)
      .set({
        status: "CLOSED_WITH_VARIANCE",
        closedByUserId: userId,
        closedAt: new Date(),
        idempotencyKey,
        notes: notes
          ? `${po.notes ?? ""}\n[Closed with variance] ${notes}`.trim()
          : po.notes,
      })
      .where(eq(purchaseOrders.id, poId))
      .returning();

    return updated;
  });
}

export async function cancelPO(
  poId: string,
  orgId: string,
  userId: string,
  userRole: string,
  idempotencyKey: string,
  notes?: string,
) {
  assertProcurementRole(userRole);

  return db.transaction(async (tx) => {
    const poRows = await tx.execute(
      sql`SELECT * FROM purchase_orders
          WHERE id = ${poId} AND org_id = ${orgId}
          FOR UPDATE`,
    );
    if (poRows.length === 0) throw new Error("Purchase Order not found");

    const po = poRows[0] as any;

    if (
      po.status === PurchaseOrderStatus.CANCELLED &&
      po.idempotency_key === idempotencyKey
    ) {
      const [existing] = await tx
        .select()
        .from(purchaseOrders)
        .where(eq(purchaseOrders.id, poId))
        .limit(1);
      return existing;
    }

    if (
      !isValidPOTransition(
        po.status as PurchaseOrderStatus,
        PurchaseOrderStatus.CANCELLED,
      )
    ) {
      throw new Error(`Cannot cancel PO in ${po.status} status`);
    }

    const [updated] = await tx
      .update(purchaseOrders)
      .set({
        status: "CANCELLED",
        cancelledByUserId: userId,
        cancelledAt: new Date(),
        idempotencyKey,
        notes: notes
          ? `${po.notes ?? ""}\n[Cancelled] ${notes}`.trim()
          : po.notes,
      })
      .where(eq(purchaseOrders.id, poId))
      .returning();

    return updated;
  });
}
