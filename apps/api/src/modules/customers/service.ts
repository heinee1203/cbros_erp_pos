import { db, type DbOrTx } from "@apex/database";
import { customers, customerTransactions } from "@apex/database/schema";
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
  },
) {
  const conditions: SQL[] = [
    eq(customers.orgId, orgId),
    eq(customers.isActive, true),
  ];

  if (opts.search && opts.search.length >= 1) {
    conditions.push(
      or(
        ilike(customers.name, `%${opts.search}%`),
        ilike(customers.phone, `%${opts.search}%`),
        ilike(customers.email, `%${opts.search}%`),
      )!,
    );
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

  const rows = await db
    .select()
    .from(customers)
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
 * Record a payment against a customer's AR balance.
 * Decreases currentBalance and creates a PAYMENT transaction.
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
    if (paymentAmount > currentBalance) {
      throw new Error(
        `Payment of ₱${paymentAmount.toFixed(2)} exceeds outstanding balance of ₱${currentBalance.toFixed(2)}`,
      );
    }

    const newBalance = currentBalance - paymentAmount;

    // Update customer balance
    await tx
      .update(customers)
      .set({ currentBalance: newBalance.toFixed(2) })
      .where(eq(customers.id, customerId));

    // Insert PAYMENT transaction
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
      })
      .returning();

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
    .select()
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
