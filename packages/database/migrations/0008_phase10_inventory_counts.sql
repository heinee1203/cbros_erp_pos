-- Phase 10: Inventory Counts / Cycle Counts
-- Adds count sessions and count line tables for physical inventory verification

-- ── Enums ──

DO $$ BEGIN
  CREATE TYPE "public"."count_status" AS ENUM('DRAFT', 'IN_PROGRESS', 'COMPLETED', 'REVIEWED', 'POSTED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "public"."count_scope" AS ENUM('FULL_LOCATION', 'CATEGORY', 'FAMILY', 'SELECTED_SKUS');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- ── Count Sessions ──

CREATE TABLE IF NOT EXISTS "inventory_counts" (
  "id"                  uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id"              uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "location_id"         uuid NOT NULL REFERENCES "locations"("id") ON DELETE CASCADE,
  "created_by_user_id"  uuid NOT NULL REFERENCES "users"("id") ON DELETE SET NULL,
  "reviewed_by_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "posted_by_user_id"   uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "label"               varchar(255) NOT NULL,
  "status"              "count_status" NOT NULL DEFAULT 'DRAFT',
  "scope"               "count_scope" NOT NULL DEFAULT 'FULL_LOCATION',
  "scope_filter"        varchar(255),
  "notes"               varchar(1000),
  "total_lines"         integer NOT NULL DEFAULT 0,
  "counted_lines"       integer NOT NULL DEFAULT 0,
  "variance_lines"      integer NOT NULL DEFAULT 0,
  "started_at"          timestamp with time zone,
  "completed_at"        timestamp with time zone,
  "reviewed_at"         timestamp with time zone,
  "posted_at"           timestamp with time zone,
  "created_at"          timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"          timestamp with time zone NOT NULL DEFAULT now()
);

-- ── Count Lines ──

CREATE TABLE IF NOT EXISTS "inventory_count_lines" (
  "id"                uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "count_id"          uuid NOT NULL REFERENCES "inventory_counts"("id") ON DELETE CASCADE,
  "product_id"        uuid NOT NULL REFERENCES "products"("id") ON DELETE CASCADE,
  "inventory_id"      uuid NOT NULL REFERENCES "inventory"("id") ON DELETE CASCADE,
  "system_qty"        integer NOT NULL,
  "counted_qty"       integer,
  "variance"          integer,
  "counted_by_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "counted_at"        timestamp with time zone,
  "notes"             varchar(500),
  "created_at"        timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"        timestamp with time zone NOT NULL DEFAULT now()
);

-- ── Indexes ──

CREATE INDEX IF NOT EXISTS "idx_counts_org_id"       ON "inventory_counts" ("org_id");
CREATE INDEX IF NOT EXISTS "idx_counts_location_id"   ON "inventory_counts" ("location_id");
CREATE INDEX IF NOT EXISTS "idx_counts_status"        ON "inventory_counts" ("status");
CREATE INDEX IF NOT EXISTS "idx_counts_created_at"    ON "inventory_counts" ("created_at");
CREATE INDEX IF NOT EXISTS "idx_count_lines_count_id"  ON "inventory_count_lines" ("count_id");
CREATE INDEX IF NOT EXISTS "idx_count_lines_product_id" ON "inventory_count_lines" ("product_id");
