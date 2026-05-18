export interface ResolveSoaPaymentStatusInput {
  currentStatus: string;
  totalCharges: number;
  totalPayable: number;
  realAllocatedCharges: number;
  creditCoverage: number;
}

export interface CustomerSoaTransactionLike {
  type: string;
  amount: string;
}

export interface GeneratedSoaRowLike {
  id: string;
  soa_number: string;
  total_charges: string;
  total_credits: string;
  total_payable: string;
  transaction_count: number;
  status: string;
}

export interface AgingReportRowLike {
  id: string;
  name: string;
  customer_type: string;
  payment_terms_days: number;
  current: string;
  days1to30: string;
  days31to60: string;
  days61to90: string;
  days90plus: string;
  total: string;
}

export function resolveSoaPaymentStatus({
  currentStatus,
  totalCharges,
  totalPayable,
  realAllocatedCharges,
  creditCoverage,
}: ResolveSoaPaymentStatusInput) {
  const effectiveCoverage = realAllocatedCharges + creditCoverage;
  let newStatus: string;

  if (effectiveCoverage >= totalCharges - 0.005) {
    newStatus = "PAID";
  } else if (realAllocatedCharges > 0.005) {
    newStatus = "PARTIAL";
  } else {
    newStatus =
      currentStatus === "PAID" || currentStatus === "PARTIAL"
        ? "GENERATED"
        : currentStatus;
  }

  return {
    newStatus,
    storedPaid: Math.min(realAllocatedCharges, totalPayable).toFixed(2),
    effectiveCoverage,
  };
}

export function summarizeSoaTransactions(txns: CustomerSoaTransactionLike[]) {
  return {
    charges: txns
      .filter((txn) => txn.type === "CHARGE")
      .reduce((sum, txn) => sum + parseFloat(txn.amount), 0),
    credits: txns
      .filter((txn) => txn.type !== "CHARGE")
      .reduce((sum, txn) => sum + Math.abs(parseFloat(txn.amount)), 0),
  };
}

export function buildGeneratedSoaResponse(
  soa: GeneratedSoaRowLike,
  billedCount: number,
) {
  return {
    id: soa.id,
    soaNumber: soa.soa_number,
    totalCharges: parseFloat(soa.total_charges),
    totalCredits: parseFloat(soa.total_credits),
    totalPayable: parseFloat(soa.total_payable),
    transactionCount: soa.transaction_count,
    billedCount,
    status: soa.status,
  };
}

export function mapAgingReportRow(row: AgingReportRowLike) {
  let current = parseFloat(row.current);
  let d1to30 = parseFloat(row.days1to30);
  let d31to60 = parseFloat(row.days31to60);
  let d61to90 = parseFloat(row.days61to90);
  let d90plus = parseFloat(row.days90plus);
  const total = parseFloat(row.total);
  const bucketSum = current + d1to30 + d31to60 + d61to90 + d90plus;

  if (bucketSum > total + 0.01 && bucketSum > 0) {
    const scale = total / bucketSum;
    current = parseFloat((current * scale).toFixed(2));
    d1to30 = parseFloat((d1to30 * scale).toFixed(2));
    d31to60 = parseFloat((d31to60 * scale).toFixed(2));
    d61to90 = parseFloat((d61to90 * scale).toFixed(2));
    d90plus = parseFloat(
      (total - current - d1to30 - d31to60 - d61to90).toFixed(2),
    );
  }

  return {
    customer: { id: row.id, name: row.name },
    customerType: row.customer_type,
    paymentTerms: row.payment_terms_days,
    current,
    days1to30: d1to30,
    days31to60: d31to60,
    days61to90: d61to90,
    days90plus: d90plus,
    total,
  };
}

export function buildAgingReportResponse(
  asOfDate: string,
  rows: AgingReportRowLike[],
) {
  const data = rows.map(mapAgingReportRow);
  const totals = {
    current: 0,
    days1to30: 0,
    days31to60: 0,
    days61to90: 0,
    days90plus: 0,
    total: 0,
  };

  for (const row of data) {
    totals.current += row.current;
    totals.days1to30 += row.days1to30;
    totals.days31to60 += row.days31to60;
    totals.days61to90 += row.days61to90;
    totals.days90plus += row.days90plus;
    totals.total += row.total;
  }

  const pct = (value: number) =>
    totals.total > 0
      ? parseFloat(((value / totals.total) * 100).toFixed(1))
      : 0;

  return {
    asOfDate,
    data,
    totals,
    percentages: {
      current: pct(totals.current),
      days1to30: pct(totals.days1to30),
      days31to60: pct(totals.days31to60),
      days61to90: pct(totals.days61to90),
      days90plus: pct(totals.days90plus),
    },
  };
}
