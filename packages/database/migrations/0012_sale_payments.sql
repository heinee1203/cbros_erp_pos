-- Phase: Sale Payments
-- Add payment method tracking for sales

DO $$ BEGIN
  CREATE TYPE "public"."payment_method" AS ENUM('CASH', 'CARD', 'EFT', 'ACCOUNT', 'OTHER');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "sale_payments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "sale_id" uuid NOT NULL REFERENCES "sales"("id") ON DELETE CASCADE,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "method" "payment_method" NOT NULL,
  "amount" numeric(12, 2) NOT NULL,
  "reference" varchar(255),
  "notes" varchar(500),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_sale_payments_sale_id" ON "sale_payments" USING btree ("sale_id");
CREATE INDEX IF NOT EXISTS "idx_sale_payments_org_id" ON "sale_payments" USING btree ("org_id");

-- Performance index for sales listing and reporting
CREATE INDEX IF NOT EXISTS "idx_sales_org_status_completed" ON "sales" USING btree ("org_id", "status", "completed_at" DESC);
