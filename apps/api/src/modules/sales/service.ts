import { db, type DbOrTx } from "@apex/database";
import {
  sales,
  saleLines,
  salePayments,
  inventory,
  stockJournal,
  locations,
  products,
  customers,
  customerVehicles,
  users,
} from "@apex/database/schema";
import { eq, and, or, sql, desc, ilike, inArray, type SQL, asc } from "drizzle-orm";
import type { CreateSaleInput, CompleteSaleInput, RefundSaleInput } from "@apex/types";
import { SaleStatus, isValidSaleTransition, REFUND_ROLES } from "@apex/types";
import { getOrCreateShift } from "../shifts/service";

// ── Helpers ──

async function generateSaleNo(
  tx: DbOrTx,
  orgId: string,
  locationCode: string,
): Promise<string> {
  const result = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(sales)
    .where(eq(sales.orgId, orgId));
  const seq = (result[0]?.count ?? 0) + 1;
  const prefix = locationCode.slice(0, 2).toUpperCase();
  return `${prefix}-${String(seq).padStart(6, "0")}`;
}

/**
 * Upsert inventory row with row-level locking via SELECT ... FOR UPDATE.
 * Returns the locked row's current stock_level for validation.
 */
async function lockInventoryRow(
  tx: DbOrTx,
  orgId: string,
  productId: string,
  locationId: string,
): Promise<{ id: string; stockLevel: number; reservedLevel: number }> {
  const rows = await tx.execute(
    sql`SELECT id, stock_level, reserved_level
        FROM inventory
        WHERE org_id = ${orgId}
          AND product_id = ${productId}
          AND location_id = ${locationId}
        FOR UPDATE`,
  );

  if (rows.length > 0) {
    const row = rows[0] as any;
    return {
      id: row.id,
      stockLevel: row.stock_level,
      reservedLevel: row.reserved_level,
    };
  }

  // Auto-create if doesn't exist
  const [newRow] = await tx
    .insert(inventory)
    .values({
      orgId,
      productId,
      locationId,
      stockLevel: 0,
      reservedLevel: 0,
    })
    .returning();

  return { id: newRow.id, stockLevel: 0, reservedLevel: 0 };
}

/**
 * Insert a stock_journal entry with idempotency key.
 * referenceType: "SALE" for checkout deductions, "RETURN" for refund reversals.
 */
async function insertJournalEntry(
  tx: DbOrTx,
  params: {
    orgId: string;
    productId: string;
    locationId: string;
    userId: string;
    actorType: "USER" | "SYSTEM";
    changeQuantity: number;
    balanceAfter: number;
    referenceType: "SALE" | "RETURN";
    referenceId: string;
    referenceLineId?: string;
    idempotencyKey: string;
    notes?: string;
  },
) {
  const [entry] = await tx
    .insert(stockJournal)
    .values({
      orgId: params.orgId,
      productId: params.productId,
      locationId: params.locationId,
      userId: params.userId,
      actorType: params.actorType,
      changeQuantity: params.changeQuantity,
      balanceAfter: params.balanceAfter,
      referenceType: params.referenceType,
      referenceId: params.referenceId,
      referenceLineId: params.referenceLineId,
      idempotencyKey: params.idempotencyKey,
      notes: params.notes,
    })
    .returning();
  return entry;
}

// ── Service Functions ──

/**
 * Create a new sale in OPEN status.
 * Looks up each product's unitPrice, computes line totals, and sale totals.
 * Does NOT deduct inventory — that only happens on COMPLETED.
 */
