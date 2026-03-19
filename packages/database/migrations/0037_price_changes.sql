-- Price changes audit trail for price management module
CREATE TYPE "public"."price_field" AS ENUM('SELL_PRICE', 'COST_PRICE');

CREATE TABLE IF NOT EXISTS "price_changes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL,
  "product_id" uuid NOT NULL,
  "field" "price_field" NOT NULL,
  "old_value" numeric(12, 2) NOT NULL,
  "new_value" numeric(12, 2) NOT NULL,
  "change_reason" varchar(255),
  "batch_id" uuid,
  "changed_by" uuid,
  "changed_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "price_changes" ADD CONSTRAINT "price_changes_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "price_changes" ADD CONSTRAINT "price_changes_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;

CREATE INDEX IF NOT EXISTS "idx_price_changes_product_date" ON "price_changes" USING btree ("org_id", "product_id", "changed_at");
CREATE INDEX IF NOT EXISTS "idx_price_changes_batch" ON "price_changes" USING btree ("org_id", "batch_id");
