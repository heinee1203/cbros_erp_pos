import { db, type DbOrTx } from "@apex/database";
import { customers, customerTransactions, customerTiers, arPaymentAllocations } from "@apex/database/schema";
import { eq, and, or, sql, desc, asc, ilike, gt, lt, gte, lte, type SQL } from "drizzle-orm";
import type {
  CreateCustomerInput,
  UpdateCustomerInput,
  RecordPaymentInput,
  CustomerAdjustmentInput,
} from "@apex/types";
import { verifyPin } from "../auth/service";

// ── Custom Errors ──

export class CreditLimitError extends Error {
  code = "CREDIT_LIMIT_EXCEEDED" as const;
  constructor(
    public overage: number,
    public currentBalance: number,
    public creditLimit: number,
  ) {
    super(`Charge would exceed credit limit by ₱${overage.toFixed(2)}`);
  }
}

// ── Service Functions ──

/**
 * List customers with search, filters, sorting, and keyset cursor pagination.
 */
export async function listCustomers(
  orgId: string,
  opts: {
    search?: string;
    type?: string;
    hasBalance?: boolean;
    sortBy?: string;
    cursor?: string;
    limit: number;
    dateFrom?: string;
    dateTo?: string;
  },
) {
  const conditions: SQL[] = [
    eq(customers.orgId, orgId),
    eq(customers.isActive, true),
  ];

  // Determine if search is an invoice/payment/SOA number
  const searchTerm = opts.search?.trim() ?? "";
  const isRefSearch = searchTerm.length >= 2 && /^(Q\d|PAY-|SOA-|\d{4,})/i.test(searchTerm);

  if (searchTerm.length >= 1) {
    if (isRefSearch) {
      // Search by reference number, payment number, or SOA number
      conditions.push(
        sql`(
          ${or(
            ilike(customers.name, `%${searchTerm}%`),
            ilike(customers.phone, `%${searchTerm}%`),
          )}
          OR EXISTS (
            SELECT 1 FROM customer_transactions ct
            WHERE ct.customer_id = ${customers.id} AND ct.org_id = ${customers.orgId}
              AND (ct.reference_number ILIKE ${`%${searchTerm}%`} OR ct.payment_number ILIKE ${`%${searchTerm}%`})
          )
          OR EXISTS (
            SELECT 1 FROM soa_records sr
            WHERE sr.customer_id = ${customers.id} AND sr.org_id = ${customers.orgId}
              AND sr.soa_number ILIKE ${`%${searchTerm}%`}
          )
        )`,
      );
    } else {
      conditions.push(
        or(
          ilike(customers.name, `%${searchTerm}%`),
          ilike(customers.phone, `%${searchTerm}%`),
          ilike(customers.email, `%${searchTerm}%`),
        )!,
      );
    }
  }

  if (opts.type) {
    conditions.push(eq(customers.customerType, opts.type as any));
  }

  if (opts.hasBalance) {
    conditions.push(gt(customers.currentBalance, "0.00"));
  }

  if (opts.cursor) {
    const [cursorRow] = await db
      .select({ createdAt: customers.createdAt, id: customers.id })
      .from(customers)
      .where(eq(customers.id, opts.cursor))
      .limit(1);
    if (cursorRow) {
      conditions.push(
        sql`(${customers.createdAt}, ${customers.id}) < (${cursorRow.createdAt}, ${opts.cursor})`,
      );
    }
  }

  // Date-range filtered purchases: compute from customer_transactions if date range provided
  const hasDates = opts.dateFrom && opts.dateTo;
  const periodPurchases = hasDates
    ? sql<string>`COALESCE((
        SELECT SUM(ct.amount::numeric)
        FROM customer_transactions ct
        WHERE ct.customer_id = ${customers.id}
          AND ct.org_id = ${customers.orgId}
          AND ct.type = 'CHARGE'
          AND ct.recorded_at >= ${opts.dateFrom!}::timestamptz
          AND ct.recorded_at <= ${opts.dateTo!}::timestamptz
      ), 0)::text`
    : customers.totalPurchases;

  const periodTxnCount = hasDates
    ? sql<number>`COALESCE((
        SELECT COUNT(*)::int
        FROM customer_transactions ct
        WHERE ct.customer_id = ${customers.id}
          AND ct.org_id = ${customers.orgId}
          AND ct.type = 'CHARGE'
          AND ct.recorded_at >= ${opts.dateFrom!}::timestamptz
          AND ct.recorded_at <= ${opts.dateTo!}::timestamptz
      ), 0)`
    : sql<number>`0`;

  const unbilledCount = sql<number>`COALESCE((
    SELECT COUNT(*)::int FROM customer_transactions ct2
    WHERE ct2.customer_id = ${customers.id} AND ct2.org_id = ${customers.orgId}
      AND ct2.type = 'CHARGE' AND (ct2.billed = false OR ct2.billed IS NULL)
  ), 0)`;

  const totalChargeCount = sql<number>`COALESCE((
    SELECT COUNT(*)::int FROM customer_transactions ct3
    WHERE ct3.customer_id = ${customers.id} AND ct3.org_id = ${customers.orgId}
      AND ct3.type = 'CHARGE'
  ), 0)`;

  const rows = await db
    .select({
      id: customers.id,
      orgId: customers.orgId,
      name: customers.name,
      customerType: customers.customerType,
      contactPerson: customers.contactPerson,
      phone: customers.phone,
      email: customers.email,
      address: customers.address,
      tin: customers.tin,
      creditLimit: customers.creditLimit,
      paymentTermsDays: customers.paymentTermsDays,
      currentBalance: customers.currentBalance,
      totalPurchases: periodPurchases,
      txnCount: periodTxnCount,
      unbilledCount,
      totalChargeCount,
      notes: customers.notes,
      isActive: customers.isActive,
      tierId: customers.tierId,
      tierName: customerTiers.name,
      tierColor: customerTiers.color,
      tierDiscount: customerTiers.defaultDiscount,
      createdAt: customers.createdAt,
      updatedAt: customers.updatedAt,
      // When searching by ref number, return the matched reference for display
      matchedRef: isRefSearch && searchTerm.length >= 2
        ? sql<string | null>`(
            SELECT json_build_object(
              'type', CASE
                WHEN ct.reference_number ILIKE ${`%${searchTerm}%`} THEN 'invoice'
                WHEN ct.payment_number ILIKE ${`%${searchTerm}%`} THEN 'payment'
                ELSE 'invoice'
              END,
              'number', COALESCE(
                CASE WHEN ct.reference_number ILIKE ${`%${searchTerm}%`} THEN ct.reference_number ELSE NULL END,
                CASE WHEN ct.payment_number ILIKE ${`%${searchTerm}%`} THEN ct.payment_number ELSE NULL END
              ),
              'date', ct.recorded_at::text,
              'amount', ct.amount::text,
              'txnType', ct.type
            )::text
            FROM customer_transactions ct
            WHERE ct.customer_id = ${customers.id} AND ct.org_id = ${customers.orgId}
              AND (ct.reference_number ILIKE ${`%${searchTerm}%`} OR ct.payment_number ILIKE ${`%${searchTerm}%`})
            LIMIT 1
          )`
        : sql<string | null>`NULL`,
    })
    .from(customers)
    .leftJoin(customerTiers, eq(customers.tierId, customerTiers.id))
    .where(and(...conditions))
    .orderBy(desc(customers.createdAt), desc(customers.id))
    .limit(opts.limit + 1);

  const hasMore = rows.length > opts.limit;
  const data = hasMore ? rows.slice(0, opts.limit) : rows;
  const nextCursor = hasMore ? data[data.length - 1].id : null;

  return { data, nextCursor, hasMore };
}

