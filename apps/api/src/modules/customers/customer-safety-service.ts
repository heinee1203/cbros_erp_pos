import { db } from "@apex/database";
import {
  auditLogs,
  customerCollectionNotes,
  customerDisputes,
  customerPaymentRiskEvents,
  customerTransactions,
  customers,
} from "@apex/database/schema";
import { and, desc, eq, sql } from "drizzle-orm";

type CustomerLike = {
  id: string;
  orgId?: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  tin?: string | null;
  contactPerson?: string | null;
  customerType?: string | null;
  creditLimit?: string | number | null;
  currentBalance?: string | number | null;
  creditStatus?: string | null;
  creditHoldType?: string | null;
  creditHoldReason?: string | null;
  creditHoldNote?: string | null;
  creditHoldApprovedBy?: string | null;
  creditHoldApprovedAt?: string | Date | null;
  paymentTermsDays?: number | null;
  isActive?: boolean | null;
  unbilledCount?: number | null;
  totalChargeCount?: number | null;
  lastPaymentDate?: string | Date | null;
};

type DuplicateIndex = {
  byName: Map<string, number>;
  byPhone: Map<string, number>;
  byTin: Map<string, number>;
};

export type CustomerCollectionNoteInput = {
  noteType?: string;
  contactMethod?: string | null;
  outcome?: string | null;
  priority?: string | null;
  note: string;
  promisedAmount?: string | number | null;
  promiseToPayDate?: string | null;
  followUpAt?: string | null;
  assignedToUserId?: string | null;
};

export type CustomerCollectionNotePatch = Partial<CustomerCollectionNoteInput> & {
  resolved?: boolean;
};

export function moneyValue(value: string | number | null | undefined): number {
  const parsed = typeof value === "number" ? value : Number.parseFloat(value ?? "0");
  return Number.isFinite(parsed) ? parsed : 0;
}

