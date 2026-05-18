import assert from "node:assert/strict";
import test from "node:test";

import {
  assertBulkCreateInvoicesHasRows,
  assertBulkMarkInvoicesPaidInput,
  assertInvoiceCanEdit,
  assertInvoiceCanVoid,
  buildBulkCreateInvoiceError,
  buildBulkCreateInvoicesResult,
  buildBulkPaidInvoiceUpdate,
  buildBulkSupplierInvoiceInsertValues,
  buildSupplierInvoiceInsertValues,
  buildSupplierInvoiceUpdateFields,
  collectMissingBulkPaidInvoiceIds,
  normalizeBulkSupplierInvoiceRow,
  normalizeCreditMemoInvoiceNumber,
  resolveBulkPaidInvoicePaymentDate,
  resolveInvoicePaymentTermsDays,
  shouldSkipBulkPaidInvoice,
} from "./invoice-helpers";

test("supplier invoice create helpers preserve defaults, terms, and due dates", () => {
  assert.equal(resolveInvoicePaymentTermsDays(undefined, undefined), 30);
  assert.equal(resolveInvoicePaymentTermsDays(undefined, 45), 45);
  assert.equal(resolveInvoicePaymentTermsDays(0, 45), 0);

  assert.deepEqual(
    buildSupplierInvoiceInsertValues({
      orgId: "org-1",
      userId: "user-1",
      supplierTermsDays: 45,
      data: {
        supplierId: "supplier-1",
        invoiceNumber: "INV-001",
        invoiceDate: "2026-05-15",
        totalAmount: "100.00",
        sourcePoId: "po-1",
      },
    }),
    {
      orgId: "org-1",
      supplierId: "supplier-1",
      invoiceNumber: "INV-001",
      invoiceDate: "2026-05-15",
      dueDate: "2026-06-29",
      totalAmount: "100.00",
      balance: "100.00",
      paymentTermsDays: 45,
      currency: "PHP",
      sourcePoId: "po-1",
      sourceReceiptId: null,
      notes: null,
      recordedBy: "user-1",
    },
  );
});

test("bulk invoice create helpers preserve row guard, insert payload, errors, and total rounding", () => {
  assert.throws(() => assertBulkCreateInvoicesHasRows([]), /No invoices provided/);
  assert.doesNotThrow(() => assertBulkCreateInvoicesHasRows([{ invoiceNumber: "INV-1", invoiceDate: "2026-05-15", amount: "10.00" }]));

  assert.deepEqual(
    buildBulkSupplierInvoiceInsertValues({
      orgId: "org-1",
      userId: "user-1",
      termsDays: 30,
      data: {
        supplierId: "supplier-1",
        sourcePoId: "po-1",
        notes: "batch",
        invoices: [],
      },
      invoice: {
        invoiceNumber: "INV-002",
        invoiceDate: "2026-05-15",
        amount: "50.25",
      },
    }),
    {
      orgId: "org-1",
      supplierId: "supplier-1",
      invoiceNumber: "INV-002",
      invoiceDate: "2026-05-15",
      dueDate: "2026-06-14",
      totalAmount: "50.25",
      balance: "50.25",
      paymentTermsDays: 30,
      sourcePoId: "po-1",
      notes: "batch",
      recordedBy: "user-1",
    },
  );

  assert.equal(normalizeCreditMemoInvoiceNumber("CM-77"), "CM-77");
  assert.equal(normalizeCreditMemoInvoiceNumber("cm-77"), "CM-77");
  assert.equal(normalizeCreditMemoInvoiceNumber("77"), "CM-77");

  assert.deepEqual(
    normalizeBulkSupplierInvoiceRow({
      kind: "credit_memo",
      invoiceNumber: "777",
      invoiceDate: "2026-05-15",
      amount: "125",
    }),
    {
      kind: "credit_memo",
      invoiceNumber: "CM-777",
      invoiceDate: "2026-05-15",
      amount: "-125.00",
    },
  );

  assert.deepEqual(
    buildBulkSupplierInvoiceInsertValues({
      orgId: "org-1",
      userId: "user-1",
      termsDays: 30,
      data: {
        supplierId: "supplier-1",
        notes: "credit",
        invoices: [],
      },
      invoice: {
        kind: "credit_memo",
        invoiceNumber: "CM-888",
        invoiceDate: "2026-05-15",
        amount: "75.5",
      },
    }),
    {
      orgId: "org-1",
      supplierId: "supplier-1",
      invoiceNumber: "CM-888",
      invoiceDate: "2026-05-15",
      dueDate: "2026-06-14",
      totalAmount: "-75.50",
      balance: "-75.50",
      paymentTermsDays: 30,
      sourcePoId: null,
      notes: "credit",
      recordedBy: "user-1",
    },
  );

  assert.deepEqual(buildBulkCreateInvoiceError(2, "INV-003", "Duplicate invoice number"), {
    index: 2,
    invoiceNumber: "INV-003",
    message: "Duplicate invoice number",
  });
  assert.deepEqual(
    buildBulkCreateInvoicesResult({
      created: 2,
      total: 100.005,
      errors: [{ index: 0, invoiceNumber: "INV-001", message: "Duplicate invoice number" }],
    }),
    {
      created: 2,
      total: 100,
      errors: [{ index: 0, invoiceNumber: "INV-001", message: "Duplicate invoice number" }],
    },
  );
});

