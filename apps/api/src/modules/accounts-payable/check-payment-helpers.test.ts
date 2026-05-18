import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCheckPaymentStatusResult,
  calculateCheckPaymentInvoiceReversalAmount,
  normalizeCheckRegisterOptions,
  parseCheckPaymentAmount,
  requireCheckPaymentRow,
  requireCheckPaymentStatus,
  requireOutstandingCheckPayment,
  requireReleasedCheckPayment,
  shouldReverseBouncedCheckSettlement,
} from "./check-payment-helpers";

const outstandingCheck = {
  id: "payment-1",
  status: "OUTSTANDING",
  payment_method: "CHECK",
  amount: "100.50",
  dv_id: "dv-1",
  soa_id: "soa-1",
  org_id: "org-1",
};

test("check register options preserve search trimming without changing submitted filters", () => {
  assert.deepEqual(
    normalizeCheckRegisterOptions({
      search: "  dv-100  ",
      bank: "Bank",
      status: "RELEASED",
      dateFrom: "2026-05-01",
      dateTo: "2026-05-31",
    }),
    {
      search: "  dv-100  ",
      bank: "Bank",
      status: "RELEASED",
      dateFrom: "2026-05-01",
      dateTo: "2026-05-31",
      searchPattern: "%dv-100%",
    },
  );
  assert.deepEqual(normalizeCheckRegisterOptions({ search: "   " }), {
    search: "   ",
    searchPattern: null,
  });
});

test("check payment guards preserve existing lifecycle messages", () => {
  assert.deepEqual(requireCheckPaymentRow([outstandingCheck]), outstandingCheck);
  assert.throws(() => requireCheckPaymentRow([]), /Check not found/);
  assert.throws(
    () => requireCheckPaymentRow([{ ...outstandingCheck, payment_method: "CASH" }]),
    /Not a check payment/,
  );

  assert.doesNotThrow(() => requireCheckPaymentStatus({
    check: outstandingCheck,
    expectedStatus: "OUTSTANDING",
    message: "Can only release OUTSTANDING checks",
  }));
  assert.throws(
    () => requireCheckPaymentStatus({
      check: { ...outstandingCheck, status: "RELEASED" },
      expectedStatus: "OUTSTANDING",
      message: "Can only release OUTSTANDING checks",
    }),
    /Can only release OUTSTANDING checks/,
  );

  assert.deepEqual(requireOutstandingCheckPayment([outstandingCheck], "release"), outstandingCheck);
  assert.throws(
    () => requireOutstandingCheckPayment([{ ...outstandingCheck, status: "RELEASED" }], "cancel"),
    /Can only cancel OUTSTANDING checks/,
  );
  assert.deepEqual(
    requireReleasedCheckPayment([{ ...outstandingCheck, status: "RELEASED" }], "clear"),
    { ...outstandingCheck, status: "RELEASED" },
  );
  assert.throws(
    () => requireReleasedCheckPayment([outstandingCheck], "bounce"),
    /Can only bounce RELEASED checks/,
  );
});

test("check payment amount and status helpers preserve bounce behavior", () => {
  assert.equal(parseCheckPaymentAmount(outstandingCheck), 100.5);
  assert.equal(parseCheckPaymentAmount({ amount: undefined }), 0);
  assert.equal(shouldReverseBouncedCheckSettlement(outstandingCheck), true);
  assert.equal(shouldReverseBouncedCheckSettlement({ ...outstandingCheck, soa_id: null }), false);
  assert.equal(shouldReverseBouncedCheckSettlement({ ...outstandingCheck, amount: "0.00" }), false);
  assert.equal(
    calculateCheckPaymentInvoiceReversalAmount({
      remaining: 40,
      paidAmount: "55.25",
    }),
    40,
  );
  assert.equal(
    calculateCheckPaymentInvoiceReversalAmount({
      remaining: 40,
      paidAmount: "12.25",
    }),
    12.25,
  );
  assert.deepEqual(buildCheckPaymentStatusResult("payment-1", "BOUNCED"), {
    id: "payment-1",
    status: "BOUNCED",
  });
});
