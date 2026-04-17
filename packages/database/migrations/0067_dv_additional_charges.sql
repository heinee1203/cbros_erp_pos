-- Migration 0067: supplier DV additional charges (freight, handling, misc, etc.)
-- Mirror of 0065_dv_deductions.sql but charges ADD to net instead of subtract.

-- Add total_charges column to DV header
ALTER TABLE supplier_disbursement_vouchers
ADD COLUMN IF NOT EXISTS total_charges numeric(14, 2) NOT NULL DEFAULT 0;

-- Backfill is a no-op (default 0). Existing rows have no charges, so
-- gross - deductions == gross + 0 - deductions; net_amount stays correct.

-- Create additional charges child table
CREATE TABLE IF NOT EXISTS "supplier_dv_additional_charges" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "dv_id" uuid NOT NULL REFERENCES "supplier_disbursement_vouchers"("id") ON DELETE CASCADE,
  "charge_type" text NOT NULL,
  "description" text NOT NULL,
  "reference_number" text,
  "amount" numeric(14, 2) NOT NULL CHECK (amount > 0),
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_dv_additional_charges_dv_id" ON "supplier_dv_additional_charges" ("dv_id");