test("supplier invoice update and void guards preserve status and balance behavior", () => {
  assert.doesNotThrow(() => assertInvoiceCanEdit("OPEN"));
  assert.throws(() => assertInvoiceCanEdit("PAID"), /Can only edit OPEN invoices/);
  assert.doesNotThrow(() => assertInvoiceCanVoid("OPEN"));
  assert.throws(() => assertInvoiceCanVoid("VOIDED"), /Invoice already voided/);
  assert.throws(() => assertInvoiceCanVoid("PAID"), /Cannot void a fully paid invoice/);

  assert.deepEqual(
    buildSupplierInvoiceUpdateFields({
      data: {
        invoiceNumber: "INV-NEW",
        invoiceDate: "2026-05-20",
        paymentTermsDays: 10,
        totalAmount: "150.00",
        notes: "updated",
      },
      invoice: {
        invoiceDate: "2026-05-15",
        paymentTermsDays: 30,
        paidAmount: "20.00",
        rtvCreditAmount: "5.00",
        status: "OPEN",
      },
    }),
    {
      invoiceNumber: "INV-NEW",
      notes: "updated",
      paymentTermsDays: 10,
      dueDate: "2026-05-30",
      invoiceDate: "2026-05-20",
      totalAmount: "150.00",
      balance: "125",
    },
  );
});

test("bulk paid helpers preserve input guards, skip rules, dates, updates, and result shape", () => {
  assert.throws(
    () => assertBulkMarkInvoicesPaidInput({ invoiceIds: [], useInvoiceDateAsPaymentDate: false }),
    /No invoice IDs provided/,
  );
  assert.throws(
    () => assertBulkMarkInvoicesPaidInput({
      invoiceIds: Array.from({ length: 101 }, (_, index) => `inv-${index}`),
      useInvoiceDateAsPaymentDate: false,
    }),
    /Maximum 100 invoices per request/,
  );

  assert.deepEqual(
    collectMissingBulkPaidInvoiceIds(["inv-1", "inv-2", "inv-3"], new Set(["inv-2"])),
    ["inv-1", "inv-3"],
  );
  assert.equal(shouldSkipBulkPaidInvoice({ status: "PAID", balance: "10.00" }), true);
  assert.equal(shouldSkipBulkPaidInvoice({ status: "VOIDED", balance: "10.00" }), true);
  assert.equal(shouldSkipBulkPaidInvoice({ status: "OPEN", balance: "0.00" }), true);
  assert.equal(shouldSkipBulkPaidInvoice({ status: "OPEN", balance: "0.01" }), false);

  assert.equal(
    resolveBulkPaidInvoicePaymentDate({
      invoiceDate: "2026-05-01",
      data: { invoiceIds: ["inv-1"], useInvoiceDateAsPaymentDate: true },
      fallbackDate: "2026-05-15",
    }),
    "2026-05-01",
  );
  assert.equal(
    resolveBulkPaidInvoicePaymentDate({
      invoiceDate: "2026-05-01",
      data: { invoiceIds: ["inv-1"], useInvoiceDateAsPaymentDate: false },
      fallbackDate: "2026-05-15",
    }),
    "2026-05-15",
  );

  assert.deepEqual(
    buildBulkPaidInvoiceUpdate({
      invoice: {
        id: "inv-1",
        invoiceDate: "2026-05-01",
        paidAmount: "10.00",
        balance: "40.25",
        status: "OPEN",
        notes: "existing",
      },
      data: {
        invoiceIds: ["inv-1"],
        useInvoiceDateAsPaymentDate: false,
        paymentMethod: "CASH",
        referenceNumber: "REF-1",
        notes: "memo",
      },
      paymentDate: "2026-05-15",
    }),
    {
      amountPaid: 40.25,
      updateFields: {
        paidAmount: "50.25",
        balance: "0.00",
        status: "PAID",
        notes: "existing\n[Bulk Paid: 2026-05-15, CASH, Ref#REF-1]\nmemo",
      },
    },
  );
});
