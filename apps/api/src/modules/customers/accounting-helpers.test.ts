import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAgingReportResponse,
  buildGeneratedSoaResponse,
  mapAgingReportRow,
  resolveSoaPaymentStatus,
  summarizeSoaTransactions,
} from "./accounting-helpers";

test("resolveSoaPaymentStatus preserves cash, credit, and reset rules", () => {
  assert.deepEqual(
    resolveSoaPaymentStatus({
      currentStatus: "GENERATED",
      totalCharges: 100,
      totalPayable: 80,
      realAllocatedCharges: 70,
      creditCoverage: 30,
    }),
    {
      newStatus: "PAID",
      storedPaid: "70.00",
      effectiveCoverage: 100,
    },
  );
  assert.equal(
    resolveSoaPaymentStatus({
      currentStatus: "SENT",
      totalCharges: 100,
      totalPayable: 100,
      realAllocatedCharges: 1,
      creditCoverage: 0,
    }).newStatus,
    "PARTIAL",
  );
  assert.equal(
    resolveSoaPaymentStatus({
      currentStatus: "PARTIAL",
      totalCharges: 100,
      totalPayable: 100,
      realAllocatedCharges: 0,
      creditCoverage: 0,
    }).newStatus,
    "GENERATED",
  );
});

test("SOA helpers preserve transaction totals and generated response shape", () => {
  assert.deepEqual(
    summarizeSoaTransactions([
      { type: "CHARGE", amount: "100.00" },
      { type: "CREDIT_NOTE", amount: "-15.25" },
      { type: "PAYMENT", amount: "-10.00" },
    ]),
    {
      charges: 100,
      credits: 25.25,
    },
  );

  assert.deepEqual(
    buildGeneratedSoaResponse(
      {
        id: "soa-1",
        soa_number: "SOA-2026-0001",
        total_charges: "100.00",
        total_credits: "25.25",
        total_payable: "74.75",
        transaction_count: 3,
        status: "GENERATED",
      },
      2,
    ),
    {
      id: "soa-1",
      soaNumber: "SOA-2026-0001",
      totalCharges: 100,
      totalCredits: 25.25,
      totalPayable: 74.75,
      transactionCount: 3,
      billedCount: 2,
      status: "GENERATED",
    },
  );
});

test("aging helpers preserve reconciliation, totals, and percentage behavior", () => {
  assert.deepEqual(
    mapAgingReportRow({
      id: "customer-1",
      name: "Lucky Se7en",
      customer_type: "BUSINESS",
      payment_terms_days: 30,
      current: "60.00",
      days1to30: "30.00",
      days31to60: "10.00",
      days61to90: "0.00",
      days90plus: "0.00",
      total: "50.00",
    }),
    {
      customer: { id: "customer-1", name: "Lucky Se7en" },
      customerType: "BUSINESS",
      paymentTerms: 30,
      current: 30,
      days1to30: 15,
      days31to60: 5,
      days61to90: 0,
      days90plus: 0,
      total: 50,
    },
  );

  assert.deepEqual(
    buildAgingReportResponse("2026-05-15", [
      {
        id: "customer-1",
        name: "Lucky Se7en",
        customer_type: "BUSINESS",
        payment_terms_days: 30,
        current: "50.00",
        days1to30: "0.00",
        days31to60: "0.00",
        days61to90: "0.00",
        days90plus: "0.00",
        total: "50.00",
      },
      {
        id: "customer-2",
        name: "Acme",
        customer_type: "RETAIL",
        payment_terms_days: 15,
        current: "0.00",
        days1to30: "25.00",
        days31to60: "25.00",
        days61to90: "0.00",
        days90plus: "0.00",
        total: "50.00",
      },
    ]),
    {
      asOfDate: "2026-05-15",
      data: [
        {
          customer: { id: "customer-1", name: "Lucky Se7en" },
          customerType: "BUSINESS",
          paymentTerms: 30,
          current: 50,
          days1to30: 0,
          days31to60: 0,
          days61to90: 0,
          days90plus: 0,
          total: 50,
        },
        {
          customer: { id: "customer-2", name: "Acme" },
          customerType: "RETAIL",
          paymentTerms: 15,
          current: 0,
          days1to30: 25,
          days31to60: 25,
          days61to90: 0,
          days90plus: 0,
          total: 50,
        },
      ],
      totals: {
        current: 50,
        days1to30: 25,
        days31to60: 25,
        days61to90: 0,
        days90plus: 0,
        total: 100,
      },
      percentages: {
        current: 50,
        days1to30: 25,
        days31to60: 25,
        days61to90: 0,
        days90plus: 0,
      },
    },
  );
});
