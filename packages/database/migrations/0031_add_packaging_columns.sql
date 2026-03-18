-- Add packaging columns to products table
ALTER TABLE "products" ADD COLUMN "units_per_case" integer NOT NULL DEFAULT 1;
ALTER TABLE "products" ADD COLUMN "packaging_unit" varchar(50);
