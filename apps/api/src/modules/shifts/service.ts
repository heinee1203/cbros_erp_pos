import { db, type DbOrTx } from "@apex/database";
import {
  shifts,
  sales,
  saleLines,
  salePayments,
  products,
  inventory,
  users,
  locations,
} from "@apex/database/schema";
import { eq, and, sql, desc, inArray, type SQL } from "drizzle-orm";
import { ShiftStatus, SHIFT_FORCE_CLOSE_ROLES } from "@apex/types";

// ── Types ──

export interface ZReadingData {
  shiftId: string;
  cashierName: string;
  locationName: string;
  openedAt: string;
  closedAt: string | null;
  openingFloat: string;
  salesSummary: {
    grossSales: string;
    refundsTotal: string;
    netSales: string;
    transactionCount: number;
    avgTicket: string;
    voidCount: number;
  };
  paymentBreakdown: Array<{
    method: string;
    total: string;
    count: number;
  }>;
  cashReconciliation: {
    expectedCash: string;
    actualCash: string | null;
    variance: string | null;
  };
  topItems: Array<{
    productName: string;
    mnemonicSku: string;
    unitsSold: number;
    totalRevenue: string;
  }>;
  accountability: {
    voids: Array<{
      saleNo: string;
      amount: string;
      voidedAt: string | null;
      voidedBy: string | null;
      reason: string | null;
    }>;
    refunds: Array<{
      saleNo: string;
      amount: string;
      refundedAt: string | null;
      refundedBy: string | null;
      reason: string | null;
    }>;
    drawerEvents: Array<ShiftDrawerEventData>;
  };
}

export type ShiftDrawerEventAction = "NO_SALE" | "PAID_IN" | "PAID_OUT";

export interface ShiftDrawerEventData {
  id: string;
  type: ShiftDrawerEventAction;
  amount: string;
  reason: string;
  locationId: string;
  locationName: string;
  shiftId: string;
  cashierId: string;
  cashierName: string;
  approvedBy: string;
  authorizationMethod: "pin" | "barcode" | "card";
  authorizationUserId: string | null;
  drawerOpened: boolean;
  drawerError: string | null;
  clientEventId: string | null;
  createdAt: string;
}

export type ShiftDrawerEventCreateInput = {
  type: ShiftDrawerEventAction;
  amount?: string | number | null;
  reason?: string | null;
  clientEventId?: string | null;
  authorizationMethod: "pin" | "barcode" | "card";
  authorizationUserId: string;
  approvedBy: string;
  drawerOpened?: boolean;
  drawerError?: string | null;
};

function mapShiftDrawerEventRow(row: any): ShiftDrawerEventData {
  return {
    id: row.id,
    type: row.type ?? row.action,
    amount: String(row.amount ?? "0.00"),
    reason: row.reason ?? "",
    locationId: row.locationId ?? row.location_id,
    locationName: row.locationName ?? row.location_name ?? "",
    shiftId: row.shiftId ?? row.shift_id,
    cashierId: row.cashierId ?? row.cashier_user_id,
    cashierName: row.cashierName ?? row.cashier_name ?? "",
    approvedBy: row.approvedBy ?? row.approved_by_name ?? "Manager",
    authorizationMethod: row.authorizationMethod ?? row.authorization_method,
    authorizationUserId: row.authorizationUserId ?? row.approved_by_user_id ?? null,
    drawerOpened: Boolean(row.drawerOpened ?? row.drawer_opened),
    drawerError: row.drawerError ?? row.drawer_error ?? null,
    clientEventId: row.clientEventId ?? row.client_event_id ?? null,
    createdAt: row.createdAt?.toISOString?.() ?? row.created_at?.toISOString?.() ?? row.createdAt ?? row.created_at,
  };
}

function parseDrawerAction(value: unknown): ShiftDrawerEventAction {
  if (value === "NO_SALE" || value === "PAID_IN" || value === "PAID_OUT") {
    return value;
  }
  throw new Error("Drawer action must be NO_SALE, PAID_IN, or PAID_OUT");
}

function parseDrawerAmount(action: ShiftDrawerEventAction, value: unknown): number {
  if (action === "NO_SALE") return 0;
  const amount = parseFloat(String(value ?? "0").trim());
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Drawer amount must be greater than zero");
  }
  return amount;
}

// ── Core Functions ──

/**
 * Find or create an OPEN shift for the given cashier at the given location.
 * Called inside completeSale transaction — uses the same tx.
 * Handles race conditions via partial unique index retry.
 */
