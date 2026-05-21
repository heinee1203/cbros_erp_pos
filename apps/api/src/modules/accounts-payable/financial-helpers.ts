const ones = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
  "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
  "Seventeen", "Eighteen", "Nineteen",
];

const tens = [
  "", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety",
];

export type SupplierInvoicePaymentStatus = "OPEN" | "PARTIALLY_PAID" | "PAID";
const MONEY_TOLERANCE = 0.01;

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

export function calculateDueDate(invoiceDate: string, paymentTermsDays: number) {
  const date = new Date(invoiceDate);
  date.setDate(date.getDate() + paymentTermsDays);
  return date.toISOString().split("T")[0];
}

export function calculateEditedInvoiceBalance({
  totalAmount,
  paidAmount,
  rtvCreditAmount,
}: {
  totalAmount: string;
  paidAmount: string;
  rtvCreditAmount: string;
}) {
  return String(parseFloat(totalAmount) - parseFloat(paidAmount) - parseFloat(rtvCreditAmount));
}

export function calculateCheckVoucherTotals(
  lines: Array<{ amount: string; deductionAmount?: string }>,
) {
  let totalAmount = 0;
  let totalDeductions = 0;

  for (const line of lines) {
    totalAmount += parseFloat(line.amount);
    totalDeductions += parseFloat(line.deductionAmount ?? "0");
  }

  const netAmount = totalAmount - totalDeductions;

  return {
    totalAmount,
    totalDeductions,
    netAmount,
    totalAmountText: totalAmount.toFixed(2),
    totalDeductionsText: totalDeductions.toFixed(2),
    netAmountText: netAmount.toFixed(2),
  };
}

export function calculateInvoicePaymentApplication({
  paidAmount,
  totalAmount,
  rtvCreditAmount,
  allocation,
  paidThreshold = 0.005,
}: {
  paidAmount: string;
  totalAmount: string;
  rtvCreditAmount: string;
  allocation: number;
  paidThreshold?: number;
}) {
  const currentBalance = parseFloat(totalAmount) - parseFloat(paidAmount) - parseFloat(rtvCreditAmount);
  if (Math.abs(allocation - currentBalance) > Math.max(paidThreshold, MONEY_TOLERANCE)) {
    throw new Error(
      `Supplier invoice payments must settle the full remaining balance (${currentBalance.toFixed(2)}); partial payments are not allowed`,
    );
  }

  const newPaid = parseFloat(paidAmount) + allocation;
  const newBalance = parseFloat(totalAmount) - newPaid - parseFloat(rtvCreditAmount);
  const status: SupplierInvoicePaymentStatus = newBalance <= paidThreshold ? "PAID" : "OPEN";

  return {
    newPaid,
    newBalance,
    status,
    paidAmountText: newPaid.toFixed(2),
    balanceText: Math.max(0, newBalance).toFixed(2),
  };
}

export function calculateInvoicePaymentReversal({
  paidAmount,
  totalAmount,
  rtvCreditAmount,
  reversal,
}: {
  paidAmount: string;
  totalAmount: string;
  rtvCreditAmount: string;
  reversal: number;
}) {
  const currentPaid = parseFloat(paidAmount);
  if (Math.abs(reversal - currentPaid) > MONEY_TOLERANCE) {
    throw new Error(
      `Supplier invoice payment reversals must restore the full paid amount (${currentPaid.toFixed(2)}); partial reversals are not allowed`,
    );
  }

  const newPaid = parseFloat(paidAmount) - reversal;
  const newBalance = parseFloat(totalAmount) - newPaid - parseFloat(rtvCreditAmount);
  const status: SupplierInvoicePaymentStatus = "OPEN";

  return {
    newPaid,
    newBalance,
    status,
    paidAmountText: newPaid.toFixed(2),
    balanceText: Math.max(0, newBalance).toFixed(2),
  };
}

export function calculateFullInvoicePayment({
  paidAmount,
  balance,
}: {
  paidAmount: string;
  balance: string;
}) {
  const amountPaid = parseFloat(balance);
  const newPaid = parseFloat(paidAmount) + amountPaid;

  return {
    amountPaid,
    newPaid,
    paidAmountText: newPaid.toFixed(2),
    balanceText: "0.00",
    status: "PAID" as const,
  };
}

export function buildAuditNote({
  label,
  date,
  paymentMethod,
  referenceNumber,
}: {
  label: string;
  date: string;
  paymentMethod?: string;
  referenceNumber?: string;
}) {
  const parts = [`[${label}: ${date}`];
  if (paymentMethod) parts.push(paymentMethod);
  if (referenceNumber) parts.push(`Ref#${referenceNumber}`);
  parts[parts.length - 1] += "]";
  return parts.join(", ");
}

export function appendAuditNote(
  existingNotes: string | null | undefined,
  auditNote: string,
  userNotes?: string,
) {
  const updatedNotes = existingNotes ? `${existingNotes}\n${auditNote}` : auditNote;
  return userNotes ? `${updatedNotes}\n${userNotes}` : updatedNotes;
}