/**
 * Get a single customer by ID with their 10 most recent transactions.
 */
export async function getCustomer(customerId: string, orgId: string) {
  const [customer] = await db
    .select()
    .from(customers)
    .where(and(eq(customers.id, customerId), eq(customers.orgId, orgId)))
    .limit(1);

  if (!customer) return null;

  const recentTransactions = await db
    .select()
    .from(customerTransactions)
    .where(
      and(
        eq(customerTransactions.customerId, customerId),
        eq(customerTransactions.orgId, orgId),
      ),
    )
    .orderBy(desc(customerTransactions.recordedAt), desc(customerTransactions.id))
    .limit(10);

  return { customer, recentTransactions };
}

/**
 * Create a new customer with AR fields.
 */
export async function createCustomer(input: CreateCustomerInput, orgId: string) {
  // Sanitize: empty strings → null for optional fields
  const nullIfEmpty = (v: string | undefined | null): string | null =>
    !v || v.trim() === "" ? null : v.trim();

  const [customer] = await db
    .insert(customers)
    .values({
      orgId,
      name: input.name.trim(),
      phone: input.phone.trim(),
      customerType: input.customerType as any,
      contactPerson: nullIfEmpty(input.contactPerson),
      email: nullIfEmpty(input.email),
      address: nullIfEmpty(input.address),
      tin: nullIfEmpty(input.tin),
      creditLimit: input.creditLimit || "0.00",
      paymentTermsDays: input.paymentTermsDays ?? 30,
      notes: nullIfEmpty(input.notes),
      tierId: (input as any).tierId || null,
    })
    .returning();

  return customer;
}

/**
 * PATCH update a customer. Cannot modify currentBalance or totalPurchases.
 */
export async function updateCustomer(
  customerId: string,
  input: UpdateCustomerInput,
  orgId: string,
) {
  const setFields: Record<string, any> = {};

  if (input.name !== undefined) setFields.name = input.name;
  if (input.customerType !== undefined) setFields.customerType = input.customerType;
  if (input.contactPerson !== undefined) setFields.contactPerson = input.contactPerson;
  if (input.phone !== undefined) setFields.phone = input.phone;
  if (input.email !== undefined) setFields.email = input.email;
  if (input.address !== undefined) setFields.address = input.address;
  if (input.tin !== undefined) setFields.tin = input.tin;
  if (input.creditLimit !== undefined) setFields.creditLimit = input.creditLimit;
  if (input.paymentTermsDays !== undefined) setFields.paymentTermsDays = input.paymentTermsDays;
  if (input.notes !== undefined) setFields.notes = input.notes;
  if (input.isActive !== undefined) setFields.isActive = input.isActive;
  if ((input as any).tierId !== undefined) setFields.tierId = (input as any).tierId || null;

  if (Object.keys(setFields).length === 0) {
    // Nothing to update — just return existing
    const [existing] = await db
      .select()
      .from(customers)
      .where(and(eq(customers.id, customerId), eq(customers.orgId, orgId)))
      .limit(1);
    return existing ?? null;
  }

  const [updated] = await db
    .update(customers)
    .set(setFields)
    .where(and(eq(customers.id, customerId), eq(customers.orgId, orgId)))
    .returning();

  return updated ?? null;
}

/**
 * Soft-delete a customer (set is_active = false).
 * Only allowed if current_balance is zero.
 */
export async function softDeleteCustomer(customerId: string, orgId: string) {
  const [customer] = await db
    .select()
    .from(customers)
    .where(and(eq(customers.id, customerId), eq(customers.orgId, orgId)))
    .limit(1);

  if (!customer) throw new Error("Customer not found");

  if (parseFloat(customer.currentBalance) !== 0) {
    throw new Error(
      `Cannot deactivate customer with outstanding balance of ₱${parseFloat(customer.currentBalance).toFixed(2)}`,
    );
  }

  const [updated] = await db
    .update(customers)
    .set({ isActive: false })
    .where(eq(customers.id, customerId))
    .returning();

  return updated;
}

/**
 * FIFO allocate a payment (or credit note) against unpaid charges.
 * Oldest unpaid charges get paid first.
 */
