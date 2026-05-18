import assert from "node:assert/strict";
import test from "node:test";

import {
  appendAuditNote,
  buildAuditNote,
  buildDisbursementVoucherSoaAllocations,
  buildSoaAllocationMap,
  calculateCheckVoucherTotals,
  calculateDisbursementVoucherTotals,
  calculateDueDate,
  calculateEditedInvoiceBalance,
  calculateFullInvoicePayment,
  calculateInvoicePaymentApplication,
  calculateInvoicePaymentReversal,
  calculateSoaPaymentReversalTotals,
  calculateSoaPaymentTotals,
  numberToWords,
  resolveDisbursementVoucherSoaIds,
} from "./financial-helpers";

test("numberToWords preserves Philippine peso wording", () => {
  assert.equal(numberToWords(0), "Zero Pesos and 00/100 Only");
  assert.equal(numberToWords(1234.56), "One Thousand Two Hundred Thirty-Four Pesos and 56/100 Only");
  assert.equal(numberToWords(-19.05), "Nineteen Pesos and 05/100 Only");
});

test("invoice date and edit balance helpers preserve existing AP math", () => {
  assert.equal(calculateDueDate("2026-05-15", 30), "2026-06-14");
  assert.equal(
    calculateEditedInvoiceBalance({
      totalAmount: "100.00",
      paidAmount: "12.50",
      rtvCreditAmount: "2.25",
    }),
    "85.25",
  );
});

test("check voucher totals preserve amount, deduction, and net formatting", () => {
  assert.deepEqual(
    calculateCheckVoucherTotals([
      { amount: "100.005", deductionAmount: "5.001" },
      { amount: "50.50" },
    ]),
    {
      totalAmount: 150.505,
      totalDeductions: 5.001,
      netAmount: 145.504,
      totalAmountText: "150.50",
      totalDeductionsText: "5.00",
      netAmountText: "145.50",
    },
  );
});

test("invoice payment helpers preserve status thresholds and rounded payload text", () => {
  assert.deepEqual(
    calculateInvoicePaymentApplication({
      paidAmount: "20.00",
      totalAmount: "100.00",
      rtvCreditAmount: "5.00",
      allocation: 75,
    }),
    {
      newPaid: 95,
      newBalance: 0,
      status: "PAID",
      paidAmountText: "95.00",
      balanceText: "0.00",
    },
  );

  assert.deepEqual(
    calculateInvoicePaymentApplication({
      paidAmount: "20.00",
      totalAmount: "100.00",
      rtvCreditAmount: "0.00",
      allocation: 70,
      paidThreshold: 0,
    }),
    {
      newPaid: 90,
      newBalance: 10,
      status: "PARTIALLY_PAID",
      paidAmountText: "90.00",
      balanceText: "10.00",
    },
  );

  assert.deepEqual(
    calculateInvoicePaymentReversal({
      paidAmount: "100.00",
      totalAmount: "125.00",
      rtvCreditAmount: "5.00",
      reversal: 25,
    }),
    {
      newPaid: 75,
      newBalance: 45,
      status: "PARTIALLY_PAID",
      paidAmountText: "75.00",
      balanceText: "45.00",
    },
  );

  assert.deepEqual(
    calculateFullInvoicePayment({ paidAmount: "15.00", balance: "80.25" }),
    {
      amountPaid: 80.25,
      newPaid: 95.25,
      paidAmountText: "95.25",
      balanceText: "0.00",
      status: "PAID",
    },
  );
});

test("audit note helpers preserve existing note formatting", () => {
  const note = buildAuditNote({
    label: "SOA Payment",
    date: "2026-05-15",
    paymentMethod: "CHECK",
    referenceNumber: "CHK-1",
  });

  assert.equal(note, "[SOA Payment: 2026-05-15, CHECK, Ref#CHK-1]");
  assert.equal(
    appendAuditNote("existing", note, "user memo"),
    "existing\n[SOA Payment: 2026-05-15, CHECK, Ref#CHK-1]\nuser memo",
  );
  assert.equal(appendAuditNote(null, note), "[SOA Payment: 2026-05-15, CHECK, Ref#CHK-1]");
});