export async function getOrCreateShift(
  tx: DbOrTx,
  orgId: string,
  locationId: string,
  userId: string,
): Promise<{ id: string }> {
  // Try to find existing OPEN shift
  const existing = await tx
    .select({ id: shifts.id })
    .from(shifts)
    .where(
      and(
        eq(shifts.orgId, orgId),
        eq(shifts.locationId, locationId),
        eq(shifts.userId, userId),
        eq(shifts.status, "OPEN"),
      ),
    )
    .limit(1);

  if (existing.length > 0) {
    return { id: existing[0].id };
  }

  // Create new shift
  try {
    const [newShift] = await tx
      .insert(shifts)
      .values({
        orgId,
        locationId,
        userId,
        status: "OPEN",
        openedAt: new Date(),
      })
      .returning({ id: shifts.id });

    return { id: newShift.id };
  } catch (err: any) {
    // Handle unique constraint violation (race condition)
    if (err.code === "23505") {
      const [retryShift] = await tx
        .select({ id: shifts.id })
        .from(shifts)
        .where(
          and(
            eq(shifts.orgId, orgId),
            eq(shifts.locationId, locationId),
            eq(shifts.userId, userId),
            eq(shifts.status, "OPEN"),
          ),
        )
        .limit(1);

      if (retryShift) return { id: retryShift.id };
    }
    throw err;
  }
}

/**
 * Get the active (OPEN) shift for the current user at the current location.
 */
export async function getActiveShift(
  orgId: string,
  locationId: string,
  userId: string,
) {
  const [shift] = await db
    .select({
      id: shifts.id,
      status: shifts.status,
      openedAt: shifts.openedAt,
      openingFloat: shifts.openingFloat,
      userId: shifts.userId,
      locationId: shifts.locationId,
      cashierName: users.fullName,
      locationName: locations.name,
    })
    .from(shifts)
    .innerJoin(users, eq(users.id, shifts.userId))
    .innerJoin(locations, eq(locations.id, shifts.locationId))
    .where(
      and(
        eq(shifts.orgId, orgId),
        eq(shifts.locationId, locationId),
        eq(shifts.userId, userId),
        eq(shifts.status, "OPEN"),
      ),
    )
    .limit(1);

  return shift ?? null;
}

/**
 * Close a shift — compute expected cash, set variance, snapshot Z-reading.
 */
export async function listShiftDrawerEvents(
  shiftId: string,
  orgId: string,
): Promise<ShiftDrawerEventData[]> {
  const rows = await db.execute(sql`
    SELECT
      sde.id,
      sde.action AS "type",
      sde.amount::text AS "amount",
      sde.reason,
      sde.location_id AS "locationId",
      l.name AS "locationName",
      sde.shift_id AS "shiftId",
      sde.cashier_user_id AS "cashierId",
      cashier.full_name AS "cashierName",
      sde.approved_by_name AS "approvedBy",
      sde.authorization_method AS "authorizationMethod",
      sde.approved_by_user_id AS "authorizationUserId",
      sde.drawer_opened AS "drawerOpened",
      sde.drawer_error AS "drawerError",
      sde.client_event_id AS "clientEventId",
      sde.created_at AS "createdAt"
    FROM shift_drawer_events sde
    JOIN locations l ON l.id = sde.location_id
    JOIN users cashier ON cashier.id = sde.cashier_user_id
    WHERE sde.shift_id = ${shiftId}
      AND sde.org_id = ${orgId}
    ORDER BY sde.created_at DESC
  `);

  return (rows as any[]).map(mapShiftDrawerEventRow);
}

