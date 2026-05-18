export type ApAgingReportRow = {
  supplier_id: string;
  supplier_name: string;
  current: string | number | null;
  days_1_30: string | number | null;
  days_31_60: string | number | null;
  days_61_90: string | number | null;
  days_91_120: string | number | null;
  days_121_180: string | number | null;
  days_180_plus: string | number | null;
  total: string | number | null;
};

export type DisbursementVoucherListRow = {
  id: string;
  dv_number: string;
  supplier_id: string;
  supplier_name: string;
  soa_id: string | null;
  soa_numbers: Array<string | null> | null;
  amount: string | number;
  payment_method: string;
  check_number: string | null;
  payment_date: string | null;
  status: string;
  created_at: Date | string;
  voided_at: Date | string | null;
  void_reason: string | null;
};

export type DisbursementVoucherSummaryRow = {
  status: string;
  cnt: number;
  total: string | number;
};

export type PdcReportRow = {
  id: string;
  cv_number: string | null;
  check_number: string | null;
  bank_name: string | null;
  check_date: Date | string | null;
  net_amount: string | number | null;
  status: string | null;
  supplier_name: string | null;
  month_bucket: string | null;
};

export type CheckRegisterRow = {
  id: string;
  check_status: string | null;
  amount: string | number;
  check_number: string | null;
  bank_name: string | null;
  check_date: string | null;
  bounce_reason: string | null;
  dv_id: string;
  dv_number: string;
  supplier_name: string;
};

export function buildApAgingReportResponse(rows: ApAgingReportRow[]) {
  return {
    data: rows.map((row) => ({
      supplierId: row.supplier_id,
      supplierName: row.supplier_name,
      current: parseAmount(row.current),
      days1to30: parseAmount(row.days_1_30),
      days31to60: parseAmount(row.days_31_60),
      days61to90: parseAmount(row.days_61_90),
      days91to120: parseAmount(row.days_91_120),
      days121to180: parseAmount(row.days_121_180),
      over180: parseAmount(row.days_180_plus),
      total: parseAmount(row.total),
    })),
  };
}

export function buildDisbursementVoucherSummary(
  rows: DisbursementVoucherSummaryRow[],
) {
  return rows.reduce(
    (summary, row) => {
      const count = row.cnt;
      const amount = parseAmount(row.total);
      summary.totalCount += count;
      if (row.status === "CONFIRMED") {
        summary.confirmedCount = count;
        summary.confirmedAmt = amount;
      } else if (row.status === "VOIDED") {
        summary.voidedCount = count;
        summary.voidedAmt = amount;
      }
      return summary;
    },
    {
      totalCount: 0,
      confirmedCount: 0,
      confirmedAmt: 0,
      voidedCount: 0,
      voidedAmt: 0,
    },
  );
}

export function buildDisbursementVoucherListResponse({
  rows,
  total,
  summaryRows,
}: {
  rows: DisbursementVoucherListRow[];
  total: number;
  summaryRows: DisbursementVoucherSummaryRow[];
}) {
  return {
    data: rows.map((row) => {
      const soaNumbers = (row.soa_numbers ?? []).filter(Boolean) as string[];
      return {
        id: row.id,
        dvNumber: row.dv_number,
        supplierId: row.supplier_id,
        supplierName: row.supplier_name,
        soaId: row.soa_id,
        soaNumber: soaNumbers[0] ?? "",
        soaNumbers,
        amount: parseAmount(row.amount),
        paymentMethod: row.payment_method,
        checkNumber: row.check_number,
        paymentDate: row.payment_date,
        status: row.status,
        createdAt: row.created_at,
        voidedAt: row.voided_at,
        voidReason: row.void_reason,
      };
    }),
    total,
    summary: buildDisbursementVoucherSummary(summaryRows),
  };
}

export function buildPdcReportResponse(rows: PdcReportRow[]) {
  const data = rows.map((row) => ({
    id: row.id,
    cvNo: row.cv_number ?? "",
    supplierName: row.supplier_name ?? "",
    checkNo: row.check_number ?? "",
    bankName: row.bank_name ?? "",
    checkDate: row.check_date,
    amount: String(row.net_amount ?? "0"),
    status: row.status ?? "",
  }));

  const monthMap = new Map<string, number>();
  for (const row of rows) {
    if (row.month_bucket) {
      monthMap.set(
        row.month_bucket,
        (monthMap.get(row.month_bucket) || 0) + parseAmount(row.net_amount),
      );
    }
  }

  const monthlySummary = Array.from(monthMap.entries())
    .map(([month, total]) => ({ month, total }))
    .sort((a, b) => a.month.localeCompare(b.month));

  return { data, monthlySummary };
}

export function buildCheckRegisterResponse(
  rows: CheckRegisterRow[],
  now = new Date(),
) {
  const endOfWeek = new Date(now);
  endOfWeek.setDate(now.getDate() + (7 - now.getDay()));
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  let totalOutstanding = 0;
  let maturingThisWeek = 0;
  let clearedThisMonth = 0;
  let totalBounced = 0;

  const data = rows.map((row) => {
    const amount = parseAmount(row.amount);
    const status = row.check_status ?? "OUTSTANDING";
    const checkDate = row.check_date ? new Date(row.check_date) : null;

    if (status === "OUTSTANDING" || status === "RELEASED") {
      totalOutstanding += amount;
    }
    if (
      (status === "OUTSTANDING" || status === "RELEASED") &&
      checkDate &&
      checkDate >= now &&
      checkDate <= endOfWeek
    ) {
      maturingThisWeek += amount;
    }
    if (
      status === "CLEARED" &&
      checkDate &&
      checkDate >= monthStart &&
      checkDate <= monthEnd
    ) {
      clearedThisMonth += amount;
    }
    if (status === "BOUNCED") {
      totalBounced += amount;
    }

    return {
      id: row.id,
      dvId: row.dv_id,
      dvNumber: row.dv_number,
      supplierName: row.supplier_name,
      checkNumber: row.check_number ?? "",
      bankName: row.bank_name ?? "",
      checkDate: row.check_date ?? "",
      amount,
      status,
      bounceReason: row.bounce_reason,
    };
  });

  return {
    data,
    summary: {
      totalOutstanding: roundMoney(totalOutstanding),
      maturingThisWeek: roundMoney(maturingThisWeek),
      clearedThisMonth: roundMoney(clearedThisMonth),
      totalBounced: roundMoney(totalBounced),
    },
  };
}

function parseAmount(value: string | number | null | undefined) {
  return parseFloat(String(value ?? "0"));
}

function roundMoney(value: number) {
  return parseFloat(value.toFixed(2));
}