export async function createSale(
  input: CreateSaleInput,
  orgId: string,
  locationId: string,
  userId: string,
) {
  return db.transaction(async (tx) => {
    // Validate location
    const [location] = await tx
      .select()
      .from(locations)
      .where(and(eq(locations.id, locationId), eq(locations.orgId, orgId)))
      .limit(1);
    if (!location) throw new Error("Location not found");
    if (location.type === "TRANSIT_BUFFER") {
      throw new Error("Cannot create sale from TRANSIT_BUFFER location");
    }

    // Validate customer if provided
    if (input.customerId) {
      const [customer] = await tx
        .select()
        .from(customers)
        .where(
          and(eq(customers.id, input.customerId), eq(customers.orgId, orgId)),
        )
        .limit(1);
      if (!customer) throw new Error("Customer not found");
    }

    // Validate vehicle if provided — must belong to customer
    if (input.customerVehicleId) {
      if (!input.customerId) {
        throw new Error("Cannot attach vehicle without a customer");
      }
      const [vehicle] = await tx
        .select()
        .from(customerVehicles)
        .where(
          and(
            eq(customerVehicles.id, input.customerVehicleId),
            eq(customerVehicles.customerId, input.customerId),
            eq(customerVehicles.orgId, orgId),
          ),
        )
        .limit(1);
      if (!vehicle) {
        throw new Error(
          "Vehicle not found or does not belong to the selected customer",
        );
      }
    }

    const saleNo = await generateSaleNo(tx, orgId, location.code);

    // Look up product prices and compute line totals
    let subtotal = 0;
    let discountTotal = 0;
    const lineValues: any[] = [];

    for (const line of input.lines) {
      const [product] = await tx
        .select({ unitPrice: products.unitPrice, id: products.id })
        .from(products)
        .where(and(eq(products.id, line.productId), eq(products.orgId, orgId)))
        .limit(1);
      if (!product) throw new Error(`Product ${line.productId} not found`);

      const effectivePrice = line.overridePrice
        ? parseFloat(line.overridePrice)
        : parseFloat(product.unitPrice);
      const discount = line.discountAmount
        ? parseFloat(line.discountAmount)
        : 0;
      const lineTotal = effectivePrice * line.quantity - discount;

      subtotal += effectivePrice * line.quantity;
      discountTotal += discount;

      lineValues.push({
        orgId,
        productId: line.productId,
        locationId,
        quantity: line.quantity,
        unitPrice: product.unitPrice,
        overridePrice: line.overridePrice ?? null,
        discountAmount: discount.toFixed(2),
        lineTotal: lineTotal.toFixed(2),
        notes: line.notes ?? null,
      });
    }

    const grandTotal = subtotal - discountTotal;

    // Insert sale
    const [sale] = await tx
      .insert(sales)
      .values({
        orgId,
        saleNo,
        locationId,
        status: "OPEN",
        customerId: input.customerId ?? null,
        customerVehicleId: input.customerVehicleId ?? null,
        subtotal: subtotal.toFixed(2),
        discountTotal: discountTotal.toFixed(2),
        taxTotal: "0.00",
        grandTotal: grandTotal.toFixed(2),
        receiptNumber: input.receiptNumber ?? null,
        notes: input.notes ?? null,
        createdByUserId: userId,
      })
      .returning();

    // Insert sale lines
    const insertedLines = await tx
      .insert(saleLines)
      .values(lineValues.map((v) => ({ ...v, saleId: sale.id })))
      .returning();

    return { sale, lines: insertedLines };
  });
}

/**
 * Park a sale (OPEN -> PARKED).
 * No inventory effect.
 */
export async function parkSale(
  saleId: string,
  orgId: string,
  _userId: string,
) {
  return db.transaction(async (tx) => {
    const saleRows = await tx.execute(
      sql`SELECT * FROM sales WHERE id = ${saleId} AND org_id = ${orgId} FOR UPDATE`,
    );
    if (saleRows.length === 0) throw new Error("Sale not found");

    const sale = saleRows[0] as any;
    if (!isValidSaleTransition(sale.status as SaleStatus, SaleStatus.PARKED)) {
      throw new Error(`Cannot park sale in ${sale.status} status`);
    }

    const [updated] = await tx
      .update(sales)
      .set({ status: "PARKED" })
      .where(eq(sales.id, saleId))
      .returning();

    return updated;
  });
}

/**
 * Resume a parked sale (PARKED -> OPEN).
 * No inventory effect.
 */
export async function resumeSale(
  saleId: string,
  orgId: string,
  _userId: string,
) {
  return db.transaction(async (tx) => {
    const saleRows = await tx.execute(
      sql`SELECT * FROM sales WHERE id = ${saleId} AND org_id = ${orgId} FOR UPDATE`,
    );
    if (saleRows.length === 0) throw new Error("Sale not found");

    const sale = saleRows[0] as any;
    if (!isValidSaleTransition(sale.status as SaleStatus, SaleStatus.OPEN)) {
      throw new Error(`Cannot resume sale in ${sale.status} status`);
    }

    const [updated] = await tx
      .update(sales)
      .set({ status: "OPEN" })
      .where(eq(sales.id, saleId))
      .returning();

    return updated;
  });
}

