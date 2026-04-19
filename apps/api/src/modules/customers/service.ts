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

  const lastPaymentDate = sql<string | null>`(
    SELECT ct_lp.recorded_at::text FROM customer_transactions ct_lp
    WHERE ct_lp.customer_id = ${customers.id} AND ct_lp.org_id = ${customers.orgId}
      AND ct_lp.type = 'PAYMENT'
    ORDER BY ct_lp.recorded_at DESC
    LIMIT 1
  )`;

  const isOverdue = sql<boolean>`EXISTS (
    SELECT 1 FROM customer_transactions ct_od
    WHERE ct_od.customer_id = ${customers.id}
      AND ct_od.org_id = ${customers.orgId}
      AND ct_od.type = 'CHARGE'
      AND ct_od.recorded_at < NOW() - (${customers.paymentTermsDays} || ' days')::interval
      AND (
        ct_od.amount::numeric - COALESCE(
          (SELECT SUM(a.allocated_amount::numeric)
           FROM ar_payment_allocations a
           WHERE a.charge_transaction_id = ct_od.id), 0
        )
      ) > 0.01
  )`;

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
      lastPaymentDate,
      isOverdue,
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
/**
 * Recompute an SOA's payment status from real allocations on its line items.
 * Single source of truth — never trust client-supplied paidAmount.
 *
 * Status rules:
 *   - total_allocated >= total_payable AND all CHARGE lines fully paid → PAID
 *   - total_allocated > 0                                              → PARTIAL
 *   - total_allocated == 0                                             → keep existing
 *                                                                        GENERATED/SENT/VOID
 *
 * VOID status is never overwritten.
 */
export async function recomputeSOAStatus(
  tx: any,
  orgId: string,
  soaId: string,
): Promise<{ soaId: string; prevStatus: string; newStatus: string; realAllocated: number; totalPayable: number } | null> {
  const [soa] = (await tx.execute(sql`
    SELECT id, status,
           total_charges::numeric AS total_charges,
           total_payable::numeric AS total_payable,
           COALESCE(paid_amount, 0)::numeric AS stored_paid
    FROM soa_records
    WHERE id = ${soaId} AND org_id = ${orgId}
    FOR UPDATE
  `)) as any[];
  if (!soa) return null;

  // VOID is terminal — never overwrite
  if (soa.status === "VOID") return null;

  // Cash coverage = sum of ar_payment_allocations against CHARGE line items only.
  // Allocations against CM line items (if any exist from the UI auto-tick) are
  // intentionally ignored — credits contribute via creditCoverage below, never
  // via this path, so there's no double-count risk.
  const [chargeAllocRow] = (await tx.execute(sql`
    SELECT COALESCE(SUM(pa.allocated_amount)::numeric, 0) AS charge_allocated
    FROM soa_line_items sli
    JOIN customer_transactions ct ON ct.id = sli.transaction_id AND ct.type = 'CHARGE'
    LEFT JOIN ar_payment_allocations pa ON pa.charge_transaction_id = sli.transaction_id
    WHERE sli.soa_id = ${soaId}
  `)) as any[];
  const realAllocatedCharges = parseFloat(chargeAllocRow?.charge_allocated ?? "0");

  // Credit coverage = sum of CM line-item amounts on this SOA. Uses the CM
  // amount field directly (not allocations) so legacy payments with no CM
  // allocation rows still recompute correctly, and so a future change to how
  // CM allocations are written can't accidentally double-count.
  const [creditRow] = (await tx.execute(sql`
    SELECT COALESCE(SUM(ct.amount)::numeric, 0) AS credit_coverage
    FROM soa_line_items sli
    JOIN customer_transactions ct ON ct.id = sli.transaction_id AND ct.type = 'CREDIT_NOTE'
    WHERE sli.soa_id = ${soaId}
  `)) as any[];
  const creditCoverage = parseFloat(creditRow?.credit_coverage ?? "0");

  const totalCharges = parseFloat(soa.total_charges);
  const totalPayable = parseFloat(soa.total_payable);

  // PAID when cash + credits cover the gross charges. Replaces the old per-charge
  // unpaidCharges check, which counted Q3283 as unpaid when the customer paid the
  // SOA's correct net amount but the cash distribution ran out exactly on the
  // last charge by the CM amount (PAY-2026-0106 case).
  // PARTIAL requires actual cash to have arrived — CMs alone (e.g. on a
  // freshly-generated SOA whose CMs were tallied in but no payment yet) don't
  // promote out of GENERATED.
  const effectiveCoverage = realAllocatedCharges + creditCoverage;
  let newStatus: string;
  if (effectiveCoverage >= totalCharges - 0.005) {
    newStatus = "PAID";
  } else if (realAllocatedCharges > 0.005) {
    newStatus = "PARTIAL";
  } else {
    // No cash arrived — preserve existing non-payment state (GENERATED/SENT)
    newStatus = soa.status === "PAID" || soa.status === "PARTIAL" ? "GENERATED" : soa.status;
  }

  // paid_amount keeps cash-only semantics. External reports may depend on this
  // representing money that came in, not credit applied.
  const storedPaid = Math.min(realAllocatedCharges, totalPayable).toFixed(2);

  await tx.execute(sql`
    UPDATE soa_records
    SET status = ${newStatus}, paid_amount = ${storedPaid}
    WHERE id = ${soaId} AND org_id = ${orgId}
  `);

  return {
    soaId,
    prevStatus: soa.status,
    newStatus,
    realAllocated: realAllocatedCharges,
    totalPayable,
  };
}

