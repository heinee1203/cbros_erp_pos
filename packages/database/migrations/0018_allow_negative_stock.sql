-- Allow negative stock levels (user-consented overselling)
ALTER TABLE "inventory" DROP CONSTRAINT IF EXISTS "chk_stock_level_non_negative";