async function allocatePaymentFIFO(
  tx: any,
  orgId: string,
  customerId: string,
  paymentTxnId: string,
  paymentAmount: number,
) {
  // Get all CHARGE transactions for this customer, oldest first
  const charges = await tx
    .select({ id: customerTransactions.id, amount: customerTransactions.amount })
    .from(customerTransactions)
    .where(and(
      eq(customerTransactions.customerId, customerId),
      eq(customerTransactions.orgId, orgId),
      eq(customerTransactions.type, "CHARGE" as any),
    ))
    .orderBy(asc(customerTransactions.recordedAt), asc(customerTransactions.id));

  let remaining = paymentAmount;
  for (const charge of charges) {
    if (remaining <= 0.005) break;
    const chargeAmt = parseFloat(charge.amount);

    // Sum existing allocations against this charge
    const [allocated] = await tx.execute(
      sql`SELECT COALESCE(SUM(allocated_amount::numeric), 0) AS total FROM ar_payment_allocations WHERE charge_transaction_id = ${charge.id}`,
    ) as any[];
    const alreadyAllocated = parseFloat(allocated.total);
    const unpaid = chargeAmt - alreadyAllocated;
    if (unpaid <= 0.005) continue;

    const alloc = Math.min(remaining, unpaid);
    await tx.insert(arPaymentAllocations).values({
      orgId,
      paymentTransactionId: paymentTxnId,
      chargeTransactionId: charge.id,
      allocatedAmount: alloc.toFixed(2),
    });
    remaining -= alloc;
  }
}

/**
 * Record a multi-customer payment (one check covering multiple AR accounts).
 */
export async function recordMultiCustomerPayment(
  input: {
    method: string;
    totalAmount: string;
    referenceNumber?: string;
    bank?: string;
    checkNumber?: string;
    checkDate?: string;
    cardType?: string;
    batchNumber?: string;
    traceNumber?: string;
    notes?: string;
    allocations: Array<{ customerId: string; amount: string; soaIds?: string[] }>;
  },
  orgId: string,
  userId: string,
) {
  return db.transaction(async (tx) => {
    const totalAmount = parseFloat(input.totalAmount);
    const allocSum = input.allocations.reduce((s, a) => s + parseFloat(a.amount), 0);
    if (Math.abs(totalAmount - allocSum) > 0.01) {
      throw new Error(`Total amount (${totalAmount}) doesn't match sum of allocations (${allocSum})`);
    }

    // Generate multi-payment reference
    const year = new Date().getFullYear();
    const [mpSeq] = await tx.execute(sql`
      INSERT INTO payment_number_sequence (org_id, year, last_number)
      VALUES (${orgId}, ${year}, 1)
      ON CONFLICT (org_id, year) DO UPDATE SET last_number = payment_number_sequence.last_number + 1
      RETURNING last_number
    `) as any[];
    const mpNumber = `MP-${year}-${String(mpSeq.last_number).padStart(4, "0")}`;

    const results: Array<{ customerId: string; customerName: string; paymentNumber: string; amount: number; newBalance: number }> = [];

    for (const alloc of input.allocations) {
      const allocAmount = parseFloat(alloc.amount);
      if (allocAmount <= 0) continue;

      // Lock customer
      const [custRow] = await tx.execute(sql`SELECT * FROM customers WHERE id = ${alloc.customerId} AND org_id = ${orgId} FOR UPDATE`) as any[];
      if (!custRow) throw new Error(`Customer ${alloc.customerId} not found`);

      const currentBalance = parseFloat(custRow.current_balance);
      const newBalance = currentBalance - allocAmount;

      // Update balance
      await tx.update(customers).set({ currentBalance: newBalance.toFixed(2) }).where(eq(customers.id, alloc.customerId));

      // Generate payment number
      const [paySeq] = await tx.execute(sql`
        INSERT INTO payment_number_sequence (org_id, year, last_number)
        VALUES (${orgId}, ${year}, 1)
        ON CONFLICT (org_id, year) DO UPDATE SET last_number = payment_number_sequence.last_number + 1
        RETURNING last_number
      `) as any[];
      const paymentNumber = `PAY-${year}-${String(paySeq.last_number).padStart(4, "0")}`;

      // Build notes
      const soaRefs = alloc.soaIds && alloc.soaIds.length > 0 ? ` [SOA: ${alloc.soaIds.join(", ")}]` : "";
      const mpNote = `[Multi-Payment: ${mpNumber}] ${input.notes || ""}${soaRefs}`.trim();

      // Build payment lines
      const paymentLines = [{
        method: input.method,
        amount: allocAmount,
        reference: input.referenceNumber,
        bank: input.bank,
        checkNumber: input.checkNumber,
        checkDate: input.checkDate,
        cardType: input.cardType,
        batchNumber: input.batchNumber,
        traceNumber: input.traceNumber,
      }];

      // Insert PAYMENT transaction
      const [txn] = await tx.insert(customerTransactions).values({
        orgId,
        customerId: alloc.customerId,
        type: "PAYMENT",
        amount: allocAmount.toFixed(2),
        balanceAfter: newBalance.toFixed(2),
        paymentMethod: input.method,
        referenceNumber: input.referenceNumber ?? null,
        notes: mpNote,
        recordedBy: userId,
        paymentNumber,
        batchNumber: input.batchNumber ?? null,
        traceNumber: input.traceNumber ?? null,
        cardType: input.cardType ?? null,
        paymentLines,
      }).returning();

      // FIFO allocate
      try { await allocatePaymentFIFO(tx, orgId, alloc.customerId, txn.id, allocAmount); } catch {}

      // Update SOA statuses
      if (alloc.soaIds) {
        for (const soaId of alloc.soaIds) {
          try {
            const [soa] = await tx.execute(sql`SELECT total_payable, paid_amount FROM soa_records WHERE id = ${soaId}`) as any[];
            if (soa) {
              const soaPayable = parseFloat(soa.total_payable);
              const prevPaid = parseFloat(soa.paid_amount || "0");
              const newPaid = prevPaid + allocAmount;
              const status = newPaid >= soaPayable ? "PAID" : "PARTIAL";
              await tx.execute(sql`UPDATE soa_records SET status = ${status}, paid_amount = ${Math.min(newPaid, soaPayable).toFixed(2)} WHERE id = ${soaId}`);
            }
          } catch {}
        }
      }

      results.push({ customerId: alloc.customerId, customerName: custRow.name, paymentNumber, amount: allocAmount, newBalance });
    }

    return { mpNumber, results };
  });
}

/**
 * Record a payment against a customer's AR balance.
 * Decreases currentBalance and creates a PAYMENT transaction.
 * Auto-allocates to oldest unpaid charges (FIFO).
 */