/**
 * Recompute status for every SOA that owns any of the given charge transactions.
 * Used after a payment is allocated so all affected SOAs stay consistent.
 *
 * NOTE: postgres.js binds a JS array passed through a single ${} placeholder
 * as a composite `record` type, not as a PostgreSQL array, so `ANY(${arr}::uuid[])`
 * fails with "cannot cast type record to uuid[]". We expand the IDs into a
 * proper IN (...) list via sql.join instead — works for both empty and large
 * input arrays and stays parametrized (no string interpolation).
 */
export async function recomputeSOAStatusForCharges(
  tx: any,
  orgId: string,
  chargeTransactionIds: string[],
): Promise<void> {
  // De-duplicate to keep the IN list minimal
  const uniqueIds = Array.from(new Set(chargeTransactionIds));
  if (uniqueIds.length === 0) return;

  const idList = sql.join(
    uniqueIds.map((id) => sql`${id}::uuid`),
    sql`, `,
  );
  const affected = (await tx.execute(sql`
    SELECT DISTINCT sli.soa_id AS id
    FROM soa_line_items sli
    WHERE sli.transaction_id IN (${idList})
  `)) as any[];

  for (const row of affected) {
    await recomputeSOAStatus(tx, orgId, row.id);
  }
}

async function allocatePaymentFIFO(
  tx: any,
  orgId: string,
  customerId: string,
  paymentTxnId: string,
  paymentAmount: number,
): Promise<string[]> {
  const touched: string[] = [];
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
    touched.push(charge.id);
    remaining -= alloc;
  }
  return touched;
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

      // FIFO allocate, collecting the exact charges this payment touched
      let touchedCharges: string[] = [];
      try {
        touchedCharges = await allocatePaymentFIFO(tx, orgId, alloc.customerId, txn.id, allocAmount);
      } catch (err) {
        console.error("[MULTI-PAY] allocation failed", err);
      }

      // Recompute status for every SOA whose line items were actually touched.
      // Union with the client-supplied soaIds as a safety net — recompute is
      // idempotent and reads real allocations, so there's no double-counting.
      try {
        await recomputeSOAStatusForCharges(tx, orgId, touchedCharges);
        if (alloc.soaIds) {
          for (const soaId of alloc.soaIds) {
            await recomputeSOAStatus(tx, orgId, soaId);
          }
        }
      } catch (err) {
        console.error("[MULTI-PAY] status recompute failed", err);
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
    let touchedCharges: string[] = [];
    const explicitAllocs = input.allocations;
    if (explicitAllocs && explicitAllocs.length > 0) {
      // Server-side SOA-membership guard. When the caller declares which SOAs
      // they intend to pay (input.soaIds), every allocated charge must belong
      // to one of those SOAs. PAY-2026-0025 hit this trap: UI sent 10 allocs
      // for SOA-0041 charges + 1 alloc for a SOA-0040 charge; server accepted
      // silently. Throws BEFORE writing any allocation row so the failure is
      // atomic — no partial commits.
      if (input.soaIds && input.soaIds.length > 0) {
        const allowedSoaIds = new Set(input.soaIds);
        const chargeIds = Array.from(new Set(explicitAllocs.map((a) => a.chargeTransactionId)));
        const idList = sql.join(chargeIds.map((cid) => sql`${cid}::uuid`), sql`, `);
        const chargeRows = (await tx.execute(sql`
          SELECT id, reference_number, billed_soa_id
          FROM customer_transactions
          WHERE id IN (${idList}) AND org_id = ${orgId}
        `)) as any[];
        const chargeMap = new Map<string, { ref: string | null; soaId: string | null }>();
        for (const r of chargeRows) {
          chargeMap.set(r.id, { ref: r.reference_number, soaId: r.billed_soa_id });
        }
        const offenders = explicitAllocs
          .map((a) => ({ alloc: a, info: chargeMap.get(a.chargeTransactionId) }))
          .filter(({ info }) => !info || !info.soaId || !allowedSoaIds.has(info.soaId))
          .map(({ alloc, info }) => ({
            chargeTransactionId: alloc.chargeTransactionId,
            chargeRef: info?.ref ?? null,
            billedSoaId: info?.soaId ?? null,
            allowedSoaIds: input.soaIds,
          }));
        if (offenders.length > 0) {
          const err: any = new Error("ALLOCATION_SOA_MISMATCH");
          err.code = "ALLOCATION_SOA_MISMATCH";
          err.details = offenders;
          throw err;
        }
      }
      try {
        for (const alloc of explicitAllocs) {
          if (alloc.amount <= 0) continue;
          await tx.insert(arPaymentAllocations).values({
            orgId,
            paymentTransactionId: transaction.id,
            chargeTransactionId: alloc.chargeTransactionId,
            allocatedAmount: alloc.amount.toFixed(2),
          });
          touchedCharges.push(alloc.chargeTransactionId);
        }
      } catch (allocErr) {
        // Non-critical — payment is still recorded even if allocation insert fails
        console.error("[ALLOC] allocation failed:", allocErr);
      }
    } else {
      // Auto-allocate using FIFO
      try {
        touchedCharges = await allocatePaymentFIFO(tx, orgId, customerId, transaction.id, paymentAmount);
      } catch (allocErr) {
        console.error("[ALLOC] FIFO allocation failed:", allocErr);
      }
    }

    // Recompute status for every SOA whose line items were touched by this payment.
    // Single source of truth — reads real ar_payment_allocations, never trusts
    // client-supplied paidAmount.
    try {
      await recomputeSOAStatusForCharges(tx, orgId, touchedCharges);
    } catch (recomputeErr) {
      console.error("[ALLOC] status recompute failed:", recomputeErr);
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

/**
 * Record a manual charge against a customer's AR balance.
 * Used for off-POS invoices, service charges, and manual entries.
 */
export async function recordManualCharge(
  orgId: string,
  customerId: string,
  data: {
    amount: number;
    referenceNumber: string;
    description?: string;
    chargeDate?: string;
    notes?: string;
  },
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

    const currentBalance = parseFloat(row.current_balance);
    const creditLimit = parseFloat(row.credit_limit);

    // Credit limit check (0 means unlimited)
    if (creditLimit > 0) {
      const newBalanceCheck = currentBalance + data.amount;
      if (newBalanceCheck > creditLimit) {
        throw Object.assign(
          new Error(
            `Credit limit exceeded. Limit: ₱${creditLimit.toFixed(2)}, Current: ₱${currentBalance.toFixed(2)}, Charge: ₱${data.amount.toFixed(2)}`,
          ),
          { statusCode: 422 },
        );
      }
    }

    const newBalance = currentBalance + data.amount;

    // Update customer balance
    await tx
      .update(customers)
      .set({ currentBalance: newBalance.toFixed(2) })
      .where(eq(customers.id, customerId));

    // Insert CHARGE transaction
    const [transaction] = await tx
      .insert(customerTransactions)
      .values({
        orgId,
        customerId,
        type: "CHARGE",
        amount: data.amount.toFixed(2),
        balanceAfter: newBalance.toFixed(2),
        referenceType: "manual_charge",
        referenceNumber: data.referenceNumber || null,
        notes:
          [data.description, data.notes].filter(Boolean).join(" — ") || null,
        recordedBy: userId,
        recordedAt: data.chargeDate ? new Date(data.chargeDate) : new Date(),
      })
      .returning();

    return transaction;
  });
}

