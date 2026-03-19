CREATE TABLE IF NOT EXISTS "product_suppliers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "product_id" uuid NOT NULL REFERENCES "products"("id") ON DELETE CASCADE,
  "supplier_id" uuid NOT NULL REFERENCES "suppliers"("id") ON DELETE CASCADE,
  "priority" integer NOT NULL DEFAULT 1,
  "supplier_sku" varchar(100),
  "supplier_cost" numeric(12, 2),
  "min_order_qty" integer NOT NULL DEFAULT 1,
  "lead_time_days" integer,
  "is_active" boolean NOT NULL DEFAULT true,
  "notes" varchar(1000),
  "last_ordered_at" timestamp with time zone,
  "last_cost" numeric(12, 2),
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "idx_product_suppliers_unique" ON "product_suppliers" ("org_id", "product_id", "supplier_id");
CREATE INDEX IF NOT EXISTS "idx_product_suppliers_priority" ON "product_suppliers" ("org_id", "product_id", "priority");
CREATE INDEX IF NOT EXISTS "idx_product_suppliers_supplier" ON "product_suppliers" ("org_id", "supplier_id");
