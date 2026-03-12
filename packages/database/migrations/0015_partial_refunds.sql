-- Add PARTIALLY_REFUNDED to sale_status enum
ALTER TYPE "sale_status" ADD VALUE IF NOT EXISTS 'PARTIALLY_REFUNDED' BEFORE 'REFUNDED';

-- Add refunded_quantity column to sale_lines (defaults to 0 for existing rows)
ALTER TABLE "sale_lines" ADD COLUMN IF NOT EXISTS "refunded_quantity" integer NOT NULL DEFAULT 0;
