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
import {
  appendAuditNote,
  buildAuditNote,
  buildDisbursementVoucherSoaAllocations,
  buildSoaAllocationMap,
  calculateCheckVoucherTotals,
  calculateDisbursementVoucherTotals,
  calculateInvoicePaymentApplication,
  calculateInvoicePaymentReversal,
  calculateSoaPaymentReversalTotals,
  calculateSoaPaymentTotals,
  numberToWords,
  resolveDisbursementVoucherSoaIds,
} from "./financial-helpers";
import {
  buildGeneratedSupplierSoaResponse,
  buildSupplierSoaDetailResponse,
  buildSupplierSoaLedgerEntries,
  buildSupplierSoaOverviewResponse,
  buildSupplierSoaSearchResponse,
  mapSupplierSoaRecordRow,
  summarizeSupplierSoaGenerationInvoices,
} from "./soa-helpers";
import {
  buildApAgingReportResponse,
  buildCheckRegisterResponse,
  buildDisbursementVoucherListResponse,
  buildPdcReportResponse,
} from "./report-helpers";
import {
  assertDisbursementVoucherCreateTotals,
  assertDisbursementVoucherHasConfirmSoaLinks,
  assertDisbursementVoucherHasPaymentLines,
  assertDisbursementVoucherPaymentsMatchNet,
  assertDisbursementVoucherRequiresSoa,
  assertDisbursementVoucherSoaAllocationsSettleBalances,
  appendDisbursementVoucherPaymentAuditNote,
  buildDisbursementVoucherAdditionalChargeInsertValues,
  buildDisbursementVoucherCreditMemoReferences,
  buildDisbursementVoucherCreateResult,
  buildDisbursementVoucherDeductionInsertValues,
  buildDisbursementVoucherDetailResponse,
  buildDisbursementVoucherInsertValues,
  buildDisbursementVoucherPaymentInsertValues,
  buildDisbursementVoucherPaymentAuditNote,
  buildDisbursementVoucherSoaInsertValues,
  calculateDisbursementVoucherInvoiceReversalAmount,
  formatDisbursementVoucherNumber,
  normalizeDisbursementVoucherListOptions,
  requireConfirmableDisbursementVoucher,
  requireDisbursementVoucherPrintResult,
  requireVoidableDisbursementVoucher,
  resolveDisbursementVoucherLinkedSoaIds,
  shouldReverseDisbursementVoucherSettlement,
  validateDisbursementVoucherSoaRow,
  type DisbursementVoucherCreateInput,
  type DisbursementVoucherListOptions,
} from "./disbursement-voucher-helpers";
import {
  assertCheckVoucherCanVoid,
  assertCheckVoucherHasLines,
  assertCheckVoucherStatus,
  buildCheckVoucherInsertValues,
  buildCheckVoucherLineInsertValues,
  buildCheckVoucherUpdateFields,
  formatCheckVoucherNumber,
  validateCheckVoucherInvoiceLines,
  type CheckVoucherCreateInput,
  type CheckVoucherUpdateInput,
} from "./check-voucher-helpers";
import {
  buildBankAccountCreateValues,
  buildBankAccountUpdateFields,
  type BankAccountCreateInput,
  type BankAccountUpdateInput,
} from "./bank-account-helpers";
import {
  buildCheckPaymentStatusResult,
  calculateCheckPaymentInvoiceReversalAmount,
  normalizeCheckRegisterOptions,
  parseCheckPaymentAmount,
  requireOutstandingCheckPayment,
  requireReleasedCheckPayment,
  shouldReverseBouncedCheckSettlement,
  type CheckRegisterOptions,
} from "./check-payment-helpers";
import {
  assertBulkCreateInvoicesHasRows,
  assertBulkMarkInvoicesPaidInput,
  assertInvoiceCanEdit,
  assertInvoiceCanVoid,
  buildBulkCreateInvoiceError,
  buildBulkCreateInvoicesResult,
  buildBulkMarkInvoicesPaidResult,
  buildBulkPaidInvoiceUpdate,
  buildBulkSupplierInvoiceInsertValues,
  buildSupplierInvoiceInsertValues,
  buildSupplierInvoiceUpdateFields,
  collectMissingBulkPaidInvoiceIds,
  normalizeBulkSupplierInvoiceRow,
  resolveBulkPaidInvoicePaymentDate,
  resolveInvoicePaymentTermsDays,
  shouldSkipBulkPaidInvoice,
  type BulkMarkInvoicesPaidInput,
  type BulkSupplierInvoiceCreateInput,
  type SupplierInvoiceCreateInput,
  type SupplierInvoiceUpdateInput,
} from "./invoice-helpers";
import {
  buildSupplierChangedFields,
  buildSupplierApCreateValues,
  buildSupplierApUpdateFields,
  buildSupplierBankVerificationStatus,
  enrichSuppliersWithSafety,
  mapSupplierApDetailRow,
  mapSupplierApStatsRow,
  splitSupplierChangedFields,
  type SupplierApCreateInput,
  type SupplierApUpdateInput,
  type SupplierBankVerificationStatus,
} from "./supplier-helpers";
import { logAction } from "./accounts-payable-audit-service";

// ════════════════════════════════════════════════════════════════════
// ════════════════════════════════════════════════════════════════════

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
      sourcePoId: supplierInvoices.sourcePoId,
      sourceReceiptId: supplierInvoices.sourceReceiptId,
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
  data: SupplierInvoiceCreateInput,
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
  const [invoice] = await db
    .insert(supplierInvoices)
    .values(buildSupplierInvoiceInsertValues({
      orgId,
      userId,
      data,
      supplierTermsDays: supplier.paymentTermsDays,
    }))
    .returning();

  return invoice;
}

/**
 * Bulk-create multiple invoices for one supplier in a single transaction.
 */
export async function bulkCreateInvoices(
  orgId: string,
  userId: string,
  data: BulkSupplierInvoiceCreateInput,
) {
  assertBulkCreateInvoicesHasRows(data.invoices);

  return await db.transaction(async (tx) => {
    // Validate supplier + get payment terms
    const [supplier] = await tx
      .select({ id: suppliers.id, paymentTermsDays: suppliers.paymentTermsDays })
      .from(suppliers)
      .where(and(eq(suppliers.id, data.supplierId), eq(suppliers.orgId, orgId)))
      .limit(1);
    if (!supplier) throw new Error("Supplier not found");

    const termsDays = resolveInvoicePaymentTermsDays(undefined, supplier.paymentTermsDays);
    let created = 0;
    const errors: Array<{ index: number; invoiceNumber: string; message: string }> = [];
    let total = 0;

    for (let i = 0; i < data.invoices.length; i++) {
      const inv = data.invoices[i];
      try {
        const normalizedInv = normalizeBulkSupplierInvoiceRow(inv);
        // Check duplicate
        const [dup] = await tx
          .select({ id: supplierInvoices.id })
          .from(supplierInvoices)
          .where(
            and(
              eq(supplierInvoices.orgId, orgId),
              eq(supplierInvoices.supplierId, data.supplierId),
              eq(supplierInvoices.invoiceNumber, normalizedInv.invoiceNumber),
            ),
          )
          .limit(1);
        if (dup) {
          errors.push(buildBulkCreateInvoiceError(i, normalizedInv.invoiceNumber, "Duplicate invoice number"));
          continue;
        }

        await tx.insert(supplierInvoices).values(buildBulkSupplierInvoiceInsertValues({
          orgId,
          userId,
          data,
          invoice: normalizedInv,
          termsDays,
        }));
        created++;
        total += parseFloat(normalizedInv.amount);
      } catch (err: any) {
        errors.push(buildBulkCreateInvoiceError(i, inv.invoiceNumber, err.message));
      }
    }

    return buildBulkCreateInvoicesResult({ created, total, errors });
  });
}

export async function updateInvoice(
  orgId: string,
  id: string,
  data: SupplierInvoiceUpdateInput,
) {
  const [invoice] = await db
    .select()
    .from(supplierInvoices)
    .where(and(eq(supplierInvoices.id, id), eq(supplierInvoices.orgId, orgId)))
    .limit(1);

  if (!invoice) throw new Error("Invoice not found");
  assertInvoiceCanEdit(invoice.status);

  const updates = buildSupplierInvoiceUpdateFields({ data, invoice });

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
  assertInvoiceCanVoid(invoice.status);

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
  data: BulkMarkInvoicesPaidInput,
) {
  assertBulkMarkInvoicesPaidInput(data);

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
    const skippedIds = collectMissingBulkPaidInvoiceIds(data.invoiceIds, foundIds);
    let totalAmountPaid = 0;

    for (const inv of invoices) {
      // Skip already-settled invoices
      if (shouldSkipBulkPaidInvoice(inv)) {
        skippedIds.push(inv.id);
        continue;
      }

      // Determine payment date
      const payDate = resolveBulkPaidInvoicePaymentDate({
        invoiceDate: inv.invoiceDate,
        data,
        fallbackDate: new Date().toISOString().split("T")[0],
      });
      const paymentUpdate = buildBulkPaidInvoiceUpdate({
        invoice: inv,
        data,
        paymentDate: payDate,
      });

      await tx
        .update(supplierInvoices)
        .set(paymentUpdate.updateFields)
        .where(eq(supplierInvoices.id, inv.id));

      totalAmountPaid += paymentUpdate.amountPaid;
      successCount++;
    }

    return buildBulkMarkInvoicesPaidResult({
      successCount,
      skippedIds,
      totalAmountPaid,
    });
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
  context?: SupplierAuditContext,
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

  const updatedCount = (result as any).count ?? data.supplierIds.length;
  const invoiceTermsUpdated = await syncOpenSupplierInvoiceTerms(
    orgId,
    data.supplierIds,
    data.paymentTermsDays,
  );

  logAction({
    orgId,
    userId: context?.userId,
    action: "SUPPLIER_BULK_TERMS",
    entityType: "SUPPLIER",
    details: {
      supplierIds: data.supplierIds,
      paymentTermsDays: data.paymentTermsDays,
      updatedCount,
      invoiceTermsUpdated,
    },
    ipAddress: context?.ipAddress,
  });

  return { updatedCount };
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

  return formatCheckVoucherNumber(year, next);
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
  data: CheckVoucherCreateInput,
) {
  assertCheckVoucherHasLines(data.lines);

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

  validateCheckVoucherInvoiceLines({
    lines: data.lines,
    invoiceRows,
    supplierId: data.supplierId,
  });

  const totals = calculateCheckVoucherTotals(data.lines);

  return await db.transaction(async (tx) => {
    const cvNumber = await generateCvNumber(tx, orgId);

    const [cv] = await tx
      .insert(checkVouchers)
      .values(buildCheckVoucherInsertValues({
        orgId,
        cvNumber,
        userId,
        data,
        totals,
      }))
      .returning();

    // Insert lines
    for (const line of data.lines) {
      await tx.insert(checkVoucherLines).values(
        buildCheckVoucherLineInsertValues(cv.id, line),
      );
    }

    return cv;
  });
}

export async function updateCheckVoucher(
  orgId: string,
  id: string,
  data: CheckVoucherUpdateInput,
) {
  const [cv] = await db
    .select()
    .from(checkVouchers)
    .where(and(eq(checkVouchers.id, id), eq(checkVouchers.orgId, orgId)))
    .limit(1);

  if (!cv) throw new Error("Check voucher not found");
  assertCheckVoucherStatus(cv.status, "DRAFT", "Can only edit DRAFT check vouchers");

  const updates = buildCheckVoucherUpdateFields(data);

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
  assertCheckVoucherStatus(cv.status, "DRAFT", "Can only delete DRAFT check vouchers");

  await db.delete(checkVouchers).where(eq(checkVouchers.id, id));
}

