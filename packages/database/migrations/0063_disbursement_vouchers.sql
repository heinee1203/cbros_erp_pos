-- Disbursement Voucher status and payment method enums
DO $$ BEGIN
  CREATE TYPE "public"."dv_status" AS ENUM('DRAFT', 'PRINTED', 'CONFIRMED', 'VOIDED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "public"."dv_payment_method" AS ENUM('CHECK', 'CASH', 'BANK_TRANSFER', 'ONLINE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Supplier disbursement vouchers
CREATE TABLE IF NOT EXISTS "supplier_disbursement_vouchers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "dv_number" varchar(50) NOT NULL,
  "supplier_id" uuid NOT NULL REFERENCES "suppliers"("id"),
  "soa_id" uuid REFERENCES "supplier_soa_records"("id"),
  "amount" numeric(14, 2) NOT NULL,
  "payment_method" "dv_payment_method" DEFAULT 'CHECK' NOT NULL,
  "check_number" varchar(50),
  "check_date" date,
  "bank_name" varchar(100),
  "payment_date" date NOT NULL,
  "remarks" text,
  "status" "dv_status" DEFAULT 'DRAFT' NOT NULL,
  "printed_at" timestamp with time zone,
  "confirmed_at" timestamp with time zone,
  "voided_at" timestamp with time zone,
  "voided_by" uuid,
  "void_reason" varchar(500),
  "created_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- DV number sequence (yearly counter, same pattern as cv_number_sequence)
CREATE TABLE IF NOT EXISTS "dv_number_sequence" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL,
  "year" integer NOT NULL,
  "last_number" integer DEFAULT 0 NOT NULL
);

-- Indexes
CREATE UNIQUE INDEX IF NOT EXISTS "idx_dv_org_number" ON "supplier_disbursement_vouchers" ("org_id", "dv_number");
CREATE INDEX IF NOT EXISTS "idx_dv_org_supplier" ON "supplier_disbursement_vouchers" ("org_id", "supplier_id");
CREATE INDEX IF NOT EXISTS "idx_dv_org_status" ON "supplier_disbursement_vouchers" ("org_id", "status");
CREATE INDEX IF NOT EXISTS "idx_dv_org_soa" ON "supplier_disbursement_vouchers" ("org_id", "soa_id");
CREATE UNIQUE INDEX IF NOT EXISTS "idx_dv_seq_org_year" ON "dv_number_sequence" ("org_id", "year");
