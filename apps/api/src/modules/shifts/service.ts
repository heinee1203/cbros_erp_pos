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
import bcrypt from "bcryptjs";

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
    }>;
    refunds: Array<{
      saleNo: string;
      amount: string;
      refundedAt: string | null;
      refundedBy: string | null;
      reason: string | null;
    }>;
  };
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
export async function closeShift(
  shiftId: string,
  orgId: string,
  userId: string,
  input: { actualCash: string; notes?: string },
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

    const actualCash = parseFloat(input.actualCash);
    const expectedCash = parseFloat(zReading.cashReconciliation.expectedCash);
    const variance = actualCash - expectedCash;

    // Update shift
    const [updated] = await tx
      .update(shifts)
      .set({
        status: "CLOSED",
        closedAt: new Date(),
        closedByUserId: userId,
        actualCash: actualCash.toFixed(2),
        cashVariance: variance.toFixed(2),
        zReadingSnapshot: zReading,
        notes: input.notes ?? null,
      })
      .where(eq(shifts.id, shiftId))
      .returning();

    return updated;
  });
}

/**
 * Force-close a shift — manager/admin with PIN verification.
 */
export async function forceCloseShift(
  shiftId: string,
  orgId: string,
  managerId: string,
  managerRole: string,
  pin: string,
) {
  if (!SHIFT_FORCE_CLOSE_ROLES.includes(managerRole as any)) {
    throw new Error("Only ADMIN or MANAGER can force-close shifts");
  }

  return db.transaction(async (tx) => {
    // Verify manager's PIN
    const [manager] = await tx
      .select({ pinHash: users.pinHash })
      .from(users)
      .where(eq(users.id, managerId))
      .limit(1);

    if (!manager?.pinHash) {
      throw new Error("Manager PIN not set — cannot force-close");
    }

    const pinValid = await bcrypt.compare(pin, manager.pinHash);
    if (!pinValid) {
      throw new Error("Invalid PIN");
    }

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

    const [updated] = await tx
      .update(shifts)
      .set({
        status: "FORCE_CLOSED",
        closedAt: new Date(),
        closedByUserId: managerId,
        zReadingSnapshot: zReading,
        notes: `Force-closed by manager`,
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
    SELECT
      COALESCE(SUM(s.grand_total::numeric) FILTER (WHERE s.status = 'COMPLETED'), 0)::text AS "grossSales",
      COALESCE(SUM(s.grand_total::numeric) FILTER (WHERE s.status IN ('REFUNDED', 'PARTIALLY_REFUNDED')), 0)::text AS "refundsTotal",
      COUNT(*) FILTER (WHERE s.status = 'COMPLETED')::int AS "transactionCount",
      COUNT(*) FILTER (WHERE s.status = 'VOIDED')::int AS "voidCount"
    FROM sales s
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
    SELECT
      sp.method,
      SUM(sp.amount::numeric)::text AS "total",
      COUNT(*)::int AS "count"
    FROM sale_payments sp
    JOIN sales s ON sp.sale_id = s.id
    WHERE s.shift_id = ${shiftId}
      AND s.org_id = ${orgId}
      AND s.status IN ('COMPLETED', 'PARTIALLY_REFUNDED')
    GROUP BY sp.method
    ORDER BY SUM(sp.amount::numeric) DESC
  `);

  // 3. Cash Reconciliation
  // Expected cash = opening_float + cash sales - cash refunds
  const cashRows = await tx.execute(sql`
    SELECT
      COALESCE(SUM(sp.amount::numeric) FILTER (
        WHERE s.status IN ('COMPLETED', 'PARTIALLY_REFUNDED')
      ), 0)::text AS "cashIn",
      COALESCE(SUM(sp.amount::numeric) FILTER (
        WHERE s.status IN ('REFUNDED')
      ), 0)::text AS "cashOut"
    FROM sale_payments sp
    JOIN sales s ON sp.sale_id = s.id
    WHERE s.shift_id = ${shiftId}
      AND s.org_id = ${orgId}
      AND sp.method = 'CASH'
  `);
  const cashData = cashRows[0] as any;
  const openingFloat = parseFloat(shiftInfo.opening_float ?? "0");
  const cashIn = parseFloat(cashData?.cashIn ?? "0");
  const cashOut = parseFloat(cashData?.cashOut ?? "0");
  const expectedCash = openingFloat + cashIn - cashOut;

  // 4. Top Items (top 5)
  const topItemRows = await tx.execute(sql`
    SELECT
      p.name AS "productName",
      p.mnemonic_sku AS "mnemonicSku",
      SUM(sl.quantity)::int AS "unitsSold",
      SUM(sl.line_total::numeric)::text AS "totalRevenue"
    FROM sale_lines sl
    JOIN sales s ON sl.sale_id = s.id
    JOIN products p ON sl.product_id = p.id
    WHERE s.shift_id = ${shiftId}
      AND s.org_id = ${orgId}
      AND s.status = 'COMPLETED'
    GROUP BY p.id, p.name, p.mnemonic_sku
    ORDER BY SUM(sl.quantity) DESC
    LIMIT 5
  `);

  // 5. Accountability — voids
  const voidRows = await tx.execute(sql`
    SELECT
      s.sale_no AS "saleNo",
      s.grand_total::text AS "amount",
      s.voided_at AS "voidedAt",
      u.full_name AS "voidedBy"
    FROM sales s
    LEFT JOIN users u ON s.voided_by_user_id = u.id
    WHERE s.shift_id = ${shiftId}
      AND s.org_id = ${orgId}
      AND s.status = 'VOIDED'
    ORDER BY s.voided_at DESC
  `);

  // 5. Accountability — refunds
  const refundRows = await tx.execute(sql`
    SELECT
      s.sale_no AS "saleNo",
      s.grand_total::text AS "amount",
      s.refunded_at AS "refundedAt",
      u.full_name AS "refundedBy",
      s.notes AS "reason"
    FROM sales s
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
      })),
      refunds: (refundRows as any[]).map((r) => ({
        saleNo: r.saleNo,
        amount: r.amount,
        refundedAt: r.refundedAt?.toISOString?.() ?? r.refundedAt ?? null,
        refundedBy: r.refundedBy ?? null,
        reason: r.reason ?? null,
      })),
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
        WHERE s.shift_id = "shifts"."id" AND s.status = 'COMPLETED'
      ), 0)::text`,
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
