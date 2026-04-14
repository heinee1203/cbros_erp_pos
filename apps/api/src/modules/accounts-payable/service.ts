import { db, type DbOrTx } from "@apex/database";
import {
  supplierInvoices,
  checkVouchers,
  checkVoucherLines,
  cvNumberSequence,
  bankAccounts,
  suppliers,
  supplierReturns,
} from "@apex/database/schema";
import { eq, and, sql, desc, asc, lt, inArray, or, gte, lte, ilike, type SQL } from "drizzle-orm";

// ════════════════════════════════════════════════════════════════════
// NUMBER TO WORDS (Philippine Peso)
// ════════════════════════════════════════════════════════════════════

const ones = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
  "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
  "Seventeen", "Eighteen", "Nineteen",
];
const tens = [
  "", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety",
];

function chunkToWords(n: number): string {
  if (n === 0) return "";
  if (n < 20) return ones[n];
  if (n < 100) {
    const remainder = n % 10;
    return tens[Math.floor(n / 10)] + (remainder ? "-" + ones[remainder] : "");
  }
  const remainder = n % 100;
  return ones[Math.floor(n / 100)] + " Hundred" + (remainder ? " " + chunkToWords(remainder) : "");
}

export function numberToWords(amount: number): string {
  if (amount < 0) amount = Math.abs(amount);
  const wholePart = Math.floor(amount);
  const centavos = Math.round((amount - wholePart) * 100);

  if (wholePart === 0) {
    return `Zero Pesos and ${String(centavos).padStart(2, "0")}/100 Only`;
  }

  const scales = ["", "Thousand", "Million", "Billion"];
  let remaining = wholePart;
  const chunks: string[] = [];

  let scaleIdx = 0;
  while (remaining > 0) {
    const chunk = remaining % 1000;
    if (chunk > 0) {
      const words = chunkToWords(chunk);
      chunks.unshift(scales[scaleIdx] ? `${words} ${scales[scaleIdx]}` : words);
    }
    remaining = Math.floor(remaining / 1000);
    scaleIdx++;
  }

  return `${chunks.join(" ")} Pesos and ${String(centavos).padStart(2, "0")}/100 Only`;
}

// ════════════════════════════════════════════════════════════════════
// SUPPLIER INVOICES
// ════════════════════════════════════════════════════════════════════

export interface InvoiceFilters {
  status?: string;
  supplierId?: string;
  overdue?: boolean;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
}

