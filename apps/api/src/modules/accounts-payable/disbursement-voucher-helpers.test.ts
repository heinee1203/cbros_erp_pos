import assert from "node:assert/strict";
import test from "node:test";

import {
  assertDisbursementVoucherCreateTotals,
  assertDisbursementVoucherHasConfirmSoaLinks,
  assertDisbursementVoucherHasPaymentLines,
  assertDisbursementVoucherPaymentsMatchNet,
  assertDisbursementVoucherRequiresSoa,
  assertDisbursementVoucherSoaAllocationsSettleBalances,
  appendDisbursementVoucherPaymentAuditNote,
  buildDisbursementVoucherAdditionalChargeInsertValues,
  buildDisbursementVoucherCreditMemoReferences,
  buildDisbursementVoucherCreateResult,
  buildDisbursementVoucherDeductionInsertValues,
  buildDisbursementVoucherDetailResponse,
  buildDisbursementVoucherInsertValues,
  buildDisbursementVoucherPaymentInsertValues,
  buildDisbursementVoucherPaymentAuditNote,
  buildDisbursementVoucherSoaInsertValues,
  buildDisbursementVoucherSoaRefs,
  calculateDisbursementVoucherInvoiceReversalAmount,
  formatDisbursementVoucherNumber,
  normalizeDisbursementVoucherListOptions,
  requireConfirmableDisbursementVoucher,
  requireDisbursementVoucherPrintResult,
  requireVoidableDisbursementVoucher,
  resolveDisbursementVoucherLinkedSoaIds,
  shouldReverseDisbursementVoucherSettlement,
  validateDisbursementVoucherSoaRow,
} from "./disbursement-voucher-helpers";

const baseDv = {
  id: "dv-1",
  dv_number: "DV-001",
  supplier_id: "supplier-1",
  supplier_name: "Acme Parts",
  soa_id: "legacy-soa",
  soa_number: "SOA-LEGACY",
  soa_date_from: "2026-05-01",
  soa_date_to: "2026-05-15",
  amount: "90.00",
  gross_amount: "100.00",
  total_deductions: "15.00",
  total_charges: "5.00",
  net_amount: "90.00",
  payment_method: "CHECK",
  payment_date: "2026-05-15",
  remarks: "Release when printed",
  status: "DRAFT",
  printed_at: null,
  confirmed_at: null,
  voided_at: null,
  void_reason: null,
  created_at: "2026-05-15T00:00:00.000Z",
};

test("DV create helpers preserve numbering, amount, payment, and SOA guards", () => {
  assert.equal(formatDisbursementVoucherNumber(2026, 7), "DV-2026-000007");

  assert.doesNotThrow(() => assertDisbursementVoucherCreateTotals({ grossAmount: 100, netAmount: 90 }));
  assert.throws(
    () => assertDisbursementVoucherCreateTotals({ grossAmount: Number.NaN, netAmount: 90 }),
    /Gross amount must be > 0/,
  );
  assert.throws(
    () => assertDisbursementVoucherCreateTotals({ grossAmount: 100, netAmount: 0 }),
    /Net amount must be > 0 \(deductions exceed gross \+ charges\)/,
  );
  assert.doesNotThrow(() => assertDisbursementVoucherHasPaymentLines([{ paymentMethod: "CHECK", amount: "90.00" }]));
  assert.throws(() => assertDisbursementVoucherHasPaymentLines([]), /At least one payment line is required/);
  assert.doesNotThrow(() => assertDisbursementVoucherPaymentsMatchNet({ paymentSum: 90, netAmount: 90 }));
  assert.throws(
    () => assertDisbursementVoucherPaymentsMatchNet({ paymentSum: 88, netAmount: 90 }),
    /Payment lines total \(88.00\) must equal net amount \(90.00\)/,
  );

  assert.doesNotThrow(() => assertDisbursementVoucherRequiresSoa(["soa-1"]));
  assert.throws(
    () => assertDisbursementVoucherRequiresSoa([]),
    (error: any) => error.code === "DV_REQUIRES_SOA"
      && error.details.message.includes("A disbursement voucher must be linked"),
  );
});

