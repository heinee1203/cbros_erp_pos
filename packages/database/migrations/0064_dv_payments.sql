-- DV payment lines: one DV can have multiple payments (e.g., split checks)
CREATE TABLE IF NOT EXISTS "supplier_dv_payments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "dv_id" uuid NOT NULL REFERENCES "supplier_disbursement_vouchers"("id") ON DELETE CASCADE,
  "payment_method" "dv_payment_method" NOT NULL,
  "amount" numeric(14, 2) NOT NULL,
  "reference_number" varchar(100),
  "bank_name" varchar(100),
  "transaction_date" date,
  "platform" varchar(50),
  "received_by" varchar(100),
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_dv_payments_dv" ON "supplier_dv_payments" ("dv_id");