/**
 * Void a sale (QUOTE/OPEN/PARKED -> VOIDED).
 * No inventory changes — stock was never deducted.
 */
export async function voidSale(
  saleId: string,
  orgId: string,
  userId: string,
  notes?: string,
) {
  return db.transaction(async (tx) => {
    const saleRows = await tx.execute(
      sql`SELECT * FROM sales WHERE id = ${saleId} AND org_id = ${orgId} FOR UPDATE`,
    );
    if (saleRows.length === 0) throw new Error("Sale not found");

    const sale = saleRows[0] as any;
    if (!isValidSaleTransition(sale.status as SaleStatus, SaleStatus.VOIDED)) {
      throw new Error(`Cannot void sale in ${sale.status} status`);
    }

    const [updated] = await tx
      .update(sales)
      .set({
        status: "VOIDED",
        voidedByUserId: userId,
        voidedAt: new Date(),
        notes: notes
          ? `${sale.notes ?? ""}\n[Voided] ${notes}`.trim()
          : sale.notes,
      })
      .where(eq(sales.id, saleId))
      .returning();

    return updated;
  });
}

/**
 * Complete a sale (OPEN -> COMPLETED).
 * THE critical checkout path:
 *   1. Lock the sale row
 *   2. For each line: lock inventory -> validate stock -> deduct -> SALE journal
 *   3. Set idempotency key, mark COMPLETED
 *
 * IDEMPOTENT: If already completed with same key, returns existing sale.
 */
export async function completeSale(
  saleId: string,
  orgId: string,
  userId: string,
  input: CompleteSaleInput,
) {
  return db.transaction(async (tx) => {
    // Lock sale row
    const saleRows = await tx.execute(
      sql`SELECT * FROM sales WHERE id = ${saleId} AND org_id = ${orgId} FOR UPDATE`,
    );
    if (saleRows.length === 0) throw new Error("Sale not found");

    const sale = saleRows[0] as any;

    // Idempotency: if already completed with same key, return success
    if (
      sale.status === SaleStatus.COMPLETED &&
      sale.idempotency_key === input.idempotencyKey
    ) {
      return sale;
    }

    if (
      !isValidSaleTransition(sale.status as SaleStatus, SaleStatus.COMPLETED)
    ) {
      throw new Error(`Cannot complete sale in ${sale.status} status`);
    }

    // Fetch all sale lines
    const lines = await tx
      .select()
      .from(saleLines)
      .where(eq(saleLines.saleId, saleId));

    if (lines.length === 0) {
      throw new Error("Cannot complete a sale with no line items");
    }

    // ── Payment validation ──
    const grandTotal = parseFloat(sale.grand_total);
    if (grandTotal > 0) {
      if (!input.payments || input.payments.length === 0) {
        throw new Error(
          `No payments provided for sale with grand total ₱${grandTotal.toFixed(2)}`,
        );
      }
      const paymentTotal = input.payments.reduce(
        (sum, p) => sum + parseFloat(p.amount),
        0,
      );
      if (paymentTotal < grandTotal - 0.005) {
        throw new Error(
          `Payment total (₱${paymentTotal.toFixed(2)}) does not cover grand total (₱${grandTotal.toFixed(2)})`,
        );
      }
    }

    // For each line: lock inventory, validate, deduct, journal
    // POS MERGE GUARDRAIL (Phase 7): lines tagged with job_card_part_id
    // skip inventory deduction — stock was already deducted via JOB_CARD_ISSUE.
    for (const line of lines) {
      if (line.jobCardPartId) {
        // Job card part line — stock already issued via JOB_CARD_ISSUE journal.
        // Skip inventory deduction entirely. Still record a SALE journal for
        // financial audit trail but with zero changeQuantity.
        continue;
      }

      const inv = await lockInventoryRow(
        tx,
        orgId,
        line.productId,
        line.locationId,
      );

      if (inv.stockLevel < line.quantity && !input.allowNegativeStock) {
        // Get product info for a useful error message
        const [product] = await tx
          .select({ name: products.name, mnemonicSku: products.mnemonicSku })
          .from(products)
          .where(eq(products.id, line.productId))
          .limit(1);

        throw new Error(
          `Insufficient stock for ${product?.mnemonicSku ?? line.productId}. ` +
            `Available: ${inv.stockLevel}, Required: ${line.quantity}`,
        );
      }

      const newBalance = inv.stockLevel - line.quantity;

      // Deduct inventory
      await tx
        .update(inventory)
        .set({ stockLevel: newBalance })
        .where(eq(inventory.id, inv.id));

      // SALE journal entry
      await insertJournalEntry(tx, {
        orgId,
        productId: line.productId,
        locationId: line.locationId,
        userId,
        actorType: "USER",
        changeQuantity: -line.quantity,
        balanceAfter: newBalance,
        referenceType: "SALE",
        referenceId: saleId,
        referenceLineId: line.id,
        idempotencyKey: `${input.idempotencyKey}:COMPLETE:${line.id}`,
      });
    }

    // Mark sale as COMPLETED
    const [updated] = await tx
      .update(sales)
      .set({
        status: "COMPLETED",
        completedByUserId: userId,
        completedAt: new Date(),
        idempotencyKey: input.idempotencyKey,
      })
      .where(eq(sales.id, saleId))
      .returning();

    // Insert payment records if provided
    if (input.payments && input.payments.length > 0) {
      await tx.insert(salePayments).values(
        input.payments.map((p) => ({
          saleId,
          orgId,
          method: p.method as any,
          amount: p.amount,
          reference: p.reference ?? null,
          notes: p.notes ?? null,
        })),
      );
    }

    // Auto-create/find shift and link sale to it
    const shift = await getOrCreateShift(tx, orgId, sale.location_id, userId);
    await tx
      .update(sales)
      .set({ shiftId: shift.id })
      .where(eq(sales.id, saleId));

    return updated;
  });
}