export async function createShiftDrawerEvent(
  shiftId: string,
  orgId: string,
  locationId: string,
  cashierUserId: string,
  input: ShiftDrawerEventCreateInput,
): Promise<ShiftDrawerEventData> {
  const action = parseDrawerAction(input.type);
  const amount = parseDrawerAmount(action, input.amount);
  const reason = String(input.reason ?? "").trim().slice(0, 500);
  const clientEventId = input.clientEventId ? String(input.clientEventId).slice(0, 120) : null;

  if (action !== "NO_SALE" && reason.length < 3) {
    throw new Error("Reason is required for paid-in and paid-out events");
  }

  return db.transaction(async (tx) => {
    const shiftRows = await tx.execute(sql`
      SELECT id, location_id, status
      FROM shifts
      WHERE id = ${shiftId}
        AND org_id = ${orgId}
      FOR UPDATE
    `);
    const shift = shiftRows[0] as any;
    if (!shift) throw new Error("Shift not found");
    if (shift.status !== "OPEN") {
      throw new Error(`Cannot record drawer event for ${shift.status} shift`);
    }
    if (shift.location_id !== locationId) {
      throw new Error("Drawer event location must match the locked register location");
    }

    if (clientEventId) {
      const existing = await tx.execute(sql`
        SELECT
          sde.id,
          sde.action AS "type",
          sde.amount::text AS "amount",
          sde.reason,
          sde.location_id AS "locationId",
          l.name AS "locationName",
          sde.shift_id AS "shiftId",
          sde.cashier_user_id AS "cashierId",
          cashier.full_name AS "cashierName",
          sde.approved_by_name AS "approvedBy",
          sde.authorization_method AS "authorizationMethod",
          sde.approved_by_user_id AS "authorizationUserId",
          sde.drawer_opened AS "drawerOpened",
          sde.drawer_error AS "drawerError",
          sde.client_event_id AS "clientEventId",
          sde.created_at AS "createdAt"
        FROM shift_drawer_events sde
        JOIN locations l ON l.id = sde.location_id
        JOIN users cashier ON cashier.id = sde.cashier_user_id
        WHERE sde.org_id = ${orgId}
          AND sde.client_event_id = ${clientEventId}
        LIMIT 1
      `);
      if (existing.length > 0) {
        return mapShiftDrawerEventRow(existing[0]);
      }
    }

    const inserted = await tx.execute(sql`
      INSERT INTO shift_drawer_events (
        org_id,
        location_id,
        shift_id,
        cashier_user_id,
        approved_by_user_id,
        approved_by_name,
        action,
        amount,
        reason,
        authorization_method,
        drawer_opened,
        drawer_error,
        client_event_id
      )
      VALUES (
        ${orgId},
        ${locationId},
        ${shiftId},
        ${cashierUserId},
        ${input.authorizationUserId},
        ${input.approvedBy},
        ${action},
        ${amount.toFixed(2)},
        ${reason},
        ${input.authorizationMethod},
        ${Boolean(input.drawerOpened)},
        ${input.drawerError ? String(input.drawerError).slice(0, 500) : null},
        ${clientEventId}
      )
      RETURNING
        id,
        action AS "type",
        amount::text AS "amount",
        reason,
        location_id AS "locationId",
        (SELECT name FROM locations WHERE id = shift_drawer_events.location_id) AS "locationName",
        shift_id AS "shiftId",
        cashier_user_id AS "cashierId",
        (SELECT full_name FROM users WHERE id = shift_drawer_events.cashier_user_id) AS "cashierName",
        approved_by_name AS "approvedBy",
        authorization_method AS "authorizationMethod",
        approved_by_user_id AS "authorizationUserId",
        drawer_opened AS "drawerOpened",
        drawer_error AS "drawerError",
        client_event_id AS "clientEventId",
        created_at AS "createdAt"
    `);

    return mapShiftDrawerEventRow(inserted[0]);
  });
}

export async function closeShift(
  shiftId: string,
  orgId: string,
  userId: string,
  input: { actualCash: string; expectedCashAdjustment?: string; notes?: string },
) {
  return db.transaction(async (tx) => {
    // Lock the shift row
    const shiftRows = await tx.execute(
      sql`SELECT * FROM shifts WHERE id = ${shiftId} AND org_id = ${orgId} FOR UPDATE`,
    );
    if (shiftRows.length === 0) throw new Error("Shift not found");

    const shift = shiftRows[0] as any;
    if (shift.status !== "OPEN") {
      throw new Error(`Cannot close shift in ${shift.status} status`);
    }
    if (shift.user_id !== userId) {
      throw new Error("Only the shift owner can close their shift");
    }

    // Compute Z-reading
    const zReading = await computeZReading(tx, shiftId, orgId);

    const actualCash = parseFloat(String(input.actualCash).trim());
    if (!Number.isFinite(actualCash) || actualCash < 0) {
      throw new Error("actualCash must be a non-negative amount");
    }
    const expectedCashAdjustment = parseFloat(String(input.expectedCashAdjustment ?? "0").trim());
    if (!Number.isFinite(expectedCashAdjustment)) {
      throw new Error("expectedCashAdjustment must be a valid amount");
    }
    const expectedCash =
      parseFloat(zReading.cashReconciliation.expectedCash) + expectedCashAdjustment;
    const variance = actualCash - expectedCash;
    const closedAt = new Date();
    const closedSnapshot: ZReadingData = {
      ...zReading,
      closedAt: closedAt.toISOString(),
      cashReconciliation: {
        ...zReading.cashReconciliation,
        expectedCash: expectedCash.toFixed(2),
        actualCash: actualCash.toFixed(2),
        variance: variance.toFixed(2),
      },
    };

    // Update shift
    const [updated] = await tx
      .update(shifts)
      .set({
        status: "CLOSED",
        closedAt,
        closedByUserId: userId,
        actualCash: actualCash.toFixed(2),
        cashVariance: variance.toFixed(2),
        zReadingSnapshot: closedSnapshot,
        notes: input.notes ?? null,
      })
      .where(eq(shifts.id, shiftId))
      .returning();

    return updated;
  });
}

