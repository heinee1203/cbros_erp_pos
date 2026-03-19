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
import { eq, and, sql, desc, asc, lt, inArray, or, gte, lte, type SQL } from "drizzle-orm";

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
  // Validate supplier belongs to org
  const [supplier] = await db
    .select({ id: suppliers.id })
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

  // Calculate due date
  const invoiceDateObj = new Date(data.invoiceDate);
  const termsDays = data.paymentTermsDays ?? 30;
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
  const rows = await db.execute(
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
  );

  return { data: rows };
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

export async function getSummary(orgId: string) {
  const [totals] = await db.execute(
    sql`
      SELECT
        COALESCE(SUM(balance::numeric), 0) AS total_payables,
        COALESCE(SUM(CASE WHEN due_date < CURRENT_DATE AND status IN ('OPEN', 'PARTIALLY_PAID') THEN balance::numeric ELSE 0 END), 0) AS total_overdue,
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

  // Group by month
  const grouped: Record<string, any[]> = {};
  for (const row of rows as any[]) {
    const bucket = row.month_bucket;
    if (!grouped[bucket]) grouped[bucket] = [];
    grouped[bucket].push(row);
  }

  return { data: grouped };
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
