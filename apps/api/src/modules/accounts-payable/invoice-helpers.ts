import {
  appendAuditNote,
  buildAuditNote,
  calculateDueDate,
  calculateEditedInvoiceBalance,
  calculateFullInvoicePayment,
} from "./financial-helpers";

export type SupplierInvoiceCreateInput = {
  supplierId: string;
  invoiceNumber: string;
  invoiceDate: string;
  totalAmount: string;
  paymentTermsDays?: number;
  currency?: string;
  sourcePoId?: string;
  sourceReceiptId?: string;
  notes?: string;
};

export type BulkSupplierInvoiceCreateInput = {
  supplierId: string;
  sourcePoId?: string;
  notes?: string;
  invoices: Array<{
    invoiceNumber: string;
    invoiceDate: string;
    amount: string;
    kind?: "invoice" | "credit_memo";
  }>;
};

export type SupplierInvoiceUpdateInput = {
  invoiceNumber?: string;
  invoiceDate?: string;
  totalAmount?: string;
  paymentTermsDays?: number;
  notes?: string;
};

export type SupplierInvoiceUpdateSource = {
  invoiceDate: string;
  paymentTermsDays: number | null;
  paidAmount: string;
  rtvCreditAmount: string;
  status: string;
};

export type BulkMarkInvoicesPaidInput = {
  invoiceIds: string[];
  useInvoiceDateAsPaymentDate: boolean;
  paymentDate?: string;
  paymentMethod?: string;
  referenceNumber?: string;
  notes?: string;
};

export type BulkPaidInvoiceSource = {
  id: string;
  invoiceDate: string;
  paidAmount: string;
  balance: string;
  status: string;
  notes: string | null;
};

export function resolveInvoicePaymentTermsDays(
  explicitTermsDays: number | undefined,
  supplierTermsDays: number | null | undefined,
) {
  return explicitTermsDays ?? supplierTermsDays ?? 30;
}

export function buildSupplierInvoiceInsertValues({
  orgId,
  userId,
  data,
  supplierTermsDays,
}: {
  orgId: string;
  userId: string;
  data: SupplierInvoiceCreateInput;
  supplierTermsDays: number | null | undefined;
}) {
  const termsDays = resolveInvoicePaymentTermsDays(data.paymentTermsDays, supplierTermsDays);

  return {
    orgId,
    supplierId: data.supplierId,
    invoiceNumber: data.invoiceNumber,
    invoiceDate: data.invoiceDate,
    dueDate: calculateDueDate(data.invoiceDate, termsDays),
    totalAmount: data.totalAmount,
    balance: data.totalAmount,
    paymentTermsDays: termsDays,
    currency: data.currency ?? "PHP",
    sourcePoId: data.sourcePoId ?? null,
    sourceReceiptId: data.sourceReceiptId ?? null,
    notes: data.notes ?? null,
    recordedBy: userId,
  };
}

export function assertBulkCreateInvoicesHasRows(
  invoices: BulkSupplierInvoiceCreateInput["invoices"],
) {
  if (!invoices.length) throw new Error("No invoices provided");
}

export function normalizeCreditMemoInvoiceNumber(invoiceNumber: string) {
  const trimmed = invoiceNumber.trim();
  return /^CM-/i.test(trimmed) ? `CM-${trimmed.slice(3)}` : `CM-${trimmed}`;
}

export function normalizeBulkSupplierInvoiceRow(
  invoice: BulkSupplierInvoiceCreateInput["invoices"][number],
) {
  const parsedAmount = Number.parseFloat(invoice.amount);
  if (!Number.isFinite(parsedAmount) || Math.abs(parsedAmount) <= 0) {
    throw new Error("Amount must be greater than zero");
  }

  const isCreditMemo =
    invoice.kind === "credit_memo" ||
    /^CM-/i.test(invoice.invoiceNumber.trim()) ||
    parsedAmount < 0;
  const amount = Math.abs(parsedAmount);

  return {
    ...invoice,
    invoiceNumber: isCreditMemo
      ? normalizeCreditMemoInvoiceNumber(invoice.invoiceNumber)
      : invoice.invoiceNumber.trim(),
    amount: (isCreditMemo ? -amount : amount).toFixed(2),
    kind: isCreditMemo ? "credit_memo" as const : "invoice" as const,
  };
}

export function buildBulkSupplierInvoiceInsertValues({
  orgId,
  userId,
  data,
  invoice,
  termsDays,
}: {
  orgId: string;
  userId: string;
  data: BulkSupplierInvoiceCreateInput;
  invoice: BulkSupplierInvoiceCreateInput["invoices"][number];
  termsDays: number;
}) {
  const normalizedInvoice = normalizeBulkSupplierInvoiceRow(invoice);
  return {
    orgId,
    supplierId: data.supplierId,
    invoiceNumber: normalizedInvoice.invoiceNumber,
    invoiceDate: normalizedInvoice.invoiceDate,
    dueDate: calculateDueDate(normalizedInvoice.invoiceDate, termsDays),
    totalAmount: normalizedInvoice.amount,
    balance: normalizedInvoice.amount,
    paymentTermsDays: termsDays,
    sourcePoId: data.sourcePoId ?? null,
    notes: data.notes ?? null,
    recordedBy: userId,
  };
}