/**
 * Force-close a shift after a manager/admin authorization credential was verified.
 */
export async function forceCloseShift(
  shiftId: string,
  orgId: string,
  managerId: string,
  managerRole: string,
  managerName?: string,
  authorizationMethod = "authorization",
) {
  if (!SHIFT_FORCE_CLOSE_ROLES.includes(managerRole as any)) {
    throw new Error("Only ADMIN or MANAGER can force-close shifts");
  }

  return db.transaction(async (tx) => {
    // Lock shift
    const shiftRows = await tx.execute(
      sql`SELECT * FROM shifts WHERE id = ${shiftId} AND org_id = ${orgId} FOR UPDATE`,
    );
    if (shiftRows.length === 0) throw new Error("Shift not found");

    const shift = shiftRows[0] as any;
    if (shift.status !== "OPEN") {
      throw new Error(`Cannot force-close shift in ${shift.status} status`);
    }

    // Compute Z-reading
    const zReading = await computeZReading(tx, shiftId, orgId);

    const closedAt = new Date();
    const closedSnapshot: ZReadingData = {
      ...zReading,
      closedAt: closedAt.toISOString(),
    };

    const [updated] = await tx
      .update(shifts)
      .set({
        status: "FORCE_CLOSED",
        closedAt,
        closedByUserId: managerId,
        zReadingSnapshot: closedSnapshot,
        notes: `Force-closed by ${managerName ?? "manager"} via ${authorizationMethod}`,
      })
      .where(eq(shifts.id, shiftId))
      .returning();

    return updated;
  });
}

/**
 * Get Z-reading for a shift.
 * OPEN shifts: live computation.
 * CLOSED/FORCE_CLOSED: return frozen snapshot.
 */
export async function getShiftZReading(
  shiftId: string,
  orgId: string,
): Promise<ZReadingData> {
  const [shift] = await db
    .select()
    .from(shifts)
    .where(and(eq(shifts.id, shiftId), eq(shifts.orgId, orgId)))
    .limit(1);

  if (!shift) throw new Error("Shift not found");

  // For closed shifts, return the frozen snapshot
  if (
    shift.status !== "OPEN" &&
    shift.zReadingSnapshot
  ) {
    return shift.zReadingSnapshot as ZReadingData;
  }

  // For open shifts, compute live
  return computeZReading(db, shiftId, orgId);
}

/**
 * Compute Z-reading data from sales in this shift.
 */