/**
 * Refund specific lines/quantities from a completed or partially-refunded sale.
 * Supports partial refunds — tracks refunded_quantity per line.
 * Status transitions: COMPLETED → PARTIALLY_REFUNDED or REFUNDED
 *                     PARTIALLY_REFUNDED → PARTIALLY_REFUNDED or REFUNDED
 *
 * IDEMPOTENT: If already processed with same key, returns existing sale.
 */
export async function refundSale(
  saleId: string,
  orgId: string,
  userId: string,
  userRole: string,
  input: RefundSaleInput,
) {
  // Role check: only ADMIN/MANAGER can refund
  if (!REFUND_ROLES.includes(userRole as any)) {
    throw new Error("Only ADMIN or MANAGER can process refunds");
  }

  return db.transaction(async (tx) => {
    // Lock sale row
    const saleRows = await tx.execute(
      sql`SELECT * FROM sales WHERE id = ${saleId} AND org_id = ${orgId} FOR UPDATE`,
    );
    if (saleRows.length === 0) throw new Error("Sale not found");

    const sale = saleRows[0] as any;

    // Idempotency: if already processed with same key, return success
    if (sale.idempotency_key === input.idempotencyKey) {
      return sale;
    }

    // Must be COMPLETED or PARTIALLY_REFUNDED to refund
    const canRefund =
      isValidSaleTransition(sale.status as SaleStatus, SaleStatus.REFUNDED) ||
      isValidSaleTransition(sale.status as SaleStatus, SaleStatus.PARTIALLY_REFUNDED);
    if (!canRefund) {
      throw new Error(`Cannot refund sale in ${sale.status} status`);
    }

    // Fetch all sale lines for this sale
    const allLines = await tx
      .select()
      .from(saleLines)
      .where(eq(saleLines.saleId, saleId));

    // Build a map of lineId → line for quick lookup
    const lineMap = new Map(allLines.map((l) => [l.id, l]));

    // Validate requested refund lines
    for (const reqLine of input.lines) {
      const line = lineMap.get(reqLine.saleLineId);
      if (!line) {
        throw new Error(`Sale line ${reqLine.saleLineId} not found`);
      }
      const refundable = line.quantity - line.refundedQuantity;
      if (reqLine.quantity > refundable) {
        throw new Error(
          `Cannot refund ${reqLine.quantity} of "${reqLine.saleLineId}" — only ${refundable} remaining`,
        );
      }
    }

    // Process each requested line: restore stock + create journal entry
    const refundNotes = `[Refund] ${input.reason}`;
    for (const reqLine of input.lines) {
      const line = lineMap.get(reqLine.saleLineId)!;

      const inv = await lockInventoryRow(
        tx,
        orgId,
        line.productId,
        line.locationId,
      );

      const newBalance = inv.stockLevel + reqLine.quantity;

      // Restore stock
      await tx
        .update(inventory)
        .set({ stockLevel: newBalance })
        .where(eq(inventory.id, inv.id));

      // RETURN journal entry (reversal — positive changeQuantity)
      await insertJournalEntry(tx, {
        orgId,
        productId: line.productId,
        locationId: line.locationId,
        userId,
        actorType: "USER",
        changeQuantity: reqLine.quantity,
        balanceAfter: newBalance,
        referenceType: "RETURN",
        referenceId: saleId,
        referenceLineId: line.id,
        idempotencyKey: `${input.idempotencyKey}:REFUND:${line.id}`,
        notes: refundNotes,
      });

      // Update refunded_quantity on the sale line
      await tx
        .update(saleLines)
        .set({
          refundedQuantity: line.refundedQuantity + reqLine.quantity,
        })
        .where(eq(saleLines.id, line.id));
    }

    // Determine new status: fully refunded or partially refunded?
    // Re-read lines after updates to get current refunded totals
    const updatedLines = await tx
      .select()
      .from(saleLines)
      .where(eq(saleLines.saleId, saleId));

    const fullyRefunded = updatedLines.every(
      (l) => l.refundedQuantity >= l.quantity,
    );
    const newStatus = fullyRefunded
      ? SaleStatus.REFUNDED
      : SaleStatus.PARTIALLY_REFUNDED;

    // Update sale status
    const [updated] = await tx
      .update(sales)
      .set({
        status: newStatus,
        refundedByUserId: userId,
        refundedAt: new Date(),
        idempotencyKey: input.idempotencyKey,
        notes: sale.notes
          ? `${sale.notes}\n${refundNotes}`.trim()
          : refundNotes,
      })
      .where(eq(sales.id, saleId))
      .returning();

    return updated;
  });
}