export async function recordPayment(
  customerId: string,
  input: RecordPaymentInput,
  orgId: string,
  userId: string,
) {
  return db.transaction(async (tx) => {
    // Lock customer row
    const rows = await tx.execute(
      sql`SELECT * FROM customers WHERE id = ${customerId} AND org_id = ${orgId} FOR UPDATE`,
    );
    if (rows.length === 0) throw new Error("Customer not found");

    const row = rows[0] as any;
    if (!row.is_active) throw new Error("Customer account is inactive");

    const paymentAmount = parseFloat(input.amount);
    const currentBalance = parseFloat(row.current_balance);

    if (paymentAmount <= 0) {
      throw new Error("Payment amount must be greater than zero");
    }
    if (paymentAmount > currentBalance + 0.01) {
      throw new Error(
        `Payment of \u20B1${paymentAmount.toFixed(2)} exceeds outstanding balance of \u20B1${currentBalance.toFixed(2)}`,
      );
    }

    const newBalance = currentBalance - paymentAmount;

    // Update customer balance
    await tx
      .update(customers)
      .set({ currentBalance: newBalance.toFixed(2) })
      .where(eq(customers.id, customerId));

    // Generate payment number
    const year = new Date().getFullYear();
    const [seq] = await tx.execute(sql`
      INSERT INTO payment_number_sequence (org_id, year, last_number)
      VALUES (${orgId}, ${year}, 1)
      ON CONFLICT (org_id, year) DO UPDATE SET last_number = payment_number_sequence.last_number + 1
      RETURNING last_number
    `) as any[];
    const paymentNumber = `PAY-${year}-${String(seq.last_number).padStart(4, "0")}`;

    // Insert PAYMENT transaction
    const recordedAt = new Date();
    const [transaction] = await tx
      .insert(customerTransactions)
      .values({
        orgId,
        customerId,
        type: "PAYMENT",
        amount: paymentAmount.toFixed(2),
        balanceAfter: newBalance.toFixed(2),
        paymentMethod: input.paymentMethod,
        referenceNumber: input.referenceNumber ?? null,
        notes: input.notes ?? null,
        recordedBy: userId,
        recordedAt,
        paymentNumber,
        batchNumber: (input as any).batchNumber ?? null,
        traceNumber: (input as any).traceNumber ?? null,
        cardType: (input as any).cardType ?? null,
        paymentLines: (input as any).paymentLines ?? null,
      })
      .returning();

    // Allocate payment to charges — explicit allocations if provided, otherwise FIFO
    try {
      const explicitAllocs = input.allocations;
      if (explicitAllocs && explicitAllocs.length > 0) {
        // Use explicit invoice-level allocations from the UI
        for (const alloc of explicitAllocs) {
          if (alloc.amount <= 0) continue;
          await tx.insert(arPaymentAllocations).values({
            orgId,
            paymentTransactionId: transaction.id,
            chargeTransactionId: alloc.chargeTransactionId,
            allocatedAmount: alloc.amount.toFixed(2),
          });
        }
      } else {
        // Auto-allocate using FIFO
        await allocatePaymentFIFO(tx, orgId, customerId, transaction.id, paymentAmount);
      }
    } catch (allocErr) {
      // Non-critical — payment is still recorded even if allocation fails
      console.error("[ALLOC] allocation failed:", allocErr);
    }

    return transaction;
  });
}

/**
 * Record a manual adjustment (positive or negative) on a customer's AR balance.
 */
export async function recordAdjustment(
  customerId: string,
  input: CustomerAdjustmentInput,
  orgId: string,
  userId: string,
) {
  return db.transaction(async (tx) => {
    // Lock customer row
    const rows = await tx.execute(
      sql`SELECT * FROM customers WHERE id = ${customerId} AND org_id = ${orgId} FOR UPDATE`,
    );
    if (rows.length === 0) throw new Error("Customer not found");

    const row = rows[0] as any;
    const adjustmentAmount = parseFloat(input.amount);
    const currentBalance = parseFloat(row.current_balance);
    const newBalance = currentBalance + adjustmentAmount;

    if (newBalance < 0) {
      throw new Error(
        `Adjustment would result in negative balance (₱${newBalance.toFixed(2)}). Current balance: ₱${currentBalance.toFixed(2)}`,
      );
    }

    // Update customer balance
    await tx
      .update(customers)
      .set({ currentBalance: newBalance.toFixed(2) })
      .where(eq(customers.id, customerId));

    // Insert ADJUSTMENT transaction
    const [transaction] = await tx
      .insert(customerTransactions)
      .values({
        orgId,
        customerId,
        type: "ADJUSTMENT",
        amount: Math.abs(adjustmentAmount).toFixed(2),
        balanceAfter: newBalance.toFixed(2),
        notes: input.notes,
        recordedBy: userId,
      })
      .returning();

    return transaction;
  });
}

// ── Helper: recalculate balance_after + customer totals ──
async function recalcCustomer(tx: any, customerId: string, orgId: string) {
  const allTxns = await tx
    .select({ id: customerTransactions.id, amount: customerTransactions.amount, type: customerTransactions.type })
    .from(customerTransactions)
    .where(eq(customerTransactions.customerId, customerId))
    .orderBy(asc(customerTransactions.recordedAt), asc(customerTransactions.id));

  let running = 0;
  for (const t of allTxns) {
    const amt = parseFloat(t.amount);
    if (t.type === "CHARGE" || (t.type === "ADJUSTMENT" && amt > 0)) running += amt;
    else running -= Math.abs(amt);
    await tx.update(customerTransactions).set({ balanceAfter: running.toFixed(2) }).where(eq(customerTransactions.id, t.id));
  }

  // Sum total purchases
  const [totals] = await tx.execute(
    sql`SELECT COALESCE(SUM(amount::numeric), 0) AS total FROM customer_transactions WHERE customer_id = ${customerId} AND type = 'CHARGE'`,
  ) as any[];

  await tx.update(customers).set({
    currentBalance: running.toFixed(2),
    totalPurchases: parseFloat(totals.total).toFixed(2),
  }).where(eq(customers.id, customerId));

  return running;
}

/**
 * Reassign a transaction from one customer to another.
 */