export function normalizeCustomerKey(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function buildDuplicateIndex(rows: CustomerLike[]): DuplicateIndex {
  const index: DuplicateIndex = { byName: new Map(), byPhone: new Map(), byTin: new Map() };
  for (const customer of rows) {
    const name = normalizeCustomerKey(customer.name);
    const phone = normalizeCustomerKey(customer.phone);
    const tin = normalizeCustomerKey(customer.tin);
    if (name) index.byName.set(name, (index.byName.get(name) ?? 0) + 1);
    if (phone) index.byPhone.set(phone, (index.byPhone.get(phone) ?? 0) + 1);
    if (tin) index.byTin.set(tin, (index.byTin.get(tin) ?? 0) + 1);
  }
  return index;
}

export function buildCustomerSafetySummary(customer: CustomerLike, duplicateIndex: DuplicateIndex) {
  const missingFields: string[] = [];
  const balance = moneyValue(customer.currentBalance);
  const creditLimit = moneyValue(customer.creditLimit);

  if (!customer.phone?.trim()) missingFields.push("phone/code");
  if (!customer.address?.trim()) missingFields.push("address");
  if (!customer.tin?.trim()) missingFields.push("TIN");
  if (customer.customerType !== "INDIVIDUAL" && !customer.contactPerson?.trim()) {
    missingFields.push("contact person");
  }
  if (balance > 0.01 && creditLimit <= 0.01) missingFields.push("credit limit");
  if (customer.isActive === false) missingFields.push("active status");

  const duplicateWarnings: Array<{ field: string; severity: "critical" | "warning"; message: string }> = [];
  const name = normalizeCustomerKey(customer.name);
  const phone = normalizeCustomerKey(customer.phone);
  const tin = normalizeCustomerKey(customer.tin);

  if (tin && (duplicateIndex.byTin.get(tin) ?? 0) > 1) {
    duplicateWarnings.push({ field: "TIN", severity: "critical", message: "Duplicate TIN in customer master" });
  }
  if (phone && (duplicateIndex.byPhone.get(phone) ?? 0) > 1) {
    duplicateWarnings.push({ field: "phone", severity: "critical", message: "Duplicate customer code / phone" });
  }
  if (name && (duplicateIndex.byName.get(name) ?? 0) > 1) {
    duplicateWarnings.push({ field: "name", severity: "warning", message: "Similar customer name" });
  }

  const riskBadges = [
    ...missingFields.map((field) => `Missing ${field}`),
    ...duplicateWarnings.map((warning) => warning.message),
  ];
  if (creditLimit > 0.01 && balance > creditLimit + 0.01) riskBadges.push("Over credit limit");
  if (customer.creditHoldType === "WATCHLIST") riskBadges.push("Credit watchlist");
  if (customer.creditHoldType === "BLOCK_BILLING") riskBadges.push("Billing blocked");

  const requiredCount = customer.customerType === "INDIVIDUAL" ? 4 : 5;
  const profileMissing = missingFields.filter((field) => field !== "credit limit" && field !== "active status");
  const completenessScore = Math.max(
    0,
    Math.round(((requiredCount - profileMissing.length) / requiredCount) * 100),
  );

  return {
    completenessScore,
    missingFields,
    duplicateWarnings,
    creditLimitStatus:
      creditLimit <= 0.01 && balance > 0.01
        ? "missing"
        : creditLimit > 0.01 && balance > creditLimit + 0.01
          ? "over_limit"
          : "ok",
    riskBadges,
  };
}

export function buildCustomerCreditControl(customer: CustomerLike) {
  const balance = moneyValue(customer.currentBalance);
  const creditLimit = moneyValue(customer.creditLimit);
  const holdType = customer.creditHoldType || "NONE";
  const status = customer.creditStatus || (holdType === "NONE" ? "OK" : holdType);
  const overLimit = creditLimit > 0.01 && balance > creditLimit + 0.01;
  return {
    status,
    holdType,
    reason: customer.creditHoldReason ?? null,
    note: customer.creditHoldNote ?? null,
    approvedBy: customer.creditHoldApprovedBy ?? null,
    approvedAt: parseDate(customer.creditHoldApprovedAt),
    blocksBilling: holdType === "BLOCK_BILLING",
    overLimit,
    creditLimit,
    currentBalance: balance,
    availableCredit: creditLimit > 0.01 ? Math.max(creditLimit - balance, 0) : null,
  };
}

function emptyAgingBucket() {
  return {
    current: { amount: 0, count: 0 },
    days1to30: { amount: 0, count: 0 },
    days31to60: { amount: 0, count: 0 },
    days61to90: { amount: 0, count: 0 },
    days90plus: { amount: 0, count: 0 },
  };
}

function parseDate(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

async function getOrgDuplicateIndex(orgId: string) {
  const rows = await db
    .select({
      id: customers.id,
      name: customers.name,
      phone: customers.phone,
      tin: customers.tin,
      customerType: customers.customerType,
      contactPerson: customers.contactPerson,
      address: customers.address,
      creditLimit: customers.creditLimit,
      creditStatus: customers.creditStatus,
      creditHoldType: customers.creditHoldType,
      creditHoldReason: customers.creditHoldReason,
      creditHoldNote: customers.creditHoldNote,
      creditHoldApprovedBy: customers.creditHoldApprovedBy,
      creditHoldApprovedAt: customers.creditHoldApprovedAt,
      currentBalance: customers.currentBalance,
      isActive: customers.isActive,
    })
    .from(customers)
    .where(eq(customers.orgId, orgId));
  return buildDuplicateIndex(rows);
}

export async function enrichCustomersWithSafety<T extends CustomerLike>(
  orgId: string,
  rows: T[],
): Promise<Array<T & Record<string, unknown>>> {
  if (rows.length === 0) return rows;
  const ids = rows.map((row) => row.id);
  const idList = sql.join(ids.map((id) => sql`${id}::uuid`), sql`, `);
  const duplicateIndex = await getOrgDuplicateIndex(orgId);

  const agingRows = (await db.execute(sql`
    WITH charge_balances AS (
      SELECT
        ct.customer_id,
        GREATEST(
          ct.amount::numeric - COALESCE(SUM(pa.allocated_amount::numeric), 0),
          0
        ) AS remaining,
        COALESCE(ct.due_date, (ct.recorded_at::date + c.payment_terms_days)) AS due_date
      FROM customer_transactions ct
      JOIN customers c ON c.id = ct.customer_id
      LEFT JOIN ar_payment_allocations pa ON pa.charge_transaction_id = ct.id
      WHERE ct.org_id = ${orgId}
        AND ct.customer_id IN (${idList})
        AND ct.type = 'CHARGE'
      GROUP BY ct.id, c.payment_terms_days
    )
    SELECT
      customer_id,
      COALESCE(SUM(remaining) FILTER (WHERE remaining > 0.005 AND CURRENT_DATE - due_date <= 0), 0)::text AS current_amount,
      COUNT(*) FILTER (WHERE remaining > 0.005 AND CURRENT_DATE - due_date <= 0)::int AS current_count,
      COALESCE(SUM(remaining) FILTER (WHERE remaining > 0.005 AND CURRENT_DATE - due_date BETWEEN 1 AND 30), 0)::text AS days_1_30_amount,
      COUNT(*) FILTER (WHERE remaining > 0.005 AND CURRENT_DATE - due_date BETWEEN 1 AND 30)::int AS days_1_30_count,
      COALESCE(SUM(remaining) FILTER (WHERE remaining > 0.005 AND CURRENT_DATE - due_date BETWEEN 31 AND 60), 0)::text AS days_31_60_amount,
      COUNT(*) FILTER (WHERE remaining > 0.005 AND CURRENT_DATE - due_date BETWEEN 31 AND 60)::int AS days_31_60_count,
      COALESCE(SUM(remaining) FILTER (WHERE remaining > 0.005 AND CURRENT_DATE - due_date BETWEEN 61 AND 90), 0)::text AS days_61_90_amount,
      COUNT(*) FILTER (WHERE remaining > 0.005 AND CURRENT_DATE - due_date BETWEEN 61 AND 90)::int AS days_61_90_count,
      COALESCE(SUM(remaining) FILTER (WHERE remaining > 0.005 AND CURRENT_DATE - due_date > 90), 0)::text AS days_90_plus_amount,
      COUNT(*) FILTER (WHERE remaining > 0.005 AND CURRENT_DATE - due_date > 90)::int AS days_90_plus_count
    FROM charge_balances
    GROUP BY customer_id
  `)) as any[];

  const collectionRows = (await db.execute(sql`
    SELECT
      customer_id,
      COUNT(*) FILTER (WHERE resolved_at IS NULL)::int AS open_note_count,
      COUNT(*) FILTER (WHERE resolved_at IS NULL AND follow_up_at IS NOT NULL AND follow_up_at <= NOW())::int AS due_follow_up_count,
      MIN(follow_up_at) FILTER (WHERE resolved_at IS NULL AND follow_up_at IS NOT NULL)::text AS next_follow_up_at,
      MIN(promise_to_pay_date) FILTER (WHERE resolved_at IS NULL AND promise_to_pay_date IS NOT NULL)::text AS promise_to_pay_date,
      COALESCE(SUM(promised_amount::numeric) FILTER (WHERE resolved_at IS NULL AND promised_amount IS NOT NULL), 0)::text AS promised_amount,
      MAX(created_at)::text AS last_contact_at
    FROM customer_collection_notes
    WHERE org_id = ${orgId}
      AND customer_id IN (${idList})
    GROUP BY customer_id
  `)) as any[];

  const warningRows = (await db.execute(sql`
    WITH charge_rows AS (
      SELECT
        ct.*,
        COALESCE((SELECT SUM(a.allocated_amount::numeric) FROM ar_payment_allocations a WHERE a.charge_transaction_id = ct.id), 0) AS allocated
      FROM customer_transactions ct
      WHERE ct.org_id = ${orgId}
        AND ct.customer_id IN (${idList})
        AND ct.type = 'CHARGE'
    ),
    duplicate_refs AS (
      SELECT customer_id, lower(reference_number) AS reference_number
      FROM charge_rows
      WHERE reference_number IS NOT NULL AND btrim(reference_number) <> ''
      GROUP BY customer_id, lower(reference_number)
      HAVING COUNT(*) > 1
    )
    SELECT
      cr.customer_id,
      COUNT(*) FILTER (WHERE cr.reference_number IS NULL OR btrim(cr.reference_number) = '')::int AS missing_reference_count,
      COUNT(*) FILTER (WHERE cr.amount::numeric <= 0)::int AS amount_anomaly_count,
      COUNT(*) FILTER (WHERE cr.amount::numeric - cr.allocated > 0.005 AND cr.recorded_at < NOW() - INTERVAL '120 days')::int AS old_unpaid_count,
      COUNT(*) FILTER (WHERE cr.allocated > 0.005 AND cr.amount::numeric - cr.allocated > 0.005)::int AS partial_payment_count,
      COUNT(*) FILTER (WHERE cr.billed = false OR cr.billed IS NULL)::int AS unbilled_count,
      COUNT(*) FILTER (WHERE dr.reference_number IS NOT NULL)::int AS duplicate_reference_count
    FROM charge_rows cr
    LEFT JOIN duplicate_refs dr
      ON dr.customer_id = cr.customer_id
      AND dr.reference_number = lower(cr.reference_number)
    GROUP BY cr.customer_id
  `)) as any[];

  const documentRows = (await db.execute(sql`
    SELECT
      c.id AS customer_id,
      COALESCE((SELECT COUNT(*)::int FROM soa_records s WHERE s.customer_id = c.id AND s.org_id = c.org_id), 0) AS soa_count,
      COALESCE((SELECT COUNT(*)::int FROM customer_transactions p WHERE p.customer_id = c.id AND p.org_id = c.org_id AND p.type = 'PAYMENT'), 0) AS payment_count,
      COALESCE((SELECT COUNT(*)::int FROM customer_transactions cm WHERE cm.customer_id = c.id AND cm.org_id = c.org_id AND cm.type IN ('CREDIT_NOTE', 'ADJUSTMENT') AND (cm.type = 'CREDIT_NOTE' OR cm.notes ILIKE 'Credit Memo%')), 0) AS credit_memo_count
    FROM customers c
    WHERE c.org_id = ${orgId}
      AND c.id IN (${idList})
  `)) as any[];

  const disputeRows = (await db.execute(sql`
    SELECT
      customer_id,
      COUNT(*) FILTER (WHERE status NOT IN ('RESOLVED', 'CANCELLED'))::int AS open_dispute_count,
      COALESCE(SUM(disputed_amount::numeric) FILTER (WHERE status NOT IN ('RESOLVED', 'CANCELLED')), 0)::text AS open_dispute_amount
    FROM customer_disputes
    WHERE org_id = ${orgId}
      AND customer_id IN (${idList})
    GROUP BY customer_id
  `)) as any[];

  const riskRows = (await db.execute(sql`
    SELECT
      customer_id,
      COUNT(*) FILTER (WHERE status = 'OPEN')::int AS open_payment_risk_count,
      COUNT(*) FILTER (WHERE event_type = 'BOUNCED_CHECK')::int AS bounced_payment_count,
      MAX(created_at)::text AS last_payment_risk_at
    FROM customer_payment_risk_events
    WHERE org_id = ${orgId}
      AND customer_id IN (${idList})
    GROUP BY customer_id
  `)) as any[];

  const agingByCustomer = new Map(agingRows.map((row) => [row.customer_id, row]));
  const collectionByCustomer = new Map(collectionRows.map((row) => [row.customer_id, row]));
  const warningByCustomer = new Map(warningRows.map((row) => [row.customer_id, row]));
  const docsByCustomer = new Map(documentRows.map((row) => [row.customer_id, row]));
  const disputesByCustomer = new Map(disputeRows.map((row) => [row.customer_id, row]));
  const risksByCustomer = new Map(riskRows.map((row) => [row.customer_id, row]));

  return rows.map((row) => {
    const aging = agingByCustomer.get(row.id);
    const collection = collectionByCustomer.get(row.id);
    const warnings = warningByCustomer.get(row.id);
    const docs = docsByCustomer.get(row.id);
    const disputes = disputesByCustomer.get(row.id);
    const risks = risksByCustomer.get(row.id);
    return {
      ...row,
      agingBuckets: aging
        ? {
            current: { amount: moneyValue(aging.current_amount), count: aging.current_count ?? 0 },
            days1to30: { amount: moneyValue(aging.days_1_30_amount), count: aging.days_1_30_count ?? 0 },
            days31to60: { amount: moneyValue(aging.days_31_60_amount), count: aging.days_31_60_count ?? 0 },
            days61to90: { amount: moneyValue(aging.days_61_90_amount), count: aging.days_61_90_count ?? 0 },
            days90plus: { amount: moneyValue(aging.days_90_plus_amount), count: aging.days_90_plus_count ?? 0 },
          }
        : emptyAgingBucket(),
      safetySummary: buildCustomerSafetySummary(row, duplicateIndex),
      creditControl: buildCustomerCreditControl(row),
      collectionSummary: {
        openNoteCount: collection?.open_note_count ?? 0,
        dueFollowUpCount: collection?.due_follow_up_count ?? 0,
        nextFollowUpAt: parseDate(collection?.next_follow_up_at),
        promiseToPayDate: collection?.promise_to_pay_date ?? null,
        promisedAmount: moneyValue(collection?.promised_amount),
        lastContactAt: parseDate(collection?.last_contact_at),
      },
      invoiceWarningCounts: {
        duplicateReferences: warnings?.duplicate_reference_count ?? 0,
        missingReference: warnings?.missing_reference_count ?? 0,
        amountAnomalies: warnings?.amount_anomaly_count ?? 0,
        oldUnpaid: warnings?.old_unpaid_count ?? 0,
        partialPayments: warnings?.partial_payment_count ?? 0,
        unbilled: warnings?.unbilled_count ?? row.unbilledCount ?? 0,
      },
      documentCounts: {
        soaRecords: docs?.soa_count ?? 0,
        payments: docs?.payment_count ?? 0,
        creditMemos: docs?.credit_memo_count ?? 0,
      },
      disputeSummary: {
        openCount: disputes?.open_dispute_count ?? 0,
        openAmount: moneyValue(disputes?.open_dispute_amount),
      },
      paymentRiskSummary: {
        openCount: risks?.open_payment_risk_count ?? 0,
        bouncedCount: risks?.bounced_payment_count ?? 0,
        lastRiskAt: parseDate(risks?.last_payment_risk_at),
      },
    };
  });
}

export async function listCustomerCollectionNotes(customerId: string, orgId: string) {
  const rows = await db.execute(sql`
    SELECT
      n.id,
      n.note_type,
      n.contact_method,
      n.outcome,
      n.priority,
      n.note,
      n.promised_amount,
      n.promise_to_pay_date,
      n.follow_up_at,
      n.assigned_to_user_id,
      assigned.full_name AS assigned_to_name,
      n.created_by_user_id,
      created.full_name AS created_by_name,
      n.resolved_at,
      n.resolved_by_user_id,
      resolved.full_name AS resolved_by_name,
      n.created_at,
      n.updated_at
    FROM customer_collection_notes n
    LEFT JOIN users assigned ON assigned.id = n.assigned_to_user_id
    LEFT JOIN users created ON created.id = n.created_by_user_id
    LEFT JOIN users resolved ON resolved.id = n.resolved_by_user_id
    WHERE n.org_id = ${orgId} AND n.customer_id = ${customerId}
    ORDER BY n.resolved_at NULLS FIRST, n.follow_up_at ASC NULLS LAST, n.created_at DESC
  `);
  return (rows as any[]).map(mapCollectionNote);
}

export async function createCustomerCollectionNote(
  customerId: string,
  orgId: string,
  userId: string,
  input: CustomerCollectionNoteInput,
) {
  const note = input.note?.trim();
  if (!note) throw new Error("Note is required");

  const [customer] = await db
    .select({ id: customers.id })
    .from(customers)
    .where(and(eq(customers.id, customerId), eq(customers.orgId, orgId)))
    .limit(1);
  if (!customer) throw new Error("Customer not found");

  const [created] = await db
    .insert(customerCollectionNotes)
    .values({
      orgId,
      customerId,
      noteType: input.noteType || "NOTE",
      contactMethod: input.contactMethod || null,
      outcome: input.outcome || null,
      priority: input.priority || "NORMAL",
      note,
      promisedAmount:
        input.promisedAmount === undefined || input.promisedAmount === null || input.promisedAmount === ""
          ? null
          : String(input.promisedAmount),
      promiseToPayDate: input.promiseToPayDate || null,
      followUpAt: input.followUpAt ? new Date(input.followUpAt) : null,
      assignedToUserId: input.assignedToUserId || null,
      createdByUserId: userId,
    })
    .returning();

  await db.insert(auditLogs).values({
    orgId,
    userId,
    action: "CUSTOMER_COLLECTION_NOTE_CREATE",
    entityType: "CUSTOMER",
    entityId: customerId,
    details: { noteId: created.id, noteType: created.noteType },
  });

  return (await listCustomerCollectionNotes(customerId, orgId)).find((row) => row.id === created.id);
}

export async function updateCustomerCollectionNote(
  customerId: string,
  noteId: string,
  orgId: string,
  userId: string,
  input: CustomerCollectionNotePatch,
) {
  const setFields: Record<string, unknown> = {};
  if (input.noteType !== undefined) setFields.noteType = input.noteType || "NOTE";
  if (input.contactMethod !== undefined) setFields.contactMethod = input.contactMethod || null;
  if (input.outcome !== undefined) setFields.outcome = input.outcome || null;
  if (input.priority !== undefined) setFields.priority = input.priority || "NORMAL";
  if (input.promisedAmount !== undefined) {
    setFields.promisedAmount =
      input.promisedAmount === null || input.promisedAmount === "" ? null : String(input.promisedAmount);
  }
  if (input.note !== undefined) {
    const note = input.note.trim();
    if (!note) throw new Error("Note is required");
    setFields.note = note;
  }
  if (input.promiseToPayDate !== undefined) setFields.promiseToPayDate = input.promiseToPayDate || null;
  if (input.followUpAt !== undefined) setFields.followUpAt = input.followUpAt ? new Date(input.followUpAt) : null;
  if (input.assignedToUserId !== undefined) setFields.assignedToUserId = input.assignedToUserId || null;
  if (input.resolved !== undefined) {
    setFields.resolvedAt = input.resolved ? new Date() : null;
    setFields.resolvedByUserId = input.resolved ? userId : null;
  }

  if (Object.keys(setFields).length === 0) {
    return (await listCustomerCollectionNotes(customerId, orgId)).find((row) => row.id === noteId) ?? null;
  }

  const [updated] = await db
    .update(customerCollectionNotes)
    .set(setFields)
    .where(
      and(
        eq(customerCollectionNotes.id, noteId),
        eq(customerCollectionNotes.customerId, customerId),
        eq(customerCollectionNotes.orgId, orgId),
      ),
    )
    .returning();
  if (!updated) throw new Error("Collection note not found");

  await db.insert(auditLogs).values({
    orgId,
    userId,
    action: input.resolved ? "CUSTOMER_COLLECTION_NOTE_RESOLVE" : "CUSTOMER_COLLECTION_NOTE_UPDATE",
    entityType: "CUSTOMER",
    entityId: customerId,
    details: { noteId, fields: Object.keys(setFields) },
  });

  return (await listCustomerCollectionNotes(customerId, orgId)).find((row) => row.id === noteId);
}

export async function getCustomerTimeline(customerId: string, orgId: string, limit = 80) {
  const [customer] = await db
    .select({ id: customers.id })
    .from(customers)
    .where(and(eq(customers.id, customerId), eq(customers.orgId, orgId)))
    .limit(1);
  if (!customer) throw new Error("Customer not found");

  const transactionEvents = (await db.execute(sql`
    SELECT id, type, amount, reference_number, payment_number, notes, recorded_at
    FROM customer_transactions
    WHERE customer_id = ${customerId} AND org_id = ${orgId}
    ORDER BY recorded_at DESC, id DESC
    LIMIT 60
  `)) as any[];

  const soaEvents = (await db.execute(sql`
    SELECT id, soa_number, status, total_payable, paid_amount, generated_at
    FROM soa_records
    WHERE customer_id = ${customerId} AND org_id = ${orgId}
    ORDER BY generated_at DESC, id DESC
    LIMIT 40
  `)) as any[];

  const noteEvents = await db
    .select()
    .from(customerCollectionNotes)
    .where(and(eq(customerCollectionNotes.customerId, customerId), eq(customerCollectionNotes.orgId, orgId)))
    .orderBy(desc(customerCollectionNotes.createdAt))
    .limit(40);

  const auditEvents = (await db.execute(sql`
    SELECT al.id, al.action, al.details, al.created_at, u.full_name AS user_name
    FROM audit_logs al
    LEFT JOIN users u ON u.id = al.user_id
    WHERE al.org_id = ${orgId}
      AND al.entity_type = 'CUSTOMER'
      AND al.entity_id = ${customerId}
    ORDER BY al.created_at DESC, al.id DESC
    LIMIT 40
  `)) as any[];

  const disputeEvents = (await db.execute(sql`
    SELECT id, status, reason, disputed_amount, notes, created_at, resolved_at
    FROM customer_disputes
    WHERE customer_id = ${customerId} AND org_id = ${orgId}
    ORDER BY created_at DESC, id DESC
    LIMIT 40
  `)) as any[];

  const paymentRiskEvents = (await db.execute(sql`
    SELECT id, event_type, status, reference_number, amount, reason, created_at
    FROM customer_payment_risk_events
    WHERE customer_id = ${customerId} AND org_id = ${orgId}
    ORDER BY created_at DESC, id DESC
    LIMIT 40
  `)) as any[];

  const events = [
    ...transactionEvents.map((row) => ({
      id: `txn-${row.id}`,
      source: "transaction",
      eventType: row.type,
      title: row.type === "PAYMENT" ? "Payment recorded" : row.type === "CHARGE" ? "Invoice / charge recorded" : row.type === "CREDIT_NOTE" ? "Credit memo recorded" : "Adjustment recorded",
      occurredAt: parseDate(row.recorded_at)!,
      amount: moneyValue(row.amount),
      reference: row.payment_number || row.reference_number || null,
      details: { notes: row.notes },
    })),
    ...soaEvents.map((row) => ({
      id: `soa-${row.id}`,
      source: "soa",
      eventType: row.status || "SOA",
      title: `SOA ${row.soa_number} ${String(row.status || "generated").toLowerCase()}`,
      occurredAt: parseDate(row.generated_at)!,
      amount: moneyValue(row.total_payable),
      reference: row.soa_number,
      details: { paidAmount: moneyValue(row.paid_amount) },
    })),
    ...noteEvents.map((row) => ({
      id: `note-${row.id}`,
      source: "collection_note",
      eventType: row.resolvedAt ? "RESOLVED" : row.noteType,
      title: row.resolvedAt ? "Collection note resolved" : "Collection note added",
      occurredAt: row.resolvedAt?.toISOString() ?? row.createdAt.toISOString(),
      amount: null,
      reference: row.noteType,
      details: {
        note: row.note,
        promiseToPayDate: row.promiseToPayDate,
        followUpAt: row.followUpAt?.toISOString() ?? null,
        contactMethod: row.contactMethod ?? null,
        outcome: row.outcome ?? null,
        priority: row.priority ?? "NORMAL",
        promisedAmount: row.promisedAmount ? moneyValue(row.promisedAmount) : null,
      },
    })),
    ...disputeEvents.map((row) => ({
      id: `dispute-${row.id}`,
      source: "dispute",
      eventType: row.status || "DISPUTE",
      title: row.resolved_at ? "Dispute resolved" : "Dispute opened",
      occurredAt: parseDate(row.resolved_at ?? row.created_at)!,
      amount: row.disputed_amount ? moneyValue(row.disputed_amount) : null,
      reference: row.reason ?? "Dispute",
      details: { notes: row.notes, status: row.status },
    })),
    ...paymentRiskEvents.map((row) => ({
      id: `risk-${row.id}`,
      source: "payment_risk",
      eventType: row.event_type,
      title: prettifyAuditAction(row.event_type),
      occurredAt: parseDate(row.created_at)!,
      amount: row.amount ? moneyValue(row.amount) : null,
      reference: row.reference_number ?? null,
      details: { reason: row.reason, status: row.status },
    })),
    ...auditEvents.map((row) => ({
      id: `audit-${row.id}`,
      source: "audit",
      eventType: row.action,
      title: prettifyAuditAction(row.action),
      occurredAt: parseDate(row.created_at)!,
      amount: null,
      reference: row.user_name,
      details: row.details ?? {},
    })),
  ];

  return events
    .filter((event) => Boolean(event.occurredAt))
    .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
    .slice(0, limit);
}

export async function listCustomerDocuments(customerId: string, orgId: string) {
  const soaRows = (await db.execute(sql`
    SELECT id, soa_number, generated_at, total_payable, paid_amount, status, transaction_count
    FROM soa_records
    WHERE customer_id = ${customerId} AND org_id = ${orgId}
    ORDER BY generated_at DESC
    LIMIT 100
  `)) as any[];

  const paymentRows = await db
    .select()
    .from(customerTransactions)
    .where(
      and(
        eq(customerTransactions.customerId, customerId),
        eq(customerTransactions.orgId, orgId),
        eq(customerTransactions.type, "PAYMENT"),
      ),
    )
    .orderBy(desc(customerTransactions.recordedAt))
    .limit(100);

  const creditRows = (await db.execute(sql`
    SELECT id, type, amount, reference_number, notes, recorded_at, billed_soa_id
    FROM customer_transactions
    WHERE customer_id = ${customerId}
      AND org_id = ${orgId}
      AND (type = 'CREDIT_NOTE' OR (type = 'ADJUSTMENT' AND notes ILIKE 'Credit Memo%'))
    ORDER BY recorded_at DESC
    LIMIT 100
  `)) as any[];

  const [collectionSummaryRow] = (await db.execute(sql`
    SELECT
      COUNT(*)::int AS note_count,
      COUNT(*) FILTER (WHERE resolved_at IS NULL)::int AS open_count,
      MAX(created_at) AS last_note_at
    FROM customer_collection_notes
    WHERE customer_id = ${customerId}
      AND org_id = ${orgId}
  `)) as any[];

  const rows: any[] = [
    ...soaRows.map((row) => ({
      id: row.id,
      documentType: "SOA",
      title: `SOA ${row.soa_number}`,
      number: row.soa_number,
      status: row.status,
      amount: moneyValue(row.total_payable),
      date: parseDate(row.generated_at),
      metadata: {
        paidAmount: moneyValue(row.paid_amount),
        lineCount: row.transaction_count,
        printModes: ["detailed", "concise"],
        linkedSoaNumber: row.soa_number,
      },
    })),
    ...paymentRows.map((row) => ({
      id: row.id,
      documentType: "PAYMENT_RECEIPT",
      title: row.paymentNumber ? `Receipt ${row.paymentNumber}` : "Payment receipt",
      number: row.paymentNumber,
      status: "POSTED",
      amount: moneyValue(row.amount),
      date: row.recordedAt.toISOString(),
      metadata: {
        method: row.paymentMethod,
        referenceNumber: row.referenceNumber,
        linkedPaymentNumber: row.paymentNumber,
      },
    })),
    ...creditRows.map((row) => ({
      id: row.id,
      documentType: "CREDIT_MEMO",
      title: row.reference_number ? `Credit memo ${row.reference_number}` : "Credit memo",
      number: row.reference_number,
      status: row.billed_soa_id ? "APPLIED_TO_SOA" : "AVAILABLE",
      amount: Math.abs(moneyValue(row.amount)),
      date: parseDate(row.recorded_at),
      metadata: { notes: row.notes, billedSoaId: row.billed_soa_id },
    })),
  ];

  if ((collectionSummaryRow?.note_count ?? 0) > 0) {
    rows.push({
      id: `collection-summary-${customerId}`,
      documentType: "COLLECTION_SUMMARY",
      title: "Collection summary",
      number: null,
      status: collectionSummaryRow.open_count > 0 ? "OPEN_NOTES" : "RESOLVED",
      amount: 0,
      date: parseDate(collectionSummaryRow.last_note_at) ?? new Date().toISOString(),
      metadata: {
        noteCount: collectionSummaryRow.note_count,
        openNoteCount: collectionSummaryRow.open_count,
      },
    });
  }

  const disputeRows = (await db.execute(sql`
    SELECT id, status, reason, disputed_amount, created_at, resolved_at
    FROM customer_disputes
    WHERE customer_id = ${customerId}
      AND org_id = ${orgId}
    ORDER BY created_at DESC
    LIMIT 100
  `)) as any[];

  for (const row of disputeRows) {
    rows.push({
      id: row.id,
      documentType: "DISPUTE",
      title: `Dispute - ${row.reason}`,
      number: null,
      status: row.status,
      amount: moneyValue(row.disputed_amount),
      date: parseDate(row.resolved_at ?? row.created_at),
      metadata: { reason: row.reason },
    });
  }

  return rows.sort((a, b) => new Date(b.date ?? 0).getTime() - new Date(a.date ?? 0).getTime());
}

function mapCollectionNote(row: any) {
  return {
    id: row.id,
    noteType: row.note_type,
    contactMethod: row.contact_method ?? null,
    outcome: row.outcome ?? null,
    priority: row.priority ?? "NORMAL",
    note: row.note,
    promisedAmount: row.promised_amount ? moneyValue(row.promised_amount) : null,
    promiseToPayDate: row.promise_to_pay_date ?? null,
    followUpAt: parseDate(row.follow_up_at),
    assignedToUserId: row.assigned_to_user_id ?? null,
    assignedToName: row.assigned_to_name ?? null,
    createdByUserId: row.created_by_user_id ?? null,
    createdByName: row.created_by_name ?? null,
    resolvedAt: parseDate(row.resolved_at),
    resolvedByUserId: row.resolved_by_user_id ?? null,
    resolvedByName: row.resolved_by_name ?? null,
    createdAt: parseDate(row.created_at),
    updatedAt: parseDate(row.updated_at),
  };
}

export async function getCustomerCreditControl(customerId: string, orgId: string) {
  const [customer] = await db
    .select()
    .from(customers)
    .where(and(eq(customers.id, customerId), eq(customers.orgId, orgId)))
    .limit(1);
  if (!customer) throw new Error("Customer not found");
  return buildCustomerCreditControl(customer);
}

export async function updateCustomerCreditControl(
  customerId: string,
  orgId: string,
  userId: string,
  input: {
    status?: string;
    holdType?: string;
    reason?: string | null;
    note?: string | null;
  },
) {
  const holdType = input.holdType || "NONE";
  if (!["NONE", "WATCHLIST", "BLOCK_BILLING"].includes(holdType)) {
    throw new Error("Invalid credit hold type");
  }
  const status = input.status || (holdType === "NONE" ? "OK" : holdType);
  const [updated] = await db
    .update(customers)
    .set({
      creditStatus: status,
      creditHoldType: holdType,
      creditHoldReason: input.reason?.trim() || null,
      creditHoldNote: input.note?.trim() || null,
      creditHoldApprovedBy: userId,
      creditHoldApprovedAt: new Date(),
    })
    .where(and(eq(customers.id, customerId), eq(customers.orgId, orgId)))
    .returning();
  if (!updated) throw new Error("Customer not found");

  await db.insert(auditLogs).values({
    orgId,
    userId,
    action: "CUSTOMER_CREDIT_CONTROL_UPDATE",
    entityType: "CUSTOMER",
    entityId: customerId,
    details: { status, holdType, reason: input.reason ?? null },
  });

  return buildCustomerCreditControl(updated);
}

export async function listCustomerDisputes(customerId: string, orgId: string) {
  const rows = await db.execute(sql`
    SELECT
      d.id,
      d.transaction_id,
      d.soa_id,
      sr.soa_number,
      ct.reference_number,
      d.status,
      d.reason,
      d.disputed_amount,
      d.owner_user_id,
      owner.full_name AS owner_name,
      d.notes,
      d.created_by_user_id,
      created.full_name AS created_by_name,
      d.resolved_at,
      d.resolved_by_user_id,
      resolved.full_name AS resolved_by_name,
      d.created_at,
      d.updated_at
    FROM customer_disputes d
    LEFT JOIN customer_transactions ct ON ct.id = d.transaction_id
    LEFT JOIN soa_records sr ON sr.id = d.soa_id
    LEFT JOIN users owner ON owner.id = d.owner_user_id
    LEFT JOIN users created ON created.id = d.created_by_user_id
    LEFT JOIN users resolved ON resolved.id = d.resolved_by_user_id
    WHERE d.org_id = ${orgId}
      AND d.customer_id = ${customerId}
    ORDER BY d.resolved_at NULLS FIRST, d.created_at DESC
  `) as any[];

  return rows.map(mapDispute);
}

export async function createCustomerDispute(
  customerId: string,
  orgId: string,
  userId: string,
  input: {
    transactionId?: string | null;
    soaId?: string | null;
    reason?: string;
    disputedAmount?: string | number | null;
    ownerUserId?: string | null;
    notes?: string | null;
  },
) {
  const [customer] = await db
    .select({ id: customers.id })
    .from(customers)
    .where(and(eq(customers.id, customerId), eq(customers.orgId, orgId)))
    .limit(1);
  if (!customer) throw new Error("Customer not found");
  if (!input.transactionId && !input.soaId) throw new Error("transactionId or soaId is required");

  if (input.transactionId) {
    const [txn] = await db.execute(sql`
      SELECT id
      FROM customer_transactions
      WHERE id = ${input.transactionId}
        AND customer_id = ${customerId}
        AND org_id = ${orgId}
    `) as any[];
    if (!txn) throw new Error("Disputed transaction not found");
  }
  if (input.soaId) {
    const [soa] = await db.execute(sql`
      SELECT id
      FROM soa_records
      WHERE id = ${input.soaId}
        AND customer_id = ${customerId}
        AND org_id = ${orgId}
    `) as any[];
    if (!soa) throw new Error("Disputed SOA not found");
  }

  const [created] = await db
    .insert(customerDisputes)
    .values({
      orgId,
      customerId,
      transactionId: input.transactionId || null,
      soaId: input.soaId || null,
      reason: input.reason?.trim() || "DISPUTED",
      disputedAmount:
        input.disputedAmount === undefined || input.disputedAmount === null || input.disputedAmount === ""
          ? null
          : String(input.disputedAmount),
      ownerUserId: input.ownerUserId || userId,
      notes: input.notes?.trim() || null,
      createdByUserId: userId,
    })
    .returning();

  await db.insert(auditLogs).values({
    orgId,
    userId,
    action: "CUSTOMER_DISPUTE_CREATE",
    entityType: "CUSTOMER",
    entityId: customerId,
    details: {
      disputeId: created.id,
      transactionId: input.transactionId ?? null,
      soaId: input.soaId ?? null,
    },
  });

  return (await listCustomerDisputes(customerId, orgId)).find((row) => row.id === created.id);
}

export async function updateCustomerDispute(
  customerId: string,
  disputeId: string,
  orgId: string,
  userId: string,
  input: {
    status?: string;
    reason?: string;
    disputedAmount?: string | number | null;
    ownerUserId?: string | null;
    notes?: string | null;
  },
) {
  const setFields: Record<string, unknown> = {};
  if (input.status !== undefined) {
    setFields.status = input.status || "OPEN";
    if (["RESOLVED", "CANCELLED"].includes(input.status)) {
      setFields.resolvedAt = new Date();
      setFields.resolvedByUserId = userId;
    } else {
      setFields.resolvedAt = null;
      setFields.resolvedByUserId = null;
    }
  }
  if (input.reason !== undefined) setFields.reason = input.reason || "DISPUTED";
  if (input.disputedAmount !== undefined) {
    setFields.disputedAmount =
      input.disputedAmount === null || input.disputedAmount === "" ? null : String(input.disputedAmount);
  }
  if (input.ownerUserId !== undefined) setFields.ownerUserId = input.ownerUserId || null;
  if (input.notes !== undefined) setFields.notes = input.notes?.trim() || null;

  if (Object.keys(setFields).length === 0) {
    return (await listCustomerDisputes(customerId, orgId)).find((row) => row.id === disputeId) ?? null;
  }

  const [updated] = await db
    .update(customerDisputes)
    .set(setFields)
    .where(and(eq(customerDisputes.id, disputeId), eq(customerDisputes.customerId, customerId), eq(customerDisputes.orgId, orgId)))
    .returning();
  if (!updated) throw new Error("Dispute not found");

  await db.insert(auditLogs).values({
    orgId,
    userId,
    action: "CUSTOMER_DISPUTE_UPDATE",
    entityType: "CUSTOMER",
    entityId: customerId,
    details: { disputeId, fields: Object.keys(setFields) },
  });

  return (await listCustomerDisputes(customerId, orgId)).find((row) => row.id === disputeId);
}

export async function getCustomerMergePreview(
  survivorCustomerId: string,
  duplicateCustomerId: string,
  orgId: string,
) {
  if (survivorCustomerId === duplicateCustomerId) throw new Error("Choose two different customers");
  const rows = await db.execute(sql`
    SELECT id, name, phone, email, address, tin, current_balance, credit_limit, is_active
    FROM customers
    WHERE org_id = ${orgId}
      AND id IN (${survivorCustomerId}, ${duplicateCustomerId})
  `) as any[];
  const survivor = rows.find((row) => row.id === survivorCustomerId);
  const duplicate = rows.find((row) => row.id === duplicateCustomerId);
  if (!survivor || !duplicate) throw new Error("Customer not found");

  const [counts] = await db.execute(sql`
    SELECT
      (SELECT COUNT(*)::int FROM customer_transactions WHERE org_id = ${orgId} AND customer_id = ${duplicateCustomerId}) AS transactions,
      (SELECT COUNT(*)::int FROM soa_records WHERE org_id = ${orgId} AND customer_id = ${duplicateCustomerId}) AS soas,
      (SELECT COUNT(*)::int FROM customer_collection_notes WHERE org_id = ${orgId} AND customer_id = ${duplicateCustomerId}) AS collection_notes,
      (SELECT COUNT(*)::int FROM customer_disputes WHERE org_id = ${orgId} AND customer_id = ${duplicateCustomerId}) AS disputes,
      (SELECT COUNT(*)::int FROM customer_payment_risk_events WHERE org_id = ${orgId} AND customer_id = ${duplicateCustomerId}) AS payment_risks
  `) as any[];

  const fields = ["name", "phone", "email", "address", "tin", "credit_limit"] as const;
  const profileConflicts = fields
    .filter((field) => String(survivor[field] ?? "") !== String(duplicate[field] ?? ""))
    .map((field) => ({
      field,
      survivorValue: survivor[field] ?? null,
      duplicateValue: duplicate[field] ?? null,
    }));

  return {
    canApply: true,
    survivor,
    duplicate,
    affectedCounts: {
      transactions: counts?.transactions ?? 0,
      soas: counts?.soas ?? 0,
      collectionNotes: counts?.collection_notes ?? 0,
      disputes: counts?.disputes ?? 0,
      paymentRisks: counts?.payment_risks ?? 0,
    },
    profileConflicts,
    warnings: [
      "The duplicate customer will be marked inactive and linked to the survivor.",
      "Financial records move to the survivor; the duplicate customer is not hard-deleted.",
      ...(profileConflicts.length > 0 ? ["Profile conflicts are not auto-copied; keep the survivor's master data."] : []),
    ],
  };
}

export async function applyCustomerMerge(
  survivorCustomerId: string,
  duplicateCustomerId: string,
  orgId: string,
  userId: string,
  reason: string,
) {
  if (!reason?.trim()) throw new Error("Reason is required to merge customers");
  const preview = await getCustomerMergePreview(survivorCustomerId, duplicateCustomerId, orgId);

  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT id FROM customers WHERE org_id = ${orgId} AND id IN (${survivorCustomerId}, ${duplicateCustomerId}) FOR UPDATE`);
    await tx.execute(sql`UPDATE customer_transactions SET customer_id = ${survivorCustomerId} WHERE org_id = ${orgId} AND customer_id = ${duplicateCustomerId}`);
    await tx.execute(sql`UPDATE soa_records SET customer_id = ${survivorCustomerId} WHERE org_id = ${orgId} AND customer_id = ${duplicateCustomerId}`);
    await tx.execute(sql`UPDATE customer_collection_notes SET customer_id = ${survivorCustomerId} WHERE org_id = ${orgId} AND customer_id = ${duplicateCustomerId}`);
    await tx.execute(sql`UPDATE customer_disputes SET customer_id = ${survivorCustomerId} WHERE org_id = ${orgId} AND customer_id = ${duplicateCustomerId}`);
    await tx.execute(sql`UPDATE customer_payment_risk_events SET customer_id = ${survivorCustomerId} WHERE org_id = ${orgId} AND customer_id = ${duplicateCustomerId}`);
    await tx.execute(sql`
      UPDATE customers
      SET current_balance = COALESCE((
          SELECT SUM(CASE
            WHEN type = 'CHARGE' THEN amount::numeric
            WHEN type IN ('PAYMENT', 'CREDIT_NOTE') THEN -ABS(amount::numeric)
            ELSE amount::numeric
          END)
          FROM customer_transactions
          WHERE org_id = ${orgId} AND customer_id = ${survivorCustomerId}
        ), 0)::text,
        updated_at = NOW()
      WHERE org_id = ${orgId} AND id = ${survivorCustomerId}
    `);
    await tx.execute(sql`
      UPDATE customers
      SET is_active = false,
          current_balance = '0.00',
          merged_into_customer_id = ${survivorCustomerId},
          merged_at = NOW(),
          merged_by_user_id = ${userId},
          notes = COALESCE(notes || E'\n', '') || ${`Merged into customer ${survivorCustomerId}. Reason: ${reason.trim()}`}
      WHERE org_id = ${orgId} AND id = ${duplicateCustomerId}
    `);
    await tx.insert(auditLogs).values({
      orgId,
      userId,
      action: "CUSTOMER_MERGE_APPLY",
      entityType: "CUSTOMER",
      entityId: survivorCustomerId,
      details: {
        duplicateCustomerId,
        reason: reason.trim(),
        affectedCounts: preview.affectedCounts,
      },
    });
  });

  return { ...preview, applied: true };
}

export async function recordCustomerPaymentRiskEvent(
  customerId: string,
  orgId: string,
  userId: string,
  input: {
    paymentTransactionId?: string | null;
    eventType: string;
    referenceNumber?: string | null;
    amount?: string | number | null;
    reason?: string | null;
  },
) {
  const [created] = await db
    .insert(customerPaymentRiskEvents)
    .values({
      orgId,
      customerId,
      paymentTransactionId: input.paymentTransactionId || null,
      eventType: input.eventType,
      referenceNumber: input.referenceNumber || null,
      amount:
        input.amount === undefined || input.amount === null || input.amount === ""
          ? null
          : String(input.amount),
      reason: input.reason?.trim() || null,
      createdByUserId: userId,
    })
    .returning();

  await db.insert(auditLogs).values({
    orgId,
    userId,
    action: "CUSTOMER_PAYMENT_RISK_EVENT",
    entityType: "CUSTOMER",
    entityId: customerId,
    details: {
      eventId: created.id,
      eventType: input.eventType,
      paymentTransactionId: input.paymentTransactionId ?? null,
      reason: input.reason ?? null,
    },
  });

  return created;
}

export async function getCustomerCollectionsReport(orgId: string) {
  const [summary] = await db.execute(sql`
    WITH open_charges AS (
      SELECT
        ct.customer_id,
        GREATEST(ct.amount::numeric - COALESCE(SUM(pa.allocated_amount::numeric), 0), 0) AS remaining,
        COALESCE(ct.due_date, (ct.recorded_at::date + c.payment_terms_days)) AS due_date
      FROM customer_transactions ct
      JOIN customers c ON c.id = ct.customer_id
      LEFT JOIN ar_payment_allocations pa ON pa.charge_transaction_id = ct.id
      WHERE ct.org_id = ${orgId}
        AND ct.type = 'CHARGE'
      GROUP BY ct.id, c.payment_terms_days
    )
    SELECT
      COALESCE(SUM(remaining), 0)::text AS total_open,
      COALESCE(SUM(remaining) FILTER (WHERE CURRENT_DATE - due_date > 0), 0)::text AS overdue,
      COALESCE(SUM(remaining) FILTER (WHERE CURRENT_DATE - due_date > 90), 0)::text AS days_90_plus,
      COUNT(DISTINCT customer_id) FILTER (WHERE remaining > 0.005)::int AS customers_with_balance
    FROM open_charges
  `) as any[];

  const [notes] = await db.execute(sql`
    SELECT
      COUNT(*) FILTER (WHERE resolved_at IS NULL AND follow_up_at <= NOW())::int AS follow_up_due,
      COUNT(*) FILTER (WHERE resolved_at IS NULL AND promise_to_pay_date IS NOT NULL AND promise_to_pay_date < CURRENT_DATE)::int AS promises_missed,
      COUNT(*) FILTER (WHERE resolved_at IS NULL AND promise_to_pay_date IS NOT NULL AND promise_to_pay_date >= CURRENT_DATE)::int AS promises_open
    FROM customer_collection_notes
    WHERE org_id = ${orgId}
  `) as any[];

  const [risks] = await db.execute(sql`
    SELECT
      COUNT(*) FILTER (WHERE status = 'OPEN')::int AS payment_risk_open,
      COUNT(*) FILTER (WHERE event_type = 'BOUNCED_CHECK')::int AS bounced_payment_count
    FROM customer_payment_risk_events
    WHERE org_id = ${orgId}
  `) as any[];

  const topOverdue = await db.execute(sql`
    SELECT c.id, c.name, c.current_balance, c.credit_limit
    FROM customers c
    WHERE c.org_id = ${orgId}
      AND c.current_balance::numeric > 0
    ORDER BY c.current_balance::numeric DESC
    LIMIT 10
  `) as any[];

  return {
    totals: {
      totalOpen: moneyValue(summary?.total_open),
      overdue: moneyValue(summary?.overdue),
      days90Plus: moneyValue(summary?.days_90_plus),
      customersWithBalance: summary?.customers_with_balance ?? 0,
      followUpDue: notes?.follow_up_due ?? 0,
      promisesMissed: notes?.promises_missed ?? 0,
      promisesOpen: notes?.promises_open ?? 0,
      paymentRiskOpen: risks?.payment_risk_open ?? 0,
      bouncedPayments: risks?.bounced_payment_count ?? 0,
    },
    topOverdue: topOverdue.map((row: any) => ({
      id: row.id,
      name: row.name,
      balance: moneyValue(row.current_balance),
      creditLimit: moneyValue(row.credit_limit),
    })),
  };
}

function mapDispute(row: any) {
  return {
    id: row.id,
    transactionId: row.transaction_id ?? null,
    soaId: row.soa_id ?? null,
    soaNumber: row.soa_number ?? null,
    referenceNumber: row.reference_number ?? null,
    status: row.status,
    reason: row.reason,
    disputedAmount: row.disputed_amount ? moneyValue(row.disputed_amount) : null,
    ownerUserId: row.owner_user_id ?? null,
    ownerName: row.owner_name ?? null,
    notes: row.notes ?? null,
    createdByUserId: row.created_by_user_id ?? null,
    createdByName: row.created_by_name ?? null,
    resolvedAt: parseDate(row.resolved_at),
    resolvedByUserId: row.resolved_by_user_id ?? null,
    resolvedByName: row.resolved_by_name ?? null,
    createdAt: parseDate(row.created_at),
    updatedAt: parseDate(row.updated_at),
  };
}

function prettifyAuditAction(action: string) {
  return action
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
