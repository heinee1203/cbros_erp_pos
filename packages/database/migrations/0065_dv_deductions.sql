-- Add gross/net amount columns to DV header
ALTER TABLE supplier_disbursement_vouchers
ADD COLUMN IF NOT EXISTS gross_amount numeric(14, 2),
ADD COLUMN IF NOT EXISTS total_deductions numeric(14, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS net_amount numeric(14, 2);

-- Backfill existing records: gross = amount, deductions = 0, net = amount
UPDATE supplier_disbursement_vouchers
SET gross_amount = amount,
    total_deductions = 0,
    net_amount = amount
WHERE gross_amount IS NULL;

-- Create deductions child table
CREATE TABLE IF NOT EXISTS "supplier_dv_deductions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "dv_id" uuid NOT NULL REFERENCES "supplier_disbursement_vouchers"("id") ON DELETE CASCADE,
  "deduction_type" text NOT NULL,
  "description" text NOT NULL,
  "reference_number" text,
  "amount" numeric(14, 2) NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_dv_deductions_dv_id" ON "supplier_dv_deductions" ("dv_id");
