-- Phase 9: Data Migration & Seeding
-- Staging tables for safe CSV/Excel import pipeline
-- OPENING_BALANCE reference type for stock journal

-- ── Add OPENING_BALANCE to journal_reference_type enum ──
ALTER TYPE "journal_reference_type" ADD VALUE IF NOT EXISTS 'OPENING_BALANCE';

-- ── Staging validation status enum ──
DO $$ BEGIN
  CREATE TYPE "stg_validation_status" AS ENUM ('PENDING', 'VALID', 'REJECTED', 'PROMOTED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ═══════════════════════════════════════════════
-- Migration Batches
-- ═══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS "migration_batches" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "entity_type" varchar(50) NOT NULL,
  "source_file" varchar(500) NOT NULL,
  "total_rows" integer NOT NULL DEFAULT 0,
  "valid_rows" integer NOT NULL DEFAULT 0,
  "rejected_rows" integer NOT NULL DEFAULT 0,
  "promoted_rows" integer NOT NULL DEFAULT 0,
  "status" varchar(20) NOT NULL DEFAULT 'STAGED',
  "started_at" timestamp with time zone NOT NULL DEFAULT now(),
  "completed_at" timestamp with time zone
);
CREATE INDEX IF NOT EXISTS "idx_migration_batches_entity" ON "migration_batches" ("entity_type");

-- ═══════════════════════════════════════════════
-- Stage 1: Locations
-- ═══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS "stg_locations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "batch_id" uuid NOT NULL,
  "row_number" integer NOT NULL,
  "name" varchar(255),
  "code" varchar(50),
  "type" varchar(50),
  "address" varchar(500),
  "validation_status" "stg_validation_status" NOT NULL DEFAULT 'PENDING',
  "validation_errors" text,
  "promoted_id" uuid,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "idx_stg_locations_batch" ON "stg_locations" ("batch_id");
CREATE INDEX IF NOT EXISTS "idx_stg_locations_status" ON "stg_locations" ("validation_status");

-- ═══════════════════════════════════════════════
-- Stage 1: Suppliers
-- ═══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS "stg_suppliers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "batch_id" uuid NOT NULL,
  "row_number" integer NOT NULL,
  "name" varchar(255),
  "contact_email" varchar(255),
  "contact_phone" varchar(50),
  "address" varchar(500),
  "avg_lead_time_days" varchar(10),
  "validation_status" "stg_validation_status" NOT NULL DEFAULT 'PENDING',
  "validation_errors" text,
  "promoted_id" uuid,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "idx_stg_suppliers_batch" ON "stg_suppliers" ("batch_id");
CREATE INDEX IF NOT EXISTS "idx_stg_suppliers_status" ON "stg_suppliers" ("validation_status");

-- ═══════════════════════════════════════════════
-- Stage 2: Products (46k SKUs)
-- ═══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS "stg_products" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "batch_id" uuid NOT NULL,
  "row_number" integer NOT NULL,
  "name" varchar(500),
  "sku" varchar(50),
  "mnemonic_sku" varchar(10),
  "category" varchar(50),
  "unit_price" varchar(20),
  "cost_price" varchar(20),
  "current_cost_price" varchar(20),
  "family_name" varchar(255),
  "validation_status" "stg_validation_status" NOT NULL DEFAULT 'PENDING',
  "validation_errors" text,
  "promoted_id" uuid,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "idx_stg_products_batch" ON "stg_products" ("batch_id");
CREATE INDEX IF NOT EXISTS "idx_stg_products_status" ON "stg_products" ("validation_status");
CREATE INDEX IF NOT EXISTS "idx_stg_products_sku" ON "stg_products" ("sku");

-- ═══════════════════════════════════════════════
-- Stage 3: Customers
-- ═══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS "stg_customers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "batch_id" uuid NOT NULL,
  "row_number" integer NOT NULL,
  "name" varchar(255),
  "phone" varchar(50),
  "notes" varchar(1000),
  "validation_status" "stg_validation_status" NOT NULL DEFAULT 'PENDING',
  "validation_errors" text,
  "promoted_id" uuid,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "idx_stg_customers_batch" ON "stg_customers" ("batch_id");
CREATE INDEX IF NOT EXISTS "idx_stg_customers_status" ON "stg_customers" ("validation_status");
CREATE INDEX IF NOT EXISTS "idx_stg_customers_phone" ON "stg_customers" ("phone");

-- ═══════════════════════════════════════════════
-- Stage 4: Customer Vehicles
-- ═══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS "stg_customer_vehicles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "batch_id" uuid NOT NULL,
  "row_number" integer NOT NULL,
  "customer_phone" varchar(50),
  "make" varchar(100),
  "model" varchar(100),
  "year" varchar(10),
  "plate_no" varchar(20),
  "notes" varchar(500),
  "validation_status" "stg_validation_status" NOT NULL DEFAULT 'PENDING',
  "validation_errors" text,
  "promoted_id" uuid,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "idx_stg_customer_vehicles_batch" ON "stg_customer_vehicles" ("batch_id");
CREATE INDEX IF NOT EXISTS "idx_stg_customer_vehicles_status" ON "stg_customer_vehicles" ("validation_status");
CREATE INDEX IF NOT EXISTS "idx_stg_customer_vehicles_phone" ON "stg_customer_vehicles" ("customer_phone");

-- ═══════════════════════════════════════════════
-- Stage 5: Opening Balances
-- ═══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS "stg_opening_balances" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "batch_id" uuid NOT NULL,
  "row_number" integer NOT NULL,
  "sku" varchar(50),
  "location_code" varchar(50),
  "opening_qty" varchar(20),
  "validation_status" "stg_validation_status" NOT NULL DEFAULT 'PENDING',
  "validation_errors" text,
  "promoted_id" uuid,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "idx_stg_opening_bal_batch" ON "stg_opening_balances" ("batch_id");
CREATE INDEX IF NOT EXISTS "idx_stg_opening_bal_status" ON "stg_opening_balances" ("validation_status");
CREATE INDEX IF NOT EXISTS "idx_stg_opening_bal_sku" ON "stg_opening_balances" ("sku");
