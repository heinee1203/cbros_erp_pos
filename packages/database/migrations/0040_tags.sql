CREATE TYPE IF NOT EXISTS "tag_type" AS ENUM('TIRE_SIZE', 'VEHICLE', 'APPLICATION_CODE', 'CUSTOM');

CREATE TABLE IF NOT EXISTS "tags" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "name" varchar(100) NOT NULL,
  "tag_type" "tag_type" NOT NULL,
  "description" varchar(500),
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "idx_tags_name_unique" ON "tags" ("org_id", "name");
CREATE INDEX IF NOT EXISTS "idx_tags_type" ON "tags" ("org_id", "tag_type");

CREATE TABLE IF NOT EXISTS "product_tags" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "product_id" uuid NOT NULL REFERENCES "products"("id") ON DELETE CASCADE,
  "tag_id" uuid NOT NULL REFERENCES "tags"("id") ON DELETE CASCADE,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "idx_product_tags_unique" ON "product_tags" ("org_id", "product_id", "tag_id");
CREATE INDEX IF NOT EXISTS "idx_product_tags_tag" ON "product_tags" ("org_id", "tag_id");