export async function approveCheckVoucher(orgId: string, id: string, approvedBy: string) {
  const [cv] = await db
    .select()
    .from(checkVouchers)
    .where(and(eq(checkVouchers.id, id), eq(checkVouchers.orgId, orgId)))
    .limit(1);

  if (!cv) throw new Error("Check voucher not found");
  assertCheckVoucherStatus(cv.status, "DRAFT", "Can only approve DRAFT check vouchers");

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
  assertCheckVoucherStatus(cv.status, "APPROVED", "Can only print APPROVED check vouchers");

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
  assertCheckVoucherStatus(cv.status, "PRINTED", "Can only release PRINTED check vouchers");

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
  assertCheckVoucherStatus(cv.status, "RELEASED", "Can only clear RELEASED check vouchers");

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

      const paymentUpdate = calculateInvoicePaymentApplication({
        paidAmount: inv.paidAmount,
        totalAmount: inv.totalAmount,
        rtvCreditAmount: inv.rtvCreditAmount,
        allocation: parseFloat(line.amount),
        paidThreshold: 0,
      });

      await tx
        .update(supplierInvoices)
        .set({
          paidAmount: paymentUpdate.paidAmountText,
          balance: paymentUpdate.balanceText,
          status: paymentUpdate.status,
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
  assertCheckVoucherCanVoid(cv.status);

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

  return buildApAgingReportResponse(rows);
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

  const ledger = buildSupplierSoaLedgerEntries({ invoices, payments, rtvCredits });

  return {
    supplier: { id: supplier.id, name: supplier.name },
    entries: ledger.entries,
    closingBalance: ledger.closingBalance,
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
      s.contact_person,
      s.contact_email,
      s.contact_phone,
      s.address,
      s.tin,
      s.payment_terms_days,
      s.bank_name,
      s.bank_account_number,
      s.bank_account_name,
      COUNT(si.id)::int AS invoice_count,
      COALESCE(SUM(si.balance::numeric), 0)::numeric(14,2) AS total_balance,
      MIN(si.invoice_date) AS oldest_invoice_date,
      MIN(si.due_date) AS earliest_due_date,
      COUNT(CASE WHEN si.due_date < CURRENT_DATE THEN 1 END)::int AS overdue_count,
      COALESCE(SUM(CASE WHEN si.due_date < CURRENT_DATE THEN si.balance::numeric ELSE 0 END), 0)::numeric(14,2) AS overdue_amount,
      COUNT(*) FILTER (WHERE si.due_date >= CURRENT_DATE)::int AS current_count,
      COALESCE(SUM(si.balance::numeric) FILTER (WHERE si.due_date >= CURRENT_DATE), 0)::numeric(14,2) AS current_amount,
      COUNT(*) FILTER (WHERE CURRENT_DATE - si.due_date BETWEEN 1 AND 30)::int AS days_1_30_count,
      COALESCE(SUM(si.balance::numeric) FILTER (WHERE CURRENT_DATE - si.due_date BETWEEN 1 AND 30), 0)::numeric(14,2) AS days_1_30_amount,
      COUNT(*) FILTER (WHERE CURRENT_DATE - si.due_date BETWEEN 31 AND 60)::int AS days_31_60_count,
      COALESCE(SUM(si.balance::numeric) FILTER (WHERE CURRENT_DATE - si.due_date BETWEEN 31 AND 60), 0)::numeric(14,2) AS days_31_60_amount,
      COUNT(*) FILTER (WHERE CURRENT_DATE - si.due_date BETWEEN 61 AND 90)::int AS days_61_90_count,
      COALESCE(SUM(si.balance::numeric) FILTER (WHERE CURRENT_DATE - si.due_date BETWEEN 61 AND 90), 0)::numeric(14,2) AS days_61_90_amount,
      COUNT(*) FILTER (WHERE CURRENT_DATE - si.due_date > 90)::int AS days_90_plus_count,
      COALESCE(SUM(si.balance::numeric) FILTER (WHERE CURRENT_DATE - si.due_date > 90), 0)::numeric(14,2) AS days_90_plus_amount,
      COALESCE(MAX(cm.credit_memo_count), 0)::int AS available_credit_memo_count,
      COALESCE(MAX(cm.credit_memo_amount), 0)::numeric(14,2) AS available_credit_memo_amount,
      MAX(pay.last_payment_date)::text AS last_payment_date,
      MAX(soa.last_soa_date)::text AS last_soa_date,
      COALESCE(MAX(pay.paid_this_month), 0)::numeric(14,2) AS paid_this_month,
      COALESCE(MAX(pay.open_voucher_count), 0)::int AS open_voucher_count
    FROM suppliers s
    JOIN supplier_invoices si ON si.supplier_id = s.id AND si.org_id = s.org_id
    LEFT JOIN (
      SELECT
        supplier_id,
        COUNT(*)::int AS credit_memo_count,
        COALESCE(SUM(ABS(total_amount::numeric)), 0)::numeric(14,2) AS credit_memo_amount
      FROM supplier_invoices
      WHERE org_id = ${orgId}
        AND status IN ('OPEN', 'PAID', 'PARTIALLY_PAID')
        AND billed = false
        AND (total_amount::numeric < 0 OR invoice_number ILIKE 'CM%')
      GROUP BY supplier_id
    ) cm ON cm.supplier_id = s.id
    LEFT JOIN (
      SELECT
        supplier_id,
        MAX(payment_date)::text AS last_payment_date,
        COALESCE(SUM(net_amount::numeric) FILTER (
          WHERE status = 'CONFIRMED'
            AND payment_date >= date_trunc('month', CURRENT_DATE)::date
            AND payment_date < (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month')::date
        ), 0)::numeric(14,2) AS paid_this_month,
        COUNT(*) FILTER (WHERE status IN ('DRAFT', 'PRINTED'))::int AS open_voucher_count
      FROM supplier_disbursement_vouchers
      WHERE org_id = ${orgId}
        AND status != 'VOIDED'
      GROUP BY supplier_id
    ) pay ON pay.supplier_id = s.id
    LEFT JOIN (
      SELECT supplier_id, MAX(generated_at)::text AS last_soa_date
      FROM supplier_soa_records
      WHERE org_id = ${orgId}
        AND status != 'VOID'
      GROUP BY supplier_id
    ) soa ON soa.supplier_id = s.id
    WHERE s.org_id = ${orgId}
      AND si.status IN ('OPEN', 'PARTIALLY_PAID')
      AND si.balance::numeric > 0
    GROUP BY s.id, s.name, s.contact_person, s.contact_email, s.contact_phone, s.address,
      s.tin, s.payment_terms_days, s.bank_name, s.bank_account_number, s.bank_account_name
    ORDER BY total_balance DESC
  `);

  // Due this week
  const dueThisWeek = await db.execute(sql`
    SELECT COALESCE(SUM(balance::numeric), 0)::numeric(14,2) AS amount
    FROM supplier_invoices
    WHERE org_id = ${orgId}
      AND status IN ('OPEN', 'PARTIALLY_PAID')
      AND due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days'
  `);

  return buildSupplierSoaOverviewResponse(
    rows as any[],
    (dueThisWeek as any[])[0]?.amount,
  );
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

export type SupplierAuditContext = {
  userId?: string;
  ipAddress?: string;
};

export type SupplierActivityKind = "invoices" | "pos" | "returns" | "soas" | "dvs" | "audit";
export type SupplierActivitySortDir = "asc" | "desc";

export type SupplierActivityQuery = {
  kind: SupplierActivityKind;
  page?: number;
  pageSize?: number;
  search?: string;
  status?: string;
  sort?: string;
  dir?: SupplierActivitySortDir;
};

export type SupplierMergeInput = {
  sourceSupplierId: string;
  reason?: string;
  dryRun?: boolean;
};

const SUPPLIER_ACTIVITY_KINDS = new Set<SupplierActivityKind>([
  "invoices",
  "pos",
  "returns",
  "soas",
  "dvs",
  "audit",
]);

const SUPPLIER_ACTIVITY_SORTS: Record<SupplierActivityKind, Record<string, SQL>> = {
  invoices: {
    invoiceDate: sql`si.invoice_date`,
    dueDate: sql`si.due_date`,
    invoiceNumber: sql`si.invoice_number`,
    amount: sql`si.total_amount::numeric`,
    balance: sql`si.balance::numeric`,
    status: sql`si.status`,
  },
  pos: {
    orderDate: sql`po.created_at`,
    poNumber: sql`po.po_no`,
    total: sql`COALESCE(po_totals.total_cost, 0)`,
    status: sql`po.status`,
  },
  returns: {
    createdAt: sql`sr.created_at`,
    rtvNumber: sql`sr.rtv_number`,
    totalCost: sql`sr.total_cost::numeric`,
    creditAmount: sql`sr.credit_amount::numeric`,
    status: sql`sr.status`,
  },
  soas: {
    generatedAt: sql`sr.generated_at`,
    soaNumber: sql`sr.soa_number`,
    totalAmount: sql`sr.total_amount::numeric`,
    totalBalance: sql`sr.total_balance::numeric`,
    status: sql`sr.status`,
  },
  dvs: {
    paymentDate: sql`dv.payment_date`,
    dvNumber: sql`dv.dv_number`,
    amount: sql`dv.amount::numeric`,
    status: sql`dv.status`,
  },
  audit: {
    createdAt: sql`al.created_at`,
    action: sql`al.action`,
  },
};

const SUPPLIER_ACTIVITY_DEFAULT_SORT: Record<SupplierActivityKind, string> = {
  invoices: "invoiceDate",
  pos: "orderDate",
  returns: "createdAt",
  soas: "generatedAt",
  dvs: "paymentDate",
  audit: "createdAt",
};

const SUPPLIER_ACTIVITY_STATUS_OPTIONS: Record<SupplierActivityKind, string[]> = {
  invoices: ["OPEN", "PARTIALLY_PAID", "PAID", "VOIDED"],
  pos: ["DRAFT", "SUBMITTED", "PARTIALLY_RECEIVED", "RECEIVED", "CANCELLED"],
  returns: ["DRAFT", "SUBMITTED", "ACKNOWLEDGED", "CREDIT_RECEIVED", "CLOSED", "CANCELLED"],
  soas: ["GENERATED", "SENT", "VOID"],
  dvs: ["DRAFT", "PRINTED", "CONFIRMED", "VOIDED"],
  audit: ["SUPPLIER_CREATE", "SUPPLIER_UPDATE", "SUPPLIER_BANK_CHANGE", "SUPPLIER_BANK_VERIFY", "SUPPLIER_MERGE"],
};

function toNumber(value: unknown): number {
  const parsed = Number.parseFloat(String(value ?? "0"));
  return Number.isFinite(parsed) ? parsed : 0;
}

function toInt(value: unknown): number {
  const parsed = Number.parseInt(String(value ?? "0"), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeSupplierActivityQuery(query: SupplierActivityQuery) {
  if (!SUPPLIER_ACTIVITY_KINDS.has(query.kind)) {
    throw new Error("Invalid supplier activity kind");
  }
  const page = Math.max(1, Number.isFinite(query.page ?? NaN) ? Number(query.page) : 1);
  const pageSize = Math.min(
    100,
    Math.max(1, Number.isFinite(query.pageSize ?? NaN) ? Number(query.pageSize) : 25),
  );
  const sortKey = query.sort || SUPPLIER_ACTIVITY_DEFAULT_SORT[query.kind];
  const sortSql = SUPPLIER_ACTIVITY_SORTS[query.kind][sortKey];
  if (!sortSql) {
    throw new Error("Invalid supplier activity sort");
  }

  return {
    kind: query.kind,
    page,
    pageSize,
    offset: (page - 1) * pageSize,
    search: query.search?.trim() || "",
    status: query.status?.trim() || "",
    sort: sortKey,
    sortSql,
    dirSql: query.dir === "asc" ? sql`ASC` : sql`DESC`,
    dir: query.dir === "asc" ? "asc" as const : "desc" as const,
  };
}

function logSupplierAudit(
  orgId: string,
  supplierId: string,
  action: string,
  details: Record<string, unknown>,
  context?: SupplierAuditContext,
) {
  logAction({
    orgId,
    userId: context?.userId,
    action,
    entityType: "SUPPLIER",
    entityId: supplierId,
    details,
    ipAddress: context?.ipAddress,
  });
}

async function syncOpenSupplierInvoiceTerms(
  orgId: string,
  supplierIds: string[],
  paymentTermsDays: number,
) {
  if (supplierIds.length === 0) return 0;

  const rows = await db
    .update(supplierInvoices)
    .set({
      paymentTermsDays,
      dueDate: sql`${supplierInvoices.invoiceDate} + ${paymentTermsDays}::int`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(supplierInvoices.orgId, orgId),
        inArray(supplierInvoices.supplierId, supplierIds),
        inArray(supplierInvoices.status, ["OPEN", "PARTIALLY_PAID"] as any),
      ),
    )
    .returning({ id: supplierInvoices.id });

  return rows.length;
}

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
      bank_audit.last_bank_change_at,
      COALESCE(bank_audit.bank_change_count, 0)::int AS bank_change_count,
      s.bank_verified_at,
      s.bank_verified_by,
      bank_verified_by.full_name AS bank_verified_by_name,

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
    LEFT JOIN (
      SELECT
        entity_id,
        MAX(created_at) AS last_bank_change_at,
        COUNT(*)::int AS bank_change_count
      FROM audit_logs
      WHERE org_id = ${orgId}
        AND entity_type = 'SUPPLIER'
        AND action = 'SUPPLIER_BANK_CHANGE'
      GROUP BY entity_id
    ) bank_audit ON bank_audit.entity_id = s.id
    LEFT JOIN users bank_verified_by ON bank_verified_by.id = s.bank_verified_by
    WHERE s.org_id = ${orgId}
    ORDER BY s.name ASC
  `)) as any[];

  return enrichSuppliersWithSafety(rows.map(mapSupplierApStatsRow));
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
      s.created_at, s.updated_at,
      bank_audit.last_bank_change_at,
      COALESCE(bank_audit.bank_change_count, 0)::int AS bank_change_count,
      s.bank_verified_at,
      s.bank_verified_by,
      bank_verified_by.full_name AS bank_verified_by_name
    FROM suppliers s
    LEFT JOIN (
      SELECT
        entity_id,
        MAX(created_at) AS last_bank_change_at,
        COUNT(*)::int AS bank_change_count
      FROM audit_logs
      WHERE org_id = ${orgId}
        AND entity_type = 'SUPPLIER'
        AND action = 'SUPPLIER_BANK_CHANGE'
      GROUP BY entity_id
    ) bank_audit ON bank_audit.entity_id = s.id
    LEFT JOIN users bank_verified_by ON bank_verified_by.id = s.bank_verified_by
    WHERE s.id = ${supplierId} AND s.org_id = ${orgId}
  `)) as any[];
  if (!row) return null;

  const detail = mapSupplierApDetailRow(row);
  const enrichedRows = await listSuppliersWithAPStats(orgId);
  const safety = enrichedRows.find((supplier) => supplier.id === supplierId);

  return {
    ...detail,
    safety: safety?.safety,
    duplicateWarnings: safety?.duplicateWarnings ?? [],
    riskBadges: safety?.riskBadges ?? [],
    hasBankChangeHistory: safety?.hasBankChangeHistory ?? false,
  };
}

export async function verifySupplierBank(
  orgId: string,
  supplierId: string,
  context?: SupplierAuditContext,
) {
  const [supplier] = (await db.execute(sql`
    SELECT id, name, bank_name, bank_account_number, bank_account_name
    FROM suppliers
    WHERE id = ${supplierId} AND org_id = ${orgId}
    LIMIT 1
  `)) as any[];

  if (!supplier) throw new Error("Supplier not found");
  if (!supplier.bank_name?.trim() || !supplier.bank_account_number?.trim() || !supplier.bank_account_name?.trim()) {
    throw new Error("Complete bank name, account number, and account name before verification");
  }

  const [updated] = (await db.execute(sql`
    UPDATE suppliers
    SET bank_verified_at = NOW(),
        bank_verified_by = ${context?.userId ?? null},
        updated_at = NOW()
    WHERE id = ${supplierId} AND org_id = ${orgId}
    RETURNING id, name, bank_verified_at, bank_verified_by
  `)) as any[];

  logSupplierAudit(
    orgId,
    supplierId,
    "SUPPLIER_BANK_VERIFY",
    {
      supplierName: supplier.name,
      bankName: supplier.bank_name,
      bankAccountName: supplier.bank_account_name,
    },
    context,
  );

  return {
    id: updated.id,
    name: updated.name,
    bankVerifiedAt: updated.bank_verified_at,
    bankVerifiedBy: updated.bank_verified_by,
  };
}

export async function getSupplierAPOverview(orgId: string, supplierId: string) {
  const detail = await getSupplierAPDetail(orgId, supplierId);
  if (!detail) return null;

  const [aging] = (await db.execute(sql`
    SELECT
      COALESCE(SUM(balance::numeric) FILTER (WHERE due_date >= CURRENT_DATE), 0)::text AS current_amount,
      COALESCE(SUM(balance::numeric) FILTER (WHERE CURRENT_DATE - due_date BETWEEN 1 AND 30), 0)::text AS days_1_30_amount,
      COALESCE(SUM(balance::numeric) FILTER (WHERE CURRENT_DATE - due_date BETWEEN 31 AND 60), 0)::text AS days_31_60_amount,
      COALESCE(SUM(balance::numeric) FILTER (WHERE CURRENT_DATE - due_date BETWEEN 61 AND 90), 0)::text AS days_61_90_amount,
      COALESCE(SUM(balance::numeric) FILTER (WHERE CURRENT_DATE - due_date > 90), 0)::text AS days_90_plus_amount,
      COALESCE(SUM(balance::numeric), 0)::text AS total_balance,
      COALESCE(SUM(balance::numeric) FILTER (WHERE due_date < CURRENT_DATE), 0)::text AS overdue_amount,
      COUNT(*)::int AS open_count
    FROM supplier_invoices
    WHERE org_id = ${orgId}
      AND supplier_id = ${supplierId}
      AND status IN ('OPEN', 'PARTIALLY_PAID')
      AND balance::numeric > 0
  `)) as any[];

  const [credits] = (await db.execute(sql`
    SELECT
      COUNT(*)::int AS count,
      COALESCE(SUM(ABS(balance::numeric)), 0)::text AS amount
    FROM supplier_invoices
    WHERE org_id = ${orgId}
      AND supplier_id = ${supplierId}
      AND status IN ('OPEN', 'PARTIALLY_PAID')
      AND (total_amount::numeric < 0 OR invoice_number ILIKE 'CM-%')
  `)) as any[];

  const [tabs] = (await db.execute(sql`
    SELECT
      (SELECT COUNT(*)::int FROM supplier_invoices si WHERE si.org_id = ${orgId} AND si.supplier_id = ${supplierId}) AS invoices_count,
      (SELECT COALESCE(SUM(si.balance::numeric), 0)::text FROM supplier_invoices si WHERE si.org_id = ${orgId} AND si.supplier_id = ${supplierId} AND si.status IN ('OPEN','PARTIALLY_PAID')) AS invoices_amount,
      (SELECT COUNT(*)::int FROM purchase_orders po WHERE po.org_id = ${orgId} AND po.supplier_id = ${supplierId}) AS pos_count,
      (SELECT COALESCE(SUM(pl.ordered_qty * pl.unit_cost::numeric), 0)::text
         FROM purchase_orders po
         LEFT JOIN po_lines pl ON pl.purchase_order_id = po.id
        WHERE po.org_id = ${orgId} AND po.supplier_id = ${supplierId}) AS pos_amount,
      (SELECT COUNT(*)::int FROM supplier_returns sr WHERE sr.org_id = ${orgId} AND sr.supplier_id = ${supplierId}) AS returns_count,
      (SELECT COALESCE(SUM(sr.credit_amount::numeric), 0)::text FROM supplier_returns sr WHERE sr.org_id = ${orgId} AND sr.supplier_id = ${supplierId}) AS returns_amount,
      (SELECT COUNT(*)::int FROM supplier_soa_records ssr WHERE ssr.org_id = ${orgId} AND ssr.supplier_id = ${supplierId}) AS soas_count,
      (SELECT COALESCE(SUM(ssr.total_balance::numeric), 0)::text FROM supplier_soa_records ssr WHERE ssr.org_id = ${orgId} AND ssr.supplier_id = ${supplierId} AND ssr.status != 'VOID') AS soas_amount,
      (SELECT COUNT(*)::int FROM supplier_disbursement_vouchers dv WHERE dv.org_id = ${orgId} AND dv.supplier_id = ${supplierId}) AS dvs_count,
      (SELECT COALESCE(SUM(dv.amount::numeric), 0)::text FROM supplier_disbursement_vouchers dv WHERE dv.org_id = ${orgId} AND dv.supplier_id = ${supplierId} AND dv.status != 'VOIDED') AS dvs_amount,
      (SELECT COUNT(*)::int FROM audit_logs al WHERE al.org_id = ${orgId} AND al.entity_type = 'SUPPLIER' AND al.entity_id = ${supplierId}) AS audit_count
  `)) as any[];

  const [lastActivity] = (await db.execute(sql`
    SELECT
      (SELECT jsonb_build_object('poNumber', po.po_no, 'date', po.created_at)
         FROM purchase_orders po
        WHERE po.org_id = ${orgId} AND po.supplier_id = ${supplierId}
        ORDER BY po.created_at DESC
        LIMIT 1) AS last_po,
      (SELECT jsonb_build_object('dvNumber', dv.dv_number, 'date', dv.payment_date, 'amount', dv.amount::text)
         FROM supplier_disbursement_vouchers dv
        WHERE dv.org_id = ${orgId} AND dv.supplier_id = ${supplierId} AND dv.status != 'VOIDED'
        ORDER BY dv.payment_date DESC, dv.created_at DESC
        LIMIT 1) AS last_payment,
      (SELECT jsonb_build_object('soaNumber', ssr.soa_number, 'date', ssr.generated_at, 'balance', ssr.total_balance::text)
         FROM supplier_soa_records ssr
        WHERE ssr.org_id = ${orgId} AND ssr.supplier_id = ${supplierId}
        ORDER BY ssr.generated_at DESC
        LIMIT 1) AS last_soa
  `)) as any[];

  const bankVerificationStatus = buildSupplierBankVerificationStatus(detail) as SupplierBankVerificationStatus;
  const duplicateWarnings = detail.duplicateWarnings ?? [];
  const totalPayable = toNumber(aging?.total_balance);
  const recommendedAction =
    bankVerificationStatus === "missing"
      ? { code: "complete_bank", label: "Complete bank details", tab: "details" }
      : bankVerificationStatus !== "verified"
      ? { code: "verify_bank", label: "Verify bank profile", tab: "overview" }
      : duplicateWarnings.length > 0
      ? { code: "review_duplicates", label: "Review possible duplicate", tab: "overview" }
      : totalPayable > 0
      ? { code: "generate_soa", label: "Generate supplier SOA", href: `/ap/supplier-soa?supplierId=${supplierId}` }
      : { code: "record_invoice", label: "Record invoice", href: `/ap/invoices?supplierId=${supplierId}` };

  return {
    supplier: {
      ...detail,
      bankVerificationStatus,
    },
    tabSummaries: {
      invoices: { count: toInt(tabs?.invoices_count), totalAmount: toNumber(tabs?.invoices_amount) },
      pos: { count: toInt(tabs?.pos_count), totalAmount: toNumber(tabs?.pos_amount) },
      returns: { count: toInt(tabs?.returns_count), totalAmount: toNumber(tabs?.returns_amount) },
      soas: { count: toInt(tabs?.soas_count), totalAmount: toNumber(tabs?.soas_amount) },
      dvs: { count: toInt(tabs?.dvs_count), totalAmount: toNumber(tabs?.dvs_amount) },
      audit: { count: toInt(tabs?.audit_count), totalAmount: 0 },
    },
    aging: {
      current: toNumber(aging?.current_amount),
      days1To30: toNumber(aging?.days_1_30_amount),
      days31To60: toNumber(aging?.days_31_60_amount),
      days61To90: toNumber(aging?.days_61_90_amount),
      days90Plus: toNumber(aging?.days_90_plus_amount),
      total: totalPayable,
      overdue: toNumber(aging?.overdue_amount),
      openCount: toInt(aging?.open_count),
    },
    availableCredits: {
      count: toInt(credits?.count),
      amount: toNumber(credits?.amount),
    },
    lastActivity,
    paymentSafety: {
      bankVerificationStatus,
      lastBankChangeAt: detail.lastBankChangeAt,
      bankChangeCount: detail.bankChangeCount,
      bankVerifiedAt: detail.bankVerifiedAt ?? null,
      bankVerifiedBy: detail.bankVerifiedBy ?? null,
      bankVerifiedByName: detail.bankVerifiedByName ?? null,
    },
    duplicateWarnings,
    recommendedAction,
  };
}

function supplierActivitySummary(total: number, totalAmount: unknown) {
  return {
    count: total,
    totalAmount: toNumber(totalAmount),
  };
}

function supplierActivityResponse(
  kind: SupplierActivityKind,
  normalized: ReturnType<typeof normalizeSupplierActivityQuery>,
  total: number,
  totalAmount: unknown,
  rows: any[],
) {
  return {
    data: rows,
    page: normalized.page,
    pageSize: normalized.pageSize,
    total,
    summary: supplierActivitySummary(total, totalAmount),
    statusOptions: SUPPLIER_ACTIVITY_STATUS_OPTIONS[kind],
  };
}

export async function listSupplierActivity(
  orgId: string,
  supplierId: string,
  query: SupplierActivityQuery,
) {
  const normalized = normalizeSupplierActivityQuery(query);

  const [exists] = (await db.execute(sql`
    SELECT id FROM suppliers WHERE id = ${supplierId} AND org_id = ${orgId} LIMIT 1
  `)) as any[];
  if (!exists) throw new Error("Supplier not found");

  const searchPattern = `%${normalized.search}%`;
  const statusPattern = normalized.status ? normalized.status.split(",").filter(Boolean) : [];

  if (normalized.kind === "invoices") {
    const searchSql = normalized.search
      ? sql`AND (si.invoice_number ILIKE ${searchPattern} OR COALESCE(si.notes, '') ILIKE ${searchPattern})`
      : sql``;
    const statusSql = statusPattern.length > 0
      ? sql`AND si.status::text = ANY(${statusPattern})`
      : sql``;
    const [countRow] = (await db.execute(sql`
      SELECT
        COUNT(*)::int AS total,
        COALESCE(SUM(si.balance::numeric), 0)::text AS total_amount
      FROM supplier_invoices si
      WHERE si.org_id = ${orgId} AND si.supplier_id = ${supplierId}
      ${searchSql}
      ${statusSql}
    `)) as any[];
    const rows = (await db.execute(sql`
      SELECT
        si.id,
        si.invoice_number AS "invoiceNumber",
        si.invoice_date::text AS "invoiceDate",
        si.due_date::text AS "dueDate",
        si.total_amount::text AS "totalAmount",
        si.paid_amount::text AS "paidAmount",
        si.balance::text AS "balance",
        si.status,
        si.notes,
        si.payment_terms_days AS "paymentTermsDays"
      FROM supplier_invoices si
      WHERE si.org_id = ${orgId} AND si.supplier_id = ${supplierId}
      ${searchSql}
      ${statusSql}
      ORDER BY ${normalized.sortSql} ${normalized.dirSql}, si.id DESC
      LIMIT ${normalized.pageSize} OFFSET ${normalized.offset}
    `)) as any[];
    const total = toInt(countRow?.total);
    return supplierActivityResponse("invoices", normalized, total, countRow?.total_amount, rows);
  }

  if (normalized.kind === "pos") {
    const searchSql = normalized.search ? sql`AND po.po_no ILIKE ${searchPattern}` : sql``;
    const statusSql = statusPattern.length > 0 ? sql`AND po.status::text = ANY(${statusPattern})` : sql``;
    const [countRow] = (await db.execute(sql`
      SELECT
        COUNT(*)::int AS total,
        COALESCE(SUM(COALESCE(po_totals.total_cost, 0)), 0)::text AS total_amount
      FROM purchase_orders po
      LEFT JOIN (
        SELECT purchase_order_id, SUM(ordered_qty * unit_cost::numeric) AS total_cost
        FROM po_lines
        GROUP BY purchase_order_id
      ) po_totals ON po_totals.purchase_order_id = po.id
      WHERE po.org_id = ${orgId} AND po.supplier_id = ${supplierId}
      ${searchSql}
      ${statusSql}
    `)) as any[];
    const rows = (await db.execute(sql`
      SELECT
        po.id,
        po.po_no AS "poNumber",
        po.created_at::text AS "orderDate",
        COALESCE(po_totals.item_count, 0)::int AS "itemCount",
        COALESCE(po_totals.total_cost, 0)::text AS "totalCost",
        po.status
      FROM purchase_orders po
      LEFT JOIN (
        SELECT purchase_order_id, COUNT(*)::int AS item_count, SUM(ordered_qty * unit_cost::numeric) AS total_cost
        FROM po_lines
        GROUP BY purchase_order_id
      ) po_totals ON po_totals.purchase_order_id = po.id
      WHERE po.org_id = ${orgId} AND po.supplier_id = ${supplierId}
      ${searchSql}
      ${statusSql}
      ORDER BY ${normalized.sortSql} ${normalized.dirSql}, po.id DESC
      LIMIT ${normalized.pageSize} OFFSET ${normalized.offset}
    `)) as any[];
    const total = toInt(countRow?.total);
    return supplierActivityResponse("pos", normalized, total, countRow?.total_amount, rows);
  }

  if (normalized.kind === "returns") {
    const searchSql = normalized.search
      ? sql`AND (sr.rtv_number ILIKE ${searchPattern} OR COALESCE(sr.credit_reference, '') ILIKE ${searchPattern})`
      : sql``;
    const statusSql = statusPattern.length > 0 ? sql`AND sr.status::text = ANY(${statusPattern})` : sql``;
    const [countRow] = (await db.execute(sql`
      SELECT
        COUNT(*)::int AS total,
        COALESCE(SUM(sr.credit_amount::numeric), 0)::text AS total_amount
      FROM supplier_returns sr
      WHERE sr.org_id = ${orgId} AND sr.supplier_id = ${supplierId}
      ${searchSql}
      ${statusSql}
    `)) as any[];
    const rows = (await db.execute(sql`
      SELECT
        sr.id,
        sr.rtv_number AS "rtvNumber",
        sr.created_at::text AS "createdAt",
        COALESCE(line_counts.item_count, 0)::int AS "itemCount",
        sr.total_cost::text AS "totalCost",
        sr.credit_amount::text AS "creditAmount",
        sr.status
      FROM supplier_returns sr
      LEFT JOIN (
        SELECT supplier_return_id, COUNT(*)::int AS item_count
        FROM supplier_return_lines
        GROUP BY supplier_return_id
      ) line_counts ON line_counts.supplier_return_id = sr.id
      WHERE sr.org_id = ${orgId} AND sr.supplier_id = ${supplierId}
      ${searchSql}
      ${statusSql}
      ORDER BY ${normalized.sortSql} ${normalized.dirSql}, sr.id DESC
      LIMIT ${normalized.pageSize} OFFSET ${normalized.offset}
    `)) as any[];
    const total = toInt(countRow?.total);
    return supplierActivityResponse("returns", normalized, total, countRow?.total_amount, rows);
  }

  if (normalized.kind === "soas") {
    const searchSql = normalized.search ? sql`AND sr.soa_number ILIKE ${searchPattern}` : sql``;
    const statusSql = statusPattern.length > 0 ? sql`AND sr.status = ANY(${statusPattern})` : sql``;
    const [countRow] = (await db.execute(sql`
      SELECT
        COUNT(*)::int AS total,
        COALESCE(SUM(sr.total_balance::numeric), 0)::text AS total_amount
      FROM supplier_soa_records sr
      WHERE sr.org_id = ${orgId} AND sr.supplier_id = ${supplierId}
      ${searchSql}
      ${statusSql}
    `)) as any[];
    const rows = (await db.execute(sql`
      SELECT
        sr.id,
        sr.soa_number AS "soaNumber",
        sr.date_from::text AS "dateFrom",
        sr.date_to::text AS "dateTo",
        sr.generated_at::text AS "generatedAt",
        sr.total_amount::numeric AS "totalAmount",
        sr.total_paid::numeric AS "totalPaid",
        sr.total_balance::numeric AS "totalBalance",
        sr.invoice_count::int AS "invoiceCount",
        sr.status
      FROM supplier_soa_records sr
      WHERE sr.org_id = ${orgId} AND sr.supplier_id = ${supplierId}
      ${searchSql}
      ${statusSql}
      ORDER BY ${normalized.sortSql} ${normalized.dirSql}, sr.id DESC
      LIMIT ${normalized.pageSize} OFFSET ${normalized.offset}
    `)) as any[];
    const total = toInt(countRow?.total);
    return supplierActivityResponse("soas", normalized, total, countRow?.total_amount, rows);
  }

  if (normalized.kind === "dvs") {
    const searchSql = normalized.search
      ? sql`AND (dv.dv_number ILIKE ${searchPattern} OR COALESCE(dv.check_number, '') ILIKE ${searchPattern})`
      : sql``;
    const statusSql = statusPattern.length > 0 ? sql`AND dv.status::text = ANY(${statusPattern})` : sql``;
    const [countRow] = (await db.execute(sql`
      SELECT
        COUNT(*)::int AS total,
        COALESCE(SUM(dv.amount::numeric), 0)::text AS total_amount
      FROM supplier_disbursement_vouchers dv
      WHERE dv.org_id = ${orgId} AND dv.supplier_id = ${supplierId}
      ${searchSql}
      ${statusSql}
    `)) as any[];
    const rows = (await db.execute(sql`
      SELECT
        dv.id,
        dv.dv_number AS "dvNumber",
        dv.payment_date::text AS "paymentDate",
        dv.amount::numeric AS amount,
        dv.payment_method AS "paymentMethod",
        dv.check_number AS "checkNumber",
        dv.status
      FROM supplier_disbursement_vouchers dv
      WHERE dv.org_id = ${orgId} AND dv.supplier_id = ${supplierId}
      ${searchSql}
      ${statusSql}
      ORDER BY ${normalized.sortSql} ${normalized.dirSql}, dv.id DESC
      LIMIT ${normalized.pageSize} OFFSET ${normalized.offset}
    `)) as any[];
    const total = toInt(countRow?.total);
    return supplierActivityResponse("dvs", normalized, total, countRow?.total_amount, rows);
  }

  const searchSql = normalized.search
    ? sql`AND (al.action ILIKE ${searchPattern} OR COALESCE(al.details::text, '') ILIKE ${searchPattern})`
    : sql``;
  const statusSql = statusPattern.length > 0 ? sql`AND al.action = ANY(${statusPattern})` : sql``;
  const [countRow] = (await db.execute(sql`
    SELECT COUNT(*)::int AS total
    FROM audit_logs al
    WHERE al.org_id = ${orgId}
      AND al.entity_type = 'SUPPLIER'
      AND al.entity_id = ${supplierId}
    ${searchSql}
    ${statusSql}
  `)) as any[];
  const rows = (await db.execute(sql`
    SELECT
      al.id,
      u.full_name AS "userName",
      al.action,
      al.details,
      al.created_at::text AS "createdAt"
    FROM audit_logs al
    LEFT JOIN users u ON u.id = al.user_id
    WHERE al.org_id = ${orgId}
      AND al.entity_type = 'SUPPLIER'
      AND al.entity_id = ${supplierId}
    ${searchSql}
    ${statusSql}
    ORDER BY ${normalized.sortSql} ${normalized.dirSql}, al.id DESC
    LIMIT ${normalized.pageSize} OFFSET ${normalized.offset}
  `)) as any[];
  const total = toInt(countRow?.total);
  return supplierActivityResponse("audit", normalized, total, 0, rows);
}

async function buildSupplierMergePreview(orgId: string, targetSupplierId: string, sourceSupplierId: string) {
  if (targetSupplierId === sourceSupplierId) {
    throw new Error("Source and target suppliers must be different");
  }

  const suppliersRows = (await db.execute(sql`
    SELECT id, name
    FROM suppliers
    WHERE org_id = ${orgId}
      AND (id = ${targetSupplierId} OR id = ${sourceSupplierId})
  `)) as any[];
  const target = suppliersRows.find((row) => row.id === targetSupplierId);
  const source = suppliersRows.find((row) => row.id === sourceSupplierId);
  if (!target || !source) throw new Error("Supplier not found");

  const [counts] = (await db.execute(sql`
    SELECT
      (SELECT COUNT(*)::int FROM supplier_invoices WHERE org_id = ${orgId} AND supplier_id = ${sourceSupplierId}) AS invoices,
      (SELECT COUNT(*)::int FROM supplier_soa_records WHERE org_id = ${orgId} AND supplier_id = ${sourceSupplierId}) AS soas,
      (SELECT COUNT(*)::int FROM supplier_disbursement_vouchers WHERE org_id = ${orgId} AND supplier_id = ${sourceSupplierId}) AS dvs,
      (SELECT COUNT(*)::int FROM check_vouchers WHERE org_id = ${orgId} AND supplier_id = ${sourceSupplierId}) AS check_vouchers,
      (SELECT COUNT(*)::int FROM purchase_orders WHERE org_id = ${orgId} AND supplier_id = ${sourceSupplierId}) AS purchase_orders,
      (SELECT COUNT(*)::int FROM supplier_returns WHERE org_id = ${orgId} AND supplier_id = ${sourceSupplierId}) AS supplier_returns,
      (SELECT COUNT(*)::int FROM product_suppliers WHERE org_id = ${orgId} AND supplier_id = ${sourceSupplierId}) AS product_suppliers
  `)) as any[];

  const invoiceConflicts = (await db.execute(sql`
    SELECT src.invoice_number
    FROM supplier_invoices src
    JOIN supplier_invoices tgt
      ON tgt.org_id = src.org_id
     AND tgt.supplier_id = ${targetSupplierId}
     AND tgt.invoice_number = src.invoice_number
    WHERE src.org_id = ${orgId}
      AND src.supplier_id = ${sourceSupplierId}
    ORDER BY src.invoice_number
    LIMIT 25
  `)) as any[];

  const productSupplierConflicts = (await db.execute(sql`
    SELECT src.product_id
    FROM product_suppliers src
    JOIN product_suppliers tgt
      ON tgt.org_id = src.org_id
     AND tgt.supplier_id = ${targetSupplierId}
     AND tgt.product_id = src.product_id
    WHERE src.org_id = ${orgId}
      AND src.supplier_id = ${sourceSupplierId}
    LIMIT 25
  `)) as any[];

  const conflicts = [
    ...invoiceConflicts.map((row) => ({
      type: "invoice_number",
      label: `Duplicate invoice # ${row.invoice_number}`,
      value: row.invoice_number,
    })),
    ...productSupplierConflicts.map((row) => ({
      type: "product_supplier",
      label: "Product already has the target supplier linked",
      value: row.product_id,
    })),
  ];

  return {
    targetSupplierId,
    targetSupplierName: target.name,
    sourceSupplierId,
    sourceSupplierName: source.name,
    counts: {
      invoices: toInt(counts?.invoices),
      soas: toInt(counts?.soas),
      dvs: toInt(counts?.dvs),
      checkVouchers: toInt(counts?.check_vouchers),
      purchaseOrders: toInt(counts?.purchase_orders),
      supplierReturns: toInt(counts?.supplier_returns),
      productSuppliers: toInt(counts?.product_suppliers),
    },
    conflicts,
  };
}

