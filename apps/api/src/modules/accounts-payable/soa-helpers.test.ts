import assert from "node:assert/strict";
import test from "node:test";

import {
  buildGeneratedSupplierSoaResponse,
  buildSupplierSoaDetailResponse,
  buildSupplierSoaLedgerEntries,
  buildSupplierSoaOverviewResponse,
  buildSupplierSoaSearchResponse,
  mapSupplierSoaRecordRow,
  summarizeSupplierSoaGenerationInvoices,
} from "./soa-helpers";

test("buildSupplierSoaLedgerEntries preserves invoice, payment, RTV, and running balance behavior", () => {
  const ledger = buildSupplierSoaLedgerEntries({
    invoices: [
      {
        invoiceDate: "2026-05-01",
        invoiceNumber: "INV-001",
        totalAmount: "100.00",
      },
      {
        invoiceDate: "2026-05-03",
        invoiceNumber: "INV-002",
        totalAmount: "50.00",
      },
    ],
    payments: [
      {
        checkDate: "2026-05-02",
        cvNumber: "CV-001",
        checkNumber: "CHK-77",
        netAmount: "25.00",
      },
      {
        checkDate: "2026-05-04",
        cvNumber: "CV-002",
        checkNumber: null,
        netAmount: "10.00",
      },
    ],
    rtvCredits: [
      {
        rtvNumber: "RTV-001",
        creditAmount: "5.00",
        creditReceivedAt: new Date("2026-05-03T08:00:00.000Z"),
      },
      {
        rtvNumber: "RTV-ZERO",
        creditAmount: "0.00",
        creditReceivedAt: new Date("2026-05-04T08:00:00.000Z"),
      },
    ],
  });

  assert.deepEqual(ledger, {
    entries: [
      {
        date: "2026-05-01",
        reference: "INV INV-001",
        type: "DEBIT",
        amount: "100.00",
        runningBalance: "100.00",
      },
      {
        date: "2026-05-02",
        reference: "CV CV-001 (CHK CHK-77)",
        type: "CREDIT",
        amount: "25.00",
        runningBalance: "75.00",
      },
      {
        date: "2026-05-03",
        reference: "INV INV-002",
        type: "DEBIT",
        amount: "50.00",
        runningBalance: "125.00",
      },
      {
        date: "2026-05-03",
        reference: "RTV RTV-001",
        type: "CREDIT",
        amount: "5.00",
        runningBalance: "120.00",
      },
      {
        date: "2026-05-04",
        reference: "CV CV-002",
        type: "CREDIT",
        amount: "10.00",
        runningBalance: "110.00",
      },
    ],
    closingBalance: "110.00",
  });
});

test("buildSupplierSoaLedgerEntries preserves blank RTV date fallback", () => {
  const ledger = buildSupplierSoaLedgerEntries({
    invoices: [],
    payments: [],
    rtvCredits: [
      {
        rtvNumber: "RTV-NODATE",
        creditAmount: "3.50",
        creditReceivedAt: null,
      },
    ],
  });

  assert.deepEqual(ledger, {
    entries: [
      {
        date: "",
        reference: "RTV RTV-NODATE",
        type: "CREDIT",
        amount: "3.50",
        runningBalance: "-3.50",
      },
    ],
    closingBalance: "-3.50",
  });
});

