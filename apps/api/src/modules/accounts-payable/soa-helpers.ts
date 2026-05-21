export type SupplierSoaEntry = {
  date: string;
  reference: string;
  type: "DEBIT" | "CREDIT";
  amount: string;
  runningBalance: string;
};

export type SupplierSoaInvoiceLike = {
  invoiceDate: string;
  invoiceNumber: string;
  totalAmount: string;
};

export type SupplierSoaPaymentLike = {
  checkDate: string;
  cvNumber: string;
  checkNumber: string | null;
  netAmount: string;
};

export type SupplierSoaRtvCreditLike = {
  rtvNumber: string;
  creditAmount: string;
  creditReceivedAt: Date | string | null;
};

export type SupplierSoaOverviewRow = {
  supplier_id: string;
  supplier_name: string;
  contact_person: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  address: string | null;
  tin: string | null;
  payment_terms_days: number | null;
  bank_name: string | null;
  bank_account_number: string | null;
  bank_account_name: string | null;
  invoice_count: number;
  total_balance: string;
  oldest_invoice_date: string | null;
  earliest_due_date: string | null;
  overdue_count: number;
  overdue_amount: string;
  current_count: number;
  current_amount: string;
  days_1_30_count: number;
  days_1_30_amount: string;
  days_31_60_count: number;
  days_31_60_amount: string;
  days_61_90_count: number;
  days_61_90_amount: string;
  days_90_plus_count: number;
  days_90_plus_amount: string;
  available_credit_memo_count: number;
  available_credit_memo_amount: string;
  last_payment_date: string | null;
  last_soa_date: string | null;
  paid_this_month: string;
  open_voucher_count: number;
};

export type SupplierSoaGenerationInvoiceLike = {
  invoice_date: string;
  total_amount: string;
  paid_amount: string;
  balance: string;
};

export type GeneratedSupplierSoaRow = {
  id: string;
  soa_number: string;
  status: string;
  total_amount: string;
  total_paid: string;
  total_balance: string;
  invoice_count: number;
  date_from: string;
  date_to: string;
};

export type SupplierSoaRecordRow = GeneratedSupplierSoaRow & {
  generated_at: Date | string;
  notes: string | null;
};

export type SupplierSoaSearchRow = SupplierSoaRecordRow & {
  supplier_id: string;
  supplier_name: string;
  dv_refs: Array<{
    dvId: string;
    dvNumber: string;
    status: string;
    amount: string;
    allocatedAmount: string;
  }> | null;
};

export type SupplierSoaDetailRow = SupplierSoaRecordRow & {
  supplier_id: string;
  supplier_name: string;
  contact_person: string | null;
  contact_phone: string | null;
  address: string | null;
  contact_email: string | null;
  tin: string | null;
  generated_by_name: string | null;
};

export type SupplierSoaLineItemRow = {
  invoice_id: string;
  invoice_number: string;
  invoice_date: string;
  due_date: string;
  invoice_amount: string;
  paid_at_generation: string;
  balance_at_generation: string;
};

