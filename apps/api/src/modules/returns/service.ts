import { db, type DbOrTx } from "@apex/database";
import {
  returns,
  returnLines,
  sales,
  saleLines,
  salePayments,
  inventory,
  stockJournal,
  customers,
  customerTransactions,
  products,
  locations,
} from "@apex/database/schema";
import { eq, and, sql, desc, type SQL } from "drizzle-orm";
import type { CreateReturnInput, CompleteReturnInput, VoidReturnInput } from "@apex/types";
import { SaleStatus } from "@apex/types";
import { verifyPin } from "../auth/service";

// ── Helpers ──

/**
 * Generate a return number like RTN-000001, scoped per org.
 * Uses advisory lock to serialize number generation.
 */
async function generateReturnNumber(
  tx: DbOrTx,
  orgId: string,
): Promise<string> {
  // Advisory lock scoped to this org to serialize return number generation
  // Use a different lock key space than sales (offset by 1 billion)
  const lockKey =
    Buffer.from(orgId.replace(/-/g, "").slice(0, 8), "hex").readInt32BE(0) +
    1_000_000;
  await tx.execute(sql`SELECT pg_advisory_xact_lock(${lockKey})`);

  const result = await tx
    .select({ count: sql<string>`count(*)` })
    .from(returns)
    .where(eq(returns.orgId, orgId));

  const seq = parseInt(result[0]?.count ?? "0", 10) + 1;
  return `RTN-${String(seq).padStart(6, "0")}`;
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
): Promise<{ id: string; stockLevel: number }> {
  const rows = await tx.execute(
    sql`SELECT id, stock_level
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

  return { id: newRow.id, stockLevel: 0 };
}

/**
 * Insert a stock_journal entry with idempotency key.
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
    referenceType: "RETURN" | "VOID";
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
 * Create a return in DRAFT status.
 * Validates original sale, line quantities, and calculates totals from original prices.
 *
 * IDEMPOTENT: If already processed with same key, returns existing return.
 */
export async function createReturn(
  orgId: string,
  locationId: string,
  userId: string,
  input: CreateReturnInput,
) {
  return db.transaction(async (tx) => {
    // Idempotency check: look for existing return with this key
    const [existing] = await tx
      .select()
      .from(returns)
      .where(
        and(
          eq(returns.orgId, orgId),
          eq(returns.idempotencyKey, input.idempotencyKey),
        ),
      )
      .limit(1);

    if (existing) {
      return existing;
    }

    // Validate original sale exists and belongs to org
    const [sale] = await tx
      .select()
      .from(sales)
      .where(and(eq(sales.id, input.originalSaleId), eq(sales.orgId, orgId)))
      .limit(1);

    if (!sale) throw new Error("Original sale not found");

    if (
      sale.status !== SaleStatus.COMPLETED &&
      sale.status !== SaleStatus.PARTIALLY_REFUNDED
    ) {
      throw new Error(
        `Cannot create return for sale in ${sale.status} status`,
      );
    }

    // Fetch all sale lines for this sale
    const allSaleLines = await tx
      .select()
      .from(saleLines)
      .where(eq(saleLines.saleId, input.originalSaleId));

    const saleLineMap = new Map(allSaleLines.map((l) => [l.id, l]));

    // Validate requested return lines
    let subtotal = 0;
    const validatedLines: Array<{
      saleLine: typeof allSaleLines[0];
      quantity: number;
      condition: string;
      restock: boolean;
      restockLocationId: string | undefined;
      notes: string | undefined;
    }> = [];

    for (const reqLine of input.lines) {
      const saleLine = saleLineMap.get(reqLine.originalSaleLineId);
      if (!saleLine) {
        throw new Error(
          `Sale line ${reqLine.originalSaleLineId} not found in this sale`,
        );
      }

      if (reqLine.quantity <= 0) {
        throw new Error("Return quantity must be greater than zero");
      }

      const refundable = saleLine.quantity - saleLine.refundedQuantity;
      if (reqLine.quantity > refundable) {
        throw new Error(
          `Cannot return ${reqLine.quantity} of sale line ${reqLine.originalSaleLineId} — only ${refundable} remaining`,
        );
      }

      // Calculate line total from original unit price
      const effectivePrice = saleLine.overridePrice
        ? parseFloat(saleLine.overridePrice)
        : parseFloat(saleLine.unitPrice);
      const lineTotal = effectivePrice * reqLine.quantity;
      subtotal += lineTotal;

      validatedLines.push({
        saleLine,
        quantity: reqLine.quantity,
        condition: reqLine.condition ?? "RESELLABLE",
        restock: reqLine.restock ?? true,
        restockLocationId: reqLine.restockLocationId,
        notes: reqLine.notes,
      });
    }

    // Determine refund method: force ACCOUNT_CREDIT if original sale paid via ACCOUNT
    let refundMethod = input.refundMethod;
    if (sale.customerId) {
      const payments = await tx
        .select()
        .from(salePayments)
        .where(eq(salePayments.saleId, sale.id));
      const hasAccountPayment = payments.some(
        (p) => p.method === "ACCOUNT",
      );
      if (hasAccountPayment) {
        refundMethod = "ACCOUNT_CREDIT";
      }
    }

    // Generate return number
    const returnNumber = await generateReturnNumber(tx, orgId);

    // Insert return header
    const [ret] = await tx
      .insert(returns)
      .values({
        orgId,
        locationId,
        returnNumber,
        originalSaleId: input.originalSaleId,
        customerId: sale.customerId,
        status: "DRAFT",
        returnReason: input.returnReason,
        reasonNotes: input.reasonNotes ?? null,
        subtotal: subtotal.toFixed(2),
        taxAmount: "0.00",
        total: subtotal.toFixed(2),
        refundMethod,
        notes: input.notes ?? null,
        idempotencyKey: input.idempotencyKey,
      })
      .returning();

    // Insert return lines
    const lineInserts = validatedLines.map((vl) => {
      const effectivePrice = vl.saleLine.overridePrice
        ? parseFloat(vl.saleLine.overridePrice)
        : parseFloat(vl.saleLine.unitPrice);
      const lineTotal = effectivePrice * vl.quantity;

      return {
        returnId: ret.id,
        originalSaleLineId: vl.saleLine.id,
        productId: vl.saleLine.productId,
        productName: "", // Will be filled below
        sku: "",
        quantity: vl.quantity,
        unitPrice: effectivePrice.toFixed(2),
        lineTotal: lineTotal.toFixed(2),
        condition: vl.condition as "RESELLABLE" | "DAMAGED" | "DEFECTIVE",
        restock: vl.restock,
        restockLocationId: vl.restockLocationId ?? null,
        notes: vl.notes ?? null,
      };
    });

    // Fetch product info for the lines
    const productIds = validatedLines.map((vl) => vl.saleLine.productId);
    const productRows = await tx
      .select({ id: products.id, name: products.name, sku: products.sku })
      .from(products)
      .where(sql`${products.id} = ANY(${productIds})`);
    const productMap = new Map(productRows.map((p) => [p.id, p]));

    for (const li of lineInserts) {
      const prod = productMap.get(li.productId);
      li.productName = prod?.name ?? "Unknown";
      li.sku = prod?.sku ?? "";
    }

    await tx.insert(returnLines).values(lineInserts);

    // Return the full object with lines
    const insertedLines = await tx
      .select()
      .from(returnLines)
      .where(eq(returnLines.returnId, ret.id));

    return { ...ret, lines: insertedLines };
  });
}

/**
 * Complete a DRAFT return — requires manager PIN approval.
 *
 * All in one transaction:
 * 1. Lock return row, verify DRAFT status
 * 2. Verify manager PIN
 * 3. Restock eligible items (RESELLABLE + restock=true)
 * 4. Update sale_lines.refundedQuantity
 * 5. If ACCOUNT_CREDIT: insert CREDIT_NOTE transaction, adjust balance
 * 6. Update sale status (PARTIALLY_REFUNDED or REFUNDED)
 * 7. Set return status=COMPLETED
 */
export async function completeReturn(
  returnId: string,
  orgId: string,
  userId: string,
  input: CompleteReturnInput,
) {
  return db.transaction(async (tx) => {
    // Lock return row
    const returnRows = await tx.execute(
      sql`SELECT * FROM returns WHERE id = ${returnId} AND org_id = ${orgId} FOR UPDATE`,
    );
    if (returnRows.length === 0) throw new Error("Return not found");

    const ret = returnRows[0] as any;

    if (ret.status !== "DRAFT") {
      throw new Error(`Cannot complete return in ${ret.status} status`);
    }

    // Verify manager PIN
    const pinResult = await verifyPin(orgId, input.approvalPin);
    if (!pinResult.valid) {
      throw new Error("Invalid manager PIN");
    }

    // Fetch return lines
    const lines = await tx
      .select()
      .from(returnLines)
      .where(eq(returnLines.returnId, returnId));

    // Process each return line
    for (const line of lines) {
      // Restock: only if restock=true AND condition=RESELLABLE
      if (line.restock && line.condition === "RESELLABLE") {
        const restockLoc = line.restockLocationId ?? ret.location_id;

        const inv = await lockInventoryRow(
          tx,
          orgId,
          line.productId,
          restockLoc,
        );

        const newBalance = inv.stockLevel + line.quantity;

        // Restore stock
        await tx
          .update(inventory)
          .set({ stockLevel: newBalance })
          .where(eq(inventory.id, inv.id));

        // RETURN journal entry (positive changeQuantity = stock increase)
        await insertJournalEntry(tx, {
          orgId,
          productId: line.productId,
          locationId: restockLoc,
          userId,
          actorType: "USER",
          changeQuantity: line.quantity,
          balanceAfter: newBalance,
          referenceType: "RETURN",
          referenceId: returnId,
          referenceLineId: line.id,
          idempotencyKey: `${ret.idempotency_key}:RETURN:${line.id}`,
          notes: `[Return] ${ret.return_number}`,
        });
      }

      // Update refunded_quantity on the original sale line
      const [saleLine] = await tx
        .select()
        .from(saleLines)
        .where(eq(saleLines.id, line.originalSaleLineId));

      if (saleLine) {
        await tx
          .update(saleLines)
          .set({
            refundedQuantity: saleLine.refundedQuantity + line.quantity,
          })
          .where(eq(saleLines.id, line.originalSaleLineId));
      }
    }

    // If ACCOUNT_CREDIT and customer exists, credit the customer balance
    const returnTotal = parseFloat(ret.total);
    if (ret.refund_method === "ACCOUNT_CREDIT" && ret.customer_id) {
      // Lock customer row
      const custRows = await tx.execute(
        sql`SELECT * FROM customers WHERE id = ${ret.customer_id} AND org_id = ${orgId} FOR UPDATE`,
      );
      if (custRows.length > 0) {
        const cust = custRows[0] as any;
        const currentBalance = parseFloat(cust.current_balance);
        const newBalance = currentBalance - returnTotal;

        await tx
          .update(customers)
          .set({ currentBalance: newBalance.toFixed(2) })
          .where(eq(customers.id, ret.customer_id));

        // Insert CREDIT_NOTE transaction
        await tx
          .insert(customerTransactions)
          .values({
            orgId,
            customerId: ret.customer_id,
            type: "CREDIT_NOTE",
            amount: returnTotal.toFixed(2),
            balanceAfter: newBalance.toFixed(2),
            referenceType: "return",
            referenceId: returnId,
            referenceNumber: ret.return_number,
            recordedBy: userId,
            notes: `Credit note for return ${ret.return_number}`,
          });
      }
    }

    // Check if all sale lines are fully refunded
    const updatedSaleLines = await tx
      .select()
      .from(saleLines)
      .where(eq(saleLines.saleId, ret.original_sale_id));

    const fullyRefunded = updatedSaleLines.every(
      (l) => l.refundedQuantity >= l.quantity,
    );
    const newSaleStatus = fullyRefunded
      ? SaleStatus.REFUNDED
      : SaleStatus.PARTIALLY_REFUNDED;

    // Update sale status
    await tx
      .update(sales)
      .set({
        status: newSaleStatus,
        refundedByUserId: userId,
        refundedAt: new Date(),
      })
      .where(eq(sales.id, ret.original_sale_id));

    // Set return to COMPLETED
    const [completed] = await tx
      .update(returns)
      .set({
        status: "COMPLETED",
        completedAt: new Date(),
        approvedBy: pinResult.userId,
        processedBy: userId,
      })
      .where(eq(returns.id, returnId))
      .returning();

    const completedLines = await tx
      .select()
      .from(returnLines)
      .where(eq(returnLines.returnId, returnId));

    return { ...completed, lines: completedLines };
  });
}

/**
 * Void a COMPLETED return — reverses all effects.
 *
 * 1. Lock return, verify COMPLETED status
 * 2. For each restocked line: reverse stock, reverse journal
 * 3. For each line: reverse sale_lines.refundedQuantity
 * 4. If ACCOUNT_CREDIT: reverse customer balance
 * 5. Update sale status
 * 6. Set status=VOIDED
 */
export async function voidReturn(
  returnId: string,
  orgId: string,
  userId: string,
  input: VoidReturnInput,
) {
  return db.transaction(async (tx) => {
    // Lock return row
    const returnRows = await tx.execute(
      sql`SELECT * FROM returns WHERE id = ${returnId} AND org_id = ${orgId} FOR UPDATE`,
    );
    if (returnRows.length === 0) throw new Error("Return not found");

    const ret = returnRows[0] as any;

    if (ret.status !== "COMPLETED") {
      throw new Error(`Cannot void return in ${ret.status} status`);
    }

    // Fetch return lines
    const lines = await tx
      .select()
      .from(returnLines)
      .where(eq(returnLines.returnId, returnId));

    // Reverse each return line
    for (const line of lines) {
      // Reverse restock: only if restock=true AND condition=RESELLABLE
      if (line.restock && line.condition === "RESELLABLE") {
        const restockLoc = line.restockLocationId ?? ret.location_id;

        const inv = await lockInventoryRow(
          tx,
          orgId,
          line.productId,
          restockLoc,
        );

        const newBalance = inv.stockLevel - line.quantity;

        // Remove stock
        await tx
          .update(inventory)
          .set({ stockLevel: newBalance })
          .where(eq(inventory.id, inv.id));

        // VOID journal entry (negative changeQuantity = stock decrease)
        await insertJournalEntry(tx, {
          orgId,
          productId: line.productId,
          locationId: restockLoc,
          userId,
          actorType: "USER",
          changeQuantity: -line.quantity,
          balanceAfter: newBalance,
          referenceType: "VOID",
          referenceId: returnId,
          referenceLineId: line.id,
          idempotencyKey: `${ret.idempotency_key}:VOID:${line.id}`,
          notes: `[Void Return] ${ret.return_number} — ${input.reason}`,
        });
      }

      // Reverse refunded_quantity on the original sale line
      const [saleLine] = await tx
        .select()
        .from(saleLines)
        .where(eq(saleLines.id, line.originalSaleLineId));

      if (saleLine) {
        const newRefunded = Math.max(
          0,
          saleLine.refundedQuantity - line.quantity,
        );
        await tx
          .update(saleLines)
          .set({ refundedQuantity: newRefunded })
          .where(eq(saleLines.id, line.originalSaleLineId));
      }
    }

    // If ACCOUNT_CREDIT: reverse customer balance
    const returnTotal = parseFloat(ret.total);
    if (ret.refund_method === "ACCOUNT_CREDIT" && ret.customer_id) {
      const custRows = await tx.execute(
        sql`SELECT * FROM customers WHERE id = ${ret.customer_id} AND org_id = ${orgId} FOR UPDATE`,
      );
      if (custRows.length > 0) {
        const cust = custRows[0] as any;
        const currentBalance = parseFloat(cust.current_balance);
        const newBalance = currentBalance + returnTotal;

        await tx
          .update(customers)
          .set({ currentBalance: newBalance.toFixed(2) })
          .where(eq(customers.id, ret.customer_id));

        // Insert reversal ADJUSTMENT transaction
        await tx
          .insert(customerTransactions)
          .values({
            orgId,
            customerId: ret.customer_id,
            type: "ADJUSTMENT",
            amount: returnTotal.toFixed(2),
            balanceAfter: newBalance.toFixed(2),
            referenceType: "return",
            referenceId: returnId,
            referenceNumber: ret.return_number,
            recordedBy: userId,
            notes: `Void return ${ret.return_number}: ${input.reason}`,
          });
      }
    }

    // Re-check sale status: re-read all sale lines after voiding
    const updatedSaleLines = await tx
      .select()
      .from(saleLines)
      .where(eq(saleLines.saleId, ret.original_sale_id));

    const anyRefunded = updatedSaleLines.some(
      (l) => l.refundedQuantity > 0,
    );
    const fullyRefunded = updatedSaleLines.every(
      (l) => l.refundedQuantity >= l.quantity,
    );

    let newSaleStatus: SaleStatus;
    if (fullyRefunded) {
      newSaleStatus = SaleStatus.REFUNDED;
    } else if (anyRefunded) {
      newSaleStatus = SaleStatus.PARTIALLY_REFUNDED;
    } else {
      newSaleStatus = SaleStatus.COMPLETED;
    }

    await tx
      .update(sales)
      .set({ status: newSaleStatus })
      .where(eq(sales.id, ret.original_sale_id));

    // Set return to VOIDED
    const [voided] = await tx
      .update(returns)
      .set({
        status: "VOIDED",
        voidedAt: new Date(),
        voidedBy: userId,
        voidReason: input.reason,
      })
      .where(eq(returns.id, returnId))
      .returning();

    return voided;
  });
}

// ── Query Functions ──

/**
 * Get a single return with its lines and related info.
 */
export async function getReturn(returnId: string, orgId: string) {
  const [ret] = await db
    .select()
    .from(returns)
    .where(and(eq(returns.id, returnId), eq(returns.orgId, orgId)))
    .limit(1);

  if (!ret) return null;

  const lines = await db
    .select()
    .from(returnLines)
    .where(eq(returnLines.returnId, ret.id));

  // Fetch sale info
  const [sale] = await db
    .select({
      id: sales.id,
      saleNo: sales.saleNo,
      status: sales.status,
    })
    .from(sales)
    .where(eq(sales.id, ret.originalSaleId))
    .limit(1);

  // Fetch customer info if attached
  let customer = null;
  if (ret.customerId) {
    const [c] = await db
      .select({
        id: customers.id,
        name: customers.name,
        phone: customers.phone,
        currentBalance: customers.currentBalance,
      })
      .from(customers)
      .where(eq(customers.id, ret.customerId))
      .limit(1);
    customer = c ?? null;
  }

  // Fetch location
  const [location] = await db
    .select({
      id: locations.id,
      name: locations.name,
      code: locations.code,
    })
    .from(locations)
    .where(eq(locations.id, ret.locationId))
    .limit(1);

  return {
    ...ret,
    lines,
    sale: sale ?? null,
    customer,
    location: location ?? null,
  };
}

/**
 * List returns with filters and keyset cursor pagination.
 */
export async function listReturns(
  orgId: string,
  opts: {
    locationId?: string | null;
    status?: string[];
    originalSaleId?: string;
    from?: string;
    to?: string;
    cursor?: string;
    limit: number;
  },
) {
  const conditions: SQL[] = [eq(returns.orgId, orgId)];

  if (opts.locationId) {
    conditions.push(eq(returns.locationId, opts.locationId));
  }

  if (opts.status && opts.status.length > 0) {
    conditions.push(
      sql`${returns.status} = ANY(${opts.status})`,
    );
  }

  if (opts.originalSaleId) {
    conditions.push(eq(returns.originalSaleId, opts.originalSaleId));
  }

  if (opts.from) {
    conditions.push(sql`${returns.createdAt} >= ${opts.from}`);
  }
  if (opts.to) {
    conditions.push(sql`${returns.createdAt} <= ${opts.to}`);
  }

  // Keyset cursor pagination
  if (opts.cursor) {
    const [cursorRow] = await db
      .select({
        createdAt: returns.createdAt,
        id: returns.id,
      })
      .from(returns)
      .where(eq(returns.id, opts.cursor))
      .limit(1);

    if (cursorRow) {
      conditions.push(
        sql`(${returns.createdAt}, ${returns.id}) < (${cursorRow.createdAt}, ${opts.cursor})`,
      );
    }
  }

  const limit = opts.limit;
  const rows = await db
    .select({
      id: returns.id,
      orgId: returns.orgId,
      locationId: returns.locationId,
      returnNumber: returns.returnNumber,
      originalSaleId: returns.originalSaleId,
      customerId: returns.customerId,
      status: returns.status,
      returnReason: returns.returnReason,
      subtotal: returns.subtotal,
      total: returns.total,
      refundMethod: returns.refundMethod,
      completedAt: returns.completedAt,
      createdAt: returns.createdAt,
      // Joined fields
      saleNo: sales.saleNo,
      customerName: customers.name,
      locationName: locations.name,
    })
    .from(returns)
    .leftJoin(sales, eq(sales.id, returns.originalSaleId))
    .leftJoin(customers, eq(customers.id, returns.customerId))
    .leftJoin(locations, eq(locations.id, returns.locationId))
    .where(and(...conditions))
    .orderBy(desc(returns.createdAt), desc(returns.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? data[data.length - 1].id : null;

  return { data, nextCursor, hasMore };
}
