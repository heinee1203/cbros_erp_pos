import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSupplierChangedFields,
  buildSupplierCompleteness,
  buildSupplierDuplicateWarnings,
  buildSupplierApCreateValues,
  buildSupplierApUpdateFields,
  buildSupplierBankVerificationStatus,
  enrichSuppliersWithSafety,
  hasSupplierPaymentTermsChange,
  mapSupplierApDetailRow,
  mapSupplierApStatsRow,
  splitSupplierChangedFields,
} from "./supplier-helpers";

const baseSupplierRow = {
  id: "supplier-1",
  name: "Acme Auto",
  contact_person: "Maria",
  contact_phone: "555-0101",
  contact_email: "ap@acme.test",
  address: "Main St",
  tin: "123-456",
  mnemonic_code: "ACME",
  payment_terms_days: 45,
  credit_limit: "1000.50",
  bank_name: "Metro Bank",
  bank_account_number: "123456789",
  bank_account_name: "Acme Auto Parts",
  notes: "Preferred",
  is_active: true,
  created_at: "2026-05-01T00:00:00.000Z",
  updated_at: "2026-05-02T00:00:00.000Z",
};

test("mapSupplierApStatsRow preserves supplier list shape and numeric rollups", () => {
  assert.deepEqual(
    mapSupplierApStatsRow({
      ...baseSupplierRow,
      open_count: 3,
      total_payable: "150.75",
      overdue_count: 1,
      overdue_amount: "25.25",
      oldest_overdue_date: "2026-04-15",
    }),
    {
      id: "supplier-1",
      name: "Acme Auto",
      contactPerson: "Maria",
      contactPhone: "555-0101",
      contactEmail: "ap@acme.test",
      address: "Main St",
      tin: "123-456",
      mnemonicCode: "ACME",
      paymentTermsDays: 45,
      creditLimit: 1000.5,
      bankName: "Metro Bank",
      bankAccountNumber: "123456789",
      bankAccountName: "Acme Auto Parts",
      notes: "Preferred",
      isActive: true,
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-02T00:00:00.000Z",
      openCount: 3,
      totalPayable: 150.75,
      overdueCount: 1,
      overdueAmount: 25.25,
      oldestOverdueDate: "2026-04-15",
      lastBankChangeAt: null,
      bankChangeCount: 0,
      bankVerifiedAt: null,
      bankVerifiedBy: null,
      bankVerifiedByName: null,
    },
  );
});

test("mapSupplierApDetailRow preserves detail drawer field shape", () => {
  assert.deepEqual(
    mapSupplierApDetailRow({
      ...baseSupplierRow,
      avg_lead_time_days: 7,
    }),
    {
      id: "supplier-1",
      name: "Acme Auto",
      contactPerson: "Maria",
      contactPhone: "555-0101",
      contactEmail: "ap@acme.test",
      address: "Main St",
      tin: "123-456",
      mnemonicCode: "ACME",
      paymentTermsDays: 45,
      creditLimit: 1000.5,
      bankName: "Metro Bank",
      bankAccountNumber: "123456789",
      bankAccountName: "Acme Auto Parts",
      notes: "Preferred",
      isActive: true,
      avgLeadTimeDays: 7,
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-02T00:00:00.000Z",
      lastBankChangeAt: null,
      bankChangeCount: 0,
      bankVerifiedAt: null,
      bankVerifiedBy: null,
      bankVerifiedByName: null,
    },
  );
});

test("buildSupplierBankVerificationStatus derives missing, unverified, verified, and needs_review", () => {
  const completeBank = {
    id: "supplier-1",
    name: "Acme Auto",
    contactPerson: "Maria",
    contactPhone: "555-0101",
    contactEmail: null,
    address: "Main St",
    tin: "123-456",
    paymentTermsDays: 30,
    bankName: "Metro Bank",
    bankAccountNumber: "123456789",
    bankAccountName: "Acme Auto Parts",
    isActive: true,
  };

  assert.equal(
    buildSupplierBankVerificationStatus({
      ...completeBank,
      bankAccountNumber: null,
    }),
    "missing",
  );
  assert.equal(
    buildSupplierBankVerificationStatus({
      ...completeBank,
      bankVerifiedAt: null,
    }),
    "unverified",
  );
  assert.equal(
    buildSupplierBankVerificationStatus({
      ...completeBank,
      bankVerifiedAt: null,
      lastBankChangeAt: "2026-05-11T00:00:00.000Z",
      bankChangeCount: 1,
    }),
    "needs_review",
  );
  assert.equal(
    buildSupplierBankVerificationStatus({
      ...completeBank,
      bankVerifiedAt: "2026-05-10T00:00:00.000Z",
      lastBankChangeAt: "2026-05-09T00:00:00.000Z",
    }),
    "verified",
  );
  assert.equal(
    buildSupplierBankVerificationStatus({
      ...completeBank,
      bankVerifiedAt: "2026-05-10T00:00:00.000Z",
      lastBankChangeAt: "2026-05-11T00:00:00.000Z",
    }),
    "needs_review",
  );
});

test("buildSupplierCompleteness scores payment and identity readiness", () => {
  assert.deepEqual(
    buildSupplierCompleteness({
      id: "supplier-1",
      name: "Acme Auto",
      contactPerson: "Maria",
      contactPhone: "555-0101",
      contactEmail: null,
      address: "Main St",
      tin: null,
      paymentTermsDays: 30,
      bankName: "Metro Bank",
      bankAccountNumber: null,
      bankAccountName: "Acme Auto Parts",
      isActive: true,
    }),
    {
      score: 78,
      isComplete: false,
      paymentReady: false,
      missingFields: [
        { key: "bankAccountNumber", label: "Bank account number" },
        { key: "tin", label: "TIN" },
      ],
    },
  );
});