export async function listInvoices(
  orgId: string,
  filters: InvoiceFilters,
  cursor?: string,
  limit = 50,
) {
  const conditions: SQL[] = [eq(supplierInvoices.orgId, orgId)];

  if (filters.status) {
    const statuses = filters.status.split(",").filter(Boolean);
    if (statuses.length === 1) {
      conditions.push(eq(supplierInvoices.status, statuses[0] as any));
    } else if (statuses.length > 1) {
      conditions.push(inArray(supplierInvoices.status, statuses as any));
    }
  }

  if (filters.supplierId) {
    conditions.push(eq(supplierInvoices.supplierId, filters.supplierId));
  }

  if (filters.overdue) {
    conditions.push(lt(supplierInvoices.dueDate, sql`CURRENT_DATE`));
    conditions.push(
      inArray(supplierInvoices.status, ["OPEN", "PARTIALLY_PAID"] as any),
    );
  }

  if (filters.dateFrom) {
    conditions.push(gte(supplierInvoices.invoiceDate, filters.dateFrom));
  }
  if (filters.dateTo) {
    conditions.push(lte(supplierInvoices.invoiceDate, filters.dateTo));
  }

  if (filters.search && filters.search.trim()) {
    const pattern = `%${filters.search.trim()}%`;
    conditions.push(
      or(
        ilike(supplierInvoices.invoiceNumber, pattern),
        ilike(suppliers.name, pattern),
        ilike(supplierInvoices.notes, pattern),
      )!,
    );
  }

  if (cursor) {
    conditions.push(lt(supplierInvoices.id, cursor));
  }

  const rows = await db
    .select({
      id: supplierInvoices.id,
      orgId: supplierInvoices.orgId,
      supplierId: supplierInvoices.supplierId,
      supplierName: suppliers.name,
      invoiceNumber: supplierInvoices.invoiceNumber,
      invoiceDate: supplierInvoices.invoiceDate,
      dueDate: supplierInvoices.dueDate,
      totalAmount: supplierInvoices.totalAmount,
      paidAmount: supplierInvoices.paidAmount,
      balance: supplierInvoices.balance,
      status: supplierInvoices.status,
      paymentTermsDays: supplierInvoices.paymentTermsDays,
      currency: supplierInvoices.currency,
      rtvCreditAmount: supplierInvoices.rtvCreditAmount,
      notes: supplierInvoices.notes,
      // SOA billing flags — the UI uses these to grey out rows already
      // on a previous supplier SOA and to power the Select Unbilled shortcut.
      billed: supplierInvoices.billed,
      billedSoaId: supplierInvoices.billedSoaId,
      createdAt: supplierInvoices.createdAt,
    })
    .from(supplierInvoices)
    .innerJoin(suppliers, eq(supplierInvoices.supplierId, suppliers.id))
    .where(and(...conditions))
    .orderBy(desc(supplierInvoices.createdAt), desc(supplierInvoices.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? data[data.length - 1].id : null;

  return { data, nextCursor, hasMore };
}

export async function getInvoice(orgId: string, id: string) {
  const [invoice] = await db
    .select({
      id: supplierInvoices.id,
      orgId: supplierInvoices.orgId,
      supplierId: supplierInvoices.supplierId,
      supplierName: suppliers.name,
      invoiceNumber: supplierInvoices.invoiceNumber,
      invoiceDate: supplierInvoices.invoiceDate,
      dueDate: supplierInvoices.dueDate,
      totalAmount: supplierInvoices.totalAmount,
      paidAmount: supplierInvoices.paidAmount,
      balance: supplierInvoices.balance,
      status: supplierInvoices.status,
      paymentTermsDays: supplierInvoices.paymentTermsDays,
      currency: supplierInvoices.currency,
      sourcePoId: supplierInvoices.sourcePoId,
      sourceReceiptId: supplierInvoices.sourceReceiptId,
      rtvCreditAmount: supplierInvoices.rtvCreditAmount,
      notes: supplierInvoices.notes,
      recordedBy: supplierInvoices.recordedBy,
      createdAt: supplierInvoices.createdAt,
      updatedAt: supplierInvoices.updatedAt,
    })
    .from(supplierInvoices)
    .innerJoin(suppliers, eq(supplierInvoices.supplierId, suppliers.id))
    .where(and(eq(supplierInvoices.id, id), eq(supplierInvoices.orgId, orgId)))
    .limit(1);

  if (!invoice) return null;

  // Payment history: CV lines referencing this invoice
  const payments = await db
    .select({
      cvLineId: checkVoucherLines.id,
      checkVoucherId: checkVoucherLines.checkVoucherId,
      cvNumber: checkVouchers.cvNumber,
      checkDate: checkVouchers.checkDate,
      checkNumber: checkVouchers.checkNumber,
      bankName: checkVouchers.bankName,
      amount: checkVoucherLines.amount,
      deductionAmount: checkVoucherLines.deductionAmount,
      deductionReason: checkVoucherLines.deductionReason,
      cvStatus: checkVouchers.status,
      clearedAt: checkVouchers.clearedAt,
    })
    .from(checkVoucherLines)
    .innerJoin(checkVouchers, eq(checkVoucherLines.checkVoucherId, checkVouchers.id))
    .where(
      and(
        eq(checkVoucherLines.supplierInvoiceId, id),
        eq(checkVouchers.orgId, orgId),
      ),
    )
    .orderBy(desc(checkVouchers.checkDate));

  return { ...invoice, payments };
}

export async function createInvoice(
  orgId: string,
  userId: string,
  data: {
    supplierId: string;
    invoiceNumber: string;
    invoiceDate: string;
    totalAmount: string;
    paymentTermsDays?: number;
    currency?: string;
    sourcePoId?: string;
    sourceReceiptId?: string;
    notes?: string;
  },
) {
  // Validate supplier belongs to org and fetch their payment terms
  const [supplier] = await db
    .select({ id: suppliers.id, paymentTermsDays: suppliers.paymentTermsDays })
    .from(suppliers)
    .where(and(eq(suppliers.id, data.supplierId), eq(suppliers.orgId, orgId)))
    .limit(1);

  if (!supplier) throw new Error("Supplier not found");

  // Check duplicate invoice number for this supplier
  const [dup] = await db
    .select({ id: supplierInvoices.id })
    .from(supplierInvoices)
    .where(
      and(
        eq(supplierInvoices.orgId, orgId),
        eq(supplierInvoices.supplierId, data.supplierId),
        eq(supplierInvoices.invoiceNumber, data.invoiceNumber),
      ),
    )
    .limit(1);

  if (dup) throw new Error("Duplicate invoice number for this supplier");

  // Calculate due date — use explicit param > supplier's terms > default 30
  const invoiceDateObj = new Date(data.invoiceDate);
  const termsDays = data.paymentTermsDays ?? supplier.paymentTermsDays ?? 30;
  const dueDateObj = new Date(invoiceDateObj);
  dueDateObj.setDate(dueDateObj.getDate() + termsDays);
  const dueDate = dueDateObj.toISOString().split("T")[0];

  const [invoice] = await db
    .insert(supplierInvoices)
    .values({
      orgId,
      supplierId: data.supplierId,
      invoiceNumber: data.invoiceNumber,
      invoiceDate: data.invoiceDate,
      dueDate,
      totalAmount: data.totalAmount,
      balance: data.totalAmount,
      paymentTermsDays: termsDays,
      currency: data.currency ?? "PHP",
      sourcePoId: data.sourcePoId ?? null,
      sourceReceiptId: data.sourceReceiptId ?? null,
      notes: data.notes ?? null,
      recordedBy: userId,
    })
    .returning();

  return invoice;
}

export async function updateInvoice(
  orgId: string,
  id: string,
  data: {
    invoiceNumber?: string;
    invoiceDate?: string;
    totalAmount?: string;
    paymentTermsDays?: number;
    notes?: string;
  },
) {
  const [invoice] = await db
    .select()
    .from(supplierInvoices)
    .where(and(eq(supplierInvoices.id, id), eq(supplierInvoices.orgId, orgId)))
    .limit(1);

  if (!invoice) throw new Error("Invoice not found");
  if (invoice.status !== "OPEN") throw new Error("Can only edit OPEN invoices");

  const updates: Record<string, any> = {};

  if (data.invoiceNumber !== undefined) updates.invoiceNumber = data.invoiceNumber;
  if (data.notes !== undefined) updates.notes = data.notes;
  if (data.paymentTermsDays !== undefined) updates.paymentTermsDays = data.paymentTermsDays;

  if (data.invoiceDate !== undefined || data.paymentTermsDays !== undefined) {
    const invDate = data.invoiceDate ?? invoice.invoiceDate;
    const terms = data.paymentTermsDays ?? invoice.paymentTermsDays ?? 30;
    const d = new Date(invDate);
    d.setDate(d.getDate() + terms);
    updates.dueDate = d.toISOString().split("T")[0];
    if (data.invoiceDate !== undefined) updates.invoiceDate = data.invoiceDate;
  }

  if (data.totalAmount !== undefined) {
    updates.totalAmount = data.totalAmount;
    // Recalc balance: new total - already paid
    const paid = parseFloat(invoice.paidAmount);
    const rtvCredit = parseFloat(invoice.rtvCreditAmount);
    updates.balance = String(parseFloat(data.totalAmount) - paid - rtvCredit);
  }

  if (Object.keys(updates).length === 0) return invoice;

  const [updated] = await db
    .update(supplierInvoices)
    .set(updates)
    .where(eq(supplierInvoices.id, id))
    .returning();

  return updated;
}

export async function voidInvoice(orgId: string, id: string) {
  const [invoice] = await db
    .select()
    .from(supplierInvoices)
    .where(and(eq(supplierInvoices.id, id), eq(supplierInvoices.orgId, orgId)))
    .limit(1);

  if (!invoice) throw new Error("Invoice not found");
  if (invoice.status === "VOIDED") throw new Error("Invoice already voided");
  if (invoice.status === "PAID") throw new Error("Cannot void a fully paid invoice");

  // Check no cleared CVs reference this invoice
  const clearedCvs = await db
    .select({ id: checkVoucherLines.id })
    .from(checkVoucherLines)
    .innerJoin(checkVouchers, eq(checkVoucherLines.checkVoucherId, checkVouchers.id))
    .where(
      and(
        eq(checkVoucherLines.supplierInvoiceId, id),
        eq(checkVouchers.status, "CLEARED"),
      ),
    )
    .limit(1);

  if (clearedCvs.length > 0) {
    throw new Error("Cannot void invoice with cleared check vouchers");
  }

  const [updated] = await db
    .update(supplierInvoices)
    .set({ status: "VOIDED" })
    .where(eq(supplierInvoices.id, id))
    .returning();

  return updated;
}

// ════════════════════════════════════════════════════════════════════
// BULK MARK AS PAID (COD / Cash payments)
// ════════════════════════════════════════════════════════════════════

/**
 * Directly mark multiple invoices as fully paid, bypassing the CV workflow.
 * Designed for COD / cash suppliers where the full check-voucher pipeline
 * is unnecessary.  Runs inside a single transaction for atomicity.
 *
 * Payment math mirrors `clearCheckVoucher`:
 *   newPaid  = paidAmount + balance   (pay full remaining)
 *   balance  = 0
 *   status   = "PAID"
 */
export async function bulkMarkInvoicesPaid(
  orgId: string,
  userId: string,
  data: {
    invoiceIds: string[];
    useInvoiceDateAsPaymentDate: boolean;
    paymentDate?: string;
    paymentMethod?: string;
    referenceNumber?: string;
    notes?: string;
  },
) {
  if (!data.invoiceIds.length) throw new Error("No invoice IDs provided");
  if (data.invoiceIds.length > 100) throw new Error("Maximum 100 invoices per request");

  return await db.transaction(async (tx) => {
    // Fetch all requested invoices in one round-trip
    const invoices = await tx
      .select()
      .from(supplierInvoices)
      .where(
        and(
          inArray(supplierInvoices.id, data.invoiceIds),
          eq(supplierInvoices.orgId, orgId),
        ),
      );

    const foundIds = new Set(invoices.map((inv) => inv.id));

    let successCount = 0;
    let skippedCount = 0;
    const skippedIds: string[] = [];
    let totalAmountPaid = 0;

    // IDs not found in DB → skip
    for (const id of data.invoiceIds) {
      if (!foundIds.has(id)) {
        skippedCount++;
        skippedIds.push(id);
      }
    }

    for (const inv of invoices) {
      // Skip already-settled invoices
      if (inv.status === "PAID" || inv.status === "VOIDED") {
        skippedCount++;
        skippedIds.push(inv.id);
        continue;
      }

      const currentBalance = parseFloat(inv.balance);
      if (currentBalance <= 0) {
        skippedCount++;
        skippedIds.push(inv.id);
        continue;
      }

      // Mirror clearCheckVoucher math (lines 778-789 in this file)
      const newPaid = parseFloat(inv.paidAmount) + currentBalance;

      // Determine payment date
      const payDate = data.useInvoiceDateAsPaymentDate
        ? inv.invoiceDate          // COD: paid on delivery day
        : (data.paymentDate ?? new Date().toISOString().split("T")[0]);

      // Build audit note
      const parts = [`[Bulk Paid: ${payDate}`];
      if (data.paymentMethod) parts.push(data.paymentMethod);
      if (data.referenceNumber) parts.push(`Ref#${data.referenceNumber}`);
      parts[parts.length - 1] += "]";
      const auditNote = parts.join(", ");

      const existingNotes = inv.notes ?? "";
      const updatedNotes = existingNotes
        ? `${existingNotes}\n${auditNote}`
        : auditNote;
      if (data.notes) {
        // Append user-supplied notes after the audit line
        updatedNotes.trimEnd();
      }

      await tx
        .update(supplierInvoices)
        .set({
          paidAmount: String(newPaid.toFixed(2)),
          balance: "0.00",
          status: "PAID",
          notes: data.notes
            ? `${updatedNotes}\n${data.notes}`
            : updatedNotes,
        })
        .where(eq(supplierInvoices.id, inv.id));

      totalAmountPaid += currentBalance;
      successCount++;
    }

    return {
      successCount,
      skippedCount,
      skippedIds,
      totalAmountPaid: parseFloat(totalAmountPaid.toFixed(2)),
    };
  });
}

// ════════════════════════════════════════════════════════════════════
// BULK UPDATE SUPPLIER TERMS
// ════════════════════════════════════════════════════════════════════

/**
 * Set payment_terms_days on multiple suppliers at once.
 * Single UPDATE query — no loop, no transaction needed.
 */
export async function bulkUpdateSupplierTerms(
  orgId: string,
  data: { supplierIds: string[]; paymentTermsDays: number },
) {
  if (!data.supplierIds.length) throw new Error("No supplier IDs provided");
  if (data.supplierIds.length > 200) throw new Error("Maximum 200 suppliers per request");
  if (data.paymentTermsDays < 0) throw new Error("paymentTermsDays must be >= 0");

  const result = await db
    .update(suppliers)
    .set({ paymentTermsDays: data.paymentTermsDays })
    .where(
      and(
        inArray(suppliers.id, data.supplierIds),
        eq(suppliers.orgId, orgId),
      ),
    );

  return { updatedCount: (result as any).count ?? data.supplierIds.length };
}

// ════════════════════════════════════════════════════════════════════
// CHECK VOUCHERS
// ════════════════════════════════════════════════════════════════════

export async function generateCvNumber(tx: DbOrTx, orgId: string): Promise<string> {
  const year = new Date().getFullYear();

  // Upsert with FOR UPDATE
  await tx.execute(
    sql`INSERT INTO cv_number_sequence (org_id, year, last_number)
        VALUES (${orgId}, ${year}, 0)
        ON CONFLICT (org_id, year) DO NOTHING`,
  );

  const rows = await tx.execute(
    sql`SELECT last_number FROM cv_number_sequence
        WHERE org_id = ${orgId} AND year = ${year}
        FOR UPDATE`,
  );

  const current = (rows[0] as any).last_number as number;
  const next = current + 1;

  await tx.execute(
    sql`UPDATE cv_number_sequence SET last_number = ${next}
        WHERE org_id = ${orgId} AND year = ${year}`,
  );

  return `CV-${year}-${String(next).padStart(6, "0")}`;
}

export interface CvFilters {
  status?: string;
  supplierId?: string;
  dateFrom?: string;
  dateTo?: string;
}

export async function listCheckVouchers(
  orgId: string,
  filters: CvFilters,
  cursor?: string,
  limit = 50,
) {
  const conditions: SQL[] = [eq(checkVouchers.orgId, orgId)];

  if (filters.status) {
    const statuses = filters.status.split(",").filter(Boolean);
    if (statuses.length === 1) {
      conditions.push(eq(checkVouchers.status, statuses[0] as any));
    } else if (statuses.length > 1) {
      conditions.push(inArray(checkVouchers.status, statuses as any));
    }
  }

  if (filters.supplierId) {
    conditions.push(eq(checkVouchers.supplierId, filters.supplierId));
  }

  if (filters.dateFrom) {
    conditions.push(gte(checkVouchers.checkDate, filters.dateFrom));
  }
  if (filters.dateTo) {
    conditions.push(lte(checkVouchers.checkDate, filters.dateTo));
  }

  if (cursor) {
    conditions.push(lt(checkVouchers.id, cursor));
  }

  const rows = await db
    .select({
      id: checkVouchers.id,
      orgId: checkVouchers.orgId,
      cvNumber: checkVouchers.cvNumber,
      supplierId: checkVouchers.supplierId,
      supplierName: suppliers.name,
      checkDate: checkVouchers.checkDate,
      checkNumber: checkVouchers.checkNumber,
      bankName: checkVouchers.bankName,
      bankAccount: checkVouchers.bankAccount,
      totalAmount: checkVouchers.totalAmount,
      deductions: checkVouchers.deductions,
      netAmount: checkVouchers.netAmount,
      status: checkVouchers.status,
      approvedBy: checkVouchers.approvedBy,
      approvedAt: checkVouchers.approvedAt,
      notes: checkVouchers.notes,
      preparedBy: checkVouchers.preparedBy,
      createdAt: checkVouchers.createdAt,
    })
    .from(checkVouchers)
    .innerJoin(suppliers, eq(checkVouchers.supplierId, suppliers.id))
    .where(and(...conditions))
    .orderBy(desc(checkVouchers.createdAt), desc(checkVouchers.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? data[data.length - 1].id : null;

  return { data, nextCursor, hasMore };
}

export async function getCheckVoucher(orgId: string, id: string) {
  const [cv] = await db
    .select({
      id: checkVouchers.id,
      orgId: checkVouchers.orgId,
      cvNumber: checkVouchers.cvNumber,
      supplierId: checkVouchers.supplierId,
      supplierName: suppliers.name,
      checkDate: checkVouchers.checkDate,
      checkNumber: checkVouchers.checkNumber,
      bankName: checkVouchers.bankName,
      bankAccount: checkVouchers.bankAccount,
      totalAmount: checkVouchers.totalAmount,
      deductions: checkVouchers.deductions,
      netAmount: checkVouchers.netAmount,
      status: checkVouchers.status,
      approvedBy: checkVouchers.approvedBy,
      approvedAt: checkVouchers.approvedAt,
      printedAt: checkVouchers.printedAt,
      releasedAt: checkVouchers.releasedAt,
      clearedAt: checkVouchers.clearedAt,
      voidedAt: checkVouchers.voidedAt,
      voidedBy: checkVouchers.voidedBy,
      voidReason: checkVouchers.voidReason,
      notes: checkVouchers.notes,
      preparedBy: checkVouchers.preparedBy,
      createdAt: checkVouchers.createdAt,
      updatedAt: checkVouchers.updatedAt,
    })
    .from(checkVouchers)
    .innerJoin(suppliers, eq(checkVouchers.supplierId, suppliers.id))
    .where(and(eq(checkVouchers.id, id), eq(checkVouchers.orgId, orgId)))
    .limit(1);

  if (!cv) return null;

  // Lines joined to invoices
  const lines = await db
    .select({
      id: checkVoucherLines.id,
      supplierInvoiceId: checkVoucherLines.supplierInvoiceId,
      invoiceNumber: supplierInvoices.invoiceNumber,
      invoiceDate: supplierInvoices.invoiceDate,
      invoiceTotalAmount: supplierInvoices.totalAmount,
      invoiceBalance: supplierInvoices.balance,
      amount: checkVoucherLines.amount,
      deductionAmount: checkVoucherLines.deductionAmount,
      deductionReason: checkVoucherLines.deductionReason,
    })
    .from(checkVoucherLines)
    .innerJoin(supplierInvoices, eq(checkVoucherLines.supplierInvoiceId, supplierInvoices.id))
    .where(eq(checkVoucherLines.checkVoucherId, id))
    .orderBy(asc(supplierInvoices.invoiceDate));

  // Compute amount in words
  const amountInWords = numberToWords(parseFloat(cv.netAmount));

  return { ...cv, lines, amountInWords };
}

export async function createCheckVoucher(
  orgId: string,
  userId: string,
  data: {
    supplierId: string;
    checkDate: string;
    checkNumber?: string;
    bankName?: string;
    bankAccount?: string;
    notes?: string;
    lines: Array<{
      supplierInvoiceId: string;
      amount: string;
      deductionAmount?: string;
      deductionReason?: string;
    }>;
  },
) {
  if (!data.lines || data.lines.length === 0) {
    throw new Error("At least one invoice line is required");
  }

  // Validate supplier
  const [supplier] = await db
    .select({ id: suppliers.id })
    .from(suppliers)
    .where(and(eq(suppliers.id, data.supplierId), eq(suppliers.orgId, orgId)))
    .limit(1);

  if (!supplier) throw new Error("Supplier not found");

  // Validate all invoices belong to same supplier and check balances
  const invoiceIds = data.lines.map((l) => l.supplierInvoiceId);
  const invoiceRows = await db
    .select()
    .from(supplierInvoices)
    .where(
      and(
        eq(supplierInvoices.orgId, orgId),
        inArray(supplierInvoices.id, invoiceIds),
      ),
    );

  if (invoiceRows.length !== invoiceIds.length) {
    throw new Error("One or more invoices not found");
  }

  const invoiceMap = new Map(invoiceRows.map((i) => [i.id, i]));
  for (const line of data.lines) {
    const inv = invoiceMap.get(line.supplierInvoiceId)!;
    if (inv.supplierId !== data.supplierId) {
      throw new Error(`Invoice ${inv.invoiceNumber} belongs to a different supplier`);
    }
    if (!["OPEN", "PARTIALLY_PAID"].includes(inv.status)) {
      throw new Error(`Invoice ${inv.invoiceNumber} is not payable (status: ${inv.status})`);
    }
    const lineAmount = parseFloat(line.amount);
    const balance = parseFloat(inv.balance);
    if (lineAmount > balance) {
      throw new Error(
        `Amount ${line.amount} exceeds balance ${inv.balance} for invoice ${inv.invoiceNumber}`,
      );
    }
  }

  // Calculate totals
  let totalAmount = 0;
  let totalDeductions = 0;
  for (const line of data.lines) {
    totalAmount += parseFloat(line.amount);
    totalDeductions += parseFloat(line.deductionAmount ?? "0");
  }
  const netAmount = totalAmount - totalDeductions;

  return await db.transaction(async (tx) => {
    const cvNumber = await generateCvNumber(tx, orgId);

    const [cv] = await tx
      .insert(checkVouchers)
      .values({
        orgId,
        cvNumber,
        supplierId: data.supplierId,
        checkDate: data.checkDate,
        checkNumber: data.checkNumber ?? null,
        bankName: data.bankName ?? null,
        bankAccount: data.bankAccount ?? null,
        totalAmount: String(totalAmount.toFixed(2)),
        deductions: String(totalDeductions.toFixed(2)),
        netAmount: String(netAmount.toFixed(2)),
        status: "DRAFT",
        notes: data.notes ?? null,
        preparedBy: userId,
      })
      .returning();

    // Insert lines
    for (const line of data.lines) {
      await tx.insert(checkVoucherLines).values({
        checkVoucherId: cv.id,
        supplierInvoiceId: line.supplierInvoiceId,
        amount: line.amount,
        deductionAmount: line.deductionAmount ?? "0",
        deductionReason: line.deductionReason ?? null,
      });
    }

    return cv;
  });
}

export async function updateCheckVoucher(
  orgId: string,
  id: string,
  data: {
    checkDate?: string;
    checkNumber?: string;
    bankName?: string;
    bankAccount?: string;
    notes?: string;
  },
) {
  const [cv] = await db
    .select()
    .from(checkVouchers)
    .where(and(eq(checkVouchers.id, id), eq(checkVouchers.orgId, orgId)))
    .limit(1);

  if (!cv) throw new Error("Check voucher not found");
  if (cv.status !== "DRAFT") throw new Error("Can only edit DRAFT check vouchers");

  const updates: Record<string, any> = {};
  if (data.checkDate !== undefined) updates.checkDate = data.checkDate;
  if (data.checkNumber !== undefined) updates.checkNumber = data.checkNumber;
  if (data.bankName !== undefined) updates.bankName = data.bankName;
  if (data.bankAccount !== undefined) updates.bankAccount = data.bankAccount;
  if (data.notes !== undefined) updates.notes = data.notes;

  if (Object.keys(updates).length === 0) return cv;

  const [updated] = await db
    .update(checkVouchers)
    .set(updates)
    .where(eq(checkVouchers.id, id))
    .returning();

  return updated;
}

export async function deleteCheckVoucher(orgId: string, id: string) {
  const [cv] = await db
    .select()
    .from(checkVouchers)
    .where(and(eq(checkVouchers.id, id), eq(checkVouchers.orgId, orgId)))
    .limit(1);

  if (!cv) throw new Error("Check voucher not found");
  if (cv.status !== "DRAFT") throw new Error("Can only delete DRAFT check vouchers");

  await db.delete(checkVouchers).where(eq(checkVouchers.id, id));
}

export async function approveCheckVoucher(orgId: string, id: string, approvedBy: string) {
  const [cv] = await db
    .select()
    .from(checkVouchers)
    .where(and(eq(checkVouchers.id, id), eq(checkVouchers.orgId, orgId)))
    .limit(1);

  if (!cv) throw new Error("Check voucher not found");
  if (cv.status !== "DRAFT") throw new Error("Can only approve DRAFT check vouchers");

  const [updated] = await db
    .update(checkVouchers)
    .set({ status: "APPROVED", approvedBy, approvedAt: new Date() })
    .where(eq(checkVouchers.id, id))
    .returning();

  return updated;
}

export async function markPrinted(orgId: string, id: string) {
  const [cv] = await db
    .select()
    .from(checkVouchers)
    .where(and(eq(checkVouchers.id, id), eq(checkVouchers.orgId, orgId)))
    .limit(1);

  if (!cv) throw new Error("Check voucher not found");
  if (cv.status !== "APPROVED") throw new Error("Can only print APPROVED check vouchers");

  const [updated] = await db
    .update(checkVouchers)
    .set({ status: "PRINTED", printedAt: new Date() })
    .where(eq(checkVouchers.id, id))
    .returning();

  return updated;
}

export async function releaseCheckVoucher(orgId: string, id: string) {
  const [cv] = await db
    .select()
    .from(checkVouchers)
    .where(and(eq(checkVouchers.id, id), eq(checkVouchers.orgId, orgId)))
    .limit(1);

  if (!cv) throw new Error("Check voucher not found");
  if (cv.status !== "PRINTED") throw new Error("Can only release PRINTED check vouchers");

  const [updated] = await db
    .update(checkVouchers)
    .set({ status: "RELEASED", releasedAt: new Date() })
    .where(eq(checkVouchers.id, id))
    .returning();

  return updated;
}

export async function clearCheckVoucher(orgId: string, id: string) {
  const [cv] = await db
    .select()
    .from(checkVouchers)
    .where(and(eq(checkVouchers.id, id), eq(checkVouchers.orgId, orgId)))
    .limit(1);

  if (!cv) throw new Error("Check voucher not found");
  if (cv.status !== "RELEASED") throw new Error("Can only clear RELEASED check vouchers");

  return await db.transaction(async (tx) => {
    // Update each invoice's paid_amount, balance, and status
    const lines = await tx
      .select()
      .from(checkVoucherLines)
      .where(eq(checkVoucherLines.checkVoucherId, id));

    for (const line of lines) {
      const [inv] = await tx
        .select()
        .from(supplierInvoices)
        .where(eq(supplierInvoices.id, line.supplierInvoiceId))
        .limit(1);

      if (!inv) continue;

      const newPaid = parseFloat(inv.paidAmount) + parseFloat(line.amount);
      const newBalance = parseFloat(inv.totalAmount) - newPaid - parseFloat(inv.rtvCreditAmount);
      const newStatus = newBalance <= 0 ? "PAID" : "PARTIALLY_PAID";

      await tx
        .update(supplierInvoices)
        .set({
          paidAmount: String(newPaid.toFixed(2)),
          balance: String(Math.max(0, newBalance).toFixed(2)),
          status: newStatus,
        })
        .where(eq(supplierInvoices.id, line.supplierInvoiceId));
    }

    const [updated] = await tx
      .update(checkVouchers)
      .set({ status: "CLEARED", clearedAt: new Date() })
      .where(eq(checkVouchers.id, id))
      .returning();

    return updated;
  });
}

export async function voidCheckVoucher(
  orgId: string,
  id: string,
  userId: string,
  reason: string,
) {
  const [cv] = await db
    .select()
    .from(checkVouchers)
    .where(and(eq(checkVouchers.id, id), eq(checkVouchers.orgId, orgId)))
    .limit(1);

  if (!cv) throw new Error("Check voucher not found");
  if (cv.status === "CLEARED") throw new Error("Cannot void a CLEARED check voucher");
  if (cv.status === "VOIDED") throw new Error("Check voucher already voided");

  const [updated] = await db
    .update(checkVouchers)
    .set({
      status: "VOIDED",
      voidedAt: new Date(),
      voidedBy: userId,
      voidReason: reason,
    })
    .where(eq(checkVouchers.id, id))
    .returning();

  return updated;
}

// ════════════════════════════════════════════════════════════════════
// REPORTS
// ════════════════════════════════════════════════════════════════════

export async function getAgingReport(orgId: string) {
  // Raw SQL returns snake_case column names. We map to camelCase here so
  // the frontend can consume the data directly without guessing field names.
  const rows = (await db.execute(
    sql`
      SELECT
        si.supplier_id,
        s.name AS supplier_name,
        SUM(CASE WHEN si.due_date >= CURRENT_DATE THEN si.balance::numeric ELSE 0 END) AS "current",
        SUM(CASE WHEN CURRENT_DATE - si.due_date BETWEEN 1 AND 30 THEN si.balance::numeric ELSE 0 END) AS "days_1_30",
        SUM(CASE WHEN CURRENT_DATE - si.due_date BETWEEN 31 AND 60 THEN si.balance::numeric ELSE 0 END) AS "days_31_60",
        SUM(CASE WHEN CURRENT_DATE - si.due_date BETWEEN 61 AND 90 THEN si.balance::numeric ELSE 0 END) AS "days_61_90",
        SUM(CASE WHEN CURRENT_DATE - si.due_date BETWEEN 91 AND 120 THEN si.balance::numeric ELSE 0 END) AS "days_91_120",
        SUM(CASE WHEN CURRENT_DATE - si.due_date BETWEEN 121 AND 180 THEN si.balance::numeric ELSE 0 END) AS "days_121_180",
        SUM(CASE WHEN CURRENT_DATE - si.due_date > 180 THEN si.balance::numeric ELSE 0 END) AS "days_180_plus",
        SUM(si.balance::numeric) AS total
      FROM supplier_invoices si
      JOIN suppliers s ON si.supplier_id = s.id
      WHERE si.org_id = ${orgId}
        AND si.status IN ('OPEN', 'PARTIALLY_PAID')
      GROUP BY si.supplier_id, s.name
      ORDER BY total DESC
    `,
  )) as any[];

  return {
    data: rows.map((r: any) => ({
      supplierId: r.supplier_id,
      supplierName: r.supplier_name,
      current: parseFloat(r.current ?? "0"),
      days1to30: parseFloat(r.days_1_30 ?? "0"),
      days31to60: parseFloat(r.days_31_60 ?? "0"),
      days61to90: parseFloat(r.days_61_90 ?? "0"),
      days91to120: parseFloat(r.days_91_120 ?? "0"),
      days121to180: parseFloat(r.days_121_180 ?? "0"),
      over180: parseFloat(r.days_180_plus ?? "0"),
      total: parseFloat(r.total ?? "0"),
    })),
  };
}

export async function getSupplierSOA(
  orgId: string,
  supplierId: string,
  dateFrom?: string,
  dateTo?: string,
) {
  // Validate supplier
  const [supplier] = await db
    .select({ id: suppliers.id, name: suppliers.name })
    .from(suppliers)
    .where(and(eq(suppliers.id, supplierId), eq(suppliers.orgId, orgId)))
    .limit(1);

  if (!supplier) throw new Error("Supplier not found");

  const dateConditions: SQL[] = [];
  if (dateFrom) dateConditions.push(sql`si.invoice_date >= ${dateFrom}`);
  if (dateTo) dateConditions.push(sql`si.invoice_date <= ${dateTo}`);
  const dateWhere = dateConditions.length > 0
    ? sql.join([sql`AND`, ...dateConditions.map((c, i) =>
        i > 0 ? sql` AND ${c}` : c
      )], sql` `)
    : sql``;

  // Invoices (debits)
  const invoices = await db
    .select({
      id: supplierInvoices.id,
      invoiceNumber: supplierInvoices.invoiceNumber,
      invoiceDate: supplierInvoices.invoiceDate,
      totalAmount: supplierInvoices.totalAmount,
      paidAmount: supplierInvoices.paidAmount,
      balance: supplierInvoices.balance,
      status: supplierInvoices.status,
      rtvCreditAmount: supplierInvoices.rtvCreditAmount,
    })
    .from(supplierInvoices)
    .where(
      and(
        eq(supplierInvoices.orgId, orgId),
        eq(supplierInvoices.supplierId, supplierId),
        ...(dateFrom ? [gte(supplierInvoices.invoiceDate, dateFrom)] : []),
        ...(dateTo ? [lte(supplierInvoices.invoiceDate, dateTo)] : []),
      ),
    )
    .orderBy(asc(supplierInvoices.invoiceDate));

  // Cleared CV payments (credits)
  const payments = await db
    .select({
      cvId: checkVouchers.id,
      cvNumber: checkVouchers.cvNumber,
      checkDate: checkVouchers.checkDate,
      checkNumber: checkVouchers.checkNumber,
      netAmount: checkVouchers.netAmount,
      clearedAt: checkVouchers.clearedAt,
    })
    .from(checkVouchers)
    .where(
      and(
        eq(checkVouchers.orgId, orgId),
        eq(checkVouchers.supplierId, supplierId),
        eq(checkVouchers.status, "CLEARED"),
        ...(dateFrom ? [gte(checkVouchers.checkDate, dateFrom)] : []),
        ...(dateTo ? [lte(checkVouchers.checkDate, dateTo)] : []),
      ),
    )
    .orderBy(asc(checkVouchers.checkDate));

  // RTV credits
  const rtvCredits = await db
    .select({
      id: supplierReturns.id,
      rtvNumber: supplierReturns.rtvNumber,
      creditAmount: supplierReturns.creditAmount,
      creditReceivedAt: supplierReturns.creditReceivedAt,
      status: supplierReturns.status,
    })
    .from(supplierReturns)
    .where(
      and(
        eq(supplierReturns.orgId, orgId),
        eq(supplierReturns.supplierId, supplierId),
        inArray(supplierReturns.status, ["CREDIT_RECEIVED", "CLOSED"]),
      ),
    )
    .orderBy(asc(supplierReturns.creditReceivedAt));

  // Build SOA entries with running balance
  type SoaEntry = {
    date: string;
    reference: string;
    type: "DEBIT" | "CREDIT";
    amount: string;
    runningBalance: string;
  };

  const entries: SoaEntry[] = [];

  for (const inv of invoices) {
    entries.push({
      date: inv.invoiceDate,
      reference: `INV ${inv.invoiceNumber}`,
      type: "DEBIT",
      amount: inv.totalAmount,
      runningBalance: "0", // computed below
    });
  }

  for (const pmt of payments) {
    entries.push({
      date: pmt.checkDate,
      reference: `CV ${pmt.cvNumber}${pmt.checkNumber ? ` (CHK ${pmt.checkNumber})` : ""}`,
      type: "CREDIT",
      amount: pmt.netAmount,
      runningBalance: "0",
    });
  }

  for (const rtv of rtvCredits) {
    if (parseFloat(rtv.creditAmount) > 0) {
      entries.push({
        date: rtv.creditReceivedAt?.toISOString().split("T")[0] ?? "",
        reference: `RTV ${rtv.rtvNumber}`,
        type: "CREDIT",
        amount: rtv.creditAmount,
        runningBalance: "0",
      });
    }
  }

  // Sort by date
  entries.sort((a, b) => a.date.localeCompare(b.date));

  // Compute running balance
  let balance = 0;
  for (const entry of entries) {
    if (entry.type === "DEBIT") {
      balance += parseFloat(entry.amount);
    } else {
      balance -= parseFloat(entry.amount);
    }
    entry.runningBalance = balance.toFixed(2);
  }

  return {
    supplier: { id: supplier.id, name: supplier.name },
    entries,
    closingBalance: balance.toFixed(2),
  };
}

/**
 * Supplier SOA overview — all suppliers with outstanding balances, grouped.
 */
export async function getSupplierSOAOverview(orgId: string) {
  const rows = await db.execute(sql`
    SELECT
      s.id AS supplier_id,
      s.name AS supplier_name,
      s.contact_email,
      s.contact_phone,
      s.address,
      COUNT(si.id)::int AS invoice_count,
      COALESCE(SUM(si.balance::numeric), 0)::numeric(14,2) AS total_balance,
      MIN(si.invoice_date) AS oldest_invoice_date,
      MIN(si.due_date) AS earliest_due_date,
      COUNT(CASE WHEN si.due_date < CURRENT_DATE THEN 1 END)::int AS overdue_count,
      COALESCE(SUM(CASE WHEN si.due_date < CURRENT_DATE THEN si.balance::numeric ELSE 0 END), 0)::numeric(14,2) AS overdue_amount
    FROM suppliers s
    JOIN supplier_invoices si ON si.supplier_id = s.id AND si.org_id = s.org_id
    WHERE s.org_id = ${orgId}
      AND si.status IN ('OPEN', 'PARTIALLY_PAID')
      AND si.balance::numeric > 0
    GROUP BY s.id, s.name, s.contact_email, s.contact_phone, s.address
    ORDER BY total_balance DESC
  `);

  // Summary totals
  const totalPayable = (rows as any[]).reduce((s: number, r: any) => s + parseFloat(r.total_balance), 0);
  const totalOverdue = (rows as any[]).reduce((s: number, r: any) => s + parseFloat(r.overdue_amount), 0);
  const supplierCount = rows.length;

  // Due this week
  const dueThisWeek = await db.execute(sql`
    SELECT COALESCE(SUM(balance::numeric), 0)::numeric(14,2) AS amount
    FROM supplier_invoices
    WHERE org_id = ${orgId}
      AND status IN ('OPEN', 'PARTIALLY_PAID')
      AND due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days'
  `);

  return {
    suppliers: (rows as any[]).map((r: any) => ({
      supplierId: r.supplier_id,
      supplierName: r.supplier_name,
      contactEmail: r.contact_email,
      contactPhone: r.contact_phone,
      address: r.address,
      invoiceCount: r.invoice_count,
      totalBalance: parseFloat(r.total_balance),
      oldestInvoiceDate: r.oldest_invoice_date,
      earliestDueDate: r.earliest_due_date,
      overdueCount: r.overdue_count,
      overdueAmount: parseFloat(r.overdue_amount),
    })),
    summary: {
      totalPayable: Math.round(totalPayable * 100) / 100,
      totalOverdue: Math.round(totalOverdue * 100) / 100,
      supplierCount,
      dueThisWeek: parseFloat((dueThisWeek as any[])[0]?.amount ?? "0"),
    },
  };
}

// ═══════════════════════════════════════════════════════════════
// SUPPLIER MASTER (AP list page + edit drawer)
// ═══════════════════════════════════════════════════════════════
// Full CRUD against the suppliers table lives in the procurement module
// (`listSuppliers`, `createSupplier`, `updateSupplier`, `deleteSupplier`).
// This section adds AP-flavored extensions that the Supplier List page needs:
// per-supplier rollups (invoice counts, payables, oldest overdue, status)
// and an update path that covers the new AP fields (contact_person, tin,
// payment_terms_days, credit_limit, bank details, notes, is_active).

/**
 * Supplier list with per-row AP stats — for the Supplier List page.
 *
 * Returns ALL suppliers (including inactive) so the UI can offer a toggle
 * to include deactivated rows. Sorting / filtering / search is done
 * client-side since a typical business has fewer than a few hundred
 * suppliers.
 */
export async function listSuppliersWithAPStats(orgId: string) {
  const rows = (await db.execute(sql`
    SELECT
      s.id,
      s.name,
      s.contact_person,
      s.contact_phone,
      s.contact_email,
      s.address,
      s.tin,
      s.mnemonic_code,
      s.payment_terms_days,
      s.credit_limit::text AS credit_limit,
      s.bank_name,
      s.bank_account_number,
      s.bank_account_name,
      s.notes,
      s.is_active,
      s.created_at,
      s.updated_at,

      -- Invoice rollups (only count non-void invoices)
      COALESCE(agg.open_count, 0)::int        AS open_count,
      COALESCE(agg.total_payable, 0)::text    AS total_payable,
      COALESCE(agg.overdue_count, 0)::int     AS overdue_count,
      COALESCE(agg.overdue_amount, 0)::text   AS overdue_amount,
      agg.oldest_overdue_date::text           AS oldest_overdue_date
    FROM suppliers s
    LEFT JOIN (
      SELECT
        supplier_id,
        COUNT(*) FILTER (WHERE status IN ('OPEN','PARTIALLY_PAID'))::int AS open_count,
        SUM(balance::numeric) FILTER (WHERE status IN ('OPEN','PARTIALLY_PAID')) AS total_payable,
        COUNT(*) FILTER (WHERE status IN ('OPEN','PARTIALLY_PAID')
                          AND due_date < CURRENT_DATE)::int AS overdue_count,
        SUM(balance::numeric) FILTER (WHERE status IN ('OPEN','PARTIALLY_PAID')
                                        AND due_date < CURRENT_DATE) AS overdue_amount,
        MIN(due_date) FILTER (WHERE status IN ('OPEN','PARTIALLY_PAID')
                                AND due_date < CURRENT_DATE) AS oldest_overdue_date
      FROM supplier_invoices
      WHERE org_id = ${orgId}
      GROUP BY supplier_id
    ) agg ON agg.supplier_id = s.id
    WHERE s.org_id = ${orgId}
    ORDER BY s.name ASC
  `)) as any[];

  return rows.map((r: any) => ({
    id: r.id,
    name: r.name,
    contactPerson: r.contact_person,
    contactPhone: r.contact_phone,
    contactEmail: r.contact_email,
    address: r.address,
    tin: r.tin,
    mnemonicCode: r.mnemonic_code,
    paymentTermsDays: r.payment_terms_days,
    creditLimit: parseFloat(r.credit_limit),
    bankName: r.bank_name,
    bankAccountNumber: r.bank_account_number,
    bankAccountName: r.bank_account_name,
    notes: r.notes,
    isActive: r.is_active,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    // AP rollups
    openCount: r.open_count,
    totalPayable: parseFloat(r.total_payable),
    overdueCount: r.overdue_count,
    overdueAmount: parseFloat(r.overdue_amount),
    oldestOverdueDate: r.oldest_overdue_date,
  }));
}

/**
 * Get a single supplier with every AP field. Used by the detail drawer.
 */
export async function getSupplierAPDetail(orgId: string, supplierId: string) {
  const [row] = (await db.execute(sql`
    SELECT
      s.id, s.name, s.contact_person, s.contact_phone, s.contact_email,
      s.address, s.tin, s.mnemonic_code,
      s.payment_terms_days, s.credit_limit::text AS credit_limit,
      s.bank_name, s.bank_account_number, s.bank_account_name,
      s.notes, s.is_active,
      s.avg_lead_time_days,
      s.created_at, s.updated_at
    FROM suppliers s
    WHERE s.id = ${supplierId} AND s.org_id = ${orgId}
  `)) as any[];
  if (!row) return null;

  return {
    id: row.id,
    name: row.name,
    contactPerson: row.contact_person,
    contactPhone: row.contact_phone,
    contactEmail: row.contact_email,
    address: row.address,
    tin: row.tin,
    mnemonicCode: row.mnemonic_code,
    paymentTermsDays: row.payment_terms_days,
    creditLimit: parseFloat(row.credit_limit),
    bankName: row.bank_name,
    bankAccountNumber: row.bank_account_number,
    bankAccountName: row.bank_account_name,
    notes: row.notes,
    isActive: row.is_active,
    avgLeadTimeDays: row.avg_lead_time_days,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Update the AP master fields of a supplier. Partial — only the fields
 * present in `input` are touched. Uses Drizzle's typed update API which
 * picks up the expanded suppliers schema (contact_person, tin,
 * payment_terms_days, credit_limit, bank_*, notes, is_active).
 */
export async function updateSupplierAP(
  orgId: string,
  supplierId: string,
  input: {
    name?: string;
    contactPerson?: string | null;
    contactPhone?: string | null;
    contactEmail?: string | null;
    address?: string | null;
    tin?: string | null;
    mnemonicCode?: string | null;
    paymentTermsDays?: number;
    creditLimit?: string;
    bankName?: string | null;
    bankAccountNumber?: string | null;
    bankAccountName?: string | null;
    notes?: string | null;
    isActive?: boolean;
  },
) {
  const setFields: Record<string, any> = {};
  if (input.name !== undefined) setFields.name = input.name;
  if (input.contactPerson !== undefined) setFields.contactPerson = input.contactPerson;
  if (input.contactPhone !== undefined) setFields.contactPhone = input.contactPhone;
  if (input.contactEmail !== undefined) setFields.contactEmail = input.contactEmail;
  if (input.address !== undefined) setFields.address = input.address;
  if (input.tin !== undefined) setFields.tin = input.tin;
  if (input.mnemonicCode !== undefined) setFields.mnemonicCode = input.mnemonicCode;
  if (input.paymentTermsDays !== undefined) setFields.paymentTermsDays = input.paymentTermsDays;
  if (input.creditLimit !== undefined) setFields.creditLimit = input.creditLimit;
  if (input.bankName !== undefined) setFields.bankName = input.bankName;
  if (input.bankAccountNumber !== undefined) setFields.bankAccountNumber = input.bankAccountNumber;
  if (input.bankAccountName !== undefined) setFields.bankAccountName = input.bankAccountName;
  if (input.notes !== undefined) setFields.notes = input.notes;
  if (input.isActive !== undefined) setFields.isActive = input.isActive;

  if (Object.keys(setFields).length === 0) {
    throw new Error("No fields to update");
  }

  const [updated] = await db
    .update(suppliers)
    .set(setFields)
    .where(and(eq(suppliers.id, supplierId), eq(suppliers.orgId, orgId)))
    .returning();

  if (!updated) throw new Error("Supplier not found");

  return { id: updated.id, name: updated.name, isActive: updated.isActive };
}

/**
 * Create a new supplier. Thin wrapper that fills in the AP defaults if
 * not provided.
 */
export async function createSupplierAP(
  orgId: string,
  input: {
    name: string;
    contactPerson?: string | null;
    contactPhone?: string | null;
    contactEmail?: string | null;
    address?: string | null;
    tin?: string | null;
    mnemonicCode?: string | null;
    paymentTermsDays?: number;
    creditLimit?: string;
    bankName?: string | null;
    bankAccountNumber?: string | null;
    bankAccountName?: string | null;
    notes?: string | null;
  },
) {
  if (!input.name?.trim()) throw new Error("Supplier name is required");

  const [row] = (await db.execute(sql`
    INSERT INTO suppliers (
      org_id, name,
      contact_person, contact_phone, contact_email, address, tin, mnemonic_code,
      payment_terms_days, credit_limit,
      bank_name, bank_account_number, bank_account_name,
      notes, is_active
    )
    VALUES (
      ${orgId}, ${input.name.trim()},
      ${input.contactPerson ?? null}, ${input.contactPhone ?? null},
      ${input.contactEmail ?? null}, ${input.address ?? null},
      ${input.tin ?? null}, ${input.mnemonicCode ?? null},
      ${input.paymentTermsDays ?? 30}, ${input.creditLimit ?? "0.00"},
      ${input.bankName ?? null}, ${input.bankAccountNumber ?? null},
      ${input.bankAccountName ?? null},
      ${input.notes ?? null}, true
    )
    RETURNING id, name
  `)) as any[];

  return { id: row.id, name: row.name };
}

// ═══════════════════════════════════════════════════════════════
// SUPPLIER SOA HISTORY (persistent statements)
// ═══════════════════════════════════════════════════════════════
// Mirrors the customer-side SOA module (soa_records / soa_line_items).
// Generates a persistent SOA record with frozen per-invoice snapshots
// so historical reprints are deterministic even after check voucher
// releases mutate paid/balance on the underlying supplier_invoices.

/**
 * Generate a persistent Supplier SOA for the given invoice IDs.
 *
 * Every invoice must belong to the target supplier and org, and must not
 * already be billed to a previous non-void SOA. The operation runs inside
 * a transaction: on any failure, no record / line items / billed flags
 * are written.
 *
 * Returns the new SOA record plus the count of invoices attached.
 */
export async function generateSupplierSOA(
  orgId: string,
  supplierId: string,
  invoiceIds: string[],
  userId?: string,
  notes?: string,
) {
  if (invoiceIds.length === 0) {
    throw new Error("At least one invoice must be selected");
  }

  return db.transaction(async (tx) => {
    // ── Guard: supplier exists in this org ──
    const [supplier] = (await tx.execute(sql`
      SELECT id, name FROM suppliers WHERE id = ${supplierId} AND org_id = ${orgId}
    `)) as any[];
    if (!supplier) throw new Error("Supplier not found");

    // ── Load target invoices, ownership + billed guards ──
    const idList = sql.join(
      Array.from(new Set(invoiceIds)).map((id) => sql`${id}::uuid`),
      sql`, `,
    );
    const invoices = (await tx.execute(sql`
      SELECT id, supplier_id, invoice_number, invoice_date,
             total_amount::text, paid_amount::text, balance::text,
             billed, billed_soa_id
      FROM supplier_invoices
      WHERE org_id = ${orgId}
        AND id IN (${idList})
      ORDER BY invoice_date ASC, invoice_number ASC
    `)) as any[];

    if (invoices.length === 0) {
      throw new Error("No matching invoices found");
    }
    if (invoices.length !== new Set(invoiceIds).size) {
      throw new Error(
        `Expected ${new Set(invoiceIds).size} invoices, got ${invoices.length}`,
      );
    }
    for (const inv of invoices) {
      if (inv.supplier_id !== supplierId) {
        throw new Error(
          `Invoice ${inv.invoice_number} belongs to a different supplier`,
        );
      }
      if (inv.billed === true && inv.billed_soa_id !== null) {
        throw new Error(
          `Invoice ${inv.invoice_number} is already on a previous SOA`,
        );
      }
    }

    // ── Reserve the next yearly SOA number ──
    const year = new Date().getFullYear();
    const [seq] = (await tx.execute(sql`
      INSERT INTO supplier_soa_number_sequence (org_id, year, last_number)
      VALUES (${orgId}, ${year}, 1)
      ON CONFLICT (org_id, year)
      DO UPDATE SET last_number = supplier_soa_number_sequence.last_number + 1
      RETURNING last_number
    `)) as any[];
    const soaNumber = `SUPP-SOA-${year}-${String(seq.last_number).padStart(4, "0")}`;

    // ── Compute totals + date range ──
    let totalAmount = 0;
    let totalPaid = 0;
    let totalBalance = 0;
    for (const inv of invoices) {
      totalAmount += parseFloat(inv.total_amount);
      totalPaid += parseFloat(inv.paid_amount);
      totalBalance += parseFloat(inv.balance);
    }
    const dates = invoices.map((r: any) => r.invoice_date).sort();
    const dateFrom = dates[0];
    const dateTo = dates[dates.length - 1];

    // ── Insert SOA record ──
    const [soa] = (await tx.execute(sql`
      INSERT INTO supplier_soa_records (
        org_id, supplier_id, soa_number, date_from, date_to,
        generated_by, total_amount, total_paid, total_balance,
        invoice_count, notes
      ) VALUES (
        ${orgId}, ${supplierId}, ${soaNumber}, ${dateFrom}, ${dateTo},
        ${userId ?? null},
        ${totalAmount.toFixed(2)}, ${totalPaid.toFixed(2)}, ${totalBalance.toFixed(2)},
        ${invoices.length}, ${notes ?? null}
      )
      RETURNING id, soa_number, status,
                total_amount::text, total_paid::text, total_balance::text,
                invoice_count, date_from::text, date_to::text
    `)) as any[];

    // ── Insert line items with frozen snapshots + mark invoices billed ──
    for (const inv of invoices) {
      await tx.execute(sql`
        INSERT INTO supplier_soa_line_items (
          soa_id, invoice_id,
          invoice_amount, paid_at_generation, balance_at_generation
        ) VALUES (
          ${soa.id}, ${inv.id},
          ${inv.total_amount}, ${inv.paid_amount}, ${inv.balance}
        )
      `);
      await tx.execute(sql`
        UPDATE supplier_invoices
        SET billed = true, billed_soa_id = ${soa.id}
        WHERE id = ${inv.id}
      `);
    }

    return {
      id: soa.id,
      soaNumber: soa.soa_number,
      status: soa.status,
      totalAmount: parseFloat(soa.total_amount),
      totalPaid: parseFloat(soa.total_paid),
      totalBalance: parseFloat(soa.total_balance),
      invoiceCount: soa.invoice_count,
      dateFrom: soa.date_from,
      dateTo: soa.date_to,
    };
  });
}

/**
 * List persistent SOAs for a supplier (newest first).
 * Powers the SOA history mini-list in the expanded supplier detail row.
 */
export async function listSupplierSOAs(orgId: string, supplierId: string) {
  const rows = (await db.execute(sql`
    SELECT id, soa_number, date_from::text, date_to::text,
           generated_at, total_amount::text, total_paid::text,
           total_balance::text, invoice_count, status, notes
    FROM supplier_soa_records
    WHERE org_id = ${orgId} AND supplier_id = ${supplierId}
    ORDER BY generated_at DESC
  `)) as any[];

  return rows.map((r: any) => ({
    id: r.id,
    soaNumber: r.soa_number,
    dateFrom: r.date_from,
    dateTo: r.date_to,
    generatedAt: r.generated_at,
    totalAmount: parseFloat(r.total_amount),
    totalPaid: parseFloat(r.total_paid),
    totalBalance: parseFloat(r.total_balance),
    invoiceCount: r.invoice_count,
    status: r.status,
    notes: r.notes,
  }));
}

/**
 * Cross-supplier SOA search — lists ALL supplier SOAs with optional
 * search (SOA# or supplier name), status filter, and date range.
 * Powers the dedicated SOA History page.
 */
export async function listAllSupplierSOAs(
  orgId: string,
  opts: {
    search?: string;
    status?: string;
    dateFrom?: string;
    dateTo?: string;
    limit?: number;
  } = {},
) {
  const limit = Math.min(opts.limit ?? 100, 200);
  const conditions = [sql`sr.org_id = ${orgId}`];

  if (opts.search && opts.search.trim().length > 0) {
    const pattern = `%${opts.search.trim()}%`;
    conditions.push(
      sql`(sr.soa_number ILIKE ${pattern} OR s.name ILIKE ${pattern})`,
    );
  }
  if (opts.status) {
    conditions.push(sql`sr.status = ${opts.status}`);
  }
  if (opts.dateFrom) {
    conditions.push(sql`sr.generated_at >= ${opts.dateFrom}`);
  }
  if (opts.dateTo) {
    conditions.push(sql`sr.generated_at <= ${opts.dateTo}`);
  }

  const where = sql.join(conditions, sql` AND `);

  const rows = (await db.execute(sql`
    SELECT sr.id, sr.soa_number, sr.supplier_id, s.name AS supplier_name,
           sr.date_from::text, sr.date_to::text, sr.generated_at,
           sr.total_amount::text, sr.total_paid::text, sr.total_balance::text,
           sr.invoice_count, sr.status, sr.notes
    FROM supplier_soa_records sr
    JOIN suppliers s ON s.id = sr.supplier_id
    WHERE ${where}
    ORDER BY sr.generated_at DESC
    LIMIT ${limit}
  `)) as any[];

  const countRows = (await db.execute(sql`
    SELECT count(*)::int AS total
    FROM supplier_soa_records sr
    JOIN suppliers s ON s.id = sr.supplier_id
    WHERE ${where}
  `)) as any[];

  return {
    data: rows.map((r: any) => ({
      id: r.id,
      soaNumber: r.soa_number,
      supplierId: r.supplier_id,
      supplierName: r.supplier_name,
      dateFrom: r.date_from,
      dateTo: r.date_to,
      generatedAt: r.generated_at,
      totalAmount: parseFloat(r.total_amount),
      totalPaid: parseFloat(r.total_paid),
      totalBalance: parseFloat(r.total_balance),
      invoiceCount: r.invoice_count,
      status: r.status,
      notes: r.notes,
    })),
    total: countRows[0]?.total ?? 0,
  };
}

/**
 * Fetch a persistent supplier SOA by ID with its frozen line item snapshots.
 * Used for reprints — returns the paid/balance as they were at generation
 * time, NOT the invoices' current mutable state.
 */
export async function getSupplierSOAById(orgId: string, soaId: string) {
  const [soa] = (await db.execute(sql`
    SELECT sr.id, sr.soa_number, sr.supplier_id, sr.date_from::text, sr.date_to::text,
           sr.generated_at, sr.total_amount::text, sr.total_paid::text,
           sr.total_balance::text, sr.invoice_count, sr.status, sr.notes,
           s.name AS supplier_name, s.contact_phone, s.address, s.contact_email
    FROM supplier_soa_records sr
    JOIN suppliers s ON s.id = sr.supplier_id
    WHERE sr.id = ${soaId} AND sr.org_id = ${orgId}
  `)) as any[];
  if (!soa) throw new Error("Supplier SOA not found");

  const lines = (await db.execute(sql`
    SELECT sli.id, sli.invoice_id,
           sli.invoice_amount::text, sli.paid_at_generation::text,
           sli.balance_at_generation::text,
           si.invoice_number, si.invoice_date::text, si.due_date::text
    FROM supplier_soa_line_items sli
    JOIN supplier_invoices si ON si.id = sli.invoice_id
    WHERE sli.soa_id = ${soaId}
    ORDER BY si.invoice_date ASC, si.invoice_number ASC
  `)) as any[];

  return {
    id: soa.id,
    soaNumber: soa.soa_number,
    supplierId: soa.supplier_id,
    supplier: {
      name: soa.supplier_name,
      contactPhone: soa.contact_phone,
      address: soa.address,
      contactEmail: soa.contact_email,
    },
    dateFrom: soa.date_from,
    dateTo: soa.date_to,
    generatedAt: soa.generated_at,
    totalAmount: parseFloat(soa.total_amount),
    totalPaid: parseFloat(soa.total_paid),
    totalBalance: parseFloat(soa.total_balance),
    invoiceCount: soa.invoice_count,
    status: soa.status,
    notes: soa.notes,
    invoices: lines.map((r: any) => ({
      id: r.invoice_id,
      invoiceNumber: r.invoice_number,
      invoiceDate: r.invoice_date,
      dueDate: r.due_date,
      // Frozen snapshot values
      totalAmount: parseFloat(r.invoice_amount),
      paidAmount: parseFloat(r.paid_at_generation),
      balance: parseFloat(r.balance_at_generation),
    })),
  };
}

/**
 * Change supplier SOA status.
 *
 * Allowed transitions:
 *   GENERATED \u2192 SENT | VOID
 *   SENT      \u2192 GENERATED | VOID
 *   VOID      \u2192 (terminal — no further transitions)
 *
 * Voiding unmarks all invoices that were billed to this SOA so they can
 * be included in a future SOA again. Line items are preserved for audit.
 */
export async function updateSupplierSOAStatus(
  orgId: string,
  soaId: string,
  status: "GENERATED" | "SENT" | "VOID",
) {
  const allowed = new Set(["GENERATED", "SENT", "VOID"]);
  if (!allowed.has(status)) {
    throw new Error(`Unsupported status: ${status}`);
  }

  return db.transaction(async (tx) => {
    const [current] = (await tx.execute(sql`
      SELECT id, status FROM supplier_soa_records
      WHERE id = ${soaId} AND org_id = ${orgId}
      FOR UPDATE
    `)) as any[];
    if (!current) throw new Error("Supplier SOA not found");
    if (current.status === "VOID" && status !== "VOID") {
      throw new Error("VOID SOAs cannot be reactivated");
    }

    if (status === "VOID") {
      // Unmark invoices so they can be re-billed
      await tx.execute(sql`
        UPDATE supplier_invoices
        SET billed = false, billed_soa_id = NULL
        WHERE billed_soa_id = ${soaId}
      `);
    }

    await tx.execute(sql`
      UPDATE supplier_soa_records
      SET status = ${status}
      WHERE id = ${soaId} AND org_id = ${orgId}
    `);

    return { success: true, previousStatus: current.status, newStatus: status };
  });
}

/**
 * Record a payment against a supplier SOA.
 *
 * Allocates the payment across the SOA's invoices (oldest first).
 * Updates each invoice's paidAmount/balance/status, then updates the
 * SOA header's totalPaid/totalBalance. Line item snapshots are NOT
 * touched — they're frozen for reprint fidelity.
 */
export async function paySupplierSOA(
  orgId: string,
  soaId: string,
  data: {
    amount: string;
    paymentDate: string;
    paymentMethod?: string;
    referenceNumber?: string;
    notes?: string;
  },
) {
  const payAmount = parseFloat(data.amount);
  if (isNaN(payAmount) || payAmount <= 0) throw new Error("Payment amount must be > 0");

  return await db.transaction(async (tx) => {
    // 1. Fetch SOA header with FOR UPDATE lock
    const soaRows = (await tx.execute(
      sql`SELECT id, soa_number, supplier_id, status,
                 total_amount::text, total_paid::text, total_balance::text
          FROM supplier_soa_records
          WHERE id = ${soaId} AND org_id = ${orgId}
          FOR UPDATE`,
    )) as any[];

    if (soaRows.length === 0) throw new Error("Supplier SOA not found");
    const soa = soaRows[0];

    if (soa.status === "VOID") throw new Error("Cannot pay a voided SOA");

    const soaBalance = parseFloat(soa.total_balance);
    if (soaBalance <= 0) throw new Error("SOA is already fully paid");
    if (payAmount > soaBalance + 0.01) {
      throw new Error(`Payment amount (${payAmount}) exceeds SOA balance (${soaBalance})`);
    }

    // 2. Fetch the SOA's invoices (oldest first) with current balances
    const invoiceRows = (await tx.execute(
      sql`SELECT si.id, si.invoice_number, si.invoice_date,
                 si.total_amount::text, si.paid_amount::text,
                 si.balance::text, si.status, si.rtv_credit_amount::text, si.notes
          FROM supplier_soa_line_items sli
          JOIN supplier_invoices si ON si.id = sli.invoice_id
          WHERE sli.soa_id = ${soaId}
            AND si.status IN ('OPEN', 'PARTIALLY_PAID')
            AND si.balance::numeric > 0
          ORDER BY si.invoice_date ASC, si.invoice_number ASC
          FOR UPDATE OF si`,
    )) as any[];

    // 3. Allocate payment across invoices (oldest first / FIFO)
    let remaining = payAmount;
    let totalApplied = 0;

    // Build audit note
    const parts = [`[SOA Payment: ${data.paymentDate}`];
    if (data.paymentMethod) parts.push(data.paymentMethod);
    if (data.referenceNumber) parts.push(`Ref#${data.referenceNumber}`);
    parts[parts.length - 1] += "]";
    const auditNote = parts.join(", ");

    for (const inv of invoiceRows) {
      if (remaining <= 0) break;

      const invBalance = parseFloat(inv.balance);
      const allocation = Math.min(remaining, invBalance);

      const newPaid = parseFloat(inv.paid_amount) + allocation;
      const newBalance = parseFloat(inv.total_amount) - newPaid - parseFloat(inv.rtv_credit_amount);
      const newStatus = newBalance <= 0.005 ? "PAID" : "PARTIALLY_PAID";

      const existingNotes = inv.notes ?? "";
      const updatedNotes = existingNotes
        ? `${existingNotes}\n${auditNote}`
        : auditNote;

      await tx.execute(
        sql`UPDATE supplier_invoices
            SET paid_amount = ${String(newPaid.toFixed(2))},
                balance = ${String(Math.max(0, newBalance).toFixed(2))},
                status = ${newStatus},
                notes = ${data.notes ? `${updatedNotes}\n${data.notes}` : updatedNotes}
            WHERE id = ${inv.id}`,
      );

      remaining -= allocation;
      totalApplied += allocation;
    }

    // 4. Update SOA header totals
    const newSoaPaid = parseFloat(soa.total_paid) + totalApplied;
    const newSoaBalance = parseFloat(soa.total_amount) - newSoaPaid;

    await tx.execute(
      sql`UPDATE supplier_soa_records
          SET total_paid = ${String(newSoaPaid.toFixed(2))},
              total_balance = ${String(Math.max(0, newSoaBalance).toFixed(2))}
          WHERE id = ${soaId}`,
    );

    return {
      soaId,
      soaNumber: soa.soa_number,
      amountPaid: totalApplied,
      newTotalPaid: newSoaPaid,
      newTotalBalance: Math.max(0, newSoaBalance),
      invoicesUpdated: invoiceRows.length,
    };
  });
}

// ════════════════════════════════════════════════════════════════════
// DISBURSEMENT VOUCHERS
// ════════════════════════════════════════════════════════════════════

async function generateDvNumber(tx: DbOrTx, orgId: string): Promise<string> {
  const year = new Date().getFullYear();
  await tx.execute(
    sql`INSERT INTO dv_number_sequence (id, org_id, year, last_number)
        VALUES (gen_random_uuid(), ${orgId}, ${year}, 0)
        ON CONFLICT (org_id, year) DO NOTHING`,
  );
  const rows = (await tx.execute(
    sql`SELECT last_number FROM dv_number_sequence
        WHERE org_id = ${orgId} AND year = ${year} FOR UPDATE`,
  )) as any[];
  const next = (rows[0]?.last_number ?? 0) + 1;
  await tx.execute(
    sql`UPDATE dv_number_sequence SET last_number = ${next}
        WHERE org_id = ${orgId} AND year = ${year}`,
  );
  return `DV-${year}-${String(next).padStart(6, "0")}`;
}

export async function createDisbursementVoucher(
  orgId: string,
  userId: string,
  data: {
    supplierId: string;
    soaId?: string;
    grossAmount: string;
    paymentDate: string;
    remarks?: string;
    deductions?: Array<{
      deductionType: string;
      description: string;
      referenceNumber?: string;
      amount: string;
    }>;
    payments: Array<{
      paymentMethod: string;
      amount: string;
      referenceNumber?: string;
      bankName?: string;
      transactionDate?: string;
      platform?: string;
      receivedBy?: string;
    }>;
  },
) {
  const grossAmount = parseFloat(data.grossAmount);
  if (isNaN(grossAmount) || grossAmount <= 0) throw new Error("Gross amount must be > 0");

  const totalDeductions = (data.deductions ?? []).reduce(
    (s, d) => s + (parseFloat(d.amount) || 0), 0,
  );
  const netAmount = grossAmount - totalDeductions;
  if (netAmount <= 0) throw new Error("Net amount must be > 0 (deductions exceed gross amount)");

  if (!data.payments || data.payments.length === 0) throw new Error("At least one payment line is required");
  const paymentSum = data.payments.reduce((s, p) => s + parseFloat(p.amount || "0"), 0);
  if (Math.abs(paymentSum - netAmount) > 0.01) {
    throw new Error(`Payment lines total (${paymentSum.toFixed(2)}) must equal net amount (${netAmount.toFixed(2)})`);
  }

  return await db.transaction(async (tx) => {
    // Validate SOA if provided
    if (data.soaId) {
      const soaRows = (await tx.execute(
        sql`SELECT id, supplier_id, total_balance::text, status
            FROM supplier_soa_records
            WHERE id = ${data.soaId} AND org_id = ${orgId}`,
      )) as any[];
      if (soaRows.length === 0) throw new Error("SOA not found");
      if (soaRows[0].status === "VOID") throw new Error("Cannot create DV for a voided SOA");
      if (soaRows[0].supplier_id !== data.supplierId) throw new Error("Supplier does not match SOA");
    }

    const dvNumber = await generateDvNumber(tx, orgId);
    const primaryMethod = data.payments[0].paymentMethod;

    const [row] = (await tx.execute(
      sql`INSERT INTO supplier_disbursement_vouchers
          (org_id, dv_number, supplier_id, soa_id,
           amount, gross_amount, total_deductions, net_amount,
           payment_method, payment_date, remarks, status, created_by)
          VALUES (${orgId}, ${dvNumber}, ${data.supplierId}, ${data.soaId ?? null},
                  ${String(netAmount.toFixed(2))}, ${data.grossAmount},
                  ${String(totalDeductions.toFixed(2))}, ${String(netAmount.toFixed(2))},
                  ${primaryMethod}, ${data.paymentDate},
                  ${data.remarks ?? null}, 'DRAFT', ${userId})
          RETURNING id, dv_number, status`,
    )) as any[];

    // Insert deduction lines
    for (let i = 0; i < (data.deductions ?? []).length; i++) {
      const d = data.deductions![i];
      await tx.execute(
        sql`INSERT INTO supplier_dv_deductions
            (dv_id, deduction_type, description, reference_number, amount, sort_order)
            VALUES (${row.id}, ${d.deductionType}, ${d.description},
                    ${d.referenceNumber ?? null}, ${d.amount}, ${i})`,
      );
    }

    // Insert payment lines
    for (let i = 0; i < data.payments.length; i++) {
      const p = data.payments[i];
      await tx.execute(
        sql`INSERT INTO supplier_dv_payments
            (dv_id, payment_method, amount, reference_number, bank_name,
             transaction_date, platform, received_by, sort_order)
            VALUES (${row.id}, ${p.paymentMethod}, ${p.amount},
                    ${p.referenceNumber ?? null}, ${p.bankName ?? null},
                    ${p.transactionDate ?? null}, ${p.platform ?? null},
                    ${p.receivedBy ?? null}, ${i})`,
      );
    }

    return { id: row.id, dvNumber: row.dv_number, status: row.status };
  });
}

export async function listDisbursementVouchers(
  orgId: string,
  opts: {
    search?: string;
    status?: string;
    dateFrom?: string;
    dateTo?: string;
    limit?: number;
  } = {},
) {
  const limit = Math.min(opts.limit ?? 100, 200);
  const conditions = [sql`dv.org_id = ${orgId}`];
  if (opts.search && opts.search.trim()) {
    const p = `%${opts.search.trim()}%`;
    conditions.push(sql`(dv.dv_number ILIKE ${p} OR s.name ILIKE ${p})`);
  }
  if (opts.status) conditions.push(sql`dv.status = ${opts.status}`);
  if (opts.dateFrom) conditions.push(sql`dv.payment_date >= ${opts.dateFrom}`);
  if (opts.dateTo) conditions.push(sql`dv.payment_date <= ${opts.dateTo}`);
  const where = sql.join(conditions, sql` AND `);

  const rows = (await db.execute(sql`
    SELECT dv.id, dv.dv_number, dv.supplier_id, s.name AS supplier_name,
           dv.soa_id, COALESCE(sr.soa_number, '') AS soa_number,
           dv.amount::text, dv.payment_method, dv.check_number,
           dv.payment_date::text, dv.status, dv.created_at,
           dv.voided_at, dv.void_reason
    FROM supplier_disbursement_vouchers dv
    JOIN suppliers s ON s.id = dv.supplier_id
    LEFT JOIN supplier_soa_records sr ON sr.id = dv.soa_id
    WHERE ${where}
    ORDER BY dv.created_at DESC
    LIMIT ${limit}
  `)) as any[];

  const countRows = (await db.execute(sql`
    SELECT count(*)::int AS total
    FROM supplier_disbursement_vouchers dv
    JOIN suppliers s ON s.id = dv.supplier_id
    WHERE ${where}
  `)) as any[];

  return {
    data: rows.map((r: any) => ({
      id: r.id,
      dvNumber: r.dv_number,
      supplierId: r.supplier_id,
      supplierName: r.supplier_name,
      soaId: r.soa_id,
      soaNumber: r.soa_number,
      amount: parseFloat(r.amount),
      paymentMethod: r.payment_method,
      checkNumber: r.check_number,
      paymentDate: r.payment_date,
      status: r.status,
      createdAt: r.created_at,
      voidedAt: r.voided_at,
      voidReason: r.void_reason,
    })),
    total: countRows[0]?.total ?? 0,
  };
}

export async function getDisbursementVoucher(orgId: string, dvId: string) {
  const rows = (await db.execute(sql`
    SELECT dv.*, s.name AS supplier_name,
           COALESCE(sr.soa_number, '') AS soa_number,
           sr.date_from::text AS soa_date_from, sr.date_to::text AS soa_date_to
    FROM supplier_disbursement_vouchers dv
    JOIN suppliers s ON s.id = dv.supplier_id
    LEFT JOIN supplier_soa_records sr ON sr.id = dv.soa_id
    WHERE dv.id = ${dvId} AND dv.org_id = ${orgId}
  `)) as any[];
  if (rows.length === 0) throw new Error("Disbursement voucher not found");
  const dv = rows[0] as any;

  // Fetch child payment lines
  const paymentRows = (await db.execute(sql`
    SELECT id, payment_method, amount::text, reference_number, bank_name,
           transaction_date::text, platform, received_by, sort_order
    FROM supplier_dv_payments
    WHERE dv_id = ${dvId}
    ORDER BY sort_order ASC
  `)) as any[];

  // Fetch deduction lines
  const deductionRows = (await db.execute(sql`
    SELECT id, deduction_type, description, reference_number, amount::text, sort_order
    FROM supplier_dv_deductions
    WHERE dv_id = ${dvId}
    ORDER BY sort_order ASC
  `)) as any[];

  return {
    id: dv.id,
    dvNumber: dv.dv_number,
    supplierId: dv.supplier_id,
    supplierName: dv.supplier_name,
    soaId: dv.soa_id,
    soaNumber: dv.soa_number,
    soaDateFrom: dv.soa_date_from,
    soaDateTo: dv.soa_date_to,
    grossAmount: dv.gross_amount ? parseFloat(dv.gross_amount) : parseFloat(dv.amount),
    totalDeductions: dv.total_deductions ? parseFloat(dv.total_deductions) : 0,
    netAmount: dv.net_amount ? parseFloat(dv.net_amount) : parseFloat(dv.amount),
    amount: parseFloat(dv.amount),
    paymentMethod: dv.payment_method,
    paymentDate: dv.payment_date,
    remarks: dv.remarks,
    status: dv.status,
    printedAt: dv.printed_at,
    confirmedAt: dv.confirmed_at,
    voidedAt: dv.voided_at,
    voidReason: dv.void_reason,
    createdAt: dv.created_at,
    payments: paymentRows.map((p: any) => ({
      id: p.id,
      paymentMethod: p.payment_method,
      amount: parseFloat(p.amount),
      referenceNumber: p.reference_number,
      bankName: p.bank_name,
      transactionDate: p.transaction_date,
      platform: p.platform,
      receivedBy: p.received_by,
    })),
    deductions: deductionRows.map((d: any) => ({
      id: d.id,
      deductionType: d.deduction_type,
      description: d.description,
      referenceNumber: d.reference_number,
      amount: parseFloat(d.amount),
    })),
  };
}

export async function printDisbursementVoucher(orgId: string, dvId: string) {
  const rows = (await db.execute(
    sql`UPDATE supplier_disbursement_vouchers
        SET status = 'PRINTED', printed_at = NOW()
        WHERE id = ${dvId} AND org_id = ${orgId} AND status = 'DRAFT'
        RETURNING id, dv_number, status`,
  )) as any[];
  if (rows.length === 0) throw new Error("DV not found or not in DRAFT status");
  return rows[0];
}

export async function confirmDisbursementVoucher(orgId: string, dvId: string) {
  return await db.transaction(async (tx) => {
    const dvRows = (await tx.execute(
      sql`SELECT id, soa_id, amount::text, gross_amount::text, net_amount::text, status
          FROM supplier_disbursement_vouchers
          WHERE id = ${dvId} AND org_id = ${orgId}
          FOR UPDATE`,
    )) as any[];
    if (dvRows.length === 0) throw new Error("DV not found");
    const dv = dvRows[0] as any;
    if (dv.status !== "PRINTED") throw new Error("Can only confirm PRINTED vouchers");

    // Apply payment to SOA + invoices
    // SOA is settled for the GROSS amount (full SOA), not net (deductions account for the difference)
    if (dv.soa_id) {
      const soaRows = (await tx.execute(
        sql`SELECT id, total_paid::text, total_amount::text, total_balance::text, status
            FROM supplier_soa_records WHERE id = ${dv.soa_id} FOR UPDATE`,
      )) as any[];
      if (soaRows.length === 0) throw new Error("SOA not found");
      const soa = soaRows[0] as any;

      // Use gross_amount to settle the SOA fully (deductions explain the gap)
      const payAmount = dv.gross_amount ? parseFloat(dv.gross_amount) : parseFloat(dv.amount);

      // Fetch and pay invoices (oldest first)
      const invoiceRows = (await tx.execute(
        sql`SELECT si.id, si.paid_amount::text, si.balance::text,
                   si.total_amount::text, si.rtv_credit_amount::text, si.notes
            FROM supplier_soa_line_items sli
            JOIN supplier_invoices si ON si.id = sli.invoice_id
            WHERE sli.soa_id = ${dv.soa_id}
              AND si.status IN ('OPEN', 'PARTIALLY_PAID') AND si.balance::numeric > 0
            ORDER BY si.invoice_date ASC FOR UPDATE OF si`,
      )) as any[];

      let remaining = payAmount;
      for (const inv of invoiceRows) {
        if (remaining <= 0) break;
        const invBal = parseFloat(inv.balance);
        const alloc = Math.min(remaining, invBal);
        const newPaid = parseFloat(inv.paid_amount) + alloc;
        const newBal = parseFloat(inv.total_amount) - newPaid - parseFloat(inv.rtv_credit_amount);
        const newStatus = newBal <= 0.005 ? "PAID" : "PARTIALLY_PAID";
        const auditNote = `[DV Payment: ${dv.amount}, DV#${dvRows[0].id}]`;
        const notes = inv.notes ? `${inv.notes}\n${auditNote}` : auditNote;
        await tx.execute(
          sql`UPDATE supplier_invoices SET paid_amount = ${String(newPaid.toFixed(2))},
              balance = ${String(Math.max(0, newBal).toFixed(2))}, status = ${newStatus}, notes = ${notes}
              WHERE id = ${inv.id}`,
        );
        remaining -= alloc;
      }

      // Update SOA header
      const newSoaPaid = parseFloat(soa.total_paid) + payAmount;
      const newSoaBal = parseFloat(soa.total_amount) - newSoaPaid;
      await tx.execute(
        sql`UPDATE supplier_soa_records
            SET total_paid = ${String(newSoaPaid.toFixed(2))},
                total_balance = ${String(Math.max(0, newSoaBal).toFixed(2))}
            WHERE id = ${dv.soa_id}`,
      );
    }

    // Mark applied credit memos as billed (so they don't appear as available again)
    const cmDeds = (await tx.execute(
      sql`SELECT reference_number FROM supplier_dv_deductions
          WHERE dv_id = ${dvId} AND deduction_type = 'CREDIT_MEMO' AND reference_number IS NOT NULL`,
    )) as any[];
    for (const cm of cmDeds) {
      if (cm.reference_number) {
        await tx.execute(
          sql`UPDATE supplier_invoices SET billed = true, billed_soa_id = ${dvId}
              WHERE id = ${cm.reference_number}`,
        );
      }
    }

    // Mark DV as confirmed
    const [updated] = (await tx.execute(
      sql`UPDATE supplier_disbursement_vouchers
          SET status = 'CONFIRMED', confirmed_at = NOW()
          WHERE id = ${dvId}
          RETURNING id, dv_number, status`,
    )) as any[];

    // Auto-release CHECK payment lines when DV is confirmed
    await tx.execute(
      sql`UPDATE supplier_dv_payments SET status = 'RELEASED'
          WHERE dv_id = ${dvId} AND payment_method = 'CHECK' AND status = 'OUTSTANDING'`,
    );

    return updated;
  });
}

export async function voidDisbursementVoucher(
  orgId: string,
  dvId: string,
  userId: string,
  reason: string,
) {
  return await db.transaction(async (tx) => {
    const dvRows = (await tx.execute(
      sql`SELECT id, soa_id, amount::text, gross_amount::text, status
          FROM supplier_disbursement_vouchers
          WHERE id = ${dvId} AND org_id = ${orgId}
          FOR UPDATE`,
    )) as any[];
    if (dvRows.length === 0) throw new Error("DV not found");
    const dv = dvRows[0] as any;
    if (dv.status === "VOIDED") throw new Error("DV is already voided");

    // If was CONFIRMED, reverse the payment (reverse gross_amount from SOA)
    if (dv.status === "CONFIRMED" && dv.soa_id) {
      const payAmount = dv.gross_amount ? parseFloat(dv.gross_amount) : parseFloat(dv.amount);

      // Reset invoices that were paid by this DV
      const invoiceRows = (await tx.execute(
        sql`SELECT si.id, si.paid_amount::text, si.total_amount::text,
                   si.rtv_credit_amount::text
            FROM supplier_soa_line_items sli
            JOIN supplier_invoices si ON si.id = sli.invoice_id
            WHERE sli.soa_id = ${dv.soa_id} AND si.status = 'PAID'
            ORDER BY si.invoice_date DESC FOR UPDATE OF si`,
      )) as any[];

      let remaining = payAmount;
      for (const inv of invoiceRows) {
        if (remaining <= 0) break;
        const paid = parseFloat(inv.paid_amount);
        const reversal = Math.min(remaining, paid);
        const newPaid = paid - reversal;
        const newBal = parseFloat(inv.total_amount) - newPaid - parseFloat(inv.rtv_credit_amount);
        const newStatus = newPaid <= 0.005 ? "OPEN" : "PARTIALLY_PAID";
        await tx.execute(
          sql`UPDATE supplier_invoices SET paid_amount = ${String(newPaid.toFixed(2))},
              balance = ${String(Math.max(0, newBal).toFixed(2))}, status = ${newStatus}
              WHERE id = ${inv.id}`,
        );
        remaining -= reversal;
      }

      // Reverse SOA header
      const soaRows = (await tx.execute(
        sql`SELECT total_paid::text, total_amount::text FROM supplier_soa_records
            WHERE id = ${dv.soa_id} FOR UPDATE`,
      )) as any[];
      if (soaRows.length > 0) {
        const newPaid = Math.max(0, parseFloat(soaRows[0].total_paid) - payAmount);
        const newBal = parseFloat(soaRows[0].total_amount) - newPaid;
        await tx.execute(
          sql`UPDATE supplier_soa_records
              SET total_paid = ${String(newPaid.toFixed(2))},
                  total_balance = ${String(Math.max(0, newBal).toFixed(2))}
              WHERE id = ${dv.soa_id}`,
        );
      }
    }

    // Un-mark applied credit memos (restore as available)
    if (dv.status === "CONFIRMED") {
      const cmDeds = (await tx.execute(
        sql`SELECT reference_number FROM supplier_dv_deductions
            WHERE dv_id = ${dvId} AND deduction_type = 'CREDIT_MEMO' AND reference_number IS NOT NULL`,
      )) as any[];
      for (const cm of cmDeds) {
        if (cm.reference_number) {
          await tx.execute(
            sql`UPDATE supplier_invoices SET billed = false, billed_soa_id = NULL
                WHERE id = ${cm.reference_number}`,
          );
        }
      }
    }

    const [updated] = (await tx.execute(
      sql`UPDATE supplier_disbursement_vouchers
          SET status = 'VOIDED', voided_at = NOW(), voided_by = ${userId},
              void_reason = ${reason}
          WHERE id = ${dvId}
          RETURNING id, dv_number, status`,
    )) as any[];

    // Auto-cancel CHECK payment lines when DV is voided
    await tx.execute(
      sql`UPDATE supplier_dv_payments SET status = 'CANCELLED'
          WHERE dv_id = ${dvId} AND payment_method = 'CHECK'`,
    );

    return updated;
  });
}

export async function getSummary(orgId: string) {
  const [totals] = await db.execute(
    sql`
      SELECT
        COALESCE(SUM(balance::numeric), 0) AS total_payables,
        COALESCE(SUM(CASE WHEN due_date < CURRENT_DATE AND status IN ('OPEN', 'PARTIALLY_PAID') THEN balance::numeric ELSE 0 END), 0) AS total_overdue,
        COALESCE(SUM(CASE WHEN due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days' THEN balance::numeric ELSE 0 END), 0) AS due_this_week,
        COUNT(DISTINCT supplier_id) AS supplier_count,
        COUNT(*) AS invoice_count
      FROM supplier_invoices
      WHERE org_id = ${orgId}
        AND status IN ('OPEN', 'PARTIALLY_PAID')
    `,
  );

  return totals;
}

export async function getPDCReport(orgId: string) {
  // PDC = Post-Dated Checks: checks where check_date > today OR released but not cleared
  const rows = await db.execute(
    sql`
      SELECT
        cv.id,
        cv.cv_number,
        cv.check_date,
        cv.check_number,
        cv.bank_name,
        cv.bank_account,
        cv.net_amount,
        cv.status,
        s.name AS supplier_name,
        TO_CHAR(cv.check_date::date, 'YYYY-MM') AS month_bucket
      FROM check_vouchers cv
      JOIN suppliers s ON cv.supplier_id = s.id
      WHERE cv.org_id = ${orgId}
        AND (
          (cv.check_date > CURRENT_DATE AND cv.status NOT IN ('VOIDED', 'CLEARED'))
          OR
          (cv.status = 'RELEASED')
        )
      ORDER BY cv.check_date ASC
    `,
  );

  // Map rows to flat array + compute monthly summary
  const data = (rows as any[]).map((r: any) => ({
    id: r.id,
    cvNo: r.cv_number ?? "",
    supplierName: r.supplier_name ?? "",
    checkNo: r.check_number ?? "",
    bankName: r.bank_name ?? "",
    checkDate: r.check_date,
    amount: String(r.net_amount ?? "0"),
    status: r.status ?? "",
  }));

  const monthMap = new Map<string, number>();
  for (const r of rows as any[]) {
    const bucket = r.month_bucket;
    if (bucket) {
      monthMap.set(bucket, (monthMap.get(bucket) || 0) + parseFloat(r.net_amount ?? "0"));
    }
  }
  const monthlySummary = Array.from(monthMap.entries())
    .map(([month, total]) => ({ month, total }))
    .sort((a, b) => a.month.localeCompare(b.month));

  return { data, monthlySummary };
}

// ════════════════════════════════════════════════════════════════════
// CHECK REGISTER
// ════════════════════════════════════════════════════════════════════

export async function getCheckRegister(
  orgId: string,
  opts: {
    search?: string;
    bank?: string;
    status?: string;
    dateFrom?: string;
    dateTo?: string;
  } = {},
) {
  const conditions = [
    sql`dv.org_id = ${orgId}`,
    sql`p.payment_method = 'CHECK'`,
    sql`dv.status IN ('PRINTED', 'CONFIRMED')`,
  ];
  if (opts.search && opts.search.trim()) {
    const q = `%${opts.search.trim()}%`;
    conditions.push(sql`(dv.dv_number ILIKE ${q} OR p.reference_number ILIKE ${q} OR s.name ILIKE ${q})`);
  }
  if (opts.bank) conditions.push(sql`p.bank_name = ${opts.bank}`);
  if (opts.status) conditions.push(sql`p.status = ${opts.status}`);
  if (opts.dateFrom) conditions.push(sql`p.transaction_date >= ${opts.dateFrom}::date`);
  if (opts.dateTo) conditions.push(sql`p.transaction_date <= ${opts.dateTo}::date`);

  const where = sql.join(conditions, sql` AND `);

  const rows = (await db.execute(sql`
    SELECT p.id, p.status AS check_status, p.amount::text, p.reference_number AS check_number,
           p.bank_name, p.transaction_date::text AS check_date, p.bounce_reason,
           dv.id AS dv_id, dv.dv_number, dv.status AS dv_status,
           s.name AS supplier_name
    FROM supplier_dv_payments p
    JOIN supplier_disbursement_vouchers dv ON dv.id = p.dv_id
    JOIN suppliers s ON s.id = dv.supplier_id
    WHERE ${where}
    ORDER BY p.transaction_date ASC NULLS LAST, dv.dv_number ASC
  `)) as any[];

  const now = new Date();
  const endOfWeek = new Date(now); endOfWeek.setDate(now.getDate() + (7 - now.getDay()));
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  let totalOutstanding = 0;
  let maturingThisWeek = 0;
  let clearedThisMonth = 0;
  let totalBounced = 0;

  const data = rows.map((r: any) => {
    const amt = parseFloat(r.amount);
    const st = r.check_status ?? "OUTSTANDING";
    const cd = r.check_date ? new Date(r.check_date) : null;

    if (st === "OUTSTANDING" || st === "RELEASED") totalOutstanding += amt;
    if ((st === "OUTSTANDING" || st === "RELEASED") && cd && cd >= now && cd <= endOfWeek) maturingThisWeek += amt;
    if (st === "CLEARED" && cd && cd >= monthStart && cd <= monthEnd) clearedThisMonth += amt;
    if (st === "BOUNCED") totalBounced += amt;

    return {
      id: r.id,
      dvId: r.dv_id,
      dvNumber: r.dv_number,
      supplierName: r.supplier_name,
      checkNumber: r.check_number ?? "",
      bankName: r.bank_name ?? "",
      checkDate: r.check_date ?? "",
      amount: amt,
      status: st,
      bounceReason: r.bounce_reason,
    };
  });

  return {
    data,
    summary: {
      totalOutstanding: parseFloat(totalOutstanding.toFixed(2)),
      maturingThisWeek: parseFloat(maturingThisWeek.toFixed(2)),
      clearedThisMonth: parseFloat(clearedThisMonth.toFixed(2)),
      totalBounced: parseFloat(totalBounced.toFixed(2)),
    },
  };
}

/** OUTSTANDING → RELEASED */
export async function releaseCheck(orgId: string, paymentId: string) {
  return await db.transaction(async (tx) => {
    const rows = (await tx.execute(
      sql`SELECT p.id, p.status, p.payment_method, dv.org_id
          FROM supplier_dv_payments p
          JOIN supplier_disbursement_vouchers dv ON dv.id = p.dv_id
          WHERE p.id = ${paymentId} AND dv.org_id = ${orgId}
          FOR UPDATE OF p`,
    )) as any[];
    if (rows.length === 0) throw new Error("Check not found");
    if (rows[0].payment_method !== "CHECK") throw new Error("Not a check payment");
    if (rows[0].status !== "OUTSTANDING") throw new Error("Can only release OUTSTANDING checks");

    const [updated] = (await tx.execute(
      sql`UPDATE supplier_dv_payments SET status = 'RELEASED' WHERE id = ${paymentId} RETURNING id, status`,
    )) as any[];
    return updated;
  });
}

/** RELEASED → CLEARED */
export async function clearCheck(orgId: string, paymentId: string) {
  return await db.transaction(async (tx) => {
    const rows = (await tx.execute(
      sql`SELECT p.id, p.status, p.payment_method, dv.org_id
          FROM supplier_dv_payments p
          JOIN supplier_disbursement_vouchers dv ON dv.id = p.dv_id
          WHERE p.id = ${paymentId} AND dv.org_id = ${orgId}
          FOR UPDATE OF p`,
    )) as any[];
    if (rows.length === 0) throw new Error("Check not found");
    if (rows[0].payment_method !== "CHECK") throw new Error("Not a check payment");
    if (rows[0].status !== "RELEASED") throw new Error("Can only clear RELEASED checks");

    const [updated] = (await tx.execute(
      sql`UPDATE supplier_dv_payments SET status = 'CLEARED' WHERE id = ${paymentId} RETURNING id, status`,
    )) as any[];
    return updated;
  });
}

/**
 * RELEASED → BOUNCED.
 * Also reverses the check's amount from the SOA (the money never left).
 */
export async function bounceCheck(orgId: string, paymentId: string, reason: string) {
  return await db.transaction(async (tx) => {
    const rows = (await tx.execute(
      sql`SELECT p.id, p.status, p.payment_method, p.amount::text,
                 dv.id AS dv_id, dv.soa_id, dv.org_id
          FROM supplier_dv_payments p
          JOIN supplier_disbursement_vouchers dv ON dv.id = p.dv_id
          WHERE p.id = ${paymentId} AND dv.org_id = ${orgId}
          FOR UPDATE OF p`,
    )) as any[];
    if (rows.length === 0) throw new Error("Check not found");
    const check = rows[0] as any;
    if (check.payment_method !== "CHECK") throw new Error("Not a check payment");
    if (check.status !== "RELEASED") throw new Error("Can only bounce RELEASED checks");

    // Mark check as bounced
    await tx.execute(
      sql`UPDATE supplier_dv_payments SET status = 'BOUNCED', bounce_reason = ${reason}
          WHERE id = ${paymentId}`,
    );

    // Reverse the bounced amount from SOA + invoices (money never left)
    const bouncedAmount = parseFloat(check.amount);
    if (check.soa_id && bouncedAmount > 0) {
      // Reverse SOA header
      const soaRows = (await tx.execute(
        sql`SELECT total_paid::text, total_amount::text FROM supplier_soa_records
            WHERE id = ${check.soa_id} FOR UPDATE`,
      )) as any[];
      if (soaRows.length > 0) {
        const newPaid = Math.max(0, parseFloat(soaRows[0].total_paid) - bouncedAmount);
        const newBal = parseFloat(soaRows[0].total_amount) - newPaid;
        await tx.execute(
          sql`UPDATE supplier_soa_records
              SET total_paid = ${String(newPaid.toFixed(2))},
                  total_balance = ${String(Math.max(0, newBal).toFixed(2))}
              WHERE id = ${check.soa_id}`,
        );
      }

      // Reverse invoice payments (newest first — reverse of FIFO allocation)
      const invRows = (await tx.execute(
        sql`SELECT si.id, si.paid_amount::text, si.total_amount::text, si.rtv_credit_amount::text
            FROM supplier_soa_line_items sli
            JOIN supplier_invoices si ON si.id = sli.invoice_id
            WHERE sli.soa_id = ${check.soa_id} AND si.status = 'PAID'
            ORDER BY si.invoice_date DESC FOR UPDATE OF si`,
      )) as any[];

      let remaining = bouncedAmount;
      for (const inv of invRows) {
        if (remaining <= 0) break;
        const paid = parseFloat(inv.paid_amount);
        const reversal = Math.min(remaining, paid);
        const newPaid = paid - reversal;
        const newBal = parseFloat(inv.total_amount) - newPaid - parseFloat(inv.rtv_credit_amount);
        const newStatus = newPaid <= 0.005 ? "OPEN" : "PARTIALLY_PAID";
        await tx.execute(
          sql`UPDATE supplier_invoices SET paid_amount = ${String(newPaid.toFixed(2))},
              balance = ${String(Math.max(0, newBal).toFixed(2))}, status = ${newStatus}
              WHERE id = ${inv.id}`,
        );
        remaining -= reversal;
      }
    }

    return { id: paymentId, status: "BOUNCED" };
  });
}

/** OUTSTANDING → CANCELLED */
export async function cancelCheck(orgId: string, paymentId: string) {
  return await db.transaction(async (tx) => {
    const rows = (await tx.execute(
      sql`SELECT p.id, p.status, p.payment_method, dv.org_id
          FROM supplier_dv_payments p
          JOIN supplier_disbursement_vouchers dv ON dv.id = p.dv_id
          WHERE p.id = ${paymentId} AND dv.org_id = ${orgId}
          FOR UPDATE OF p`,
    )) as any[];
    if (rows.length === 0) throw new Error("Check not found");
    if (rows[0].payment_method !== "CHECK") throw new Error("Not a check payment");
    if (rows[0].status !== "OUTSTANDING") throw new Error("Can only cancel OUTSTANDING checks");

    const [updated] = (await tx.execute(
      sql`UPDATE supplier_dv_payments SET status = 'CANCELLED' WHERE id = ${paymentId} RETURNING id, status`,
    )) as any[];
    return updated;
  });
}

// ════════════════════════════════════════════════════════════════════
// BANK ACCOUNTS
// ════════════════════════════════════════════════════════════════════

export async function listBankAccounts(orgId: string) {
  const rows = await db
    .select()
    .from(bankAccounts)
    .where(and(eq(bankAccounts.orgId, orgId), eq(bankAccounts.isActive, true)))
    .orderBy(desc(bankAccounts.isDefault), asc(bankAccounts.bankName));

  return { data: rows };
}

export async function createBankAccount(
  orgId: string,
  data: {
    bankName: string;
    accountName: string;
    accountNumber: string;
    branch?: string;
    isDefault?: boolean;
  },
) {
  return await db.transaction(async (tx) => {
    // If setting as default, unset existing default
    if (data.isDefault) {
      await tx
        .update(bankAccounts)
        .set({ isDefault: false })
        .where(and(eq(bankAccounts.orgId, orgId), eq(bankAccounts.isDefault, true)));
    }

    // Mask the display number
    const display = data.accountNumber.length > 4
      ? "****" + data.accountNumber.slice(-4)
      : data.accountNumber;

    const [account] = await tx
      .insert(bankAccounts)
      .values({
        orgId,
        bankName: data.bankName,
        accountName: data.accountName,
        accountNumber: data.accountNumber,
        accountNumberDisplay: display,
        branch: data.branch ?? null,
        isDefault: data.isDefault ?? false,
      })
      .returning();

    return account;
  });
}

export async function updateBankAccount(
  orgId: string,
  id: string,
  data: {
    bankName?: string;
    accountName?: string;
    accountNumber?: string;
    branch?: string;
    isDefault?: boolean;
  },
) {
  const [account] = await db
    .select()
    .from(bankAccounts)
    .where(and(eq(bankAccounts.id, id), eq(bankAccounts.orgId, orgId)))
    .limit(1);

  if (!account) throw new Error("Bank account not found");

  return await db.transaction(async (tx) => {
    if (data.isDefault) {
      await tx
        .update(bankAccounts)
        .set({ isDefault: false })
        .where(and(eq(bankAccounts.orgId, orgId), eq(bankAccounts.isDefault, true)));
    }

    const updates: Record<string, any> = {};
    if (data.bankName !== undefined) updates.bankName = data.bankName;
    if (data.accountName !== undefined) updates.accountName = data.accountName;
    if (data.branch !== undefined) updates.branch = data.branch;
    if (data.isDefault !== undefined) updates.isDefault = data.isDefault;
    if (data.accountNumber !== undefined) {
      updates.accountNumber = data.accountNumber;
      updates.accountNumberDisplay = data.accountNumber.length > 4
        ? "****" + data.accountNumber.slice(-4)
        : data.accountNumber;
    }

    if (Object.keys(updates).length === 0) return account;

    const [updated] = await tx
      .update(bankAccounts)
      .set(updates)
      .where(eq(bankAccounts.id, id))
      .returning();

    return updated;
  });
}

export async function deactivateBankAccount(orgId: string, id: string) {
  const [account] = await db
    .select()
    .from(bankAccounts)
    .where(and(eq(bankAccounts.id, id), eq(bankAccounts.orgId, orgId)))
    .limit(1);

  if (!account) throw new Error("Bank account not found");

  const [updated] = await db
    .update(bankAccounts)
    .set({ isActive: false })
    .where(eq(bankAccounts.id, id))
    .returning();

  return updated;
}