test("disbursement voucher totals and SOA id normalization preserve DV policy", () => {
  assert.deepEqual(
    calculateDisbursementVoucherTotals({
      grossAmount: "100.00",
      deductions: [{ amount: "3.33" }, { amount: "bad" }],
      additionalCharges: [{ amount: "5.00" }],
      payments: [{ amount: "101.67" }],
    }),
    {
      grossAmount: 100,
      totalDeductions: 3.33,
      totalCharges: 5,
      netAmount: 101.67,
      paymentSum: 101.67,
      totalDeductionsText: "3.33",
      totalChargesText: "5.00",
      netAmountText: "101.67",
    },
  );

  assert.deepEqual(resolveDisbursementVoucherSoaIds({ soaId: "soa-1" }), ["soa-1"]);
  assert.deepEqual(resolveDisbursementVoucherSoaIds({ soaId: "soa-1", soaIds: ["soa-2"] }), ["soa-2"]);
  assert.deepEqual(resolveDisbursementVoucherSoaIds({}), []);
});

test("SOA allocation map preserves explicit, proportional, and even split rules", () => {
  assert.deepEqual(
    buildSoaAllocationMap({
      resolvedSoaIds: ["soa-1", "soa-2"],
      grossAmount: 100,
      soaBalances: { "soa-1": 20, "soa-2": 80 },
      explicitAllocations: [{ soaId: "soa-2", allocatedAmount: "55.55" }],
    }),
    { "soa-2": 55.55 },
  );

  assert.deepEqual(
    buildSoaAllocationMap({
      resolvedSoaIds: ["soa-1", "soa-2", "soa-3"],
      grossAmount: 100,
      soaBalances: { "soa-1": 1, "soa-2": 1, "soa-3": 1 },
    }),
    { "soa-1": 33.33, "soa-2": 33.33, "soa-3": 33.34 },
  );

  assert.deepEqual(
    buildSoaAllocationMap({
      resolvedSoaIds: ["soa-1", "soa-2"],
      grossAmount: 10,
      soaBalances: { "soa-1": 0, "soa-2": 0 },
    }),
    { "soa-1": 5, "soa-2": 5 },
  );
});

test("DV SOA allocation helper preserves junction-first and legacy fallback behavior", () => {
  assert.deepEqual(
    buildDisbursementVoucherSoaAllocations({
      dvSoaRows: [
        { soa_id: "soa-1", allocated_amount: "10.25" },
        { soa_id: "soa-2", allocated_amount: 20.5 },
      ],
      dv: { soa_id: "legacy-soa", gross_amount: "99.99", amount: "88.88" },
    }),
    [
      { soaId: "soa-1", allocatedAmount: 10.25 },
      { soaId: "soa-2", allocatedAmount: 20.5 },
    ],
  );

  assert.deepEqual(
    buildDisbursementVoucherSoaAllocations({
      dvSoaRows: [],
      dv: { soa_id: "legacy-soa", gross_amount: "99.99", amount: "88.88" },
    }),
    [{ soaId: "legacy-soa", allocatedAmount: 99.99 }],
  );

  assert.deepEqual(
    buildDisbursementVoucherSoaAllocations({
      dvSoaRows: [],
      dv: { soa_id: "legacy-soa", gross_amount: null, amount: "88.88" },
    }),
    [{ soaId: "legacy-soa", allocatedAmount: 88.88 }],
  );
});

test("SOA payment total helpers preserve application and reversal formatting", () => {
  assert.deepEqual(
    calculateSoaPaymentTotals({
      totalPaid: "25.25",
      totalAmount: "100.00",
      appliedAmount: 75,
    }),
    {
      newTotalPaid: 100.25,
      newTotalBalance: 0,
      totalPaidText: "100.25",
      totalBalanceText: "0.00",
    },
  );

  assert.deepEqual(
    calculateSoaPaymentReversalTotals({
      totalPaid: "25.25",
      totalAmount: "100.00",
      reversalAmount: 10,
    }),
    {
      newTotalPaid: 15.25,
      newTotalBalance: 84.75,
      totalPaidText: "15.25",
      totalBalanceText: "84.75",
    },
  );

  assert.deepEqual(
    calculateSoaPaymentReversalTotals({
      totalPaid: "5.00",
      totalAmount: "100.00",
      reversalAmount: 10,
    }),
    {
      newTotalPaid: 0,
      newTotalBalance: 100,
      totalPaidText: "0.00",
      totalBalanceText: "100.00",
    },
  );
});