export async function reassignTransaction(
  customerId: string,
  transactionId: string,
  newCustomerId: string,
  reason: string,
  orgId: string,
  userId: string,
) {
  return db.transaction(async (tx) => {
    // Lock both customer rows
    const [srcRow] = await tx.execute(sql`SELECT id, name FROM customers WHERE id = ${customerId} AND org_id = ${orgId} FOR UPDATE`) as any[];
    if (!srcRow) throw new Error("Source customer not found");
    const [dstRow] = await tx.execute(sql`SELECT id, name FROM customers WHERE id = ${newCustomerId} AND org_id = ${orgId} FOR UPDATE`) as any[];
    if (!dstRow) throw new Error("Destination customer not found");
    if (customerId === newCustomerId) throw new Error("Cannot reassign to the same customer");

    // Verify transaction belongs to source customer
    const [txn] = await tx.execute(sql`SELECT id, type, amount, reference_number, billed, billed_soa_id, notes FROM customer_transactions WHERE id = ${transactionId} AND customer_id = ${customerId}`) as any[];
    if (!txn) throw new Error("Transaction not found on this customer");

    // Move to new customer, clear billing
    const oldNotes = txn.notes || "";
    const auditNote = `Reassigned from ${srcRow.name} to ${dstRow.name} by user. Reason: ${reason}`;
    const newNotes = oldNotes ? `${oldNotes} | ${auditNote}` : auditNote;

    await tx.execute(sql`
      UPDATE customer_transactions
      SET customer_id = ${newCustomerId}, billed = false, billed_soa_id = NULL, notes = ${newNotes}
      WHERE id = ${transactionId}
    `);

    // Recalculate both customers
    const srcBalance = await recalcCustomer(tx, customerId, orgId);
    const dstBalance = await recalcCustomer(tx, newCustomerId, orgId);

    return {
      sourceCustomer: { id: customerId, name: srcRow.name, newBalance: srcBalance },
      destCustomer: { id: newCustomerId, name: dstRow.name, newBalance: dstBalance },
    };
  });
}

/**
 * Edit the amount on a CHARGE transaction.
 */
export async function editTransactionAmount(
  customerId: string,
  transactionId: string,
  newAmount: number,
  reason: string,
  orgId: string,
  userId: string,
) {
  return db.transaction(async (tx) => {
    const [custRow] = await tx.execute(sql`SELECT id, name FROM customers WHERE id = ${customerId} AND org_id = ${orgId} FOR UPDATE`) as any[];
    if (!custRow) throw new Error("Customer not found");

    const [txn] = await tx.execute(sql`SELECT id, type, amount, reference_number, notes FROM customer_transactions WHERE id = ${transactionId} AND customer_id = ${customerId}`) as any[];
    if (!txn) throw new Error("Transaction not found");
    if (txn.type !== "CHARGE") throw new Error("Can only edit CHARGE transactions");
    if (newAmount <= 0) throw new Error("Amount must be greater than zero");

    const oldAmount = parseFloat(txn.amount);
    const oldNotes = txn.notes || "";
    const auditNote = `Amount edited: ${oldAmount.toFixed(2)} → ${newAmount.toFixed(2)}. Reason: ${reason}`;
    const newNotes = oldNotes ? `${oldNotes} | ${auditNote}` : auditNote;

    await tx.execute(sql`
      UPDATE customer_transactions SET amount = ${newAmount.toFixed(2)}, notes = ${newNotes}
      WHERE id = ${transactionId}
    `);

    const newBalance = await recalcCustomer(tx, customerId, orgId);
    return { id: transactionId, oldAmount, newAmount, newBalance };
  });
}

/**
 * Delete a CHARGE transaction (must not be billed).
 */
export async function deleteTransaction(
  customerId: string,
  transactionId: string,
  reason: string,
  orgId: string,
  userId: string,
) {
  return db.transaction(async (tx) => {
    const [custRow] = await tx.execute(sql`SELECT id, name FROM customers WHERE id = ${customerId} AND org_id = ${orgId} FOR UPDATE`) as any[];
    if (!custRow) throw new Error("Customer not found");

    const [txn] = await tx.execute(sql`SELECT id, type, billed, reference_number, amount FROM customer_transactions WHERE id = ${transactionId} AND customer_id = ${customerId}`) as any[];
    if (!txn) throw new Error("Transaction not found");
    if (txn.type !== "CHARGE" && txn.type !== "PAYMENT") throw new Error("Can only delete CHARGE or PAYMENT transactions");
    if (txn.type === "CHARGE" && txn.billed) throw new Error("Cannot delete a billed transaction. Void the SOA first.");

    await tx.execute(sql`DELETE FROM customer_transactions WHERE id = ${transactionId}`);

    const newBalance = await recalcCustomer(tx, customerId, orgId);
    return { deleted: true, reference: txn.reference_number, amount: parseFloat(txn.amount), newBalance };
  });
}

/**
 * List transactions for a customer with optional type and date filters.
 * Keyset pagination on (recorded_at DESC, id DESC).
 */
