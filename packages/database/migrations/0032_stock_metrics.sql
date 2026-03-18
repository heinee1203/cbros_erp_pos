CREATE TYPE "public"."stock_monitor_status" AS ENUM('CRITICAL', 'LOW', 'HEALTHY', 'OVERSTOCK', 'DEAD_STOCK');--> statement-breakpoint
CREATE TABLE "stock_metrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"total_stock" integer DEFAULT 0 NOT NULL,
	"avg_daily_sales_30d" numeric(12, 4) DEFAULT '0' NOT NULL,
	"avg_daily_sales_60d" numeric(12, 4) DEFAULT '0' NOT NULL,
	"avg_daily_sales_90d" numeric(12, 4) DEFAULT '0' NOT NULL,
	"days_of_stock" numeric(10, 1),
	"stockout_days_90d" integer DEFAULT 0 NOT NULL,
	"last_po_date" timestamp with time zone,
	"last_po_supplier_name" varchar(255),
	"last_lead_time_days" integer,
	"status" "stock_monitor_status" NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_metrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"supplier_id" uuid NOT NULL,
	"po_count_6m" integer DEFAULT 0 NOT NULL,
	"avg_lead_time_days" numeric(8, 1),
	"min_lead_time_days" integer,
	"max_lead_time_days" integer,
	"reliability_pct" numeric(5, 2),
	"last_po_date" timestamp with time zone,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "stock_metrics" ADD CONSTRAINT "stock_metrics_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_metrics" ADD CONSTRAINT "stock_metrics_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_metrics" ADD CONSTRAINT "supplier_metrics_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_metrics" ADD CONSTRAINT "supplier_metrics_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_stock_metrics_org_product" ON "stock_metrics" USING btree ("org_id","product_id");--> statement-breakpoint
CREATE INDEX "idx_stock_metrics_org_status" ON "stock_metrics" USING btree ("org_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_supplier_metrics_org_supplier" ON "supplier_metrics" USING btree ("org_id","supplier_id");