async function computeZReading(
  tx: DbOrTx,
  shiftId: string,
  orgId: string,
): Promise<ZReadingData> {
  // Fetch shift info
  const shiftRows = await tx.execute(sql`
    SELECT
      sh.id, sh.opened_at, sh.closed_at, sh.opening_float,
      u.full_name AS cashier_name,
      l.name AS location_name
    FROM shifts sh
    JOIN users u ON sh.user_id = u.id
    JOIN locations l ON sh.location_id = l.id
    WHERE sh.id = ${shiftId} AND sh.org_id = ${orgId}
  `);
  const shiftInfo = shiftRows[0] as any;

  // 1. Sales Summary
  const summaryRows = await tx.execute(sql`
    WITH refund_by_sale AS (
      SELECT
        s.id AS sale_id,
        COALESCE(SUM((sl.line_total::numeric / NULLIF(sl.quantity, 0)) * sl.refunded_quantity), 0) AS refund_total
      FROM sales s
      JOIN sale_lines sl ON sl.sale_id = s.id
      WHERE s.shift_id = ${shiftId}
        AND s.org_id = ${orgId}
        AND s.status IN ('PARTIALLY_REFUNDED', 'REFUNDED')
      GROUP BY s.id
    )
    SELECT
      COALESCE(SUM(s.grand_total::numeric) FILTER (
        WHERE s.status IN ('COMPLETED', 'PARTIALLY_REFUNDED', 'REFUNDED')
      ), 0)::text AS "grossSales",
      COALESCE(SUM(rb.refund_total), 0)::text AS "refundsTotal",
      COUNT(*) FILTER (
        WHERE s.status IN ('COMPLETED', 'PARTIALLY_REFUNDED', 'REFUNDED')
      )::int AS "transactionCount",
      COUNT(*) FILTER (WHERE s.status = 'VOIDED')::int AS "voidCount"
    FROM sales s
    LEFT JOIN refund_by_sale rb ON rb.sale_id = s.id
    WHERE s.shift_id = ${shiftId} AND s.org_id = ${orgId}
  `);
  const summary = summaryRows[0] as any;

  const grossSales = parseFloat(summary.grossSales);
  const refundsTotal = parseFloat(summary.refundsTotal);
  const netSales = grossSales - refundsTotal;
  const txnCount = summary.transactionCount || 0;
  const avgTicket = txnCount > 0 ? netSales / txnCount : 0;

  // 2. Payment Breakdown
  const paymentRows = await tx.execute(sql`
    WITH refund_by_sale AS (
      SELECT
        s.id AS sale_id,
        COALESCE(SUM((sl.line_total::numeric / NULLIF(sl.quantity, 0)) * sl.refunded_quantity), 0) AS refund_total
      FROM sales s
      JOIN sale_lines sl ON sl.sale_id = s.id
      WHERE s.shift_id = ${shiftId}
        AND s.org_id = ${orgId}
        AND s.status IN ('PARTIALLY_REFUNDED', 'REFUNDED')
      GROUP BY s.id
    ),
    payment_totals AS (
      SELECT
        sp.sale_id,
        SUM(sp.amount::numeric) AS payment_total
      FROM sale_payments sp
      JOIN sales s ON sp.sale_id = s.id
      WHERE s.shift_id = ${shiftId}
        AND s.org_id = ${orgId}
        AND s.status IN ('COMPLETED', 'PARTIALLY_REFUNDED', 'REFUNDED')
      GROUP BY sp.sale_id
    ),
    net_payments AS (
      SELECT
        sp.method,
        GREATEST(
          0,
          sp.amount::numeric - CASE
            WHEN COALESCE(pt.payment_total, 0) > 0
              THEN COALESCE(rb.refund_total, 0) * sp.amount::numeric / pt.payment_total
            ELSE 0
          END
        ) AS net_amount
      FROM sale_payments sp
      JOIN sales s ON sp.sale_id = s.id
      LEFT JOIN refund_by_sale rb ON rb.sale_id = s.id
      LEFT JOIN payment_totals pt ON pt.sale_id = s.id
      WHERE s.shift_id = ${shiftId}
        AND s.org_id = ${orgId}
        AND s.status IN ('COMPLETED', 'PARTIALLY_REFUNDED', 'REFUNDED')
    )
    SELECT
      method,
      SUM(net_amount)::text AS "total",
      COUNT(*) FILTER (WHERE net_amount > 0)::int AS "count"
    FROM net_payments
    GROUP BY method
    HAVING SUM(net_amount) > 0
    ORDER BY SUM(net_amount) DESC
  `);

  // 3. Cash Reconciliation
  // Expected cash = opening_float + net cash payments after refunds.
  const cashRows = await tx.execute(sql`
    WITH refund_by_sale AS (
      SELECT
        s.id AS sale_id,
        COALESCE(SUM((sl.line_total::numeric / NULLIF(sl.quantity, 0)) * sl.refunded_quantity), 0) AS refund_total
      FROM sales s
      JOIN sale_lines sl ON sl.sale_id = s.id
      WHERE s.shift_id = ${shiftId}
        AND s.org_id = ${orgId}
        AND s.status IN ('PARTIALLY_REFUNDED', 'REFUNDED')
      GROUP BY s.id
    ),
    payment_totals AS (
      SELECT
        sp.sale_id,
        SUM(sp.amount::numeric) AS payment_total
      FROM sale_payments sp
      JOIN sales s ON sp.sale_id = s.id
      WHERE s.shift_id = ${shiftId}
        AND s.org_id = ${orgId}
        AND s.status IN ('COMPLETED', 'PARTIALLY_REFUNDED', 'REFUNDED')
      GROUP BY sp.sale_id
    )
    SELECT
      COALESCE(SUM(GREATEST(
        0,
        sp.amount::numeric - CASE
          WHEN COALESCE(pt.payment_total, 0) > 0
            THEN COALESCE(rb.refund_total, 0) * sp.amount::numeric / pt.payment_total
          ELSE 0
        END
      )), 0)::text AS "cashNet"
    FROM sale_payments sp
    JOIN sales s ON sp.sale_id = s.id
    LEFT JOIN refund_by_sale rb ON rb.sale_id = s.id
    LEFT JOIN payment_totals pt ON pt.sale_id = s.id
    WHERE s.shift_id = ${shiftId}
      AND s.org_id = ${orgId}
      AND s.status IN ('COMPLETED', 'PARTIALLY_REFUNDED', 'REFUNDED')
      AND sp.method = 'CASH'
  `);
  const cashData = cashRows[0] as any;
  const openingFloat = parseFloat(shiftInfo.opening_float ?? "0");
  const cashNet = parseFloat(cashData?.cashNet ?? "0");
  const drawerRows = await tx.execute(sql`
    SELECT
      sde.id,
      sde.action AS "type",
      sde.amount::text AS "amount",
      sde.reason,
      sde.location_id AS "locationId",
      l.name AS "locationName",
      sde.shift_id AS "shiftId",
      sde.cashier_user_id AS "cashierId",
      cashier.full_name AS "cashierName",
      sde.approved_by_name AS "approvedBy",
      sde.authorization_method AS "authorizationMethod",
      sde.approved_by_user_id AS "authorizationUserId",
      sde.drawer_opened AS "drawerOpened",
      sde.drawer_error AS "drawerError",
      sde.client_event_id AS "clientEventId",
      sde.created_at AS "createdAt"
    FROM shift_drawer_events sde
    JOIN locations l ON l.id = sde.location_id
    JOIN users cashier ON cashier.id = sde.cashier_user_id
    WHERE sde.shift_id = ${shiftId}
      AND sde.org_id = ${orgId}
    ORDER BY sde.created_at DESC
  `);
  const drawerEvents = (drawerRows as any[]).map(mapShiftDrawerEventRow);
  const drawerExpectedAdjustment = drawerEvents.reduce((sum, event) => {
    const amount = parseFloat(event.amount);
    if (event.type === "PAID_IN") return sum + amount;
    if (event.type === "PAID_OUT") return sum - amount;
    return sum;
  }, 0);
  const expectedCash = openingFloat + cashNet + drawerExpectedAdjustment;

  // 4. Top Items (top 5)
  const topItemRows = await tx.execute(sql`
    SELECT
      p.name AS "productName",
      p.mnemonic_sku AS "mnemonicSku",
      SUM(sl.quantity - sl.refunded_quantity)::int AS "unitsSold",
      SUM(
        sl.line_total::numeric - ((sl.line_total::numeric / NULLIF(sl.quantity, 0)) * sl.refunded_quantity)
      )::text AS "totalRevenue"
    FROM sale_lines sl
    JOIN sales s ON sl.sale_id = s.id
    JOIN products p ON sl.product_id = p.id
    WHERE s.shift_id = ${shiftId}
      AND s.org_id = ${orgId}
      AND s.status IN ('COMPLETED', 'PARTIALLY_REFUNDED', 'REFUNDED')
    GROUP BY p.id, p.name, p.mnemonic_sku
    HAVING SUM(sl.quantity - sl.refunded_quantity) > 0
    ORDER BY SUM(sl.quantity - sl.refunded_quantity) DESC
    LIMIT 5
  `);

  // 5. Accountability — voids
  const voidRows = await tx.execute(sql`
    SELECT
      s.sale_no AS "saleNo",
      s.grand_total::text AS "amount",
      s.voided_at AS "voidedAt",
      u.full_name AS "voidedBy",
      NULLIF(regexp_replace(COALESCE(s.notes, ''), '^.*\\[Voided\\]\\s*', ''), '') AS "reason"
    FROM sales s
    LEFT JOIN users u ON s.voided_by_user_id = u.id
    WHERE s.shift_id = ${shiftId}
      AND s.org_id = ${orgId}
      AND s.status = 'VOIDED'
    ORDER BY s.voided_at DESC
  `);

  // 5. Accountability — refunds
  const refundRows = await tx.execute(sql`
    WITH refund_by_sale AS (
      SELECT
        s.id AS sale_id,
        COALESCE(SUM((sl.line_total::numeric / NULLIF(sl.quantity, 0)) * sl.refunded_quantity), 0) AS refund_total
      FROM sales s
      JOIN sale_lines sl ON sl.sale_id = s.id
      WHERE s.shift_id = ${shiftId}
        AND s.org_id = ${orgId}
        AND s.status IN ('PARTIALLY_REFUNDED', 'REFUNDED')
      GROUP BY s.id
    )
    SELECT
      s.sale_no AS "saleNo",
      COALESCE(rb.refund_total, 0)::text AS "amount",
      s.refunded_at AS "refundedAt",
      u.full_name AS "refundedBy",
      NULLIF(regexp_replace(COALESCE(s.notes, ''), '^.*\\[Refund\\]\\s*', ''), '') AS "reason"
    FROM sales s
    LEFT JOIN refund_by_sale rb ON rb.sale_id = s.id
    LEFT JOIN users u ON s.refunded_by_user_id = u.id
    WHERE s.shift_id = ${shiftId}
      AND s.org_id = ${orgId}
      AND s.status IN ('REFUNDED', 'PARTIALLY_REFUNDED')
    ORDER BY s.refunded_at DESC
  `);

  return {
    shiftId,
    cashierName: shiftInfo.cashier_name,
    locationName: shiftInfo.location_name,
    openedAt: shiftInfo.opened_at?.toISOString?.() ?? shiftInfo.opened_at,
    closedAt: shiftInfo.closed_at?.toISOString?.() ?? shiftInfo.closed_at ?? null,
    openingFloat: openingFloat.toFixed(2),
    salesSummary: {
      grossSales: grossSales.toFixed(2),
      refundsTotal: refundsTotal.toFixed(2),
      netSales: netSales.toFixed(2),
      transactionCount: txnCount,
      avgTicket: avgTicket.toFixed(2),
      voidCount: summary.voidCount || 0,
    },
    paymentBreakdown: (paymentRows as any[]).map((r) => ({
      method: r.method,
      total: r.total,
      count: r.count,
    })),
    cashReconciliation: {
      expectedCash: expectedCash.toFixed(2),
      actualCash: null,
      variance: null,
    },
    topItems: (topItemRows as any[]).map((r) => ({
      productName: r.productName,
      mnemonicSku: r.mnemonicSku,
      unitsSold: r.unitsSold,
      totalRevenue: r.totalRevenue,
    })),
    accountability: {
      voids: (voidRows as any[]).map((r) => ({
        saleNo: r.saleNo,
        amount: r.amount,
        voidedAt: r.voidedAt?.toISOString?.() ?? r.voidedAt ?? null,
        voidedBy: r.voidedBy ?? null,
        reason: r.reason ?? null,
      })),
      refunds: (refundRows as any[]).map((r) => ({
        saleNo: r.saleNo,
        amount: r.amount,
        refundedAt: r.refundedAt?.toISOString?.() ?? r.refundedAt ?? null,
        refundedBy: r.refundedBy ?? null,
        reason: r.reason ?? null,
      })),
      drawerEvents,
    },
  };
}

