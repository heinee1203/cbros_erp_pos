import assert from "node:assert/strict";
import test from "node:test";

import {
  buildApAgingReportResponse,
  buildCheckRegisterResponse,
  buildDisbursementVoucherListResponse,
  buildDisbursementVoucherSummary,
  buildPdcReportResponse,
} from "./report-helpers";

test("buildApAgingReportResponse preserves AP aging camelCase mapping", () => {
  assert.deepEqual(
    buildApAgingReportResponse([
      {
        supplier_id: "supplier-1",
        supplier_name: "Acme Parts",
        current: "10.50",
        days_1_30: "20.00",
        days_31_60: null,
        days_61_90: "0",
        days_91_120: "5.25",
        days_121_180: "7.75",
        days_180_plus: "9.00",
        total: "52.50",
      },
    ]),
    {
      data: [
        {
          supplierId: "supplier-1",
          supplierName: "Acme Parts",
          current: 10.5,
          days1to30: 20,
          days31to60: 0,
          days61to90: 0,
          days91to120: 5.25,
          days121to180: 7.75,
          over180: 9,
          total: 52.5,
        },
      ],
    },
  );
});

test("buildDisbursementVoucherListResponse preserves DV row and summary shape", () => {
  assert.deepEqual(
    buildDisbursementVoucherSummary([
      { status: "CONFIRMED", cnt: 2, total: "100.25" },
      { status: "VOIDED", cnt: 1, total: "10.00" },
      { status: "DRAFT", cnt: 3, total: "30.00" },
    ]),
    {
      totalCount: 6,
      confirmedCount: 2,
      confirmedAmt: 100.25,
      voidedCount: 1,
      voidedAmt: 10,
    },
  );

  assert.deepEqual(
    buildDisbursementVoucherListResponse({
      rows: [
        {
          id: "dv-1",
          dv_number: "DV-001",
          supplier_id: "supplier-1",
          supplier_name: "Acme Parts",
          soa_id: "soa-1",
          soa_numbers: ["SOA-001", null, "SOA-002"],
          amount: "500.50",
          payment_method: "CHECK",
          check_number: "CHK-1",
          payment_date: "2026-05-15",
          status: "CONFIRMED",
          created_at: "2026-05-15T00:00:00.000Z",
          voided_at: null,
          void_reason: null,
        },
      ],
      total: 1,
      summaryRows: [{ status: "CONFIRMED", cnt: 1, total: "500.50" }],
    }),
    {
      data: [
        {
          id: "dv-1",
          dvNumber: "DV-001",
          supplierId: "supplier-1",
          supplierName: "Acme Parts",
          soaId: "soa-1",
          soaNumber: "SOA-001",
          soaNumbers: ["SOA-001", "SOA-002"],
          amount: 500.5,
          paymentMethod: "CHECK",
          checkNumber: "CHK-1",
          paymentDate: "2026-05-15",
          status: "CONFIRMED",
          createdAt: "2026-05-15T00:00:00.000Z",
          voidedAt: null,
          voidReason: null,
        },
      ],
      total: 1,
      summary: {
        totalCount: 1,
        confirmedCount: 1,
        confirmedAmt: 500.5,
        voidedCount: 0,
        voidedAmt: 0,
      },
    },
  );
});