export async function listTransactions(
  customerId: string,
  orgId: string,
  opts: {
    type?: string;
    from?: string;
    to?: string;
    cursor?: string;
    limit: number;
  },
) {
  const conditions: SQL[] = [
    eq(customerTransactions.customerId, customerId),
    eq(customerTransactions.orgId, orgId),
  ];

  if (opts.type) {
    conditions.push(eq(customerTransactions.type, opts.type as any));
  }
  if (opts.from) {
    conditions.push(sql`${customerTransactions.recordedAt} >= ${opts.from}`);
  }
  if (opts.to) {
    conditions.push(sql`${customerTransactions.recordedAt} <= ${opts.to}`);
  }

  if (opts.cursor) {
    const [cursorRow] = await db
      .select({
        recordedAt: customerTransactions.recordedAt,
        id: customerTransactions.id,
      })
      .from(customerTransactions)
      .where(eq(customerTransactions.id, opts.cursor))
      .limit(1);
    if (cursorRow) {
      conditions.push(
        sql`(${customerTransactions.recordedAt}, ${customerTransactions.id}) < (${cursorRow.recordedAt}, ${opts.cursor})`,
      );
    }
  }

  const rows = await db
    .select({
      id: customerTransactions.id,
      orgId: customerTransactions.orgId,
      customerId: customerTransactions.customerId,
      type: customerTransactions.type,
      amount: customerTransactions.amount,
      balanceAfter: customerTransactions.balanceAfter,
      referenceType: customerTransactions.referenceType,
      referenceId: customerTransactions.referenceId,
      referenceNumber: customerTransactions.referenceNumber,
      paymentMethod: customerTransactions.paymentMethod,
      notes: customerTransactions.notes,
      recordedBy: customerTransactions.recordedBy,
      recordedAt: customerTransactions.recordedAt,
      billed: customerTransactions.billed,
      billedSoaId: customerTransactions.billedSoaId,
      paymentNumber: customerTransactions.paymentNumber,
      batchNumber: customerTransactions.batchNumber,
      traceNumber: customerTransactions.traceNumber,
      cardType: customerTransactions.cardType,
      paymentLines: customerTransactions.paymentLines,
      // Per-charge allocation status
      allocatedAmount: sql<string>`COALESCE((
        SELECT SUM(a.allocated_amount::numeric) FROM ar_payment_allocations a WHERE a.charge_transaction_id = ${customerTransactions.id}
      ), 0)::text`,
      paymentStatus: sql<string>`CASE
        WHEN ${customerTransactions.type} != 'CHARGE' THEN NULL
        WHEN COALESCE((SELECT SUM(a.allocated_amount::numeric) FROM ar_payment_allocations a WHERE a.charge_transaction_id = ${customerTransactions.id}), 0) >= ${customerTransactions.amount}::numeric THEN 'PAID'
        WHEN COALESCE((SELECT SUM(a.allocated_amount::numeric) FROM ar_payment_allocations a WHERE a.charge_transaction_id = ${customerTransactions.id}), 0) > 0 THEN 'PARTIAL'
        ELSE 'UNPAID'
      END`,
    })
    .from(customerTransactions)
    .where(and(...conditions))
    .orderBy(desc(customerTransactions.recordedAt), desc(customerTransactions.id))
    .limit(opts.limit + 1);

  const hasMore = rows.length > opts.limit;
  const data = hasMore ? rows.slice(0, opts.limit) : rows;
  const nextCursor = hasMore ? data[data.length - 1].id : null;

  return { data, nextCursor, hasMore };
}

/**
 * Charge a customer's account during sale completion.
 * Called from within the completeSale transaction — uses the passed tx.
 *
 * If the charge would exceed the credit limit and no override PIN is provided,
 * throws CreditLimitError. If an override PIN is given, it must be valid.
 */
export async function chargeCustomerAccount(
  tx: DbOrTx,
  customerId: string,
  orgId: string,
  saleId: string,
  saleNo: string,
  chargeAmount: number,
  userId: string,
  overridePin?: string,
) {
  // Lock customer row
  const rows = await tx.execute(
    sql`SELECT * FROM customers WHERE id = ${customerId} AND org_id = ${orgId} FOR UPDATE`,
  );
  if (rows.length === 0) throw new Error("Customer not found");

  const row = rows[0] as any;
  if (!row.is_active) throw new Error("Customer account is inactive");

  const currentBalance = parseFloat(row.current_balance);
  const creditLimit = parseFloat(row.credit_limit);
  const totalPurchases = parseFloat(row.total_purchases);

  // Credit limit check (0 means unlimited)
  if (creditLimit > 0) {
    const newBalanceCheck = currentBalance + chargeAmount;
    if (newBalanceCheck > creditLimit) {
      const overage = newBalanceCheck - creditLimit;
      if (!overridePin) {
        throw new CreditLimitError(overage, currentBalance, creditLimit);
      }
      // Verify the override PIN
      const pinResult = await verifyPin(orgId, overridePin);
      if (!pinResult.valid) {
        throw new Error("Invalid manager PIN");
      }
    }
  }

  const newBalance = currentBalance + chargeAmount;
  const newTotalPurchases = totalPurchases + chargeAmount;

  // Update customer balance and total purchases
  await tx
    .update(customers)
    .set({
      currentBalance: newBalance.toFixed(2),
      totalPurchases: newTotalPurchases.toFixed(2),
    })
    .where(eq(customers.id, customerId));

  // Insert CHARGE transaction
  const [transaction] = await tx
    .insert(customerTransactions)
    .values({
      orgId,
      customerId,
      type: "CHARGE",
      amount: chargeAmount.toFixed(2),
      balanceAfter: newBalance.toFixed(2),
      referenceType: "sale",
      referenceId: saleId,
      referenceNumber: saleNo,
      recordedBy: userId,
    })
    .returning();

  return transaction;
}

// ── AR Report Functions ──

/**
 * Get AR aging report — buckets outstanding CHARGE transactions by age.
 */
export async function getAgingReport(orgId: string) {
  const rows = await db.execute(sql`
    SELECT
      c.id, c.name, c.current_balance as total,
      COALESCE(SUM(CASE WHEN ct.recorded_at >= NOW() - INTERVAL '30 days' THEN ct.amount::numeric ELSE 0 END), 0) as "current",
      COALESCE(SUM(CASE WHEN ct.recorded_at < NOW() - INTERVAL '30 days' AND ct.recorded_at >= NOW() - INTERVAL '60 days' THEN ct.amount::numeric ELSE 0 END), 0) as "days31to60",
      COALESCE(SUM(CASE WHEN ct.recorded_at < NOW() - INTERVAL '60 days' AND ct.recorded_at >= NOW() - INTERVAL '90 days' THEN ct.amount::numeric ELSE 0 END), 0) as "days61to90",
      COALESCE(SUM(CASE WHEN ct.recorded_at < NOW() - INTERVAL '90 days' THEN ct.amount::numeric ELSE 0 END), 0) as "over90"
    FROM customers c
    LEFT JOIN customer_transactions ct
      ON ct.customer_id = c.id AND ct.type = 'CHARGE' AND ct.org_id = c.org_id
    WHERE c.org_id = ${orgId} AND c.current_balance > 0 AND c.is_active = true
    GROUP BY c.id, c.name, c.current_balance
    ORDER BY c.current_balance DESC
  `);

  return rows.map((row: any) => ({
    customer: { id: row.id, name: row.name },
    current: parseFloat(row.current),
    days31to60: parseFloat(row.days31to60),
    days61to90: parseFloat(row.days61to90),
    over90: parseFloat(row.over90),
    total: parseFloat(row.total),
  }));
}

