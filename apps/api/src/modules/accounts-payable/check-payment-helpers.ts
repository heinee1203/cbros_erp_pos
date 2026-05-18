export type CheckRegisterOptions = {
  search?: string;
  bank?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
};

export type CheckPaymentLifecycleRow = {
  id: string;
  status: string;
  payment_method: string;
  amount?: string | number;
  dv_id?: string;
  soa_id?: string | null;
  org_id?: string;
};

export type CheckPaymentStatusResult = {
  id: string;
  status: string;
};

export function normalizeCheckRegisterOptions(opts: CheckRegisterOptions) {
  const search = opts.search?.trim();

  return {
    ...opts,
    searchPattern: search ? `%${search}%` : null,
  };
}

export function requireCheckPaymentRow(rows: CheckPaymentLifecycleRow[]) {
  if (rows.length === 0) throw new Error("Check not found");

  const check = rows[0];
  if (check.payment_method !== "CHECK") throw new Error("Not a check payment");

  return check;
}

export function requireCheckPaymentStatus({
  check,
  expectedStatus,
  message,
}: {
  check: Pick<CheckPaymentLifecycleRow, "status">;
  expectedStatus: string;
  message: string;
}) {
  if (check.status !== expectedStatus) throw new Error(message);
}

export function requireOutstandingCheckPayment(
  rows: CheckPaymentLifecycleRow[],
  action: "release" | "cancel",
) {
  const check = requireCheckPaymentRow(rows);
  requireCheckPaymentStatus({
    check,
    expectedStatus: "OUTSTANDING",
    message: `Can only ${action} OUTSTANDING checks`,
  });
  return check;
}

export function requireReleasedCheckPayment(
  rows: CheckPaymentLifecycleRow[],
  action: "clear" | "bounce",
) {
  const check = requireCheckPaymentRow(rows);
  requireCheckPaymentStatus({
    check,
    expectedStatus: "RELEASED",
    message: `Can only ${action} RELEASED checks`,
  });
  return check;
}

export function parseCheckPaymentAmount(
  check: Pick<CheckPaymentLifecycleRow, "amount">,
) {
  return parseFloat(String(check.amount ?? "0"));
}

export function shouldReverseBouncedCheckSettlement(
  check: Pick<CheckPaymentLifecycleRow, "soa_id" | "amount">,
) {
  return Boolean(check.soa_id) && parseCheckPaymentAmount(check) > 0;
}

export function calculateCheckPaymentInvoiceReversalAmount({
  remaining,
  paidAmount,
}: {
  remaining: number;
  paidAmount: string | number;
}) {
  return Math.min(remaining, parseFloat(String(paidAmount)));
}

export function buildCheckPaymentStatusResult(
  id: string,
  status: string,
): CheckPaymentStatusResult {
  return { id, status };
}
