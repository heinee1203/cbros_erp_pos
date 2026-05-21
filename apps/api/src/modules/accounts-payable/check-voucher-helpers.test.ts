import assert from "node:assert/strict";
import test from "node:test";

import {
  assertCheckVoucherCanVoid,
  assertCheckVoucherHasLines,
  assertCheckVoucherStatus,
  buildCheckVoucherInsertValues,
  buildCheckVoucherLineInsertValues,
  buildCheckVoucherUpdateFields,
  formatCheckVoucherNumber,
  validateCheckVoucherInvoiceLines,
} from "./check-voucher-helpers";

test("formatCheckVoucherNumber preserves yearly padded CV number shape", () => {
  assert.equal(formatCheckVoucherNumber(2026, 7), "CV-2026-000007");
  assert.equal(formatCheckVoucherNumber(2026, 123456), "CV-2026-123456");
});

test("check voucher status guards preserve existing lifecycle messages", () => {
  assert.doesNotThrow(() => assertCheckVoucherHasLines([{ supplierInvoiceId: "inv-1", amount: "10.00" }]));
  assert.throws(() => assertCheckVoucherHasLines([]), /At least one invoice line is required/);

  assert.doesNotThrow(() => assertCheckVoucherStatus("DRAFT", "DRAFT", "Can only approve DRAFT check vouchers"));
  assert.throws(
    () => assertCheckVoucherStatus("PRINTED", "DRAFT", "Can only approve DRAFT check vouchers"),
    /Can only approve DRAFT check vouchers/,
  );

  assert.doesNotThrow(() => assertCheckVoucherCanVoid("PRINTED"));
  assert.throws(() => assertCheckVoucherCanVoid("CLEARED"), /Cannot void a CLEARED check voucher/);
  assert.throws(() => assertCheckVoucherCanVoid("VOIDED"), /Check voucher already voided/);
});

test("validateCheckVoucherInvoiceLines preserves supplier, status, balance, and missing-row checks", () => {
  const lines = [
    { supplierInvoiceId: "inv-1", amount: "25.00" },
    { supplierInvoiceId: "inv-2", amount: "75.00" },
  ];
  const invoiceRows = [
    {
      id: "inv-1",
      supplierId: "supplier-1",
      invoiceNumber: "INV-001",
      status: "OPEN",
      balance: "25.00",
    },
    {
      id: "inv-2",
      supplierId: "supplier-1",
      invoiceNumber: "INV-002",
      status: "OPEN",
      balance: "75.00",
    },
  ];

  assert.doesNotThrow(() => validateCheckVoucherInvoiceLines({ lines, invoiceRows, supplierId: "supplier-1" }));
  assert.throws(
    () => validateCheckVoucherInvoiceLines({ lines, invoiceRows: invoiceRows.slice(0, 1), supplierId: "supplier-1" }),
    /One or more invoices not found/,
  );
  assert.throws(
    () => validateCheckVoucherInvoiceLines({
      lines,
      invoiceRows: [{ ...invoiceRows[0], supplierId: "supplier-2" }, invoiceRows[1]],
      supplierId: "supplier-1",
    }),
    /Invoice INV-001 belongs to a different supplier/,
  );
  assert.throws(
    () => validateCheckVoucherInvoiceLines({
      lines,
      invoiceRows: [{ ...invoiceRows[0], status: "PARTIALLY_PAID" }, invoiceRows[1]],
      supplierId: "supplier-1",
    }),
    /Invoice INV-001 is not payable \(status: PARTIALLY_PAID\)/,
  );
  assert.throws(
    () => validateCheckVoucherInvoiceLines({
      lines: [{ supplierInvoiceId: "inv-1", amount: "26.00" }, lines[1]],
      invoiceRows,
      supplierId: "supplier-1",
    }),
    /Amount 26.00 exceeds balance 25.00 for invoice INV-001/,
  );
  assert.throws(
    () => validateCheckVoucherInvoiceLines({
      lines: [{ supplierInvoiceId: "inv-1", amount: "24.00" }, lines[1]],
      invoiceRows,
      supplierId: "supplier-1",
    }),
    /must equal full balance 25.00/,
  );
  assert.throws(
    () => validateCheckVoucherInvoiceLines({
      lines: [{ supplierInvoiceId: "inv-1", amount: "0.00" }, lines[1]],
      invoiceRows,
      supplierId: "supplier-1",
    }),
    /Amount must be > 0 for invoice INV-001/,
  );
});

test("check voucher value builders preserve create, line, and update payload shapes", () => {
  assert.deepEqual(
    buildCheckVoucherInsertValues({
      orgId: "org-1",
      cvNumber: "CV-2026-000001",
      userId: "user-1",
      data: {
        supplierId: "supplier-1",
        checkDate: "2026-05-15",
        checkNumber: "CHK-1",
        lines: [{ supplierInvoiceId: "inv-1", amount: "10.00" }],
      },
      totals: {
        totalAmountText: "10.00",
        totalDeductionsText: "0.00",
        netAmountText: "10.00",
      },
    }),
    {
      orgId: "org-1",
      cvNumber: "CV-2026-000001",
      supplierId: "supplier-1",
      checkDate: "2026-05-15",
      checkNumber: "CHK-1",
      bankName: null,
      bankAccount: null,
      totalAmount: "10.00",
      deductions: "0.00",
      netAmount: "10.00",
      status: "DRAFT",
      notes: null,
      preparedBy: "user-1",
    },
  );

  assert.deepEqual(
    buildCheckVoucherLineInsertValues("cv-1", {
      supplierInvoiceId: "inv-1",
      amount: "10.00",
    }),
    {
      checkVoucherId: "cv-1",
      supplierInvoiceId: "inv-1",
      amount: "10.00",
      deductionAmount: "0",
      deductionReason: null,
    },
  );

  assert.deepEqual(buildCheckVoucherUpdateFields({}), {});
  assert.deepEqual(
    buildCheckVoucherUpdateFields({
      checkDate: "2026-05-16",
      checkNumber: "",
      bankName: null as unknown as string,
      notes: "Updated",
    }),
    {
      checkDate: "2026-05-16",
      checkNumber: "",
      bankName: null,
      notes: "Updated",
    },
  );
});
