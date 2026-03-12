-- Phase 7: Job Cards / Service Integration
-- Adds service_operations, job_cards, job_card_labor, job_card_parts tables
-- Adds JOB_CARD_ISSUE and JOB_CARD_RETURN to journal_reference_type
-- Adds job_card_part_id and service_operation_id to sale_lines (POS merge guardrail)

-- ══════════════════════════════════════════════
-- 1. Extend journal_reference_type enum
-- ══════════════════════════════════════════════

ALTER TYPE "journal_reference_type" ADD VALUE IF NOT EXISTS 'JOB_CARD_ISSUE';
ALTER TYPE "journal_reference_type" ADD VALUE IF NOT EXISTS 'JOB_CARD_RETURN';

-- ══════════════════════════════════════════════
-- 2. New enums
-- ══════════════════════════════════════════════

CREATE TYPE "service_operation_category" AS ENUM (
  'MECHANICAL',
  'ELECTRICAL',
  'BODY',
  'TIRE_SERVICE',
  'DIAGNOSTIC',
  'OTHER'
);

CREATE TYPE "job_card_status" AS ENUM (
  'SCHEDULED',
  'CHECKED_IN',
  'ESTIMATING',
  'APPROVED',
  'WAITING_FOR_PARTS',
  'READY_FOR_BAY',
  'IN_PROGRESS',
  'WORK_COMPLETED',
  'INVOICED',
  'CLOSED',
  'CANCELLED'
);