/**
 * List shifts with filters and pagination.
 */
export async function listShifts(
  orgId: string,
  opts: {
    locationId?: string;
    userId?: string;
    status?: string[];
    from?: string;
    to?: string;
    cursor?: string;
    limit: number;
  },
) {
  const conditions: SQL[] = [eq(shifts.orgId, orgId)];

  if (opts.locationId) {
    conditions.push(eq(shifts.locationId, opts.locationId));
  }
  if (opts.userId) {
    conditions.push(eq(shifts.userId, opts.userId));
  }
  if (opts.status && opts.status.length > 0) {
    conditions.push(inArray(shifts.status, opts.status as any));
  }
  if (opts.from) {
    conditions.push(sql`${shifts.openedAt} >= ${opts.from}`);
  }
  if (opts.to) {
    conditions.push(sql`${shifts.openedAt} <= ${opts.to}`);
  }
  if (opts.cursor) {
    const [cursorRow] = await db
      .select({ openedAt: shifts.openedAt })
      .from(shifts)
      .where(eq(shifts.id, opts.cursor))
      .limit(1);
    if (cursorRow) {
      conditions.push(
        sql`(${shifts.openedAt}, ${shifts.id}) < (${cursorRow.openedAt}, ${opts.cursor})`,
      );
    }
  }

  // Compute gross sales per shift in a subquery
  const rows = await db
    .select({
      id: shifts.id,
      status: shifts.status,
      openedAt: shifts.openedAt,
      closedAt: shifts.closedAt,
      openingFloat: shifts.openingFloat,
      actualCash: shifts.actualCash,
      cashVariance: shifts.cashVariance,
      notes: shifts.notes,
      cashierName: users.fullName,
      locationName: locations.name,
      grossSales: sql<string>`COALESCE((
        SELECT SUM(s.grand_total::numeric)
        FROM sales s
        WHERE s.shift_id = "shifts"."id"
          AND s.status IN ('COMPLETED', 'PARTIALLY_REFUNDED', 'REFUNDED')
      ), 0)::text`,
      refundsTotal: sql<string>`COALESCE((
        SELECT SUM((sl.line_total::numeric / NULLIF(sl.quantity, 0)) * sl.refunded_quantity)
        FROM sales s
        JOIN sale_lines sl ON sl.sale_id = s.id
        WHERE s.shift_id = "shifts"."id"
          AND s.status IN ('PARTIALLY_REFUNDED', 'REFUNDED')
      ), 0)::text`,
      netSales: sql<string>`(
        COALESCE((
          SELECT SUM(s.grand_total::numeric)
          FROM sales s
          WHERE s.shift_id = "shifts"."id"
            AND s.status IN ('COMPLETED', 'PARTIALLY_REFUNDED', 'REFUNDED')
        ), 0)
        - COALESCE((
          SELECT SUM((sl.line_total::numeric / NULLIF(sl.quantity, 0)) * sl.refunded_quantity)
          FROM sales s
          JOIN sale_lines sl ON sl.sale_id = s.id
          WHERE s.shift_id = "shifts"."id"
            AND s.status IN ('PARTIALLY_REFUNDED', 'REFUNDED')
        ), 0)
      )::text`,
      transactionCount: sql<number>`COALESCE((
        SELECT COUNT(*)::int
        FROM sales s
        WHERE s.shift_id = "shifts"."id"
          AND s.status IN ('COMPLETED', 'PARTIALLY_REFUNDED', 'REFUNDED')
      ), 0)`,
      voidCount: sql<number>`COALESCE((
        SELECT COUNT(*)::int
        FROM sales s
        WHERE s.shift_id = "shifts"."id"
          AND s.status = 'VOIDED'
      ), 0)`,
      drawerEventCount: sql<number>`COALESCE((
        SELECT COUNT(*)::int
        FROM shift_drawer_events sde
        WHERE sde.shift_id = "shifts"."id"
      ), 0)`,
      drawerPaidInTotal: sql<string>`COALESCE((
        SELECT SUM(sde.amount::numeric)
        FROM shift_drawer_events sde
        WHERE sde.shift_id = "shifts"."id"
          AND sde.action = 'PAID_IN'
      ), 0)::text`,
      drawerPaidOutTotal: sql<string>`COALESCE((
        SELECT SUM(sde.amount::numeric)
        FROM shift_drawer_events sde
        WHERE sde.shift_id = "shifts"."id"
          AND sde.action = 'PAID_OUT'
      ), 0)::text`,
      drawerNetCash: sql<string>`(
        COALESCE((
          SELECT SUM(sde.amount::numeric)
          FROM shift_drawer_events sde
          WHERE sde.shift_id = "shifts"."id"
            AND sde.action = 'PAID_IN'
        ), 0)
        - COALESCE((
          SELECT SUM(sde.amount::numeric)
          FROM shift_drawer_events sde
          WHERE sde.shift_id = "shifts"."id"
            AND sde.action = 'PAID_OUT'
        ), 0)
      )::text`,
    })
    .from(shifts)
    .innerJoin(users, eq(users.id, shifts.userId))
    .innerJoin(locations, eq(locations.id, shifts.locationId))
    .where(and(...conditions))
    .orderBy(desc(shifts.openedAt), desc(shifts.id))
    .limit(opts.limit + 1);

  const hasMore = rows.length > opts.limit;
  const data = hasMore ? rows.slice(0, opts.limit) : rows;
  const nextCursor = hasMore ? data[data.length - 1].id : null;

  return { data, nextCursor, hasMore };
}

/**
 * Get a single shift's details.
 */
export async function getShift(shiftId: string, orgId: string) {
  const [shift] = await db
    .select({
      id: shifts.id,
      status: shifts.status,
      openedAt: shifts.openedAt,
      closedAt: shifts.closedAt,
      openingFloat: shifts.openingFloat,
      actualCash: shifts.actualCash,
      cashVariance: shifts.cashVariance,
      notes: shifts.notes,
      timezone: shifts.timezone,
      cashierName: users.fullName,
      locationName: locations.name,
      zReadingSnapshot: shifts.zReadingSnapshot,
    })
    .from(shifts)
    .innerJoin(users, eq(users.id, shifts.userId))
    .innerJoin(locations, eq(locations.id, shifts.locationId))
    .where(and(eq(shifts.id, shiftId), eq(shifts.orgId, orgId)))
    .limit(1);

  return shift ?? null;
}