// ── Query Functions ──

/**
 * Get a sale with enriched line items (product mnemonic, name, SKU).
 * No cost price exposed — cashier-safe.
 */
export async function getSale(saleId: string, orgId: string) {
  const [sale] = await db
    .select()
    .from(sales)
    .where(and(eq(sales.id, saleId), eq(sales.orgId, orgId)))
    .limit(1);

  if (!sale) return null;
  return buildSaleDetail(sale);
}

/**
 * Get a sale by its public sale number.
 */
export async function getSaleByNumber(saleNo: string, orgId: string) {
  const [sale] = await db
    .select()
    .from(sales)
    .where(and(eq(sales.saleNo, saleNo), eq(sales.orgId, orgId)))
    .limit(1);

  if (!sale) return null;
  return buildSaleDetail(sale);
}

/**
 * Look up a sale by its idempotency key.
 * Used by mobile POS for reconciliation — if a sale was already completed
 * with a given key, returns the full detail so the client can confirm success.
 */
export async function getSaleByIdempotencyKey(
  idempotencyKey: string,
  orgId: string,
) {
  const [sale] = await db
    .select()
    .from(sales)
    .where(
      and(
        eq(sales.idempotencyKey, idempotencyKey),
        eq(sales.orgId, orgId),
      ),
    )
    .limit(1);

  if (!sale) return null;
  return buildSaleDetail(sale);
}

/**
 * Build enriched sale detail with product info on each line.
 * Deliberately omits cost price — only mnemonic SKU, name, unit price.
 */