test("DV SOA validation and create value helpers preserve existing payload policy", () => {
  assert.equal(
    validateDisbursementVoucherSoaRow({
      soaId: "soa-1",
      rows: [{ supplier_id: "supplier-1", total_balance: "123.45", status: "GENERATED" }],
      supplierId: "supplier-1",
    }),
    123.45,
  );
  assert.throws(
    () => validateDisbursementVoucherSoaRow({ soaId: "soa-x", rows: [], supplierId: "supplier-1" }),
    /SOA soa-x not found/,
  );
  assert.throws(
    () => validateDisbursementVoucherSoaRow({
      soaId: "soa-1",
      rows: [{ supplier_id: "supplier-1", total_balance: "1.00", status: "VOID" }],
      supplierId: "supplier-1",
    }),
    /Cannot create DV for a voided SOA/,
  );
  assert.throws(
    () => validateDisbursementVoucherSoaRow({
      soaId: "soa-1",
      rows: [{ supplier_id: "supplier-2", total_balance: "1.00", status: "GENERATED" }],
      supplierId: "supplier-1",
    }),
    /Supplier does not match SOA/,
  );
  assert.doesNotThrow(() => assertDisbursementVoucherSoaAllocationsSettleBalances({
    resolvedSoaIds: ["soa-1", "soa-2"],
    allocationMap: { "soa-1": 40, "soa-2": 60 },
    soaBalances: { "soa-1": 40, "soa-2": 60 },
  }));
  assert.throws(
    () => assertDisbursementVoucherSoaAllocationsSettleBalances({
      resolvedSoaIds: ["soa-1", "soa-2"],
      allocationMap: { "soa-1": 40, "soa-2": 25 },
      soaBalances: { "soa-1": 40, "soa-2": 60 },
    }),
    /partial supplier invoice payments are not allowed/,
  );

  const data = {
    supplierId: "supplier-1",
    soaIds: ["soa-1", "soa-2"],
    grossAmount: "100.00",
    paymentDate: "2026-05-15",
    remarks: "Ready",
    payments: [{ paymentMethod: "CHECK", amount: "90.00", referenceNumber: "CHK-1" }],
  };
  const totals = {
    grossAmount: 100,
    netAmount: 90,
    paymentSum: 90,
    totalDeductionsText: "15.00",
    totalChargesText: "5.00",
    netAmountText: "90.00",
  };

  assert.deepEqual(
    buildDisbursementVoucherInsertValues({
      orgId: "org-1",
      dvNumber: "DV-2026-000001",
      userId: "user-1",
      data,
      totals,
      resolvedSoaIds: ["soa-1", "soa-2"],
    }),
    {
      orgId: "org-1",
      dvNumber: "DV-2026-000001",
      supplierId: "supplier-1",
      legacySoaId: "soa-1",
      amount: "90.00",
      grossAmount: "100.00",
      totalDeductions: "15.00",
      totalCharges: "5.00",
      netAmount: "90.00",
      paymentMethod: "CHECK",
      paymentDate: "2026-05-15",
      remarks: "Ready",
      status: "DRAFT",
      createdBy: "user-1",
    },
  );
});

test("DV child insert helpers and list options preserve existing shapes", () => {
  assert.deepEqual(
    buildDisbursementVoucherSoaInsertValues({
      dvId: "dv-1",
      soaId: "soa-1",
      allocatedAmount: 12.3,
    }),
    { dvId: "dv-1", soaId: "soa-1", allocatedAmountText: "12.30" },
  );
  assert.deepEqual(
    buildDisbursementVoucherDeductionInsertValues({
      dvId: "dv-1",
      deduction: {
        deductionType: "CREDIT_MEMO",
        description: "Return",
        amount: "10.00",
      },
      sortOrder: 2,
    }),
    {
      dvId: "dv-1",
      deductionType: "CREDIT_MEMO",
      description: "Return",
      referenceNumber: null,
      amount: "10.00",
      sortOrder: 2,
    },
  );
  assert.deepEqual(
    buildDisbursementVoucherAdditionalChargeInsertValues({
      dvId: "dv-1",
      charge: {
        chargeType: "BANK_FEE",
        description: "Fee",
        referenceNumber: "FEE-1",
        amount: "5.00",
      },
      sortOrder: 1,
    }),
    {
      dvId: "dv-1",
      chargeType: "BANK_FEE",
      description: "Fee",
      referenceNumber: "FEE-1",
      amount: "5.00",
      sortOrder: 1,
    },
  );
  assert.deepEqual(
    buildDisbursementVoucherPaymentInsertValues({
      dvId: "dv-1",
      payment: {
        paymentMethod: "CHECK",
        amount: "90.00",
        bankName: "Bank",
      },
      sortOrder: 0,
    }),
    {
      dvId: "dv-1",
      paymentMethod: "CHECK",
      amount: "90.00",
      referenceNumber: null,
      bankName: "Bank",
      transactionDate: null,
      platform: null,
      receivedBy: null,
      sortOrder: 0,
    },
  );
  assert.deepEqual(
    buildDisbursementVoucherCreateResult({
      id: "dv-1",
      dv_number: "DV-2026-000001",
      status: "DRAFT",
    }),
    { id: "dv-1", dvNumber: "DV-2026-000001", status: "DRAFT" },
  );
  assert.deepEqual(
    normalizeDisbursementVoucherListOptions({ search: "  acme  ", limit: 500 }),
    { search: "  acme  ", limit: 200, searchPattern: "%acme%" },
  );
});

