export type DisbursementVoucherDetailRow = {
  id: string;
  dv_number: string;
  supplier_id: string;
  supplier_name: string;
  soa_id: string | null;
  soa_number: string | null;
  soa_date_from: string | null;
  soa_date_to: string | null;
  amount: string | number;
  gross_amount: string | number | null;
  total_deductions: string | number | null;
  total_charges: string | number | null;
  net_amount: string | number | null;
  payment_method: string;
  payment_date: string | null;
  remarks: string | null;
  status: string;
  printed_at: Date | string | null;
  confirmed_at: Date | string | null;
  voided_at: Date | string | null;
  void_reason: string | null;
  created_at: Date | string;
};

export type DisbursementVoucherCreateInput = {
  supplierId: string;
  soaId?: string;
  soaIds?: string[];
  soaAllocations?: Array<{ soaId: string; allocatedAmount: string }>;
  grossAmount: string;
  paymentDate: string;
  remarks?: string;
  deductions?: Array<{
    deductionType: string;
    description: string;
    referenceNumber?: string;
    amount: string;
  }>;
  additionalCharges?: Array<{
    chargeType: string;
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
};

export type DisbursementVoucherTotalsLike = {
  grossAmount: number;
  netAmount: number;
  paymentSum: number;
  totalDeductionsText: string;
  totalChargesText: string;
  netAmountText: string;
};

export type DisbursementVoucherSoaValidationRow = {
  supplier_id: string;
  total_balance: string | number;
  status: string;
};

export type DisbursementVoucherListOptions = {
  search?: string;
  status?: string;
  supplierId?: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  includeVoided?: boolean;
};

export type DisbursementVoucherLifecycleResultRow = {
  id: string;
  dv_number: string;
  status: string;
};

export type DisbursementVoucherStatusRow = {
  id: string;
  soa_id: string | null;
  amount: string | number;
  gross_amount?: string | number | null;
  net_amount?: string | number | null;
  status: string;
};

export type DisbursementVoucherSoaAllocation = {
  soaId: string;
  allocatedAmount: number;
};

export type DisbursementVoucherCreditMemoDeductionRow = {
  reference_number: string | null;
};

export type DisbursementVoucherPaymentRow = {
  id: string;
  payment_method: string;
  amount: string | number;
  reference_number: string | null;
  bank_name: string | null;
  transaction_date: string | null;
  platform: string | null;
  received_by: string | null;
};

export type DisbursementVoucherDeductionRow = {
  id: string;
  deduction_type: string;
  description: string;
  reference_number: string | null;
  amount: string | number;
};

export type DisbursementVoucherAdditionalChargeRow = {
  id: string;
  charge_type: string;
  description: string;
  reference_number: string | null;
  amount: string | number;
};

export type DisbursementVoucherSoaRefRow = {
  soa_id: string;
  allocated_amount: string | number;
  soa_number: string;
  date_from: string;
  date_to: string;
};

export type DisbursementVoucherSoaLineItemRow = {
  invoice_number: string;
  invoice_date: string;
  total_amount: string | number;
};

export function formatDisbursementVoucherNumber(year: number, sequence: number) {
  return `DV-${year}-${String(sequence).padStart(6, "0")}`;
}

export function assertDisbursementVoucherCreateTotals(
  totals: Pick<DisbursementVoucherTotalsLike, "grossAmount" | "netAmount">,
) {
  if (Number.isNaN(totals.grossAmount) || totals.grossAmount <= 0) {
    throw new Error("Gross amount must be > 0");
  }

  if (totals.netAmount <= 0) {
    throw new Error("Net amount must be > 0 (deductions exceed gross + charges)");
  }
}

export function assertDisbursementVoucherPaymentsMatchNet(
  totals: Pick<DisbursementVoucherTotalsLike, "paymentSum" | "netAmount">,
) {
  if (Math.abs(totals.paymentSum - totals.netAmount) > 0.01) {
    throw new Error(
      `Payment lines total (${totals.paymentSum.toFixed(2)}) must equal net amount (${totals.netAmount.toFixed(2)})`,
    );
  }
}

export function assertDisbursementVoucherHasPaymentLines(
  payments: DisbursementVoucherCreateInput["payments"] | undefined,
) {
  if (!payments || payments.length === 0) {
    throw new Error("At least one payment line is required");
  }
}

export function assertDisbursementVoucherRequiresSoa(resolvedSoaIds: string[]) {
  if (resolvedSoaIds.length > 0) return;

  const err: any = new Error("DV_REQUIRES_SOA");
  err.code = "DV_REQUIRES_SOA";
  err.details = {
    message: "A disbursement voucher must be linked to at least one SOA. Open the Supplier SOA History page and use the Pay action, or select SOAs from the SOA picker.",
  };
  throw err;
}

export function validateDisbursementVoucherSoaRow({
  soaId,
  rows,
  supplierId,
}: {
  soaId: string;
  rows: DisbursementVoucherSoaValidationRow[];
  supplierId: string;
}) {
  if (rows.length === 0) throw new Error(`SOA ${soaId} not found`);
  const soa = rows[0];
  if (soa.status === "VOID") throw new Error("Cannot create DV for a voided SOA");
  if (soa.supplier_id !== supplierId) throw new Error("Supplier does not match SOA");

  return parseAmount(soa.total_balance);
}

export function buildDisbursementVoucherInsertValues({
  orgId,
  dvNumber,
  userId,
  data,
  totals,
  resolvedSoaIds,
}: {
  orgId: string;
  dvNumber: string;
  userId: string;
  data: DisbursementVoucherCreateInput;
  totals: DisbursementVoucherTotalsLike;
  resolvedSoaIds: string[];
}) {
  return {
    orgId,
    dvNumber,
    supplierId: data.supplierId,
    legacySoaId: resolvedSoaIds.length > 0 ? resolvedSoaIds[0] : null,
    amount: totals.netAmountText,
    grossAmount: data.grossAmount,
    totalDeductions: totals.totalDeductionsText,
    totalCharges: totals.totalChargesText,
    netAmount: totals.netAmountText,
    paymentMethod: data.payments[0].paymentMethod,
    paymentDate: data.paymentDate,
    remarks: data.remarks ?? null,
    status: "DRAFT" as const,
    createdBy: userId,
  };
}

export function buildDisbursementVoucherSoaInsertValues({
  dvId,
  soaId,
  allocatedAmount,
}: {
  dvId: string;
  soaId: string;
  allocatedAmount: number;
}) {
  return {
    dvId,
    soaId,
    allocatedAmountText: allocatedAmount.toFixed(2),
  };
}

export function buildDisbursementVoucherDeductionInsertValues({
  dvId,
  deduction,
  sortOrder,
}: {
  dvId: string;
  deduction: NonNullable<DisbursementVoucherCreateInput["deductions"]>[number];
  sortOrder: number;
}) {
  return {
    dvId,
    deductionType: deduction.deductionType,
    description: deduction.description,
    referenceNumber: deduction.referenceNumber ?? null,
    amount: deduction.amount,
    sortOrder,
  };
}

export function buildDisbursementVoucherAdditionalChargeInsertValues({
  dvId,
  charge,
  sortOrder,
}: {
  dvId: string;
  charge: NonNullable<DisbursementVoucherCreateInput["additionalCharges"]>[number];
  sortOrder: number;
}) {
  return {
    dvId,
    chargeType: charge.chargeType,
    description: charge.description,
    referenceNumber: charge.referenceNumber ?? null,
    amount: charge.amount,
    sortOrder,
  };
}

export function buildDisbursementVoucherPaymentInsertValues({
  dvId,
  payment,
  sortOrder,
}: {
  dvId: string;
  payment: DisbursementVoucherCreateInput["payments"][number];
  sortOrder: number;
}) {
  return {
    dvId,
    paymentMethod: payment.paymentMethod,
    amount: payment.amount,
    referenceNumber: payment.referenceNumber ?? null,
    bankName: payment.bankName ?? null,
    transactionDate: payment.transactionDate ?? null,
    platform: payment.platform ?? null,
    receivedBy: payment.receivedBy ?? null,
    sortOrder,
  };
}

export function buildDisbursementVoucherCreateResult(
  row: { id: string; dv_number: string; status: string },
) {
  return { id: row.id, dvNumber: row.dv_number, status: row.status };
}

export function normalizeDisbursementVoucherListOptions(
  opts: DisbursementVoucherListOptions,
) {
  const search = opts.search?.trim();

  return {
    ...opts,
    limit: Math.min(opts.limit ?? 100, 200),
    searchPattern: search ? `%${search}%` : null,
  };
}

export function requireDisbursementVoucherPrintResult(
  rows: DisbursementVoucherLifecycleResultRow[],
) {
  if (rows.length === 0) throw new Error("DV not found or not in DRAFT status");
  return rows[0];
}

export function requireConfirmableDisbursementVoucher(
  rows: DisbursementVoucherStatusRow[],
) {
  if (rows.length === 0) throw new Error("DV not found");

  const dv = rows[0];
  if (dv.status !== "PRINTED") throw new Error("Can only confirm PRINTED vouchers");

  return dv;
}

export function assertDisbursementVoucherHasConfirmSoaLinks(
  soaAllocations: DisbursementVoucherSoaAllocation[],
  dvId: string,
) {
  if (soaAllocations.length > 0) return;

  const err: any = new Error("DV_HAS_NO_SOA_LINK");
  err.code = "DV_HAS_NO_SOA_LINK";
  err.details = {
    dvId,
    message: "Cannot confirm: this DV has no linked SOA. Contact support to backfill the link.",
  };
  throw err;
}

export function requireVoidableDisbursementVoucher(
  rows: DisbursementVoucherStatusRow[],
) {
  if (rows.length === 0) throw new Error("DV not found");

  const dv = rows[0];
  if (dv.status === "VOIDED") throw new Error("DV is already voided");

  return dv;
}

export function shouldReverseDisbursementVoucherSettlement(
  dv: Pick<DisbursementVoucherStatusRow, "status">,
) {
  return dv.status === "CONFIRMED";
}

export function buildDisbursementVoucherPaymentAuditNote({
  payAmount,
  dvId,
}: {
  payAmount: number;
  dvId: string;
}) {
  return `[DV Payment: ${payAmount.toFixed(2)}, DV#${dvId}]`;
}

export function appendDisbursementVoucherPaymentAuditNote(
  existingNotes: string | null | undefined,
  auditNote: string,
) {
  return existingNotes ? `${existingNotes}\n${auditNote}` : auditNote;
}

export function calculateDisbursementVoucherInvoiceReversalAmount({
  remaining,
  paidAmount,
}: {
  remaining: number;
  paidAmount: string | number;
}) {
  return Math.min(remaining, parseAmount(paidAmount));
}

export function buildDisbursementVoucherCreditMemoReferences(
  rows: DisbursementVoucherCreditMemoDeductionRow[],
) {
  return rows
    .map((row) => row.reference_number)
    .filter((referenceNumber): referenceNumber is string => Boolean(referenceNumber));
}

export function buildDisbursementVoucherSoaRefs(
  rows: DisbursementVoucherSoaRefRow[],
) {
  return rows.map((row) => ({
    soaId: row.soa_id,
    soaNumber: row.soa_number,
    allocatedAmount: parseAmount(row.allocated_amount),
    dateFrom: row.date_from,
    dateTo: row.date_to,
  }));
}

export function resolveDisbursementVoucherLinkedSoaIds({
  soaRefRows,
  legacySoaId,
}: {
  soaRefRows: DisbursementVoucherSoaRefRow[];
  legacySoaId: string | null;
}) {
  return soaRefRows.length > 0
    ? soaRefRows.map((row) => row.soa_id)
    : legacySoaId
      ? [legacySoaId]
      : [];
}

export function buildDisbursementVoucherDetailResponse({
  dv,
  paymentRows,
  deductionRows,
  additionalChargeRows,
  soaRefRows,
  soaLineItems,
}: {
  dv: DisbursementVoucherDetailRow;
  paymentRows: DisbursementVoucherPaymentRow[];
  deductionRows: DisbursementVoucherDeductionRow[];
  additionalChargeRows: DisbursementVoucherAdditionalChargeRow[];
  soaRefRows: DisbursementVoucherSoaRefRow[];
  soaLineItems: DisbursementVoucherSoaLineItemRow[];
}) {
  const soaRefs = buildDisbursementVoucherSoaRefs(soaRefRows);
  const positiveItems = soaLineItems.filter(
    (item) => parseAmount(item.total_amount) > 0,
  );
  const negativeItems = soaLineItems.filter(
    (item) => parseAmount(item.total_amount) < 0,
  );
  const computedGross = positiveItems.reduce(
    (sum, item) => sum + parseAmount(item.total_amount),
    0,
  );

  return {
    id: dv.id,
    dvNumber: dv.dv_number,
    supplierId: dv.supplier_id,
    supplierName: dv.supplier_name,
    soaId: soaRefs.length > 0 ? soaRefs[0].soaId : dv.soa_id,
    soaNumber: soaRefs.length > 0 ? soaRefs[0].soaNumber : dv.soa_number,
    soaDateFrom: soaRefs.length > 0 ? soaRefs[0].dateFrom : dv.soa_date_from,
    soaDateTo: soaRefs.length > 0 ? soaRefs[0].dateTo : dv.soa_date_to,
    soaRefs,
    grossAmount:
      computedGross > 0
        ? computedGross
        : dv.gross_amount
          ? parseAmount(dv.gross_amount)
          : parseAmount(dv.amount),
    totalDeductions: dv.total_deductions
      ? parseAmount(dv.total_deductions)
      : 0,
    totalCharges: dv.total_charges ? parseAmount(dv.total_charges) : 0,
    netAmount: dv.net_amount ? parseAmount(dv.net_amount) : parseAmount(dv.amount),
    soaCreditMemos: negativeItems.map((item) => ({
      invoiceNumber: item.invoice_number,
      amount: Math.abs(parseAmount(item.total_amount)),
    })),
    amount: parseAmount(dv.amount),
    paymentMethod: dv.payment_method,
    paymentDate: dv.payment_date,
    remarks: dv.remarks,
    status: dv.status,
    printedAt: dv.printed_at,
    confirmedAt: dv.confirmed_at,
    voidedAt: dv.voided_at,
    voidReason: dv.void_reason,
    createdAt: dv.created_at,
    payments: paymentRows.map((row) => ({
      id: row.id,
      paymentMethod: row.payment_method,
      amount: parseAmount(row.amount),
      referenceNumber: row.reference_number,
      bankName: row.bank_name,
      transactionDate: row.transaction_date,
      platform: row.platform,
      receivedBy: row.received_by,
    })),
    deductions: deductionRows.map((row) => ({
      id: row.id,
      deductionType: row.deduction_type,
      description: row.description,
      referenceNumber: row.reference_number,
      amount: parseAmount(row.amount),
    })),
    additionalCharges: additionalChargeRows.map((row) => ({
      id: row.id,
      chargeType: row.charge_type,
      description: row.description,
      referenceNumber: row.reference_number,
      amount: parseAmount(row.amount),
    })),
  };
}

function parseAmount(value: string | number | null | undefined) {
  return parseFloat(String(value ?? "0"));
}