export function buildBulkCreateInvoiceError(
  index: number,
  invoiceNumber: string,
  message: string,
) {
  return { index, invoiceNumber, message };
}

export function buildBulkCreateInvoicesResult({
  created,
  total,
  errors,
}: {
  created: number;
  total: number;
  errors: Array<{ index: number; invoiceNumber: string; message: string }>;
}) {
  return { created, total: Number.parseFloat(total.toFixed(2)), errors };
}

export function assertInvoiceCanEdit(status: string) {
  if (status !== "OPEN") throw new Error("Can only edit OPEN invoices");
}

export function assertInvoiceCanVoid(status: string) {
  if (status === "VOIDED") throw new Error("Invoice already voided");
  if (status === "PAID") throw new Error("Cannot void a fully paid invoice");
}

export function buildSupplierInvoiceUpdateFields({
  data,
  invoice,
}: {
  data: SupplierInvoiceUpdateInput;
  invoice: SupplierInvoiceUpdateSource;
}) {
  const updates: Record<string, any> = {};

  if (data.invoiceNumber !== undefined) updates.invoiceNumber = data.invoiceNumber;
  if (data.notes !== undefined) updates.notes = data.notes;
  if (data.paymentTermsDays !== undefined) updates.paymentTermsDays = data.paymentTermsDays;

  if (data.invoiceDate !== undefined || data.paymentTermsDays !== undefined) {
    const invoiceDate = data.invoiceDate ?? invoice.invoiceDate;
    const termsDays = data.paymentTermsDays ?? invoice.paymentTermsDays ?? 30;
    updates.dueDate = calculateDueDate(invoiceDate, termsDays);
    if (data.invoiceDate !== undefined) updates.invoiceDate = data.invoiceDate;
  }

  if (data.totalAmount !== undefined) {
    updates.totalAmount = data.totalAmount;
    updates.balance = calculateEditedInvoiceBalance({
      totalAmount: data.totalAmount,
      paidAmount: invoice.paidAmount,
      rtvCreditAmount: invoice.rtvCreditAmount,
    });
  }

  return updates;
}

export function assertBulkMarkInvoicesPaidInput(data: BulkMarkInvoicesPaidInput) {
  if (!data.invoiceIds.length) throw new Error("No invoice IDs provided");
  if (data.invoiceIds.length > 100) throw new Error("Maximum 100 invoices per request");
}

export function collectMissingBulkPaidInvoiceIds(
  requestedIds: string[],
  foundIds: Set<string>,
) {
  return requestedIds.filter((id) => !foundIds.has(id));
}

export function shouldSkipBulkPaidInvoice(invoice: Pick<BulkPaidInvoiceSource, "balance" | "status">) {
  if (invoice.status === "PAID" || invoice.status === "VOIDED") return true;
  return Number.parseFloat(invoice.balance) <= 0;
}

export function resolveBulkPaidInvoicePaymentDate({
  invoiceDate,
  data,
  fallbackDate,
}: {
  invoiceDate: string;
  data: BulkMarkInvoicesPaidInput;
  fallbackDate: string;
}) {
  return data.useInvoiceDateAsPaymentDate
    ? invoiceDate
    : (data.paymentDate ?? fallbackDate);
}

export function buildBulkPaidInvoiceUpdate({
  invoice,
  data,
  paymentDate,
}: {
  invoice: BulkPaidInvoiceSource;
  data: BulkMarkInvoicesPaidInput;
  paymentDate: string;
}) {
  const paymentUpdate = calculateFullInvoicePayment({
    paidAmount: invoice.paidAmount,
    balance: invoice.balance,
  });
  const auditNote = buildAuditNote({
    label: "Bulk Paid",
    date: paymentDate,
    paymentMethod: data.paymentMethod,
    referenceNumber: data.referenceNumber,
  });

  return {
    amountPaid: paymentUpdate.amountPaid,
    updateFields: {
      paidAmount: paymentUpdate.paidAmountText,
      balance: paymentUpdate.balanceText,
      status: paymentUpdate.status,
      notes: appendAuditNote(invoice.notes, auditNote, data.notes),
    },
  };
}

export function buildBulkMarkInvoicesPaidResult({
  successCount,
  skippedIds,
  totalAmountPaid,
}: {
  successCount: number;
  skippedIds: string[];
  totalAmountPaid: number;
}) {
  return {
    successCount,
    skippedCount: skippedIds.length,
    skippedIds,
    totalAmountPaid: Number.parseFloat(totalAmountPaid.toFixed(2)),
  };
}