export async function mergeSupplierAP(
  orgId: string,
  targetSupplierId: string,
  input: SupplierMergeInput,
  context?: SupplierAuditContext,
) {
  if (!input.sourceSupplierId) throw new Error("sourceSupplierId is required");
  const preview = await buildSupplierMergePreview(orgId, targetSupplierId, input.sourceSupplierId);
  if (input.dryRun) {
    return { dryRun: true, merged: false, ...preview };
  }
  if (preview.conflicts.length > 0) {
    const err = Object.assign(new Error("Supplier merge has conflicts"), {
      details: preview.conflicts,
    });
    throw err;
  }

  const reason = input.reason?.trim() || "Supplier duplicate merge";
  await db.transaction(async (tx) => {
    await tx.execute(sql`
      UPDATE supplier_invoices
      SET supplier_id = ${targetSupplierId}, updated_at = NOW()
      WHERE org_id = ${orgId} AND supplier_id = ${input.sourceSupplierId}
    `);
    await tx.execute(sql`
      UPDATE supplier_soa_records
      SET supplier_id = ${targetSupplierId}
      WHERE org_id = ${orgId} AND supplier_id = ${input.sourceSupplierId}
    `);
    await tx.execute(sql`
      UPDATE supplier_disbursement_vouchers
      SET supplier_id = ${targetSupplierId}, updated_at = NOW()
      WHERE org_id = ${orgId} AND supplier_id = ${input.sourceSupplierId}
    `);
    await tx.execute(sql`
      UPDATE check_vouchers
      SET supplier_id = ${targetSupplierId}, updated_at = NOW()
      WHERE org_id = ${orgId} AND supplier_id = ${input.sourceSupplierId}
    `);
    await tx.execute(sql`
      UPDATE purchase_orders
      SET supplier_id = ${targetSupplierId}, updated_at = NOW()
      WHERE org_id = ${orgId} AND supplier_id = ${input.sourceSupplierId}
    `);
    await tx.execute(sql`
      UPDATE supplier_returns
      SET supplier_id = ${targetSupplierId}, updated_at = NOW()
      WHERE org_id = ${orgId} AND supplier_id = ${input.sourceSupplierId}
    `);
    await tx.execute(sql`
      UPDATE product_suppliers
      SET supplier_id = ${targetSupplierId}, updated_at = NOW()
      WHERE org_id = ${orgId} AND supplier_id = ${input.sourceSupplierId}
    `);
    await tx.execute(sql`
      UPDATE suppliers
      SET is_active = false,
          notes = TRIM(BOTH FROM CONCAT_WS(E'\n', NULLIF(notes, ''), ${`Merged into ${preview.targetSupplierName}: ${reason}`})),
          updated_at = NOW()
      WHERE org_id = ${orgId} AND id = ${input.sourceSupplierId}
    `);
    await tx.execute(sql`
      UPDATE suppliers
      SET notes = TRIM(BOTH FROM CONCAT_WS(E'\n', NULLIF(notes, ''), ${`Merged ${preview.sourceSupplierName}: ${reason}`})),
          updated_at = NOW()
      WHERE org_id = ${orgId} AND id = ${targetSupplierId}
    `);
  });

  const details = {
    sourceSupplierId: input.sourceSupplierId,
    sourceSupplierName: preview.sourceSupplierName,
    targetSupplierId,
    targetSupplierName: preview.targetSupplierName,
    counts: preview.counts,
    reason,
  };
  logAction({
    orgId,
    userId: context?.userId,
    action: "SUPPLIER_MERGE",
    entityType: "SUPPLIER",
    entityId: targetSupplierId,
    details,
    ipAddress: context?.ipAddress,
  });
  logAction({
    orgId,
    userId: context?.userId,
    action: "SUPPLIER_MERGE",
    entityType: "SUPPLIER",
    entityId: input.sourceSupplierId,
    details,
    ipAddress: context?.ipAddress,
  });

  return { dryRun: false, merged: true, ...preview };
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
  input: SupplierApUpdateInput,
  context?: SupplierAuditContext,
) {
  const setFields = buildSupplierApUpdateFields(input);

  if (Object.keys(setFields).length === 0) {
    throw new Error("No fields to update");
  }

  const [current] = await db
    .select()
    .from(suppliers)
    .where(and(eq(suppliers.id, supplierId), eq(suppliers.orgId, orgId)))
    .limit(1);

  if (!current) throw new Error("Supplier not found");

  const changedFields = buildSupplierChangedFields(current, setFields);
  const splitChanges = splitSupplierChangedFields(changedFields);
  if (splitChanges.bankFields.length > 0) {
    setFields.bankVerifiedAt = null;
    setFields.bankVerifiedBy = null;
  }

  const [updated] = await db
    .update(suppliers)
    .set(setFields)
    .where(and(eq(suppliers.id, supplierId), eq(suppliers.orgId, orgId)))
    .returning();

  if (!updated) throw new Error("Supplier not found");

  let invoiceTermsUpdated = 0;
  if (input.paymentTermsDays !== undefined) {
    invoiceTermsUpdated = await syncOpenSupplierInvoiceTerms(
      orgId,
      [supplierId],
      input.paymentTermsDays,
    );
  }

  if (splitChanges.bankFields.length > 0) {
    logSupplierAudit(
      orgId,
      updated.id,
      "SUPPLIER_BANK_CHANGE",
      {
        supplierName: updated.name,
        changedFields: splitChanges.bankFields,
      },
      context,
    );
  }
  if (splitChanges.masterFields.length > 0) {
    logSupplierAudit(
      orgId,
      updated.id,
      "SUPPLIER_UPDATE",
      {
        supplierName: updated.name,
        changedFields: splitChanges.masterFields,
        invoiceTermsUpdated,
      },
      context,
    );
  }
  if (splitChanges.statusFields.length > 0) {
    logSupplierAudit(
      orgId,
      updated.id,
      "SUPPLIER_STATUS_CHANGE",
      {
        supplierName: updated.name,
        changedFields: splitChanges.statusFields,
        isActive: updated.isActive,
      },
      context,
    );
  }

  return { id: updated.id, name: updated.name, isActive: updated.isActive };
}