// ── AR Report Functions ──

/**
 * AR Aging Report — NET per-charge aging with payment allocation and due-date buckets.
 *
 * Uses ar_payment_allocations to compute each charge's remaining (unpaid) balance,
 * then ages by DUE DATE (recorded_at + payment_terms_days) not charge date.
 * Bucket sums will equal customer's current_balance (within rounding tolerance).
 */
export async function getAgingReport(orgId: string, opts?: { asOfDate?: string }) {
  const asOf = opts?.asOfDate ?? new Date().toISOString().split("T")[0];

  const rows = (await db.execute(sql`
    WITH charge_balances AS (
      SELECT
        ct.id AS charge_id,
        ct.customer_id,
        ct.amount::numeric AS charge_amount,
        ct.recorded_at::date AS charge_date,
        COALESCE(SUM(pa.allocated_amount::numeric), 0) AS allocated,
        ct.amount::numeric - COALESCE(SUM(pa.allocated_amount::numeric), 0) AS remaining
      FROM customer_transactions ct
      LEFT JOIN ar_payment_allocations pa ON pa.charge_transaction_id = ct.id
      WHERE ct.org_id = ${orgId}
        AND ct.type = 'CHARGE'
        AND ct.recorded_at::date <= ${asOf}::date
      GROUP BY ct.id, ct.customer_id, ct.amount, ct.recorded_at
      HAVING ct.amount::numeric - COALESCE(SUM(pa.allocated_amount::numeric), 0) > 0.005
    )
    SELECT
      c.id, c.name, c.customer_type, c.payment_terms_days,
      c.current_balance::text AS total,
      COALESCE(SUM(CASE WHEN (${asOf}::date - (cb.charge_date + c.payment_terms_days)) <= 0
        THEN cb.remaining ELSE 0 END), 0)::text AS "current",
      COALESCE(SUM(CASE WHEN (${asOf}::date - (cb.charge_date + c.payment_terms_days)) BETWEEN 1 AND 30
        THEN cb.remaining ELSE 0 END), 0)::text AS "days1to30",
      COALESCE(SUM(CASE WHEN (${asOf}::date - (cb.charge_date + c.payment_terms_days)) BETWEEN 31 AND 60
        THEN cb.remaining ELSE 0 END), 0)::text AS "days31to60",
      COALESCE(SUM(CASE WHEN (${asOf}::date - (cb.charge_date + c.payment_terms_days)) BETWEEN 61 AND 90
        THEN cb.remaining ELSE 0 END), 0)::text AS "days61to90",
      COALESCE(SUM(CASE WHEN (${asOf}::date - (cb.charge_date + c.payment_terms_days)) > 90
        THEN cb.remaining ELSE 0 END), 0)::text AS "days90plus"
    FROM customers c
    JOIN charge_balances cb ON cb.customer_id = c.id
    WHERE c.org_id = ${orgId} AND c.current_balance > 0 AND c.is_active = true
    GROUP BY c.id, c.name, c.customer_type, c.payment_terms_days, c.current_balance
    ORDER BY c.current_balance DESC
  `)) as any[];

  const data = rows.map((r: any) => {
    let current = parseFloat(r.current);
    let d1to30 = parseFloat(r.days1to30);
    let d31to60 = parseFloat(r.days31to60);
    let d61to90 = parseFloat(r.days61to90);
    let d90plus = parseFloat(r.days90plus);
    const total = parseFloat(r.total);
    const bucketSum = current + d1to30 + d31to60 + d61to90 + d90plus;

    // Reconcile: if bucket sum exceeds current_balance (unallocated credits/payments),
    // proportionally reduce each bucket to match total. This handles credit notes and
    // payments not tracked in ar_payment_allocations.
    if (bucketSum > total + 0.01 && bucketSum > 0) {
      const scale = total / bucketSum;
      current = parseFloat((current * scale).toFixed(2));
      d1to30 = parseFloat((d1to30 * scale).toFixed(2));
      d31to60 = parseFloat((d31to60 * scale).toFixed(2));
      d61to90 = parseFloat((d61to90 * scale).toFixed(2));
      // Assign remainder to 90+ to avoid rounding drift
      d90plus = parseFloat((total - current - d1to30 - d31to60 - d61to90).toFixed(2));
    }

    return {
      customer: { id: r.id, name: r.name },
      customerType: r.customer_type,
      paymentTerms: r.payment_terms_days,
      current,
      days1to30: d1to30,
      days31to60: d31to60,
      days61to90: d61to90,
      days90plus: d90plus,
      total,
    };
  });

  // Compute grand totals and percentages
  const totals = { current: 0, days1to30: 0, days31to60: 0, days61to90: 0, days90plus: 0, total: 0 };
  for (const r of data) {
    totals.current += r.current;
    totals.days1to30 += r.days1to30;
    totals.days31to60 += r.days31to60;
    totals.days61to90 += r.days61to90;
    totals.days90plus += r.days90plus;
    totals.total += r.total;
  }
  const pct = (v: number) => totals.total > 0 ? parseFloat(((v / totals.total) * 100).toFixed(1)) : 0;

  return {
    asOfDate: asOf,
    data,
    totals,
    percentages: {
      current: pct(totals.current),
      days1to30: pct(totals.days1to30),
      days31to60: pct(totals.days31to60),
      days61to90: pct(totals.days61to90),
      days90plus: pct(totals.days90plus),
    },
  };
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
 * Fetch an SOA reprint payload by soa_id, using the SOA's own stored
 * soa_line_items (NOT the customer's current transactions in a date range).
 *
 * This is the historical snapshot — it returns exactly the invoices that were
 * billed under this SOA number when it was generated. Fixes the Lucky Se7en
 * reprint bug where the date-range endpoint re-queried customer_transactions
 * and pulled in unrelated invoices from other SOAs covering overlapping dates.
 *
 * Return shape mirrors getSOA() so existing reprint flows can swap in.
 */
export async function getSOAById(soaId: string, orgId: string) {
  const [soa] = (await db.execute(sql`
    SELECT id, customer_id, soa_number, date_from, date_to, generated_at,
           total_charges, total_credits, total_payable, paid_amount,
           transaction_count, status
    FROM soa_records
    WHERE id = ${soaId} AND org_id = ${orgId}
  `)) as any[];
  if (!soa) throw new Error("SOA not found");

  const [customer] = await db
    .select()
    .from(customers)
    .where(and(eq(customers.id, soa.customer_id), eq(customers.orgId, orgId)))
    .limit(1);
  if (!customer) throw new Error("Customer not found");

  // Historical transactions = rows referenced by soa_line_items, nothing else.
  const transactions = (await db.execute(sql`
    SELECT ct.id, ct.type, ct.amount, ct.balance_after, ct.reference_number,
           ct.notes, ct.recorded_at, ct.payment_number, ct.payment_method
    FROM soa_line_items sli
    JOIN customer_transactions ct ON ct.id = sli.transaction_id
    WHERE sli.soa_id = ${soaId} AND ct.org_id = ${orgId}
    ORDER BY ct.recorded_at ASC, ct.id ASC
  `)) as any[];

  // Opening balance = balance_after of the last transaction strictly before
  // the earliest line item on this SOA. Keeps continuity with historical data.
  let openingBalance = 0;
  if (transactions.length > 0) {
    const earliest = transactions[0].recorded_at;
    const earliestId = transactions[0].id;
    const [lastBefore] = (await db.execute(sql`
      SELECT balance_after FROM customer_transactions
      WHERE customer_id = ${soa.customer_id}
        AND org_id = ${orgId}
        AND (recorded_at < ${earliest}
          OR (recorded_at = ${earliest} AND id < ${earliestId}))
      ORDER BY recorded_at DESC, id DESC
      LIMIT 1
    `)) as any[];
    openingBalance = lastBefore ? parseFloat(lastBefore.balance_after) : 0;
  }

  const closingBalance =
    transactions.length > 0
      ? parseFloat(transactions[transactions.length - 1].balance_after)
      : openingBalance;

  return {
    customer,
    openingBalance,
    transactions: transactions.map((t: any) => ({
      id: t.id,
      type: t.type,
      amount: t.amount,
      balanceAfter: t.balance_after,
      referenceNumber: t.reference_number,
      notes: t.notes,
      recordedAt: t.recorded_at,
      paymentNumber: t.payment_number,
      paymentMethod: t.payment_method,
    })),
    closingBalance,
    from: soa.date_from,
    to: soa.date_to,
    soaNumber: soa.soa_number,
    soaStatus: soa.status,
    soaTotals: {
      totalCharges: parseFloat(soa.total_charges),
      totalCredits: parseFloat(soa.total_credits),
      totalPayable: parseFloat(soa.total_payable),
      paidAmount: parseFloat(soa.paid_amount ?? "0"),
    },
  };
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
 * Update SOA status (SENT, GENERATED, VOID only).
 *
 * PAID / PARTIAL can NOT be set by clients — they are derived from real
 * ar_payment_allocations by recomputeSOAStatus(), which is auto-invoked
 * whenever a payment is recorded or allocated. If a caller passes PAID or
 * PARTIAL, we ignore the value and recompute from actual allocations so the
 * DB can never drift from the source of truth.
 *
 * This guard closes the root cause of the Lucky Se7en SOA-0161 false-PAID
 * bug: the old web client-side loop passed the full payment amount to every
 * SOA in a multi-SOA payment, which marked both PAID even though only part
 * of the payment actually covered each SOA's line items.
 */
export async function updateSOAStatus(
  soaId: string,
  orgId: string,
  status: string,
  _paidAmount?: string,
) {
  const allowedManualStates = new Set(["SENT", "GENERATED", "VOID"]);

  // Client-supplied PAID / PARTIAL is ignored — recompute from real allocations.
  if (!allowedManualStates.has(status)) {
    return await db.transaction(async (tx) => {
      const result = await recomputeSOAStatus(tx, orgId, soaId);
      return { success: true, recomputed: result };
    });
  }

  if (status === "VOID") {
    await db.execute(sql`
      UPDATE customer_transactions SET billed = false, billed_soa_id = NULL
      WHERE billed_soa_id = ${soaId}
    `);
    await db.execute(sql`
      UPDATE soa_records SET status = 'VOID', paid_amount = 0
      WHERE id = ${soaId} AND org_id = ${orgId}
    `);
    return { success: true };
  }

  // SENT / GENERATED — pure state transition, do not touch paid_amount.
  await db.execute(sql`
    UPDATE soa_records SET status = ${status} WHERE id = ${soaId} AND org_id = ${orgId}
  `);
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

  // Overdue: customers with unpaid charges past their payment terms.
  // A charge is "unpaid" if its amount exceeds the sum of allocations in ar_payment_allocations.
  // This avoids the old bug where fully-paid historical charges inflated the overdue count.
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
          AND (
            ct.amount::numeric - COALESCE(
              (SELECT SUM(a.allocated_amount::numeric)
               FROM ar_payment_allocations a
               WHERE a.charge_transaction_id = ct.id), 0
            )
          ) > 0.01
      )
  `);

  const totalReceivables = parseFloat((totals as any).totalReceivables);
  const customerCount = parseInt((totals as any).customerCount, 10);
  const overdueCount = parseInt((overdue as any).overdueCount, 10);
  const overdueAmount = parseFloat((overdue as any).overdueAmount);

  return {
    totalReceivables,
    customerCount,
    overdueCount,
    overdueAmount,
    currentCount: customerCount - overdueCount,
    currentAmount: totalReceivables - overdueAmount,
  };
}

/**
 * List all customer payments for the Payment Register.
 */
export async function listPayments(
  orgId: string,
  opts: {
    search?: string;
    paymentMethod?: string;
    customerId?: string;
    dateFrom?: string;
    dateTo?: string;
    limit?: number;
  } = {},
) {
  const limit = Math.min(opts.limit ?? 200, 5000);
  const conditions: SQL[] = [
    sql`ct.org_id = ${orgId}`,
    sql`ct.type = 'PAYMENT'`,
  ];
  if (opts.customerId) conditions.push(sql`ct.customer_id = ${opts.customerId}`);
  if (opts.paymentMethod) conditions.push(sql`ct.payment_method = ${opts.paymentMethod}`);
  if (opts.dateFrom) conditions.push(sql`ct.recorded_at >= ${opts.dateFrom}::timestamptz`);
  if (opts.dateTo) conditions.push(sql`ct.recorded_at <= ${opts.dateTo}::timestamptz`);
  if (opts.search && opts.search.trim()) {
    const pattern = `%${opts.search.trim()}%`;
    conditions.push(sql`(ct.payment_number ILIKE ${pattern} OR c.name ILIKE ${pattern} OR ct.reference_number ILIKE ${pattern})`);
  }

  const where = sql.join(conditions, sql` AND `);

  const rows = (await db.execute(sql`
    SELECT ct.id, ct.payment_number, ct.recorded_at, ct.amount::text,
      ct.payment_method, ct.reference_number, ct.notes,
      ct.batch_number, ct.trace_number, ct.card_type,
      ct.payment_lines,
      ct.customer_id, c.name AS customer_name, c.phone AS customer_code,
      u.full_name AS recorded_by_name
    FROM customer_transactions ct
    JOIN customers c ON c.id = ct.customer_id
    LEFT JOIN users u ON u.id = ct.recorded_by
    WHERE ${where}
    ORDER BY ct.recorded_at DESC
    LIMIT ${limit}
  `)) as any[];

  // Summary: totals for today, this week, this month
  const [summaryRow] = (await db.execute(sql`
    SELECT
      COALESCE(SUM(ct.amount::numeric), 0)::text AS total,
      COALESCE(SUM(CASE WHEN ct.recorded_at >= CURRENT_DATE THEN ct.amount::numeric ELSE 0 END), 0)::text AS today,
      COALESCE(SUM(CASE WHEN ct.recorded_at >= date_trunc('week', CURRENT_DATE) THEN ct.amount::numeric ELSE 0 END), 0)::text AS this_week,
      COALESCE(SUM(CASE WHEN ct.recorded_at >= date_trunc('month', CURRENT_DATE) THEN ct.amount::numeric ELSE 0 END), 0)::text AS this_month,
      COUNT(*)::int AS count
    FROM customer_transactions ct
    JOIN customers c ON c.id = ct.customer_id
    WHERE ${where}
  `)) as any[];

  return {
    data: rows.map((r: any) => ({
      id: r.id,
      paymentNumber: r.payment_number,
      recordedAt: r.recorded_at,
      amount: r.amount,
      paymentMethod: r.payment_method,
      referenceNumber: r.reference_number,
      notes: r.notes,
      batchNumber: r.batch_number,
      traceNumber: r.trace_number,
      cardType: r.card_type,
      paymentLines: r.payment_lines,
      customerId: r.customer_id,
      customerName: r.customer_name,
      customerCode: r.customer_code,
      recordedByName: r.recorded_by_name,
    })),
    summary: {
      total: parseFloat(summaryRow.total),
      today: parseFloat(summaryRow.today),
      thisWeek: parseFloat(summaryRow.this_week),
      thisMonth: parseFloat(summaryRow.this_month),
      count: summaryRow.count,
    },
  };
}