function parseMoney(value: string | number | null | undefined): number {
  const parsed = typeof value === "number" ? value : parseFloat(value ?? "0");
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseCount(value: string | number | null | undefined): number {
  const parsed = typeof value === "number" ? value : parseInt(value ?? "0", 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function buildOverviewBucket(count: string | number | null | undefined, amount: string | number | null | undefined) {
  return {
    count: parseCount(count),
    amount: parseMoney(amount),
  };
}

function buildPaymentReadiness(row: SupplierSoaOverviewRow) {
  const missingFields = [
    row.bank_name?.trim() ? null : "bank name",
    row.bank_account_number?.trim() ? null : "bank account number",
    row.bank_account_name?.trim() ? null : "bank account name",
    row.contact_person?.trim() ? null : "contact person",
    row.address?.trim() ? null : "address",
    row.tin?.trim() ? null : "TIN",
  ].filter(Boolean) as string[];

  return {
    hasBankDetails: Boolean(row.bank_name?.trim() && row.bank_account_number?.trim() && row.bank_account_name?.trim()),
    hasTerms: Number.isFinite(row.payment_terms_days),
    hasContactPerson: Boolean(row.contact_person?.trim()),
    hasAddress: Boolean(row.address?.trim()),
    hasTin: Boolean(row.tin?.trim()),
    missingFields,
  };
}

export function buildSupplierSoaLedgerEntries({
  invoices,
  payments,
  rtvCredits,
}: {
  invoices: SupplierSoaInvoiceLike[];
  payments: SupplierSoaPaymentLike[];
  rtvCredits: SupplierSoaRtvCreditLike[];
}) {
  const entries: SupplierSoaEntry[] = [];

  for (const invoice of invoices) {
    entries.push({
      date: invoice.invoiceDate,
      reference: `INV ${invoice.invoiceNumber}`,
      type: "DEBIT",
      amount: invoice.totalAmount,
      runningBalance: "0",
    });
  }

  for (const payment of payments) {
    entries.push({
      date: payment.checkDate,
      reference: `CV ${payment.cvNumber}${payment.checkNumber ? ` (CHK ${payment.checkNumber})` : ""}`,
      type: "CREDIT",
      amount: payment.netAmount,
      runningBalance: "0",
    });
  }

  for (const rtv of rtvCredits) {
    if (parseFloat(rtv.creditAmount) <= 0) continue;

    entries.push({
      date: normalizeSupplierSoaDate(rtv.creditReceivedAt),
      reference: `RTV ${rtv.rtvNumber}`,
      type: "CREDIT",
      amount: rtv.creditAmount,
      runningBalance: "0",
    });
  }

  entries.sort((a, b) => a.date.localeCompare(b.date));

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
    entries,
    closingBalance: balance.toFixed(2),
  };
}

export function summarizeSupplierSoaGenerationInvoices(
  invoices: SupplierSoaGenerationInvoiceLike[],
) {
  let totalAmount = 0;
  let totalPaid = 0;
  let totalBalance = 0;
  for (const invoice of invoices) {
    totalAmount += parseFloat(invoice.total_amount);
    totalPaid += parseFloat(invoice.paid_amount);
    totalBalance += parseFloat(invoice.balance);
  }

  const dates = invoices.map((row) => row.invoice_date).sort();
  return {
    totalAmount,
    totalPaid,
    totalBalance,
    totalAmountText: totalAmount.toFixed(2),
    totalPaidText: totalPaid.toFixed(2),
    totalBalanceText: totalBalance.toFixed(2),
    dateFrom: dates[0],
    dateTo: dates[dates.length - 1],
  };
}

export function buildGeneratedSupplierSoaResponse(soa: GeneratedSupplierSoaRow) {
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
}

export function mapSupplierSoaRecordRow(row: SupplierSoaRecordRow) {
  return {
    id: row.id,
    soaNumber: row.soa_number,
    dateFrom: row.date_from,
    dateTo: row.date_to,
    generatedAt: row.generated_at,
    totalAmount: parseFloat(row.total_amount),
    totalPaid: parseFloat(row.total_paid),
    totalBalance: parseFloat(row.total_balance),
    invoiceCount: row.invoice_count,
    status: row.status,
    notes: row.notes,
  };
}

export function buildSupplierSoaSearchResponse({
  rows,
  total,
}: {
  rows: SupplierSoaSearchRow[];
  total: number;
}) {
  return {
    data: rows.map((row) => {
      const dvRefs = (row.dv_refs ?? []).map((dvRef) => ({
        dvId: dvRef.dvId,
        dvNumber: dvRef.dvNumber,
        status: dvRef.status,
        amount: parseFloat(dvRef.amount),
        allocatedAmount: parseFloat(dvRef.allocatedAmount),
      }));
      const active = dvRefs[0] ?? null;
      return {
        id: row.id,
        soaNumber: row.soa_number,
        supplierId: row.supplier_id,
        supplierName: row.supplier_name,
        dateFrom: row.date_from,
        dateTo: row.date_to,
        generatedAt: row.generated_at,
        totalAmount: parseFloat(row.total_amount),
        totalPaid: parseFloat(row.total_paid),
        totalBalance: parseFloat(row.total_balance),
        invoiceCount: row.invoice_count,
        status: row.status,
        notes: row.notes,
        dvRefs,
        activeDvId: active?.dvId ?? null,
        activeDvNumber: active?.dvNumber ?? null,
        activeDvStatus: active?.status ?? null,
      };
    }),
    total,
  };
}

export function buildSupplierSoaDetailResponse({
  soa,
  lines,
}: {
  soa: SupplierSoaDetailRow;
  lines: SupplierSoaLineItemRow[];
}) {
  return {
    id: soa.id,
    soaNumber: soa.soa_number,
    supplierId: soa.supplier_id,
    supplier: {
      name: soa.supplier_name,
      contactPerson: soa.contact_person,
      contactPhone: soa.contact_phone,
      address: soa.address,
      contactEmail: soa.contact_email,
      tin: soa.tin,
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
    generatedByName: soa.generated_by_name,
    invoices: lines.map((line) => ({
      id: line.invoice_id,
      invoiceNumber: line.invoice_number,
      invoiceDate: line.invoice_date,
      dueDate: line.due_date,
      totalAmount: parseFloat(line.invoice_amount),
      paidAmount: parseFloat(line.paid_at_generation),
      balance: parseFloat(line.balance_at_generation),
    })),
  };
}

function normalizeSupplierSoaDate(date: Date | string | null) {
  if (!date) return "";
  return date instanceof Date ? date.toISOString().split("T")[0] : date;
}

export function buildSupplierSoaOverviewResponse(
  rows: SupplierSoaOverviewRow[],
  dueThisWeekAmount: string | number | null | undefined,
) {
  const totalPayable = rows.reduce(
    (sum, row) => sum + parseFloat(row.total_balance),
    0,
  );
  const totalOverdue = rows.reduce(
    (sum, row) => sum + parseFloat(row.overdue_amount),
    0,
  );

  return {
    suppliers: rows.map((row) => ({
      supplierId: row.supplier_id,
      supplierName: row.supplier_name,
      contactPerson: row.contact_person,
      contactEmail: row.contact_email,
      contactPhone: row.contact_phone,
      address: row.address,
      tin: row.tin,
      invoiceCount: row.invoice_count,
      totalBalance: parseMoney(row.total_balance),
      oldestInvoiceDate: row.oldest_invoice_date,
      earliestDueDate: row.earliest_due_date,
      overdueCount: row.overdue_count,
      overdueAmount: parseMoney(row.overdue_amount),
      aging: {
        current: buildOverviewBucket(row.current_count, row.current_amount),
        days1To30: buildOverviewBucket(row.days_1_30_count, row.days_1_30_amount),
        days31To60: buildOverviewBucket(row.days_31_60_count, row.days_31_60_amount),
        days61To90: buildOverviewBucket(row.days_61_90_count, row.days_61_90_amount),
        days90Plus: buildOverviewBucket(row.days_90_plus_count, row.days_90_plus_amount),
      },
      paymentReadiness: buildPaymentReadiness(row),
      creditMemoCount: parseCount(row.available_credit_memo_count),
      creditMemoAmount: parseMoney(row.available_credit_memo_amount),
      lastPaymentDate: row.last_payment_date,
      lastSoaDate: row.last_soa_date,
      paidThisMonth: parseMoney(row.paid_this_month),
      openVoucherCount: parseCount(row.open_voucher_count),
    })),
    summary: {
      totalPayable: Math.round(totalPayable * 100) / 100,
      totalOverdue: Math.round(totalOverdue * 100) / 100,
      supplierCount: rows.length,
      dueThisWeek: parseFloat(String(dueThisWeekAmount ?? "0")),
    },
  };
}