/**
 * Create a new supplier. Thin wrapper that fills in the AP defaults if
 * not provided.
 */
export async function createSupplierAP(
  orgId: string,
  input: SupplierApCreateInput,
  context?: SupplierAuditContext,
) {
  const values = buildSupplierApCreateValues(orgId, input);

  const [row] = (await db.execute(sql`
    INSERT INTO suppliers (
      org_id, name,
      contact_person, contact_phone, contact_email, address, tin, mnemonic_code,
      payment_terms_days, credit_limit,
      bank_name, bank_account_number, bank_account_name,
      notes, is_active
    )
    VALUES (
      ${values.orgId}, ${values.name},
      ${values.contactPerson}, ${values.contactPhone},
      ${values.contactEmail}, ${values.address},
      ${values.tin}, ${values.mnemonicCode},
      ${values.paymentTermsDays}, ${values.creditLimit},
      ${values.bankName}, ${values.bankAccountNumber},
      ${values.bankAccountName},
      ${values.notes}, ${values.isActive}
    )
    RETURNING id, name
  `)) as any[];

  logSupplierAudit(
    orgId,
    row.id,
    "SUPPLIER_CREATE",
    {
      supplierName: row.name,
      hasBankDetails: Boolean(
        values.bankName && values.bankAccountNumber && values.bankAccountName,
      ),
      paymentTermsDays: values.paymentTermsDays,
    },
    context,
  );

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
    const totals = summarizeSupplierSoaGenerationInvoices(invoices);

    // ── Insert SOA record ──
    const [soa] = (await tx.execute(sql`
      INSERT INTO supplier_soa_records (
        org_id, supplier_id, soa_number, date_from, date_to,
        generated_by, total_amount, total_paid, total_balance,
        invoice_count, notes
      ) VALUES (
        ${orgId}, ${supplierId}, ${soaNumber}, ${totals.dateFrom}, ${totals.dateTo},
        ${userId ?? null},
        ${totals.totalAmountText}, ${totals.totalPaidText}, ${totals.totalBalanceText},
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

    return buildGeneratedSupplierSoaResponse(soa);
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

  return rows.map(mapSupplierSoaRecordRow);
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

  // Aggregate non-voided DVs per SOA via the junction table, with a legacy
  // fallback to dv.soa_id for DVs created before the junction existed. Same
  // junction-first/legacy-fallback pattern used by confirmDisbursementVoucher.
  // Sorted so the "most advanced" DV (CONFIRMED > PRINTED > DRAFT) lands
  // first — the frontend's resolveStatus() picks dvRefs[0] as the active DV.
  const rows = (await db.execute(sql`
    SELECT sr.id, sr.soa_number, sr.supplier_id, s.name AS supplier_name,
           sr.date_from::text, sr.date_to::text, sr.generated_at,
           sr.total_amount::text, sr.total_paid::text, sr.total_balance::text,
           sr.invoice_count, sr.status, sr.notes,
           COALESCE(
             (
               WITH linked AS (
                 -- Modern link via junction table
                 SELECT dv.id AS dv_id, dv.dv_number, dv.status, dv.amount,
                        ds.allocated_amount AS alloc, dv.created_at
                 FROM supplier_dv_soas ds
                 JOIN supplier_disbursement_vouchers dv ON dv.id = ds.dv_id
                 WHERE ds.soa_id = sr.id AND dv.status != 'VOIDED'
                 UNION ALL
                 -- Legacy link via dv.soa_id (only when no junction entry exists)
                 SELECT dv.id, dv.dv_number, dv.status, dv.amount,
                        COALESCE(dv.gross_amount, dv.amount) AS alloc, dv.created_at
                 FROM supplier_disbursement_vouchers dv
                 WHERE dv.soa_id = sr.id
                   AND dv.status != 'VOIDED'
                   AND NOT EXISTS (SELECT 1 FROM supplier_dv_soas WHERE dv_id = dv.id)
               )
               SELECT json_agg(
                 json_build_object(
                   'dvId', linked.dv_id,
                   'dvNumber', linked.dv_number,
                   'status', linked.status,
                   'amount', linked.amount::text,
                   'allocatedAmount', linked.alloc::text
                 )
                 ORDER BY
                   CASE linked.status
                     WHEN 'CONFIRMED' THEN 1
                     WHEN 'PRINTED' THEN 2
                     WHEN 'DRAFT' THEN 3
                     ELSE 4
                   END,
                   linked.created_at DESC
               )
               FROM linked
             ),
             '[]'::json
           ) AS dv_refs
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

  return buildSupplierSoaSearchResponse({
    rows,
    total: countRows[0]?.total ?? 0,
  });
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
           s.name AS supplier_name, s.contact_person, s.contact_phone, s.address, s.contact_email, s.tin,
           u.full_name AS generated_by_name
    FROM supplier_soa_records sr
    JOIN suppliers s ON s.id = sr.supplier_id
    LEFT JOIN users u ON u.id = sr.generated_by
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

  return buildSupplierSoaDetailResponse({ soa, lines });
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
      // Defense-in-depth: block the void if any non-VOIDED DV (DRAFT/PRINTED/
      // CONFIRMED) is still linked to this SOA. Voiding here would orphan the
      // disbursement (CONFIRMED) or leave printed/draft DVs pointing at
      // nothing. UI also disables the button — this catches direct API hits
      // and stale-UI submissions. Same junction + legacy union pattern used
      // by the SOA list query so live DVs surface consistently.
      const liveDvs = (await tx.execute(sql`
        WITH linked AS (
          SELECT dv.id, dv.dv_number, dv.status
          FROM supplier_dv_soas ds
          JOIN supplier_disbursement_vouchers dv ON dv.id = ds.dv_id
          WHERE ds.soa_id = ${soaId} AND dv.status != 'VOIDED'
          UNION
          SELECT dv.id, dv.dv_number, dv.status
          FROM supplier_disbursement_vouchers dv
          WHERE dv.soa_id = ${soaId}
            AND dv.status != 'VOIDED'
            AND NOT EXISTS (SELECT 1 FROM supplier_dv_soas WHERE dv_id = dv.id)
        )
        SELECT id, dv_number, status FROM linked
      `)) as any[];
      if (liveDvs.length > 0) {
        const err: any = new Error("SOA_HAS_ACTIVE_DV");
        err.code = "SOA_HAS_ACTIVE_DV";
        err.details = liveDvs.map((d) => ({ dvId: d.id, dvNumber: d.dv_number, status: d.status }));
        throw err;
      }

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
    if (Math.abs(payAmount - soaBalance) > 0.01) {
      throw new Error(
        `Supplier SOA payments must settle the full balance (${soaBalance.toFixed(2)}); partial supplier invoice payments are not allowed`,
      );
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
    const auditNote = buildAuditNote({
      label: "SOA Payment",
      date: data.paymentDate,
      paymentMethod: data.paymentMethod,
      referenceNumber: data.referenceNumber,
    });

    for (const inv of invoiceRows) {
      if (remaining <= 0) break;

      const invBalance = parseFloat(inv.balance);
      const allocation = Math.min(remaining, invBalance);

      const paymentUpdate = calculateInvoicePaymentApplication({
        paidAmount: inv.paid_amount,
        totalAmount: inv.total_amount,
        rtvCreditAmount: inv.rtv_credit_amount,
        allocation,
      });

      await tx.execute(
        sql`UPDATE supplier_invoices
            SET paid_amount = ${paymentUpdate.paidAmountText},
                balance = ${paymentUpdate.balanceText},
                status = ${paymentUpdate.status},
                notes = ${appendAuditNote(inv.notes, auditNote, data.notes)}
            WHERE id = ${inv.id}`,
      );

      remaining -= allocation;
      totalApplied += allocation;
    }

    // 4. Update SOA header totals
    const soaTotals = calculateSoaPaymentTotals({
      totalPaid: soa.total_paid,
      totalAmount: soa.total_amount,
      appliedAmount: totalApplied,
    });

    await tx.execute(
      sql`UPDATE supplier_soa_records
          SET total_paid = ${soaTotals.totalPaidText},
              total_balance = ${soaTotals.totalBalanceText}
          WHERE id = ${soaId}`,
    );

    return {
      soaId,
      soaNumber: soa.soa_number,
      amountPaid: totalApplied,
      newTotalPaid: soaTotals.newTotalPaid,
      newTotalBalance: soaTotals.newTotalBalance,
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
  return formatDisbursementVoucherNumber(year, next);
}

export async function createDisbursementVoucher(
  orgId: string,
  userId: string,
  data: DisbursementVoucherCreateInput,
) {
  const totals = calculateDisbursementVoucherTotals(data);
  assertDisbursementVoucherCreateTotals(totals);
  assertDisbursementVoucherHasPaymentLines(data.payments);
  assertDisbursementVoucherPaymentsMatchNet(totals);

  // Normalize: backward compat — if soaId (singular) provided but not soaIds, treat as single-element array
  const resolvedSoaIds = resolveDisbursementVoucherSoaIds(data);

  // A DV must be linked to at least one SOA. Without this, the orphan DV
  // gets created with soa_id=NULL and zero junction rows; downstream
  // confirmDisbursementVoucher then silently no-ops because soaAllocations
  // resolves to []. Result: DV ends up CONFIRMED but no SOA ever flips off
  // BILLED. (See DV-2026-000026 / DV-2026-000027 incident.)
  assertDisbursementVoucherRequiresSoa(resolvedSoaIds);

  return await db.transaction(async (tx) => {
    // Validate ALL SOAs if provided
    const soaBalances: Record<string, number> = {};
    for (const sid of resolvedSoaIds) {
      const soaRows = (await tx.execute(
        sql`SELECT id, supplier_id, total_balance::text, status
            FROM supplier_soa_records
            WHERE id = ${sid} AND org_id = ${orgId}`,
      )) as any[];
      soaBalances[sid] = validateDisbursementVoucherSoaRow({
        soaId: sid,
        rows: soaRows,
        supplierId: data.supplierId,
      });
    }

    const dvNumber = await generateDvNumber(tx, orgId);
    const dvValues = buildDisbursementVoucherInsertValues({
      orgId,
      dvNumber,
      userId,
      data,
      totals,
      resolvedSoaIds,
    });

    const [row] = (await tx.execute(
      sql`INSERT INTO supplier_disbursement_vouchers
          (org_id, dv_number, supplier_id, soa_id,
           amount, gross_amount, total_deductions, total_charges, net_amount,
           payment_method, payment_date, remarks, status, created_by)
          VALUES (${dvValues.orgId}, ${dvValues.dvNumber}, ${dvValues.supplierId}, ${dvValues.legacySoaId},
                  ${dvValues.amount}, ${dvValues.grossAmount},
                  ${dvValues.totalDeductions}, ${dvValues.totalCharges},
                  ${dvValues.netAmount},
                  ${dvValues.paymentMethod}, ${dvValues.paymentDate},
                  ${dvValues.remarks}, ${dvValues.status}, ${dvValues.createdBy})
          RETURNING id, dv_number, status`,
    )) as any[];

    // Insert junction rows into supplier_dv_soas
    const allocationMap = buildSoaAllocationMap({
      resolvedSoaIds,
      grossAmount: totals.grossAmount,
      soaBalances,
      explicitAllocations: data.soaAllocations,
    });
    assertDisbursementVoucherSoaAllocationsSettleBalances({
      resolvedSoaIds,
      allocationMap,
      soaBalances,
    });
    for (const sid of resolvedSoaIds) {
      const soaInsert = buildDisbursementVoucherSoaInsertValues({
        dvId: row.id,
        soaId: sid,
        allocatedAmount: allocationMap[sid] ?? 0,
      });
      await tx.execute(
        sql`INSERT INTO supplier_dv_soas (dv_id, soa_id, allocated_amount)
            VALUES (${soaInsert.dvId}, ${soaInsert.soaId}, ${soaInsert.allocatedAmountText})`,
      );
    }

    // Insert deduction lines
    for (let i = 0; i < (data.deductions ?? []).length; i++) {
      const deductionInsert = buildDisbursementVoucherDeductionInsertValues({
        dvId: row.id,
        deduction: data.deductions![i],
        sortOrder: i,
      });
      await tx.execute(
        sql`INSERT INTO supplier_dv_deductions
            (dv_id, deduction_type, description, reference_number, amount, sort_order)
            VALUES (${deductionInsert.dvId}, ${deductionInsert.deductionType}, ${deductionInsert.description},
                    ${deductionInsert.referenceNumber}, ${deductionInsert.amount}, ${deductionInsert.sortOrder})`,
      );
    }

    // Insert additional charge lines (ADD to net; mirror of deductions)
    for (let i = 0; i < (data.additionalCharges ?? []).length; i++) {
      const chargeInsert = buildDisbursementVoucherAdditionalChargeInsertValues({
        dvId: row.id,
        charge: data.additionalCharges![i],
        sortOrder: i,
      });
      await tx.execute(
        sql`INSERT INTO supplier_dv_additional_charges
            (dv_id, charge_type, description, reference_number, amount, sort_order)
            VALUES (${chargeInsert.dvId}, ${chargeInsert.chargeType}, ${chargeInsert.description},
                    ${chargeInsert.referenceNumber}, ${chargeInsert.amount}, ${chargeInsert.sortOrder})`,
      );
    }

    // Insert payment lines
    for (let i = 0; i < data.payments.length; i++) {
      const paymentInsert = buildDisbursementVoucherPaymentInsertValues({
        dvId: row.id,
        payment: data.payments[i],
        sortOrder: i,
      });
      await tx.execute(
        sql`INSERT INTO supplier_dv_payments
            (dv_id, payment_method, amount, reference_number, bank_name,
             transaction_date, platform, received_by, sort_order)
            VALUES (${paymentInsert.dvId}, ${paymentInsert.paymentMethod}, ${paymentInsert.amount},
                    ${paymentInsert.referenceNumber}, ${paymentInsert.bankName},
                    ${paymentInsert.transactionDate}, ${paymentInsert.platform},
                    ${paymentInsert.receivedBy}, ${paymentInsert.sortOrder})`,
      );
    }

    return buildDisbursementVoucherCreateResult(row);
  });
}

export async function listDisbursementVouchers(
  orgId: string,
  opts: DisbursementVoucherListOptions = {},
) {
  const listOptions = normalizeDisbursementVoucherListOptions(opts);
  const conditions = [sql`dv.org_id = ${orgId}`];
  if (listOptions.supplierId) conditions.push(sql`dv.supplier_id = ${listOptions.supplierId}`);
  if (listOptions.searchPattern) {
    conditions.push(sql`(dv.dv_number ILIKE ${listOptions.searchPattern} OR s.name ILIKE ${listOptions.searchPattern})`);
  }
  if (listOptions.status) {
    // Explicit status wins — show only that status, ignore includeVoided.
    conditions.push(sql`dv.status = ${listOptions.status}`);
  } else if (!listOptions.includeVoided) {
    // "All statuses" default: hide voided unless explicitly requested.
    conditions.push(sql`dv.status != 'VOIDED'`);
  }
  if (listOptions.dateFrom) conditions.push(sql`dv.payment_date >= ${listOptions.dateFrom}`);
  if (listOptions.dateTo) conditions.push(sql`dv.payment_date <= ${listOptions.dateTo}`);
  const where = sql.join(conditions, sql` AND `);

  const rows = (await db.execute(sql`
    SELECT dv.id, dv.dv_number, dv.supplier_id, s.name AS supplier_name,
           dv.soa_id,
           COALESCE(
             (SELECT array_agg(DISTINCT sr2.soa_number ORDER BY sr2.soa_number)
              FROM supplier_dv_soas ds2
              JOIN supplier_soa_records sr2 ON sr2.id = ds2.soa_id
              WHERE ds2.dv_id = dv.id),
             CASE WHEN dv.soa_id IS NOT NULL
               THEN ARRAY[(SELECT sr3.soa_number FROM supplier_soa_records sr3 WHERE sr3.id = dv.soa_id)]
               ELSE ARRAY[]::text[] END
           ) AS soa_numbers,
           dv.amount::text, dv.payment_method, dv.check_number,
           dv.payment_date::text, dv.status, dv.created_at,
           dv.voided_at, dv.void_reason
    FROM supplier_disbursement_vouchers dv
    JOIN suppliers s ON s.id = dv.supplier_id
    WHERE ${where}
    ORDER BY dv.created_at DESC
    LIMIT ${listOptions.limit}
  `)) as any[];

  const countRows = (await db.execute(sql`
    SELECT count(*)::int AS total
    FROM supplier_disbursement_vouchers dv
    JOIN suppliers s ON s.id = dv.supplier_id
    WHERE ${where}
  `)) as any[];

  // Org-wide summary (ignores search/status/supplier/date filters) so the
  // three stat cards stay stable as the table filters change.
  const summaryRows = (await db.execute(sql`
    SELECT status, COUNT(*)::int AS cnt, COALESCE(SUM(amount), 0)::text AS total
    FROM supplier_disbursement_vouchers
    WHERE org_id = ${orgId}
    GROUP BY status
  `)) as any[];
  return buildDisbursementVoucherListResponse({
    rows,
    total: countRows[0]?.total ?? 0,
    summaryRows,
  });
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

  // Fetch additional charge lines
  const additionalChargeRows = (await db.execute(sql`
    SELECT id, charge_type, description, reference_number, amount::text, sort_order
    FROM supplier_dv_additional_charges
    WHERE dv_id = ${dvId}
    ORDER BY sort_order ASC
  `)) as any[];

  // Fetch all linked SOAs from the junction table
  const soaRefRows = (await db.execute(sql`
    SELECT ds.soa_id, ds.allocated_amount::text,
           sr.soa_number, sr.date_from::text AS date_from, sr.date_to::text AS date_to
    FROM supplier_dv_soas ds
    JOIN supplier_soa_records sr ON sr.id = ds.soa_id
    WHERE ds.dv_id = ${dvId}
    ORDER BY sr.date_from ASC
  `)) as any[];

  // Determine which SOA IDs to use for line items (junction table first, fallback to legacy)
  const linkedSoaIds = resolveDisbursementVoucherLinkedSoaIds({
    soaRefRows,
    legacySoaId: dv.soa_id,
  });

  // Fetch SOA line items (invoices + credit memos) from ALL linked SOAs
  let soaLineItems: any[] = [];
  if (linkedSoaIds.length > 0) {
    // Build a VALUES list for the SOA IDs
    const soaIdValues = sql.join(linkedSoaIds.map((id: string) => sql`${id}::uuid`), sql`, `);
    soaLineItems = (await db.execute(sql`
      SELECT DISTINCT ON (si.id) si.invoice_number, si.invoice_date::text, si.total_amount::text
      FROM supplier_soa_line_items sli
      JOIN supplier_invoices si ON si.id = sli.invoice_id
      WHERE sli.soa_id IN (${soaIdValues})
      ORDER BY si.id, si.invoice_date ASC, si.invoice_number ASC
    `)) as any[];
  }

  return buildDisbursementVoucherDetailResponse({
    dv,
    paymentRows,
    deductionRows,
    additionalChargeRows,
    soaRefRows,
    soaLineItems,
  });
}

export async function printDisbursementVoucher(orgId: string, dvId: string) {
  const rows = (await db.execute(
    sql`UPDATE supplier_disbursement_vouchers
        SET status = 'PRINTED', printed_at = NOW()
        WHERE id = ${dvId} AND org_id = ${orgId} AND status = 'DRAFT'
        RETURNING id, dv_number, status`,
  )) as any[];
  return requireDisbursementVoucherPrintResult(rows);
}

/**
 * Settlement work for a DV: paints invoices FIFO across each SOA's line items,
 * updates the SOA header's total_paid/total_balance, and marks any
 * CREDIT_MEMO-type deductions as billed.
 *
 * Extracted from confirmDisbursementVoucher so orphan-DV cleanups (DVs that
 * were CONFIRMED before the junction row existed) can replay the settlement
 * work that the original confirm silently skipped. See
 * apps/api/scripts/replay-confirm-orphans-dv26-dv27.ts.
 *
 * Does NOT touch supplier_disbursement_vouchers.status or
 * supplier_soa_records.status — those are caller responsibilities (or
 * unchanged by AP convention, respectively).
 *
 * The caller is responsible for:
 *   - Resolving soaAllocations (typically from supplier_dv_soas + legacy fallback)
 *   - Guarding against an empty soaAllocations array (this function would
 *     no-op silently)
 *   - Passing a transaction handle (this function never opens its own tx)
 */
export async function replayConfirmForOrphan(
  tx: any,
  dvId: string,
  soaAllocations: Array<{ soaId: string; allocatedAmount: number }>,
): Promise<void> {
  // Process each linked SOA
  for (const soaAlloc of soaAllocations) {
    const soaRows = (await tx.execute(
      sql`SELECT id, total_paid::text, total_amount::text, total_balance::text, status
          FROM supplier_soa_records WHERE id = ${soaAlloc.soaId} FOR UPDATE`,
    )) as any[];
    if (soaRows.length === 0) throw new Error(`SOA ${soaAlloc.soaId} not found`);
    const soa = soaRows[0] as any;

    const payAmount = soaAlloc.allocatedAmount;

    // Fetch and pay invoices for this SOA (oldest first / FIFO)
    const invoiceRows = (await tx.execute(
      sql`SELECT si.id, si.paid_amount::text, si.balance::text,
                 si.total_amount::text, si.rtv_credit_amount::text, si.notes
          FROM supplier_soa_line_items sli
          JOIN supplier_invoices si ON si.id = sli.invoice_id
          WHERE sli.soa_id = ${soaAlloc.soaId}
            AND si.status IN ('OPEN', 'PARTIALLY_PAID') AND si.balance::numeric > 0
          ORDER BY si.invoice_date ASC FOR UPDATE OF si`,
    )) as any[];

    let remaining = payAmount;
    for (const inv of invoiceRows) {
      if (remaining <= 0) break;
      const invBal = parseFloat(inv.balance);
      const alloc = Math.min(remaining, invBal);
      const paymentUpdate = calculateInvoicePaymentApplication({
        paidAmount: inv.paid_amount,
        totalAmount: inv.total_amount,
        rtvCreditAmount: inv.rtv_credit_amount,
        allocation: alloc,
      });
      const auditNote = buildDisbursementVoucherPaymentAuditNote({ payAmount, dvId });
      const notes = appendDisbursementVoucherPaymentAuditNote(inv.notes, auditNote);
      await tx.execute(
        sql`UPDATE supplier_invoices SET paid_amount = ${paymentUpdate.paidAmountText},
            balance = ${paymentUpdate.balanceText}, status = ${paymentUpdate.status}, notes = ${notes}
            WHERE id = ${inv.id}`,
      );
      remaining -= alloc;
    }

    // Update SOA header
    const soaTotals = calculateSoaPaymentTotals({
      totalPaid: soa.total_paid,
      totalAmount: soa.total_amount,
      appliedAmount: payAmount,
    });
    await tx.execute(
      sql`UPDATE supplier_soa_records
          SET total_paid = ${soaTotals.totalPaidText},
              total_balance = ${soaTotals.totalBalanceText}
          WHERE id = ${soaAlloc.soaId}`,
    );
  }

  // Mark applied credit memos as billed (so they don't appear as available again)
  const cmDeds = (await tx.execute(
    sql`SELECT reference_number FROM supplier_dv_deductions
        WHERE dv_id = ${dvId} AND deduction_type = 'CREDIT_MEMO' AND reference_number IS NOT NULL`,
  )) as any[];
  for (const referenceNumber of buildDisbursementVoucherCreditMemoReferences(cmDeds)) {
    await tx.execute(
      sql`UPDATE supplier_invoices SET billed = true, billed_soa_id = ${dvId}
          WHERE id = ${referenceNumber}`,
    );
  }
}

export async function confirmDisbursementVoucher(orgId: string, dvId: string) {
  return await db.transaction(async (tx) => {
    const dvRows = (await tx.execute(
      sql`SELECT id, soa_id, amount::text, gross_amount::text, net_amount::text, status
          FROM supplier_disbursement_vouchers
          WHERE id = ${dvId} AND org_id = ${orgId}
          FOR UPDATE`,
    )) as any[];
    const dv = requireConfirmableDisbursementVoucher(dvRows);

    // Apply payment to SOA + invoices
    // Query junction table for all linked SOAs; fallback to legacy soa_id
    const dvSoaRows = (await tx.execute(
      sql`SELECT soa_id, allocated_amount::text
          FROM supplier_dv_soas WHERE dv_id = ${dvId}
          ORDER BY created_at ASC`,
    )) as any[];

    const soaAllocations = buildDisbursementVoucherSoaAllocations({
      dvSoaRows,
      dv,
    });

    // Defense-in-depth: any orphan DV that slipped past the create guard
    // would silently no-op the SOA-update loop below. Reject explicitly so
    // the caller sees the failure instead of a "successful" confirm that
    // updates nothing. The only path to recovery is a manual backfill of the
    // junction row (see backfill-dv-soa-orphans-2026.sql).
    assertDisbursementVoucherHasConfirmSoaLinks(soaAllocations, dvId);

    // Apply settlement work (invoice paint + SOA header update + CM marking).
    // Extracted so the same code path can be replayed by orphan-DV cleanups
    // (see replayConfirmForOrphan + scripts/replay-confirm-orphans-*.ts).
    await replayConfirmForOrphan(tx, dvId, soaAllocations);

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
    const dv = requireVoidableDisbursementVoucher(dvRows);

    // If was CONFIRMED, reverse payment on ALL linked SOAs
    if (shouldReverseDisbursementVoucherSettlement(dv)) {
      // Query junction table for all linked SOAs; fallback to legacy soa_id
      const dvSoaRows = (await tx.execute(
        sql`SELECT soa_id, allocated_amount::text
            FROM supplier_dv_soas WHERE dv_id = ${dvId}
            ORDER BY created_at ASC`,
      )) as any[];

      const soaAllocations = buildDisbursementVoucherSoaAllocations({
        dvSoaRows,
        dv,
      });

      for (const soaAlloc of soaAllocations) {
        const payAmount = soaAlloc.allocatedAmount;

        // Reset invoices that were paid by this DV for this SOA
        const invoiceRows = (await tx.execute(
          sql`SELECT si.id, si.paid_amount::text, si.total_amount::text,
                     si.rtv_credit_amount::text
              FROM supplier_soa_line_items sli
              JOIN supplier_invoices si ON si.id = sli.invoice_id
              WHERE sli.soa_id = ${soaAlloc.soaId} AND si.status = 'PAID'
              ORDER BY si.invoice_date DESC FOR UPDATE OF si`,
        )) as any[];

        let remaining = payAmount;
        for (const inv of invoiceRows) {
          if (remaining <= 0) break;
          const reversal = calculateDisbursementVoucherInvoiceReversalAmount({
            remaining,
            paidAmount: inv.paid_amount,
          });
          const reversalUpdate = calculateInvoicePaymentReversal({
            paidAmount: inv.paid_amount,
            totalAmount: inv.total_amount,
            rtvCreditAmount: inv.rtv_credit_amount,
            reversal,
          });
          await tx.execute(
            sql`UPDATE supplier_invoices SET paid_amount = ${reversalUpdate.paidAmountText},
                balance = ${reversalUpdate.balanceText}, status = ${reversalUpdate.status}
                WHERE id = ${inv.id}`,
          );
          remaining -= reversal;
        }

        // Reverse SOA header
        const soaRows = (await tx.execute(
          sql`SELECT total_paid::text, total_amount::text FROM supplier_soa_records
              WHERE id = ${soaAlloc.soaId} FOR UPDATE`,
        )) as any[];
        if (soaRows.length > 0) {
          const soaTotals = calculateSoaPaymentReversalTotals({
            totalPaid: soaRows[0].total_paid,
            totalAmount: soaRows[0].total_amount,
            reversalAmount: payAmount,
          });
          await tx.execute(
            sql`UPDATE supplier_soa_records
                SET total_paid = ${soaTotals.totalPaidText},
                    total_balance = ${soaTotals.totalBalanceText}
                WHERE id = ${soaAlloc.soaId}`,
          );
        }
      }
    }

    // Un-mark applied credit memos (restore as available)
    if (shouldReverseDisbursementVoucherSettlement(dv)) {
      const cmDeds = (await tx.execute(
        sql`SELECT reference_number FROM supplier_dv_deductions
            WHERE dv_id = ${dvId} AND deduction_type = 'CREDIT_MEMO' AND reference_number IS NOT NULL`,
      )) as any[];
      for (const referenceNumber of buildDisbursementVoucherCreditMemoReferences(cmDeds)) {
        await tx.execute(
          sql`UPDATE supplier_invoices SET billed = false, billed_soa_id = NULL
              WHERE id = ${referenceNumber}`,
        );
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

  return buildPdcReportResponse(rows as any[]);
}

// ════════════════════════════════════════════════════════════════════
// CHECK REGISTER
// ════════════════════════════════════════════════════════════════════

export async function getCheckRegister(
  orgId: string,
  opts: CheckRegisterOptions = {},
) {
  const registerOptions = normalizeCheckRegisterOptions(opts);
  const conditions = [
    sql`dv.org_id = ${orgId}`,
    sql`p.payment_method = 'CHECK'`,
    sql`dv.status IN ('PRINTED', 'CONFIRMED')`,
  ];
  if (registerOptions.searchPattern) {
    conditions.push(sql`(dv.dv_number ILIKE ${registerOptions.searchPattern} OR p.reference_number ILIKE ${registerOptions.searchPattern} OR s.name ILIKE ${registerOptions.searchPattern})`);
  }
  if (registerOptions.bank) conditions.push(sql`p.bank_name = ${registerOptions.bank}`);
  if (registerOptions.status) conditions.push(sql`p.status = ${registerOptions.status}`);
  if (registerOptions.dateFrom) conditions.push(sql`p.transaction_date >= ${registerOptions.dateFrom}::date`);
  if (registerOptions.dateTo) conditions.push(sql`p.transaction_date <= ${registerOptions.dateTo}::date`);

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

  return buildCheckRegisterResponse(rows);
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
    requireOutstandingCheckPayment(rows, "release");

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
    requireReleasedCheckPayment(rows, "clear");

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
    const check = requireReleasedCheckPayment(rows, "bounce");

    // Mark check as bounced
    await tx.execute(
      sql`UPDATE supplier_dv_payments SET status = 'BOUNCED', bounce_reason = ${reason}
          WHERE id = ${paymentId}`,
    );

    // Reverse the bounced amount from SOA + invoices (money never left)
    const bouncedAmount = parseCheckPaymentAmount(check);
    if (shouldReverseBouncedCheckSettlement(check)) {
      // Reverse SOA header
      const soaRows = (await tx.execute(
        sql`SELECT total_paid::text, total_amount::text FROM supplier_soa_records
            WHERE id = ${check.soa_id} FOR UPDATE`,
      )) as any[];
      if (soaRows.length > 0) {
        const soaTotals = calculateSoaPaymentReversalTotals({
          totalPaid: soaRows[0].total_paid,
          totalAmount: soaRows[0].total_amount,
          reversalAmount: bouncedAmount,
        });
        await tx.execute(
          sql`UPDATE supplier_soa_records
              SET total_paid = ${soaTotals.totalPaidText},
                  total_balance = ${soaTotals.totalBalanceText}
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
        const reversal = calculateCheckPaymentInvoiceReversalAmount({
          remaining,
          paidAmount: inv.paid_amount,
        });
        const reversalUpdate = calculateInvoicePaymentReversal({
          paidAmount: inv.paid_amount,
          totalAmount: inv.total_amount,
          rtvCreditAmount: inv.rtv_credit_amount,
          reversal,
        });
        await tx.execute(
          sql`UPDATE supplier_invoices SET paid_amount = ${reversalUpdate.paidAmountText},
              balance = ${reversalUpdate.balanceText}, status = ${reversalUpdate.status}
              WHERE id = ${inv.id}`,
        );
        remaining -= reversal;
      }
    }

    return buildCheckPaymentStatusResult(paymentId, "BOUNCED");
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
    requireOutstandingCheckPayment(rows, "cancel");

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
  data: BankAccountCreateInput,
) {
  return await db.transaction(async (tx) => {
    // If setting as default, unset existing default
    if (data.isDefault) {
      await tx
        .update(bankAccounts)
        .set({ isDefault: false })
        .where(and(eq(bankAccounts.orgId, orgId), eq(bankAccounts.isDefault, true)));
    }

    const [account] = await tx
      .insert(bankAccounts)
      .values(buildBankAccountCreateValues(orgId, data))
      .returning();

    return account;
  });
}

export async function updateBankAccount(
  orgId: string,
  id: string,
  data: BankAccountUpdateInput,
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

    const updates = buildBankAccountUpdateFields(data);

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