-- ══════════════════════════════════════════════
-- 3. service_operations table
-- ══════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS "service_operations" (
  "id"                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id"              uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "code"                varchar(50) NOT NULL,
  "name"                varchar(255) NOT NULL,
  "category"            "service_operation_category" NOT NULL,
  "default_labor_rate"  numeric(12,2) NOT NULL,
  "estimated_hours"     numeric(6,2) NOT NULL,
  "active"              boolean NOT NULL DEFAULT true,
  "created_at"          timestamptz NOT NULL DEFAULT now(),
  "updated_at"          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_service_operations_org_id"
  ON "service_operations" ("org_id");
CREATE UNIQUE INDEX IF NOT EXISTS "idx_service_operations_org_code"
  ON "service_operations" ("org_id", "code");
CREATE INDEX IF NOT EXISTS "idx_service_operations_category"
  ON "service_operations" ("category");

-- ══════════════════════════════════════════════
-- 4. job_cards table
-- ══════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS "job_cards" (
  "id"                            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id"                        uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "job_no"                        varchar(50) NOT NULL,
  "customer_id"                   uuid NOT NULL REFERENCES "customers"("id"),
  "customer_vehicle_id"           uuid NOT NULL REFERENCES "customer_vehicles"("id"),
  "location_id"                   uuid NOT NULL REFERENCES "locations"("id"),
  "status"                        "job_card_status" NOT NULL DEFAULT 'SCHEDULED',
  "assigned_technician_user_id"   uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "odometer_reading"              integer,
  "notes"                         varchar(2000),
  "created_by_user_id"            uuid NOT NULL REFERENCES "users"("id") ON DELETE SET NULL,
  "checked_in_by_user_id"         uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "approved_by_user_id"           uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "cancelled_by_user_id"          uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "closed_by_user_id"             uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "checked_in_at"                 timestamptz,
  "approved_at"                   timestamptz,
  "started_at"                    timestamptz,
  "completed_at"                  timestamptz,
  "invoiced_at"                   timestamptz,
  "cancelled_at"                  timestamptz,
  "closed_at"                     timestamptz,
  "idempotency_key"               varchar(255),
  "created_at"                    timestamptz NOT NULL DEFAULT now(),
  "updated_at"                    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_job_cards_org_id"
  ON "job_cards" ("org_id");
CREATE INDEX IF NOT EXISTS "idx_job_cards_status"
  ON "job_cards" ("status");
CREATE INDEX IF NOT EXISTS "idx_job_cards_location_id"
  ON "job_cards" ("location_id");
CREATE INDEX IF NOT EXISTS "idx_job_cards_customer_id"
  ON "job_cards" ("customer_id");
CREATE INDEX IF NOT EXISTS "idx_job_cards_vehicle_id"
  ON "job_cards" ("customer_vehicle_id");
CREATE UNIQUE INDEX IF NOT EXISTS "idx_job_cards_org_job_no"
  ON "job_cards" ("org_id", "job_no");
CREATE UNIQUE INDEX IF NOT EXISTS "idx_job_cards_idempotency_key"
  ON "job_cards" ("idempotency_key");

-- ══════════════════════════════════════════════
-- 5. job_card_labor table
-- ══════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS "job_card_labor" (
  "id"                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "job_card_id"           uuid NOT NULL REFERENCES "job_cards"("id") ON DELETE CASCADE,
  "org_id"                uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "service_operation_id"  uuid NOT NULL REFERENCES "service_operations"("id"),
  "description"           varchar(500),
  "qty_hours"             numeric(6,2) NOT NULL,
  "unit_price"            numeric(12,2) NOT NULL,
  "line_total"            numeric(12,2) NOT NULL,
  "created_at"            timestamptz NOT NULL DEFAULT now(),
  "updated_at"            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_job_card_labor_job_card_id"
  ON "job_card_labor" ("job_card_id");
CREATE INDEX IF NOT EXISTS "idx_job_card_labor_service_op_id"
  ON "job_card_labor" ("service_operation_id");

-- ══════════════════════════════════════════════
-- 6. job_card_parts table (with CHECK constraints)
-- ══════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS "job_card_parts" (
  "id"              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "job_card_id"     uuid NOT NULL REFERENCES "job_cards"("id") ON DELETE CASCADE,
  "org_id"          uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "product_id"      uuid NOT NULL REFERENCES "products"("id"),
  "location_id"     uuid NOT NULL REFERENCES "locations"("id"),
  "planned_qty"     integer NOT NULL,
  "reserved_qty"    integer NOT NULL DEFAULT 0,
  "issued_qty"      integer NOT NULL DEFAULT 0,
  "returned_qty"    integer NOT NULL DEFAULT 0,
  "unit_price"      numeric(12,2) NOT NULL,
  "created_at"      timestamptz NOT NULL DEFAULT now(),
  "updated_at"      timestamptz NOT NULL DEFAULT now(),

  -- CHECK constraints (from ERP Consultant corrections)
  CONSTRAINT "chk_jcp_planned_qty_positive"      CHECK (planned_qty > 0),
  CONSTRAINT "chk_jcp_reserved_qty_non_negative"  CHECK (reserved_qty >= 0),
  CONSTRAINT "chk_jcp_issued_qty_non_negative"    CHECK (issued_qty >= 0),
  CONSTRAINT "chk_jcp_returned_qty_non_negative"  CHECK (returned_qty >= 0),
  CONSTRAINT "chk_jcp_returned_lte_issued"        CHECK (returned_qty <= issued_qty),
  CONSTRAINT "chk_jcp_commitment_lte_planned"     CHECK (reserved_qty + issued_qty - returned_qty <= planned_qty)
);

CREATE INDEX IF NOT EXISTS "idx_job_card_parts_job_card_id"
  ON "job_card_parts" ("job_card_id");
CREATE INDEX IF NOT EXISTS "idx_job_card_parts_product_id"
  ON "job_card_parts" ("product_id");
CREATE INDEX IF NOT EXISTS "idx_job_card_parts_location_id"
  ON "job_card_parts" ("location_id");

-- ══════════════════════════════════════════════
-- 7. POS Merge Guardrail — add columns to sale_lines
-- ══════════════════════════════════════════════

ALTER TABLE "sale_lines"
  ADD COLUMN IF NOT EXISTS "job_card_part_id" uuid REFERENCES "job_card_parts"("id") ON DELETE SET NULL;

ALTER TABLE "sale_lines"
  ADD COLUMN IF NOT EXISTS "service_operation_id" uuid REFERENCES "service_operations"("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "idx_sale_lines_job_card_part_id"
  ON "sale_lines" ("job_card_part_id");