test("buildSupplierSoaOverviewResponse preserves supplier mapping and rounded summary totals", () => {
  assert.deepEqual(
    buildSupplierSoaOverviewResponse(
      [
        {
          supplier_id: "supplier-1",
          supplier_name: "Acme Auto",
          contact_email: "ap@acme.test",
          contact_phone: "555-0101",
          address: "Main St",
          invoice_count: 2,
          total_balance: "100.335",
          oldest_invoice_date: "2026-05-01",
          earliest_due_date: "2026-05-15",
          overdue_count: 1,
          overdue_amount: "20.111",
        },
        {
          supplier_id: "supplier-2",
          supplier_name: "Brake House",
          contact_email: null,
          contact_phone: null,
          address: null,
          invoice_count: 1,
          total_balance: "50.335",
          oldest_invoice_date: "2026-05-03",
          earliest_due_date: "2026-05-20",
          overdue_count: 0,
          overdue_amount: "0",
        },
      ],
      "12.34",
    ),
    {
      suppliers: [
        {
          supplierId: "supplier-1",
          supplierName: "Acme Auto",
          contactEmail: "ap@acme.test",
          contactPhone: "555-0101",
          address: "Main St",
          invoiceCount: 2,
          totalBalance: 100.335,
          oldestInvoiceDate: "2026-05-01",
          earliestDueDate: "2026-05-15",
          overdueCount: 1,
          overdueAmount: 20.111,
        },
        {
          supplierId: "supplier-2",
          supplierName: "Brake House",
          contactEmail: null,
          contactPhone: null,
          address: null,
          invoiceCount: 1,
          totalBalance: 50.335,
          oldestInvoiceDate: "2026-05-03",
          earliestDueDate: "2026-05-20",
          overdueCount: 0,
          overdueAmount: 0,
        },
      ],
      summary: {
        totalPayable: 150.67,
        totalOverdue: 20.11,
        supplierCount: 2,
        dueThisWeek: 12.34,
      },
    },
  );
});

test("supplier SOA generation helpers preserve totals, dates, and return shape", () => {
  const totals = summarizeSupplierSoaGenerationInvoices([
    {
      invoice_date: "2026-05-03",
      total_amount: "50.10",
      paid_amount: "10.00",
      balance: "40.10",
    },
    {
      invoice_date: "2026-05-01",
      total_amount: "100.20",
      paid_amount: "25.00",
      balance: "75.20",
    },
  ]);

  assert.deepEqual(totals, {
    totalAmount: 150.3,
    totalPaid: 35,
    totalBalance: 115.30000000000001,
    totalAmountText: "150.30",
    totalPaidText: "35.00",
    totalBalanceText: "115.30",
    dateFrom: "2026-05-01",
    dateTo: "2026-05-03",
  });
  assert.deepEqual(
    buildGeneratedSupplierSoaResponse({
      id: "soa-1",
      soa_number: "SUPP-SOA-2026-0001",
      status: "GENERATED",
      total_amount: "150.30",
      total_paid: "35.00",
      total_balance: "115.30",
      invoice_count: 2,
      date_from: "2026-05-01",
      date_to: "2026-05-03",
    }),
    {
      id: "soa-1",
      soaNumber: "SUPP-SOA-2026-0001",
      status: "GENERATED",
      totalAmount: 150.3,
      totalPaid: 35,
      totalBalance: 115.3,
      invoiceCount: 2,
      dateFrom: "2026-05-01",
      dateTo: "2026-05-03",
    },
  );
});