test("DV lifecycle helpers preserve print, confirm, and void guards", () => {
  assert.deepEqual(
    requireDisbursementVoucherPrintResult([
      { id: "dv-1", dv_number: "DV-2026-000001", status: "PRINTED" },
    ]),
    { id: "dv-1", dv_number: "DV-2026-000001", status: "PRINTED" },
  );
  assert.throws(
    () => requireDisbursementVoucherPrintResult([]),
    /DV not found or not in DRAFT status/,
  );

  const printedDv = {
    id: "dv-1",
    soa_id: "soa-1",
    amount: "90.00",
    gross_amount: "100.00",
    status: "PRINTED",
  };
  assert.deepEqual(requireConfirmableDisbursementVoucher([printedDv]), printedDv);
  assert.throws(() => requireConfirmableDisbursementVoucher([]), /DV not found/);
  assert.throws(
    () => requireConfirmableDisbursementVoucher([{ ...printedDv, status: "DRAFT" }]),
    /Can only confirm PRINTED vouchers/,
  );

  assert.doesNotThrow(() => assertDisbursementVoucherHasConfirmSoaLinks([
    { soaId: "soa-1", allocatedAmount: 100 },
  ], "dv-1"));
  assert.throws(
    () => assertDisbursementVoucherHasConfirmSoaLinks([], "dv-1"),
    (error: any) => error.code === "DV_HAS_NO_SOA_LINK"
      && error.details.dvId === "dv-1"
      && error.details.message.includes("Cannot confirm"),
  );

  const confirmedDv = { ...printedDv, status: "CONFIRMED" };
  assert.deepEqual(requireVoidableDisbursementVoucher([confirmedDv]), confirmedDv);
  assert.equal(shouldReverseDisbursementVoucherSettlement(confirmedDv), true);
  assert.equal(shouldReverseDisbursementVoucherSettlement(printedDv), false);
  assert.throws(() => requireVoidableDisbursementVoucher([]), /DV not found/);
  assert.throws(
    () => requireVoidableDisbursementVoucher([{ ...printedDv, status: "VOIDED" }]),
    /DV is already voided/,
  );
});

test("DV lifecycle helpers preserve audit notes, reversal math, and credit memo refs", () => {
  const auditNote = buildDisbursementVoucherPaymentAuditNote({
    payAmount: 90,
    dvId: "dv-1",
  });
  assert.equal(auditNote, "[DV Payment: 90.00, DV#dv-1]");
  assert.equal(
    appendDisbursementVoucherPaymentAuditNote("existing", auditNote),
    "existing\n[DV Payment: 90.00, DV#dv-1]",
  );
  assert.equal(
    appendDisbursementVoucherPaymentAuditNote(null, auditNote),
    "[DV Payment: 90.00, DV#dv-1]",
  );
  assert.equal(
    calculateDisbursementVoucherInvoiceReversalAmount({
      remaining: 25,
      paidAmount: "40.00",
    }),
    25,
  );
  assert.equal(
    calculateDisbursementVoucherInvoiceReversalAmount({
      remaining: 25,
      paidAmount: "10.00",
    }),
    10,
  );
  assert.deepEqual(
    buildDisbursementVoucherCreditMemoReferences([
      { reference_number: "cm-1" },
      { reference_number: null },
      { reference_number: "cm-2" },
    ]),
    ["cm-1", "cm-2"],
  );
});

test("buildDisbursementVoucherSoaRefs and linked IDs preserve junction-first behavior", () => {
  const soaRefRows = [
    {
      soa_id: "soa-1",
      allocated_amount: "60.25",
      soa_number: "SOA-001",
      date_from: "2026-05-01",
      date_to: "2026-05-07",
    },
    {
      soa_id: "soa-2",
      allocated_amount: "39.75",
      soa_number: "SOA-002",
      date_from: "2026-05-08",
      date_to: "2026-05-15",
    },
  ];

  assert.deepEqual(buildDisbursementVoucherSoaRefs(soaRefRows), [
    {
      soaId: "soa-1",
      soaNumber: "SOA-001",
      allocatedAmount: 60.25,
      dateFrom: "2026-05-01",
      dateTo: "2026-05-07",
    },
    {
      soaId: "soa-2",
      soaNumber: "SOA-002",
      allocatedAmount: 39.75,
      dateFrom: "2026-05-08",
      dateTo: "2026-05-15",
    },
  ]);
  assert.deepEqual(
    resolveDisbursementVoucherLinkedSoaIds({
      soaRefRows,
      legacySoaId: "legacy-soa",
    }),
    ["soa-1", "soa-2"],
  );
  assert.deepEqual(
    resolveDisbursementVoucherLinkedSoaIds({
      soaRefRows: [],
      legacySoaId: "legacy-soa",
    }),
    ["legacy-soa"],
  );
});