/**
 * Get Statement of Account for a customer within a date range.
 */
export async function getSOA(
  customerId: string,
  orgId: string,
  from: string,
  to: string,
) {
  // Validate customer exists and belongs to org
  const [customer] = await db
    .select()
    .from(customers)
    .where(and(eq(customers.id, customerId), eq(customers.orgId, orgId)))
    .limit(1);

  if (!customer) throw new Error("Customer not found");

  // Get opening balance: balanceAfter of the last transaction before `from`
  const [lastBefore] = await db
    .select({ balanceAfter: customerTransactions.balanceAfter })
    .from(customerTransactions)
    .where(
      and(
        eq(customerTransactions.customerId, customerId),
        eq(customerTransactions.orgId, orgId),
        sql`${customerTransactions.recordedAt} < ${from}`,
      ),
    )
    .orderBy(desc(customerTransactions.recordedAt), desc(customerTransactions.id))
    .limit(1);

  const openingBalance = lastBefore ? parseFloat(lastBefore.balanceAfter) : 0;

  // Fetch transactions in [from, to] range
  const transactions = await db
    .select()
    .from(customerTransactions)
    .where(
      and(
        eq(customerTransactions.customerId, customerId),
        eq(customerTransactions.orgId, orgId),
        sql`${customerTransactions.recordedAt} >= ${from}`,
        sql`${customerTransactions.recordedAt} <= ${to}`,
      ),
    )
    .orderBy(asc(customerTransactions.recordedAt), asc(customerTransactions.id));

  const closingBalance =
    transactions.length > 0
      ? parseFloat(transactions[transactions.length - 1].balanceAfter)
      : openingBalance;

  return {
    customer,
    openingBalance,
    transactions,
    closingBalance,
    from,
    to,
  };
}

/**
 * Generate SOA record — marks transactions as billed and creates a record.
 */
export async function generateSOA(
  customerId: string,
  orgId: string,
  from: string,
  to: string,
  userId?: string,
  unbilledOnly?: boolean,
  transactionIds?: string[],
) {
  // Get the next SOA number
  const year = new Date().getFullYear();
  const [seq] = await db.execute(sql`
    INSERT INTO soa_number_sequence (org_id, year, last_number)
    VALUES (${orgId}, ${year}, 1)
    ON CONFLICT (org_id, year) DO UPDATE SET last_number = soa_number_sequence.last_number + 1
    RETURNING last_number
  `) as any[];
  const soaNumber = `SOA-${year}-${String(seq.last_number).padStart(4, "0")}`;

  // Fetch transactions — if specific IDs provided, use those; otherwise use date range
  let txns;
  if (transactionIds && transactionIds.length > 0) {
    // Selective billing: only the specified transactions
    const allTxns = await db
      .select()
      .from(customerTransactions)
      .where(and(
        eq(customerTransactions.customerId, customerId),
        eq(customerTransactions.orgId, orgId),
      ))
      .orderBy(asc(customerTransactions.recordedAt));
    const idSet = new Set(transactionIds);
    txns = allTxns.filter((t) => idSet.has(t.id));
  } else {
    const conditions = [
      eq(customerTransactions.customerId, customerId),
      eq(customerTransactions.orgId, orgId),
    ];
    if (unbilledOnly) {
      conditions.push(eq(customerTransactions.type, "CHARGE" as any));
      conditions.push(sql`${customerTransactions.billed} = false`);
    } else {
      conditions.push(sql`${customerTransactions.recordedAt} >= ${from}`);
      conditions.push(sql`${customerTransactions.recordedAt} <= ${to}`);
    }
    txns = await db
      .select()
      .from(customerTransactions)
      .where(and(...conditions))
      .orderBy(asc(customerTransactions.recordedAt));
  }

  const charges = txns.filter((t) => t.type === "CHARGE").reduce((s, t) => s + parseFloat(t.amount), 0);
  const credits = txns.filter((t) => t.type !== "CHARGE").reduce((s, t) => s + Math.abs(parseFloat(t.amount)), 0);

  // Create SOA record
  const [soa] = await db.execute(sql`
    INSERT INTO soa_records (org_id, customer_id, soa_number, date_from, date_to, generated_by,
      total_charges, total_credits, total_payable, transaction_count)
    VALUES (${orgId}, ${customerId}, ${soaNumber}, ${from}, ${to}, ${userId ?? null},
      ${charges.toFixed(2)}, ${credits.toFixed(2)}, ${(charges - credits).toFixed(2)}, ${txns.length})
    RETURNING id, soa_number, total_charges, total_credits, total_payable, transaction_count, status
  `) as any[];

  // Create line items and mark as billed (both CHARGE and CREDIT_NOTE)
  const unbilledCharges = txns.filter((t) => (t.type === "CHARGE" || t.type === "CREDIT_NOTE") && !t.billed);
  for (const txn of unbilledCharges) {
    await db.execute(sql`
      INSERT INTO soa_line_items (soa_id, transaction_id) VALUES (${soa.id}, ${txn.id})
      ON CONFLICT DO NOTHING
    `);
    await db.update(customerTransactions)
      .set({ billed: true, billedSoaId: soa.id })
      .where(eq(customerTransactions.id, txn.id));
  }

  return {
    id: soa.id,
    soaNumber: soa.soa_number,
    totalCharges: parseFloat(soa.total_charges),
    totalCredits: parseFloat(soa.total_credits),
    totalPayable: parseFloat(soa.total_payable),
    transactionCount: soa.transaction_count,
    billedCount: unbilledCharges.length,
    status: soa.status,
  };
}

/**
 * Get settled invoices for a payment transaction (from ar_payment_allocations).
 */
export async function getPaymentSettledInvoices(paymentTxnId: string, orgId: string) {
  const rows = await db.execute(sql`
    SELECT ct.reference_number, pa.allocated_amount
    FROM ar_payment_allocations pa
    JOIN customer_transactions ct ON ct.id = pa.charge_transaction_id
    WHERE pa.payment_transaction_id = ${paymentTxnId}
    ORDER BY ct.recorded_at ASC
  `) as any[];
  return rows.map((r: any) => ({
    referenceNumber: r.reference_number || "N/A",
    amount: parseFloat(r.allocated_amount),
  }));
}

