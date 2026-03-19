-- Accounts Payable: enums, tables, indexes

-- Enums
CREATE TYPE "supplier_invoice_status" AS ENUM ('OPEN', 'PARTIALLY_PAID', 'PAID', 'VOIDED', 'DISPUTED');
CREATE TYPE "check_voucher_status" AS ENUM ('DRAFT', 'APPROVED', 'PRINTED', 'RELEASED', 'CLEARED', 'VOIDED', 'STALE');

-- supplier_invoices
CREATE TABLE "supplier_invoices" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "supplier_id" uuid NOT NULL REFERENCES "suppliers"("id"),
  "invoice_number" varchar(100) NOT NULL,
  "invoice_date" date NOT NULL,
  "due_date" date NOT NULL,
  "total_amount" numeric(14,2) NOT NULL,
  "paid_amount" numeric(14,2) NOT NULL DEFAULT '0',
  "balance" numeric(14,2) NOT NULL,
  "status" "supplier_invoice_status" NOT NULL DEFAULT 'OPEN',
  "payment_terms_days" integer,
  "currency" varchar(3) NOT NULL DEFAULT 'PHP',
  "source_po_id" uuid,
  "source_receipt_id" uuid,
  "rtv_credit_amount" numeric(14,2) NOT NULL DEFAULT '0',
  "notes" varchar(2000),
  "recorded_by" uuid,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX "idx_supplier_invoices_unique" ON "supplier_invoices" ("org_id", "supplier_id", "invoice_number");
CREATE INDEX "idx_supplier_invoices_status" ON "supplier_invoices" ("org_id", "status");
CREATE INDEX "idx_supplier_invoices_due" ON "supplier_invoices" ("org_id", "due_date");
CREATE INDEX "idx_supplier_invoices_supplier_status" ON "supplier_invoices" ("org_id", "supplier_id", "status");
CREATE INDEX "idx_supplier_invoices_po" ON "supplier_invoices" ("org_id", "source_po_id");

-- check_vouchers
CREATE TABLE "check_vouchers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "cv_number" varchar(50) NOT NULL,
  "supplier_id" uuid NOT NULL REFERENCES "suppliers"("id"),
  "check_date" date NOT NULL,
  "check_number" varchar(50),
  "bank_name" varchar(100),
  "bank_account" varchar(50),
  "total_amount" numeric(14,2) NOT NULL,
  "deductions" numeric(14,2) NOT NULL DEFAULT '0',
  "net_amount" numeric(14,2) NOT NULL,
  "status" "check_voucher_status" NOT NULL DEFAULT 'DRAFT',
  "approved_by" uuid,
  "approved_at" timestamptz,
  "printed_at" timestamptz,
  "released_at" timestamptz,
  "cleared_at" timestamptz,
  "voided_at" timestamptz,
  "voided_by" uuid,
  "void_reason" varchar(500),
  "notes" varchar(2000),
  "prepared_by" uuid,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX "idx_check_vouchers_cv_number" ON "check_vouchers" ("org_id", "cv_number");
CREATE INDEX "idx_check_vouchers_supplier" ON "check_vouchers" ("org_id", "supplier_id");
CREATE INDEX "idx_check_vouchers_status" ON "check_vouchers" ("org_id", "status");
CREATE INDEX "idx_check_vouchers_date" ON "check_vouchers" ("org_id", "check_date");

-- check_voucher_lines
CREATE TABLE "check_voucher_lines" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "check_voucher_id" uuid NOT NULL REFERENCES "check_vouchers"("id") ON DELETE CASCADE,
  "supplier_invoice_id" uuid NOT NULL REFERENCES "supplier_invoices"("id"),
  "amount" numeric(14,2) NOT NULL,
  "deduction_amount" numeric(14,2) NOT NULL DEFAULT '0',
  "deduction_reason" varchar(500)
);

CREATE INDEX "idx_cv_lines_voucher" ON "check_voucher_lines" ("check_voucher_id");
CREATE INDEX "idx_cv_lines_invoice" ON "check_voucher_lines" ("supplier_invoice_id");

-- cv_number_sequence
CREATE TABLE "cv_number_sequence" (
  "org_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "year" integer NOT NULL,
  "last_number" integer NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX "idx_cv_sequence_unique" ON "cv_number_sequence" ("org_id", "year");

-- bank_accounts
CREATE TABLE "bank_accounts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "bank_name" varchar(100) NOT NULL,
  "account_name" varchar(255) NOT NULL,
  "account_number" varchar(50) NOT NULL,
  "account_number_display" varchar(20),
  "branch" varchar(100),
  "is_default" boolean NOT NULL DEFAULT false,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX "idx_bank_accounts_active" ON "bank_accounts" ("org_id", "is_active");