test("buildDisbursementVoucherDetailResponse preserves multi-SOA detail shape", () => {
  assert.deepEqual(
    buildDisbursementVoucherDetailResponse({
      dv: baseDv,
      paymentRows: [
        {
          id: "payment-1",
          payment_method: "CHECK",
          amount: "90.00",
          reference_number: "CHK-1",
          bank_name: "Bank",
          transaction_date: "2026-05-16",
          platform: null,
          received_by: "Rina",
        },
      ],
      deductionRows: [
        {
          id: "deduction-1",
          deduction_type: "CREDIT_MEMO",
          description: "Return credit",
          reference_number: "CM-1",
          amount: "15.00",
        },
      ],
      additionalChargeRows: [
        {
          id: "charge-1",
          charge_type: "BANK_FEE",
          description: "Wire fee",
          reference_number: "FEE-1",
          amount: "5.00",
        },
      ],
      soaRefRows: [
        {
          soa_id: "soa-1",
          allocated_amount: "90.00",
          soa_number: "SOA-001",
          date_from: "2026-05-01",
          date_to: "2026-05-15",
        },
      ],
      soaLineItems: [
        {
          invoice_number: "INV-001",
          invoice_date: "2026-05-01",
          total_amount: "60.00",
        },
        {
          invoice_number: "INV-002",
          invoice_date: "2026-05-02",
          total_amount: "40.00",
        },
        {
          invoice_number: "CM-001",
          invoice_date: "2026-05-03",
          total_amount: "-10.00",
        },
      ],
    }),
    {
      id: "dv-1",
      dvNumber: "DV-001",
      supplierId: "supplier-1",
      supplierName: "Acme Parts",
      soaId: "soa-1",
      soaNumber: "SOA-001",
      soaDateFrom: "2026-05-01",
      soaDateTo: "2026-05-15",
      soaRefs: [
        {
          soaId: "soa-1",
          soaNumber: "SOA-001",
          allocatedAmount: 90,
          dateFrom: "2026-05-01",
          dateTo: "2026-05-15",
        },
      ],
      grossAmount: 100,
      totalDeductions: 15,
      totalCharges: 5,
      netAmount: 90,
      soaCreditMemos: [{ invoiceNumber: "CM-001", amount: 10 }],
      amount: 90,
      paymentMethod: "CHECK",
      paymentDate: "2026-05-15",
      remarks: "Release when printed",
      status: "DRAFT",
      printedAt: null,
      confirmedAt: null,
      voidedAt: null,
      voidReason: null,
      createdAt: "2026-05-15T00:00:00.000Z",
      payments: [
        {
          id: "payment-1",
          paymentMethod: "CHECK",
          amount: 90,
          referenceNumber: "CHK-1",
          bankName: "Bank",
          transactionDate: "2026-05-16",
          platform: null,
          receivedBy: "Rina",
        },
      ],
      deductions: [
        {
          id: "deduction-1",
          deductionType: "CREDIT_MEMO",
          description: "Return credit",
          referenceNumber: "CM-1",
          amount: 15,
        },
      ],
      additionalCharges: [
        {
          id: "charge-1",
          chargeType: "BANK_FEE",
          description: "Wire fee",
          referenceNumber: "FEE-1",
          amount: 5,
        },
      ],
    },
  );
});

test("buildDisbursementVoucherDetailResponse preserves legacy SOA and amount fallbacks", () => {
  assert.deepEqual(
    buildDisbursementVoucherDetailResponse({
      dv: {
        ...baseDv,
        gross_amount: null,
        total_deductions: null,
        total_charges: null,
        net_amount: null,
      },
      paymentRows: [],
      deductionRows: [],
      additionalChargeRows: [],
      soaRefRows: [],
      soaLineItems: [],
    }),
    {
      id: "dv-1",
      dvNumber: "DV-001",
      supplierId: "supplier-1",
      supplierName: "Acme Parts",
      soaId: "legacy-soa",
      soaNumber: "SOA-LEGACY",
      soaDateFrom: "2026-05-01",
      soaDateTo: "2026-05-15",
      soaRefs: [],
      grossAmount: 90,
      totalDeductions: 0,
      totalCharges: 0,
      netAmount: 90,
      soaCreditMemos: [],
      amount: 90,
      paymentMethod: "CHECK",
      paymentDate: "2026-05-15",
      remarks: "Release when printed",
      status: "DRAFT",
      printedAt: null,
      confirmedAt: null,
      voidedAt: null,
      voidReason: null,
      createdAt: "2026-05-15T00:00:00.000Z",
      payments: [],
      deductions: [],
      additionalCharges: [],
    },
  );
});