test("buildSupplierDuplicateWarnings flags critical TIN and bank-account matches", () => {
  const suppliers = [
    {
      id: "supplier-1",
      name: "Acme Auto Parts, Inc.",
      contactPerson: "Maria",
      contactPhone: "555-0101",
      contactEmail: null,
      address: "Main St",
      tin: "123-456",
      paymentTermsDays: 30,
      bankName: "Metro Bank",
      bankAccountNumber: "001-234",
      bankAccountName: "Acme",
      isActive: true,
    },
    {
      id: "supplier-2",
      name: "Acme Auto Parts",
      contactPerson: "AP",
      contactPhone: "5550101",
      contactEmail: null,
      address: "Second St",
      tin: "123456",
      paymentTermsDays: 30,
      bankName: "Metro Bank",
      bankAccountNumber: "001234",
      bankAccountName: "Acme",
      isActive: true,
    },
  ];

  assert.deepEqual(buildSupplierDuplicateWarnings(suppliers[0], suppliers), [
    {
      field: "tin",
      label: "Same TIN",
      severity: "critical",
      matchedSupplierId: "supplier-2",
      matchedSupplierName: "Acme Auto Parts",
    },
    {
      field: "bankAccountNumber",
      label: "Same bank account",
      severity: "critical",
      matchedSupplierId: "supplier-2",
      matchedSupplierName: "Acme Auto Parts",
    },
    {
      field: "name",
      label: "Same supplier name",
      severity: "warning",
      matchedSupplierId: "supplier-2",
      matchedSupplierName: "Acme Auto Parts",
    },
    {
      field: "contactPhone",
      label: "Same contact phone",
      severity: "warning",
      matchedSupplierId: "supplier-2",
      matchedSupplierName: "Acme Auto Parts",
    },
  ]);
});

test("enrichSuppliersWithSafety adds badges without changing the base supplier shape", () => {
  const [supplier] = enrichSuppliersWithSafety([
    {
      id: "supplier-1",
      name: "Dormant Supplier",
      contactPerson: null,
      contactPhone: null,
      contactEmail: null,
      address: null,
      tin: null,
      paymentTermsDays: 30,
      bankName: null,
      bankAccountNumber: null,
      bankAccountName: null,
      isActive: false,
      totalPayable: 100,
      overdueCount: 1,
      lastBankChangeAt: "2026-05-01T00:00:00.000Z",
      bankChangeCount: 1,
    },
  ]);

  assert.equal(supplier.hasBankChangeHistory, true);
  assert.deepEqual(
    supplier.riskBadges.map((badge) => badge.code),
    [
      "MISSING_BANK",
      "MISSING_TIN",
      "MISSING_ADDRESS",
      "MISSING_CONTACT",
      "INACTIVE_WITH_BALANCE",
      "OVERDUE",
      "BANK_CHANGED",
    ],
  );
});

test("buildSupplierChangedFields and splitSupplierChangedFields isolate bank changes", () => {
  const changedFields = buildSupplierChangedFields(
    {
      name: "Acme",
      bankName: "Old Bank",
      bankAccountNumber: "111",
      bankAccountName: "Acme",
      isActive: true,
    },
    {
      name: "Acme Updated",
      bankName: "New Bank",
      bankAccountNumber: "111",
      isActive: false,
    },
  );

  assert.deepEqual(
    changedFields.map((field) => field.field),
    ["name", "bankName", "isActive"],
  );
  assert.deepEqual(splitSupplierChangedFields(changedFields), {
    bankFields: [
      {
        field: "bankName",
        label: "Bank name",
        before: "Old Bank",
        after: "New Bank",
      },
    ],
    statusFields: [
      {
        field: "isActive",
        label: "Active status",
        before: true,
        after: false,
      },
    ],
    masterFields: [
      {
        field: "name",
        label: "Supplier name",
        before: "Acme",
        after: "Acme Updated",
      },
    ],
  });
  assert.equal(hasSupplierPaymentTermsChange(changedFields), false);
  assert.equal(
    hasSupplierPaymentTermsChange([
      ...changedFields,
      {
        field: "paymentTermsDays",
        label: "Payment terms",
        before: 30,
        after: 150,
      },
    ]),
    true,
  );
});

test("buildSupplierApUpdateFields preserves partial update semantics", () => {
  assert.deepEqual(buildSupplierApUpdateFields({}), {});
  assert.deepEqual(
    buildSupplierApUpdateFields({
      name: "Acme Updated",
      contactPerson: null,
      paymentTermsDays: 0,
      creditLimit: "0.00",
      bankName: null,
      isActive: false,
    }),
    {
      name: "Acme Updated",
      contactPerson: null,
      paymentTermsDays: 0,
      creditLimit: "0.00",
      bankName: null,
      isActive: false,
    },
  );
});

test("buildSupplierApCreateValues preserves AP defaults and supplier-name guard", () => {
  assert.deepEqual(
    buildSupplierApCreateValues("org-1", {
      name: "  New Supplier  ",
      contactPhone: "555-0202",
      paymentTermsDays: 0,
    }),
    {
      orgId: "org-1",
      name: "New Supplier",
      contactPerson: null,
      contactPhone: "555-0202",
      contactEmail: null,
      address: null,
      tin: null,
      mnemonicCode: null,
      paymentTermsDays: 0,
      creditLimit: "0.00",
      bankName: null,
      bankAccountNumber: null,
      bankAccountName: null,
      notes: null,
      isActive: true,
    },
  );

  assert.throws(
    () => buildSupplierApCreateValues("org-1", { name: "   " }),
    /Supplier name is required/,
  );
});
