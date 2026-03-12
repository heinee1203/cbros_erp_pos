-- Phase 3: Transfer & Adjustment Schema Migration
-- ================================================

-- 1. Add new values to location_type enum
ALTER TYPE "location_type" ADD VALUE IF NOT EXISTS 'SHOWROOM';
ALTER TYPE "location_type" ADD VALUE IF NOT EXISTS 'STORE';
ALTER TYPE "location_type" ADD VALUE IF NOT EXISTS 'TRANSIT_BUFFER';

-- 2. Add INTEGRATION to actor_type enum
ALTER TYPE "actor_type" ADD VALUE IF NOT EXISTS 'INTEGRATION';

-- 3. Create adjustment_reason_code enum
DO $$ BEGIN
  CREATE TYPE "adjustment_reason_code" AS ENUM (
    'COUNT_GAIN',
    'FOUND_STOCK',
    'OPENING_BALANCE',
    'COUNT_LOSS',
    'DAMAGE_IN_TRANSIT',
    'DAMAGE_WAREHOUSE',
    'DAMAGE_SHOWROOM',
    'WARRANTY_WRITE_OFF',
    'SHRINKAGE_MISSING',
    'OBSOLETE_WRITE_OFF',
    'TRANSFER_SHORTAGE_CONFIRMED',
    'DATA_CORRECTION'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 4. Locations: add code, is_system, is_active
ALTER TABLE "locations" ADD COLUMN IF NOT EXISTS "code" VARCHAR(50) NOT NULL DEFAULT '';
ALTER TABLE "locations" ADD COLUMN IF NOT EXISTS "is_system" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "locations" ADD COLUMN IF NOT EXISTS "is_active" BOOLEAN NOT NULL DEFAULT true;

-- Backfill code for existing locations from name
UPDATE "locations" SET "code" = UPPER(REPLACE(SUBSTRING("name" FROM 1 FOR 20), ' ', '_'))
WHERE "code" = '';

-- Create unique index on (org_id, code)
CREATE UNIQUE INDEX IF NOT EXISTS "idx_locations_org_code" ON "locations" ("org_id", "code");

-- 5. Inventory: add org_id, reserved_level
ALTER TABLE "inventory" ADD COLUMN IF NOT EXISTS "org_id" UUID;
ALTER TABLE "inventory" ADD COLUMN IF NOT EXISTS "reserved_level" INTEGER NOT NULL DEFAULT 0;

-- Backfill org_id from products table
UPDATE "inventory" i
SET "org_id" = p."org_id"
FROM "products" p
WHERE i."product_id" = p."id"
AND i."org_id" IS NULL;

-- Make org_id NOT NULL after backfill
ALTER TABLE "inventory" ALTER COLUMN "org_id" SET NOT NULL;

-- Add FK constraint for org_id
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_org_id_organizations_id_fk"
  FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE;

-- Add reserved_level CHECK constraint
ALTER TABLE "inventory" ADD CONSTRAINT "chk_reserved_level_non_negative"
  CHECK ("reserved_level" >= 0);

-- Add index on org_id
CREATE INDEX IF NOT EXISTS "idx_inventory_org_id" ON "inventory" ("org_id");

-- 6. Stock journal: add reason_code and reversal_of_journal_id
ALTER TABLE "stock_journal" ADD COLUMN IF NOT EXISTS "reason_code" "adjustment_reason_code";
ALTER TABLE "stock_journal" ADD COLUMN IF NOT EXISTS "reversal_of_journal_id" UUID;

-- Update journal index (drop old single-column reference_type index, create composite)
DROP INDEX IF EXISTS "idx_journal_reference_type";
CREATE INDEX IF NOT EXISTS "idx_journal_reference" ON "stock_journal" ("reference_type", "reference_id");

-- 7. Drop and recreate transfer_status enum (no data exists in transfers tables)
-- First drop dependent tables (no data in them)
DROP TABLE IF EXISTS "stock_transfer_items" CASCADE;
DROP TABLE IF EXISTS "stock_transfers" CASCADE;

-- Drop old enum
DROP TYPE IF EXISTS "transfer_status";

-- Create new enum with full state machine
CREATE TYPE "transfer_status" AS ENUM (
  'DRAFT',
  'APPROVED',
  'PICKING',
  'DISPATCHED',
  'PARTIALLY_RECEIVED',
  'DISCREPANCY_REVIEW',
  'RECEIVED',
  'CLOSED_WITH_VARIANCE',
  'CANCELLED'
);

-- 8. Recreate stock_transfers with full schema
CREATE TABLE "stock_transfers" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "transfer_no" VARCHAR(50) NOT NULL,
  "source_location_id" UUID NOT NULL REFERENCES "locations"("id"),
  "destination_location_id" UUID NOT NULL REFERENCES "locations"("id"),
  "status" "transfer_status" NOT NULL DEFAULT 'DRAFT',
  "notes" VARCHAR(1000),
  "requested_by_user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE SET NULL,
  "approved_by_user_id" UUID REFERENCES "users"("id") ON DELETE SET NULL,
  "dispatched_by_user_id" UUID REFERENCES "users"("id") ON DELETE SET NULL,
  "received_by_user_id" UUID REFERENCES "users"("id") ON DELETE SET NULL,
  "approved_at" TIMESTAMPTZ,
  "dispatched_at" TIMESTAMPTZ,
  "completed_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX "idx_stock_transfers_org_id" ON "stock_transfers" ("org_id");
CREATE INDEX "idx_stock_transfers_status" ON "stock_transfers" ("status");
CREATE UNIQUE INDEX "idx_stock_transfers_org_transfer_no" ON "stock_transfers" ("org_id", "transfer_no");

-- 9. Recreate stock_transfer_items with full schema
CREATE TABLE "stock_transfer_items" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "transfer_id" UUID NOT NULL REFERENCES "stock_transfers"("id") ON DELETE CASCADE,
  "org_id" UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "product_id" UUID NOT NULL REFERENCES "products"("id"),
  "requested_qty" INTEGER NOT NULL,
  "dispatched_qty" INTEGER NOT NULL DEFAULT 0,
  "received_qty" INTEGER NOT NULL DEFAULT 0,
  "variance_qty" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "chk_requested_qty_positive" CHECK ("requested_qty" > 0),
  CONSTRAINT "chk_dispatched_qty_non_negative" CHECK ("dispatched_qty" >= 0),
  CONSTRAINT "chk_received_qty_non_negative" CHECK ("received_qty" >= 0),
  CONSTRAINT "chk_variance_qty_non_negative" CHECK ("variance_qty" >= 0),
  CONSTRAINT "chk_dispatched_lte_requested" CHECK ("dispatched_qty" <= "requested_qty")
);

CREATE INDEX "idx_transfer_items_transfer_id" ON "stock_transfer_items" ("transfer_id");

-- 10. Create stock_transfer_receipts table
CREATE TABLE IF NOT EXISTS "stock_transfer_receipts" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "transfer_id" UUID NOT NULL REFERENCES "stock_transfers"("id") ON DELETE CASCADE,
  "transfer_item_id" UUID NOT NULL REFERENCES "stock_transfer_items"("id") ON DELETE CASCADE,
  "location_id" UUID NOT NULL REFERENCES "locations"("id"),
  "received_qty" INTEGER NOT NULL,
  "notes" VARCHAR(500),
  "received_by_user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "chk_receipt_qty_positive" CHECK ("received_qty" > 0)
);

CREATE INDEX "idx_receipts_transfer_id" ON "stock_transfer_receipts" ("transfer_id");
CREATE INDEX "idx_receipts_transfer_item_id" ON "stock_transfer_receipts" ("transfer_item_id");
