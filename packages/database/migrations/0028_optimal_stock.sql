ALTER TABLE "inventory" ADD COLUMN IF NOT EXISTS "optimal_stock" integer NOT NULL DEFAULT 0;