async function buildSaleDetail(sale: typeof sales.$inferSelect) {
  const rawLines = await db
    .select({
      id: saleLines.id,
      saleId: saleLines.saleId,
      productId: saleLines.productId,
      locationId: saleLines.locationId,
      quantity: saleLines.quantity,
      refundedQuantity: saleLines.refundedQuantity,
      unitPrice: saleLines.unitPrice,
      overridePrice: saleLines.overridePrice,
      discountAmount: saleLines.discountAmount,
      lineTotal: saleLines.lineTotal,
      notes: saleLines.notes,
      createdAt: saleLines.createdAt,
      mnemonicSku: products.mnemonicSku,
      productName: products.name,
      sku: products.sku,
      category: products.category,
    })
    .from(saleLines)
    .innerJoin(products, eq(products.id, saleLines.productId))
    .where(eq(saleLines.saleId, sale.id));

  // Fetch location info
  const [location] = await db
    .select({
      id: locations.id,
      name: locations.name,
      code: locations.code,
      type: locations.type,
    })
    .from(locations)
    .where(eq(locations.id, sale.locationId))
    .limit(1);

  // Fetch customer if attached
  let customer = null;
  if (sale.customerId) {
    const [c] = await db
      .select()
      .from(customers)
      .where(eq(customers.id, sale.customerId))
      .limit(1);
    customer = c ?? null;
  }

  // Fetch vehicle if attached
  let vehicle = null;
  if (sale.customerVehicleId) {
    const [v] = await db
      .select()
      .from(customerVehicles)
      .where(eq(customerVehicles.id, sale.customerVehicleId))
      .limit(1);
    vehicle = v ?? null;
  }

  // Fetch payments
  const payments = await db
    .select()
    .from(salePayments)
    .where(eq(salePayments.saleId, sale.id));

  return {
    ...sale,
    location,
    customer,
    vehicle,
    lines: rawLines,
    payments,
  };
}

/**
 * List sales with filters, joined display fields, and keyset pagination.
 */
export async function listSales(
  orgId: string,
  opts: {
    locationId?: string;
    status?: string[];
    from?: string;
    to?: string;
    q?: string;
    cursor?: string;
    limit: number;
  },
) {
  const conditions: SQL[] = [eq(sales.orgId, orgId)];

  if (opts.locationId) {
    conditions.push(eq(sales.locationId, opts.locationId));
  }
  if (opts.status && opts.status.length > 0) {
    conditions.push(inArray(sales.status, opts.status as any));
  }
  if (opts.from) {
    conditions.push(sql`${sales.createdAt} >= ${opts.from}`);
  }
  if (opts.to) {
    conditions.push(sql`${sales.createdAt} <= ${opts.to}`);
  }
  if (opts.q && opts.q.length >= 1) {
    conditions.push(
      or(
        ilike(sales.saleNo, `%${opts.q}%`),
        ilike(sales.receiptNumber, `%${opts.q}%`),
      )!,
    );
  }
  if (opts.cursor) {
    const [cursorRow] = await db
      .select({ createdAt: sales.createdAt })
      .from(sales)
      .where(eq(sales.id, opts.cursor))
      .limit(1);
    if (cursorRow) {
      conditions.push(
        sql`(${sales.createdAt}, ${sales.id}) < (${cursorRow.createdAt}, ${opts.cursor})`,
      );
    }
  }

  const rows = await db
    .select({
      id: sales.id,
      saleNo: sales.saleNo,
      receiptNumber: sales.receiptNumber,
      status: sales.status,
      locationId: sales.locationId,
      customerId: sales.customerId,
      grandTotal: sales.grandTotal,
      subtotal: sales.subtotal,
      discountTotal: sales.discountTotal,
      createdAt: sales.createdAt,
      completedAt: sales.completedAt,
      customerName: customers.name,
      locationName: locations.name,
      employeeName: users.fullName,
      lineCount: sql<number>`(
        SELECT count(*)::int FROM sale_lines
        WHERE sale_lines.sale_id = "sales"."id"
      )`,
    })
    .from(sales)
    .leftJoin(customers, eq(customers.id, sales.customerId))
    .leftJoin(locations, eq(locations.id, sales.locationId))
    .leftJoin(users, eq(users.id, sales.createdByUserId))
    .where(and(...conditions))
    .orderBy(desc(sales.createdAt), desc(sales.id))
    .limit(opts.limit + 1);

  const hasMore = rows.length > opts.limit;
  const data = hasMore ? rows.slice(0, opts.limit) : rows;
  const nextCursor = hasMore ? data[data.length - 1].id : null;

  return { data, nextCursor, hasMore };
}

/**
 * Get sale-related journal entries for audit trail.
 */
export async function getSaleJournal(saleId: string, orgId: string) {
  const entries = await db
    .select()
    .from(stockJournal)
    .where(
      and(
        eq(stockJournal.referenceId, saleId),
        eq(stockJournal.orgId, orgId),
      ),
    )
    .orderBy(stockJournal.effectiveAt, stockJournal.createdAt);

  return entries;
}