/**
 * Get all payments received for a specific SOA (via ar_payment_allocations).
 */
export async function getSOAPaymentSummary(soaId: string, orgId: string) {
  // Find all unique payments that have allocations to charges in this SOA
  const rows = await db.execute(sql`
    SELECT DISTINCT ON (ct_pay.id)
      ct_pay.id,
      ct_pay.payment_number,
      ct_pay.amount AS total_amount,
      ct_pay.payment_method,
      ct_pay.payment_lines,
      ct_pay.recorded_at,
      ct_pay.notes,
      SUM(pa.allocated_amount::numeric) OVER (PARTITION BY ct_pay.id) AS allocated_to_soa
    FROM ar_payment_allocations pa
    JOIN soa_line_items sli ON sli.transaction_id = pa.charge_transaction_id
    JOIN customer_transactions ct_pay ON ct_pay.id = pa.payment_transaction_id
    WHERE sli.soa_id = ${soaId}
    ORDER BY ct_pay.id, ct_pay.recorded_at
  `) as any[];

  return rows.map((r: any) => ({
    id: r.id,
    paymentNumber: r.payment_number,
    totalAmount: parseFloat(r.total_amount),
    allocatedToSOA: parseFloat(r.allocated_to_soa),
    paymentMethod: r.payment_method,
    paymentLines: r.payment_lines,
    recordedAt: r.recorded_at,
    notes: r.notes,
  }));
}

/**
 * Get invoices/transactions within a specific SOA, with allocation status per invoice.
 */
export async function getSOAInvoices(soaId: string, orgId: string) {
  const rows = await db.execute(sql`
    SELECT ct.id, ct.type, ct.amount, ct.reference_number, ct.recorded_at, ct.notes,
      COALESCE((SELECT SUM(a.allocated_amount::numeric) FROM ar_payment_allocations a WHERE a.charge_transaction_id = ct.id), 0) AS allocated_amount
    FROM soa_line_items sli
    JOIN customer_transactions ct ON ct.id = sli.transaction_id
    WHERE sli.soa_id = ${soaId} AND ct.org_id = ${orgId}
    ORDER BY ct.recorded_at ASC, ct.id ASC
  `) as any[];

  return rows.map((r: any) => ({
    id: r.id,
    type: r.type,
    amount: parseFloat(r.amount),
    referenceNumber: r.reference_number,
    recordedAt: r.recorded_at,
    notes: r.notes,
    allocatedAmount: parseFloat(r.allocated_amount),
    remainingAmount: r.type === "CHARGE" ? Math.max(0, parseFloat(r.amount) - parseFloat(r.allocated_amount)) : 0,
    paymentStatus: r.type !== "CHARGE" ? null
      : parseFloat(r.allocated_amount) >= parseFloat(r.amount) ? "PAID"
      : parseFloat(r.allocated_amount) > 0 ? "PARTIAL" : "UNPAID",
  }));
}

/**
 * List SOA records for a customer.
 */
export async function listSOARecords(customerId: string, orgId: string) {
  const rows = await db.execute(sql`
    SELECT id, soa_number, date_from, date_to, generated_at,
      total_charges, total_credits, total_payable, paid_amount, transaction_count, status
    FROM soa_records
    WHERE customer_id = ${customerId} AND org_id = ${orgId}
    ORDER BY generated_at DESC
  `);
  return (rows as any[]).map((r: any) => ({
    id: r.id,
    soaNumber: r.soa_number,
    dateFrom: r.date_from,
    dateTo: r.date_to,
    generatedAt: r.generated_at,
    totalCharges: parseFloat(r.total_charges),
    totalCredits: parseFloat(r.total_credits),
    totalPayable: parseFloat(r.total_payable),
    paidAmount: parseFloat(r.paid_amount ?? "0"),
    transactionCount: r.transaction_count,
    status: r.status,
  }));
}

/**
 * Update SOA status (SENT, PAID, VOID).
 */
export async function updateSOAStatus(soaId: string, orgId: string, status: string, paidAmount?: string) {
  if (status === "VOID") {
    await db.execute(sql`
      UPDATE customer_transactions SET billed = false, billed_soa_id = NULL
      WHERE billed_soa_id = ${soaId}
    `);
  }
  if (paidAmount !== undefined) {
    await db.execute(sql`
      UPDATE soa_records SET status = ${status}, paid_amount = ${paidAmount} WHERE id = ${soaId} AND org_id = ${orgId}
    `);
  } else {
    await db.execute(sql`
      UPDATE soa_records SET status = ${status} WHERE id = ${soaId} AND org_id = ${orgId}
    `);
  }
  return { success: true };
}

/**
 * Get AR summary — totals, counts, overdue info.
 */
export async function getARSummary(orgId: string) {
  // Total receivables and customer count
  const [totals] = await db.execute(sql`
    SELECT
      COALESCE(SUM(current_balance::numeric), 0) as "totalReceivables",
      COUNT(*) as "customerCount"
    FROM customers
    WHERE org_id = ${orgId} AND current_balance > 0 AND is_active = true
  `);

  // Overdue: customers with current_balance > 0 who have any CHARGE older than their payment_terms_days
  const [overdue] = await db.execute(sql`
    SELECT
      COUNT(DISTINCT c.id) as "overdueCount",
      COALESCE(SUM(DISTINCT c.current_balance::numeric), 0) as "overdueAmount"
    FROM customers c
    WHERE c.org_id = ${orgId} AND c.current_balance > 0 AND c.is_active = true
      AND EXISTS (
        SELECT 1 FROM customer_transactions ct
        WHERE ct.customer_id = c.id
          AND ct.org_id = c.org_id
          AND ct.type = 'CHARGE'
          AND ct.recorded_at < NOW() - (c.payment_terms_days || ' days')::interval
      )
  `);

  return {
    totalReceivables: parseFloat((totals as any).totalReceivables),
    customerCount: parseInt((totals as any).customerCount, 10),
    overdueCount: parseInt((overdue as any).overdueCount, 10),
    overdueAmount: parseFloat((overdue as any).overdueAmount),
  };
}
