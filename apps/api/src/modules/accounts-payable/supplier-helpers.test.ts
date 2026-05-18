import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSupplierApCreateValues,
  buildSupplierApUpdateFields,
  mapSupplierApDetailRow,
  mapSupplierApStatsRow,
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
    },
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
