CREATE TYPE "public"."actor_type" AS ENUM('USER', 'SYSTEM');--> statement-breakpoint
CREATE TYPE "public"."journal_reference_type" AS ENUM('SALE', 'RECEIVING', 'TRANSFER_IN', 'TRANSFER_OUT', 'ADJUSTMENT', 'RETURN', 'STOCKTAKE', 'VOID');--> statement-breakpoint
CREATE TABLE "product_families" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"slug" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_journal" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"user_id" uuid,
	"change_quantity" integer NOT NULL,
	"balance_after" integer NOT NULL,
	"reference_type" "journal_reference_type" NOT NULL,
	"reference_id" uuid NOT NULL,
	"reference_line_id" uuid,
	"idempotency_key" varchar(255) NOT NULL,
	"unit_cost_snapshot" numeric(12, 2),
	"actor_type" "actor_type" DEFAULT 'USER' NOT NULL,
	"effective_at" timestamp with time zone DEFAULT now() NOT NULL,
	"notes" varchar(500),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stock_journal_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "vehicle_compatibility" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"make" varchar(100) NOT NULL,
	"model" varchar(100) NOT NULL,
	"year_start" integer NOT NULL,
	"year_end" integer NOT NULL,
	"engine" varchar(100),
	"notes" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "family_id" uuid;--> statement-breakpoint
ALTER TABLE "product_families" ADD CONSTRAINT "product_families_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_journal" ADD CONSTRAINT "stock_journal_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_journal" ADD CONSTRAINT "stock_journal_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_journal" ADD CONSTRAINT "stock_journal_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_journal" ADD CONSTRAINT "stock_journal_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_compatibility" ADD CONSTRAINT "vehicle_compatibility_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_product_families_org_slug" ON "product_families" USING btree ("org_id","slug");--> statement-breakpoint
CREATE INDEX "idx_product_families_org_id" ON "product_families" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "idx_journal_product_location" ON "stock_journal" USING btree ("product_id","location_id");--> statement-breakpoint
CREATE INDEX "idx_journal_reference_type" ON "stock_journal" USING btree ("reference_type");--> statement-breakpoint
CREATE INDEX "idx_journal_effective_at" ON "stock_journal" USING btree ("effective_at");--> statement-breakpoint
CREATE INDEX "idx_journal_org_id" ON "stock_journal" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "idx_compat_product_id" ON "vehicle_compatibility" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "idx_compat_make_model" ON "vehicle_compatibility" USING btree ("make","model");--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_family_id_product_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."product_families"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_products_family_id" ON "products" USING btree ("family_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_inventory_location_id" ON "inventory" USING btree ("location_id");--> statement-breakpoint
ALTER TABLE "inventory" ADD CONSTRAINT "chk_stock_level_non_negative" CHECK (stock_level >= 0);--> statement-breakpoint
ALTER TABLE "stock_transfer_items" ADD CONSTRAINT "chk_transfer_quantity_positive" CHECK (quantity > 0);