test("buildPdcReportResponse preserves flat rows and month summaries", () => {
  assert.deepEqual(
    buildPdcReportResponse([
      {
        id: "cv-2",
        cv_number: "CV-002",
        check_number: null,
        bank_name: null,
        check_date: "2026-06-01",
        net_amount: "25.25",
        status: "RELEASED",
        supplier_name: "Beta",
        month_bucket: "2026-06",
      },
      {
        id: "cv-1",
        cv_number: "CV-001",
        check_number: "CHK-1",
        bank_name: "Bank",
        check_date: "2026-05-20",
        net_amount: "10.00",
        status: "PRINTED",
        supplier_name: "Acme",
        month_bucket: "2026-05",
      },
      {
        id: "cv-3",
        cv_number: null,
        check_number: null,
        bank_name: null,
        check_date: null,
        net_amount: null,
        status: null,
        supplier_name: null,
        month_bucket: "2026-06",
      },
    ]),
    {
      data: [
        {
          id: "cv-2",
          cvNo: "CV-002",
          supplierName: "Beta",
          checkNo: "",
          bankName: "",
          checkDate: "2026-06-01",
          amount: "25.25",
          status: "RELEASED",
        },
        {
          id: "cv-1",
          cvNo: "CV-001",
          supplierName: "Acme",
          checkNo: "CHK-1",
          bankName: "Bank",
          checkDate: "2026-05-20",
          amount: "10.00",
          status: "PRINTED",
        },
        {
          id: "cv-3",
          cvNo: "",
          supplierName: "",
          checkNo: "",
          bankName: "",
          checkDate: null,
          amount: "0",
          status: "",
        },
      ],
      monthlySummary: [
        { month: "2026-05", total: 10 },
        { month: "2026-06", total: 25.25 },
      ],
    },
  );
});

test("buildCheckRegisterResponse preserves register rows and date bucket totals", () => {
  assert.deepEqual(
    buildCheckRegisterResponse(
      [
        {
          id: "payment-1",
          check_status: null,
          amount: "100.10",
          check_number: null,
          bank_name: null,
          check_date: "2026-05-16",
          bounce_reason: null,
          dv_id: "dv-1",
          dv_number: "DV-001",
          supplier_name: "Acme",
        },
        {
          id: "payment-2",
          check_status: "RELEASED",
          amount: "50.20",
          check_number: "CHK-2",
          bank_name: "Bank",
          check_date: "2026-05-30",
          bounce_reason: null,
          dv_id: "dv-2",
          dv_number: "DV-002",
          supplier_name: "Beta",
        },
        {
          id: "payment-3",
          check_status: "CLEARED",
          amount: "30.30",
          check_number: "CHK-3",
          bank_name: "Bank",
          check_date: "2026-05-10",
          bounce_reason: null,
          dv_id: "dv-3",
          dv_number: "DV-003",
          supplier_name: "Clear Co",
        },
        {
          id: "payment-4",
          check_status: "BOUNCED",
          amount: "5.55",
          check_number: "CHK-4",
          bank_name: "Bank",
          check_date: null,
          bounce_reason: "NSF",
          dv_id: "dv-4",
          dv_number: "DV-004",
          supplier_name: "Bounce Co",
        },
      ],
      new Date("2026-05-15T00:00:00.000Z"),
    ),
    {
      data: [
        {
          id: "payment-1",
          dvId: "dv-1",
          dvNumber: "DV-001",
          supplierName: "Acme",
          checkNumber: "",
          bankName: "",
          checkDate: "2026-05-16",
          amount: 100.1,
          status: "OUTSTANDING",
          bounceReason: null,
        },
        {
          id: "payment-2",
          dvId: "dv-2",
          dvNumber: "DV-002",
          supplierName: "Beta",
          checkNumber: "CHK-2",
          bankName: "Bank",
          checkDate: "2026-05-30",
          amount: 50.2,
          status: "RELEASED",
          bounceReason: null,
        },
        {
          id: "payment-3",
          dvId: "dv-3",
          dvNumber: "DV-003",
          supplierName: "Clear Co",
          checkNumber: "CHK-3",
          bankName: "Bank",
          checkDate: "2026-05-10",
          amount: 30.3,
          status: "CLEARED",
          bounceReason: null,
        },
        {
          id: "payment-4",
          dvId: "dv-4",
          dvNumber: "DV-004",
          supplierName: "Bounce Co",
          checkNumber: "CHK-4",
          bankName: "Bank",
          checkDate: "",
          amount: 5.55,
          status: "BOUNCED",
          bounceReason: "NSF",
        },
      ],
      summary: {
        totalOutstanding: 150.3,
        maturingThisWeek: 100.1,
        clearedThisMonth: 30.3,
        totalBounced: 5.55,
      },
    },
  );
});
