-- Phase: Shift Management & Z-Reading
-- Creates shifts table and adds shift_id FK to sales

-- Shift status enum
CREATE TYPE "public"."shift_status" AS ENUM('OPEN', 'CLOSED', 'FORCE_CLOSED');

-- Shifts table
CREATE TABLE IF NOT EXISTS "shifts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL,
  "location_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "status" "shift_status" DEFAULT 'OPEN' NOT NULL,
  "opened_at" timestamp with time zone NOT NULL,
  "closed_at" timestamp with time zone,
  "closed_by_user_id" uuid,
  "opening_float" numeric(12, 2) DEFAULT '0.00' NOT NULL,
  "actual_cash" numeric(12, 2),
  "cash_variance" numeric(12, 2),
  "z_reading_snapshot" jsonb,
  "notes" varchar(1000),
  "timezone" varchar(50) DEFAULT 'Asia/Manila' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- Foreign keys
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_closed_by_user_id_users_id_fk" FOREIGN KEY ("closed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;

-- Indexes
CREATE INDEX IF NOT EXISTS "idx_shifts_org_loc_user_status" ON "shifts" USING btree ("org_id", "location_id", "user_id", "status");
CREATE INDEX IF NOT EXISTS "idx_shifts_opened_at" ON "shifts" USING btree ("opened_at");

-- Partial unique index: only one OPEN shift per cashier per location
CREATE UNIQUE INDEX IF NOT EXISTS "idx_shifts_one_open_per_user_location" ON "shifts" ("org_id", "location_id", "user_id") WHERE status = 'OPEN';

-- Add shift_id FK to sales
ALTER TABLE "sales" ADD COLUMN "shift_id" uuid;
ALTER TABLE "sales" ADD CONSTRAINT "sales_shift_id_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id") ON DELETE restrict ON UPDATE no action;
CREATE INDEX IF NOT EXISTS "idx_sales_shift_id" ON "sales" USING btree ("shift_id");
