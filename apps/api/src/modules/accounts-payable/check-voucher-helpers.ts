export type CheckVoucherLineInput = {
  supplierInvoiceId: string;
  amount: string;
  deductionAmount?: string;
  deductionReason?: string;
};

export type CheckVoucherCreateInput = {
  supplierId: string;
  checkDate: string;
  checkNumber?: string;
  bankName?: string;
  bankAccount?: string;
  notes?: string;
  lines: CheckVoucherLineInput[];
};

export type CheckVoucherUpdateInput = {
  checkDate?: string;
  checkNumber?: string;
  bankName?: string;
  bankAccount?: string;
  notes?: string;
};

export type CheckVoucherInvoiceValidationRow = {
  id: string;
  supplierId: string;
  invoiceNumber: string;
  status: string;
  balance: string;
};

export type CheckVoucherTotalsLike = {
  totalAmountText: string;
  totalDeductionsText: string;
  netAmountText: string;
};

export function formatCheckVoucherNumber(year: number, sequence: number) {
  return `CV-${year}-${String(sequence).padStart(6, "0")}`;
}

export function assertCheckVoucherHasLines(lines: CheckVoucherLineInput[] | undefined) {
  if (!lines || lines.length === 0) {
    throw new Error("At least one invoice line is required");
  }
}

export function assertCheckVoucherStatus(
  status: string,
  expectedStatus: string,
  message: string,
) {
  if (status !== expectedStatus) throw new Error(message);
}

export function assertCheckVoucherCanVoid(status: string) {
  if (status === "CLEARED") throw new Error("Cannot void a CLEARED check voucher");
  if (status === "VOIDED") throw new Error("Check voucher already voided");
}

export function validateCheckVoucherInvoiceLines({
  lines,
  invoiceRows,
  supplierId,
}: {
  lines: CheckVoucherLineInput[];
  invoiceRows: CheckVoucherInvoiceValidationRow[];
  supplierId: string;
}) {
  if (invoiceRows.length !== lines.length) {
    throw new Error("One or more invoices not found");
  }

  const invoiceMap = new Map(invoiceRows.map((invoice) => [invoice.id, invoice]));

  for (const line of lines) {
    const invoice = invoiceMap.get(line.supplierInvoiceId)!;

    if (invoice.supplierId !== supplierId) {
      throw new Error(`Invoice ${invoice.invoiceNumber} belongs to a different supplier`);
    }
    if (!["OPEN", "PARTIALLY_PAID"].includes(invoice.status)) {
      throw new Error(`Invoice ${invoice.invoiceNumber} is not payable (status: ${invoice.status})`);
    }

    const lineAmount = Number.parseFloat(line.amount);
    const balance = Number.parseFloat(invoice.balance);
    if (lineAmount > balance) {
      throw new Error(
        `Amount ${line.amount} exceeds balance ${invoice.balance} for invoice ${invoice.invoiceNumber}`,
      );
    }
  }
}

export function buildCheckVoucherInsertValues({
  orgId,
  cvNumber,
  userId,
  data,
  totals,
}: {
  orgId: string;
  cvNumber: string;
  userId: string;
  data: CheckVoucherCreateInput;
  totals: CheckVoucherTotalsLike;
}) {
  return {
    orgId,
    cvNumber,
    supplierId: data.supplierId,
    checkDate: data.checkDate,
    checkNumber: data.checkNumber ?? null,
    bankName: data.bankName ?? null,
    bankAccount: data.bankAccount ?? null,
    totalAmount: totals.totalAmountText,
    deductions: totals.totalDeductionsText,
    netAmount: totals.netAmountText,
    status: "DRAFT" as const,
    notes: data.notes ?? null,
    preparedBy: userId,
  };
}

export function buildCheckVoucherLineInsertValues(
  checkVoucherId: string,
  line: CheckVoucherLineInput,
) {
  return {
    checkVoucherId,
    supplierInvoiceId: line.supplierInvoiceId,
    amount: line.amount,
    deductionAmount: line.deductionAmount ?? "0",
    deductionReason: line.deductionReason ?? null,
  };
}

export function buildCheckVoucherUpdateFields(data: CheckVoucherUpdateInput) {
  const updates: Record<string, any> = {};

  if (data.checkDate !== undefined) updates.checkDate = data.checkDate;
  if (data.checkNumber !== undefined) updates.checkNumber = data.checkNumber;
  if (data.bankName !== undefined) updates.bankName = data.bankName;
  if (data.bankAccount !== undefined) updates.bankAccount = data.bankAccount;
  if (data.notes !== undefined) updates.notes = data.notes;

  return updates;
}
