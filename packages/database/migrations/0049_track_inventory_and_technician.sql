-- Add track_inventory flag to products (default true for regular items)
ALTER TABLE products ADD COLUMN IF NOT EXISTS track_inventory BOOLEAN NOT NULL DEFAULT true;

-- Backfill: Set Non-Items family products to not track inventory
UPDATE products SET track_inventory = false
WHERE family_id = (SELECT id FROM product_families WHERE slug = 'non-items');

-- Backfill: Also set products in Labor/Count/Price Add/Payment categories
UPDATE products SET track_inventory = false
WHERE category_id IN (
  SELECT id FROM categories WHERE name IN ('Labor', 'Count', 'Price Add', 'Payment')
) AND track_inventory = true;

-- Add technician_id to sale_lines for mechanic labor tracking
ALTER TABLE sale_lines ADD COLUMN IF NOT EXISTS technician_id UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sale_lines_technician ON sale_lines(technician_id) WHERE technician_id IS NOT NULL;