test("supplier SOA list/search helpers preserve DV refs and active DV fields", () => {
  assert.deepEqual(
    mapSupplierSoaRecordRow({
      id: "soa-1",
      soa_number: "SUPP-SOA-2026-0001",
      date_from: "2026-05-01",
      date_to: "2026-05-03",
      generated_at: "2026-05-04T00:00:00.000Z",
      total_amount: "150.30",
      total_paid: "35.00",
      total_balance: "115.30",
      invoice_count: 2,
      status: "GENERATED",
      notes: "Batch",
    }),
    {
      id: "soa-1",
      soaNumber: "SUPP-SOA-2026-0001",
      dateFrom: "2026-05-01",
      dateTo: "2026-05-03",
      generatedAt: "2026-05-04T00:00:00.000Z",
      totalAmount: 150.3,
      totalPaid: 35,
      totalBalance: 115.3,
      invoiceCount: 2,
      status: "GENERATED",
      notes: "Batch",
    },
  );

  assert.deepEqual(
    buildSupplierSoaSearchResponse({
      rows: [
        {
          id: "soa-1",
          soa_number: "SUPP-SOA-2026-0001",
          supplier_id: "supplier-1",
          supplier_name: "Acme Parts",
          date_from: "2026-05-01",
          date_to: "2026-05-03",
          generated_at: "2026-05-04T00:00:00.000Z",
          total_amount: "150.30",
          total_paid: "35.00",
          total_balance: "115.30",
          invoice_count: 2,
          status: "SENT",
          notes: null,
          dv_refs: [
            {
              dvId: "dv-1",
              dvNumber: "DV-001",
              status: "CONFIRMED",
              amount: "100.25",
              allocatedAmount: "90.25",
            },
            {
              dvId: "dv-2",
              dvNumber: "DV-002",
              status: "DRAFT",
              amount: "25.00",
              allocatedAmount: "25.00",
            },
          ],
        },
      ],
      total: 1,
    }),
    {
      data: [
        {
          id: "soa-1",
          soaNumber: "SUPP-SOA-2026-0001",
          supplierId: "supplier-1",
          supplierName: "Acme Parts",
          dateFrom: "2026-05-01",
          dateTo: "2026-05-03",
          generatedAt: "2026-05-04T00:00:00.000Z",
          totalAmount: 150.3,
          totalPaid: 35,
          totalBalance: 115.3,
          invoiceCount: 2,
          status: "SENT",
          notes: null,
          dvRefs: [
            {
              dvId: "dv-1",
              dvNumber: "DV-001",
              status: "CONFIRMED",
              amount: 100.25,
              allocatedAmount: 90.25,
            },
            {
              dvId: "dv-2",
              dvNumber: "DV-002",
              status: "DRAFT",
              amount: 25,
              allocatedAmount: 25,
            },
          ],
          activeDvId: "dv-1",
          activeDvNumber: "DV-001",
          activeDvStatus: "CONFIRMED",
        },
      ],
      total: 1,
    },
  );
});

test("buildSupplierSoaDetailResponse preserves supplier and frozen invoice snapshots", () => {
  assert.deepEqual(
    buildSupplierSoaDetailResponse({
      soa: {
        id: "soa-1",
        soa_number: "SUPP-SOA-2026-0001",
        supplier_id: "supplier-1",
        supplier_name: "Acme Parts",
        contact_phone: "555-0101",
        address: "Main St",
        contact_email: "ap@acme.test",
        date_from: "2026-05-01",
        date_to: "2026-05-03",
        generated_at: "2026-05-04T00:00:00.000Z",
        total_amount: "150.30",
        total_paid: "35.00",
        total_balance: "115.30",
        invoice_count: 2,
        status: "GENERATED",
        notes: "For print",
      },
      lines: [
        {
          invoice_id: "invoice-1",
          invoice_number: "INV-001",
          invoice_date: "2026-05-01",
          due_date: "2026-05-31",
          invoice_amount: "100.20",
          paid_at_generation: "25.00",
          balance_at_generation: "75.20",
        },
      ],
    }),
    {
      id: "soa-1",
      soaNumber: "SUPP-SOA-2026-0001",
      supplierId: "supplier-1",
      supplier: {
        name: "Acme Parts",
        contactPhone: "555-0101",
        address: "Main St",
        contactEmail: "ap@acme.test",
      },
      dateFrom: "2026-05-01",
      dateTo: "2026-05-03",
      generatedAt: "2026-05-04T00:00:00.000Z",
      totalAmount: 150.3,
      totalPaid: 35,
      totalBalance: 115.3,
      invoiceCount: 2,
      status: "GENERATED",
      notes: "For print",
      invoices: [
        {
          id: "invoice-1",
          invoiceNumber: "INV-001",
          invoiceDate: "2026-05-01",
          dueDate: "2026-05-31",
          totalAmount: 100.2,
          paidAmount: 25,
          balance: 75.2,
        },
      ],
    },
  );
});
