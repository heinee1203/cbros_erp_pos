-- Add variable price flag
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_variable_price BOOLEAN NOT NULL DEFAULT false;

-- Relax barcode constraint: drop EAN-13 regex, widen to VARCHAR(50)
ALTER TABLE products DROP CONSTRAINT IF EXISTS chk_barcode_format;
ALTER TABLE products ALTER COLUMN barcode TYPE VARCHAR(50);

-- Replace plain barcode index with org-scoped unique index
DROP INDEX IF EXISTS idx_products_barcode;
CREATE UNIQUE INDEX IF NOT EXISTS idx_products_org_barcode
  ON products (org_id, barcode) WHERE barcode IS NOT NULL;

-- Add granular category FK
ALTER TABLE products ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES categories(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_products_category_id ON products (category_id);