export function calculateDisbursementVoucherTotals(data: {
  grossAmount: string;
  deductions?: Array<{ amount: string }>;
  additionalCharges?: Array<{ amount: string }>;
  payments?: Array<{ amount: string }>;
}) {
  const grossAmount = parseFloat(data.grossAmount);
  const totalDeductions = (data.deductions ?? []).reduce(
    (sum, deduction) => sum + (parseFloat(deduction.amount) || 0),
    0,
  );
  const totalCharges = (data.additionalCharges ?? []).reduce(
    (sum, charge) => sum + (parseFloat(charge.amount) || 0),
    0,
  );
  const netAmount = grossAmount + totalCharges - totalDeductions;
  const paymentSum = (data.payments ?? []).reduce(
    (sum, payment) => sum + parseFloat(payment.amount || "0"),
    0,
  );

  return {
    grossAmount,
    totalDeductions,
    totalCharges,
    netAmount,
    paymentSum,
    totalDeductionsText: totalDeductions.toFixed(2),
    totalChargesText: totalCharges.toFixed(2),
    netAmountText: netAmount.toFixed(2),
  };
}

export function resolveDisbursementVoucherSoaIds(data: {
  soaId?: string;
  soaIds?: string[];
}) {
  return data.soaIds && data.soaIds.length > 0
    ? data.soaIds
    : data.soaId
      ? [data.soaId]
      : [];
}

export function buildSoaAllocationMap({
  resolvedSoaIds,
  grossAmount,
  soaBalances,
  explicitAllocations,
}: {
  resolvedSoaIds: string[];
  grossAmount: number;
  soaBalances: Record<string, number>;
  explicitAllocations?: Array<{ soaId: string; allocatedAmount: string }>;
}) {
  const allocationMap: Record<string, number> = {};

  if (explicitAllocations && explicitAllocations.length > 0) {
    for (const allocation of explicitAllocations) {
      allocationMap[allocation.soaId] = parseFloat(allocation.allocatedAmount);
    }
    return allocationMap;
  }

  if (resolvedSoaIds.length === 1) {
    allocationMap[resolvedSoaIds[0]] = grossAmount;
    return allocationMap;
  }

  const totalBalance = Object.values(soaBalances).reduce((sum, balance) => sum + balance, 0);
  if (totalBalance > 0) {
    let allocated = 0;
    for (let i = 0; i < resolvedSoaIds.length; i++) {
      const soaId = resolvedSoaIds[i];
      if (i === resolvedSoaIds.length - 1) {
        allocationMap[soaId] = parseFloat((grossAmount - allocated).toFixed(2));
      } else {
        const proportion = soaBalances[soaId] / totalBalance;
        const amount = parseFloat((grossAmount * proportion).toFixed(2));
        allocationMap[soaId] = amount;
        allocated += amount;
      }
    }
    return allocationMap;
  }

  const each = parseFloat((grossAmount / resolvedSoaIds.length).toFixed(2));
  let allocated = 0;
  for (let i = 0; i < resolvedSoaIds.length; i++) {
    const soaId = resolvedSoaIds[i];
    if (i === resolvedSoaIds.length - 1) {
      allocationMap[soaId] = parseFloat((grossAmount - allocated).toFixed(2));
    } else {
      allocationMap[soaId] = each;
      allocated += each;
    }
  }

  return allocationMap;
}

export type DisbursementVoucherSoaAllocationRow = {
  soa_id: string;
  allocated_amount: string | number;
};

export type DisbursementVoucherLegacyAllocationSource = {
  soa_id: string | null;
  gross_amount?: string | number | null;
  amount: string | number;
};

export function buildDisbursementVoucherSoaAllocations({
  dvSoaRows,
  dv,
}: {
  dvSoaRows: DisbursementVoucherSoaAllocationRow[];
  dv: DisbursementVoucherLegacyAllocationSource;
}) {
  if (dvSoaRows.length > 0) {
    return dvSoaRows.map((row) => ({
      soaId: row.soa_id,
      allocatedAmount: parseFloat(String(row.allocated_amount)),
    }));
  }

  return dv.soa_id
    ? [
        {
          soaId: dv.soa_id,
          allocatedAmount: dv.gross_amount
            ? parseFloat(String(dv.gross_amount))
            : parseFloat(String(dv.amount)),
        },
      ]
    : [];
}

export function calculateSoaPaymentTotals({
  totalPaid,
  totalAmount,
  appliedAmount,
}: {
  totalPaid: string;
  totalAmount: string;
  appliedAmount: number;
}) {
  const newTotalPaid = parseFloat(totalPaid) + appliedAmount;
  const newTotalBalance = Math.max(0, parseFloat(totalAmount) - newTotalPaid);

  return {
    newTotalPaid,
    newTotalBalance,
    totalPaidText: newTotalPaid.toFixed(2),
    totalBalanceText: newTotalBalance.toFixed(2),
  };
}

export function calculateSoaPaymentReversalTotals({
  totalPaid,
  totalAmount,
  reversalAmount,
}: {
  totalPaid: string;
  totalAmount: string;
  reversalAmount: number;
}) {
  const newTotalPaid = Math.max(0, parseFloat(totalPaid) - reversalAmount);
  const newTotalBalance = Math.max(0, parseFloat(totalAmount) - newTotalPaid);

  return {
    newTotalPaid,
    newTotalBalance,
    totalPaidText: newTotalPaid.toFixed(2),
    totalBalanceText: newTotalBalance.toFixed(2),
  };
}
