-- Fixed commission per unit for installation labor products
ALTER TABLE products ADD COLUMN IF NOT EXISTS commission_amount NUMERIC(10,2);

-- Set fixed rates on parent labor products
UPDATE products SET commission_amount = 100
WHERE name IN ('ACC INSTALL ALARM', 'ACC INSTALL HORN', 'ACC INSTALL LED LIGHT')
  AND parent_product_id IS NULL;

UPDATE products SET commission_amount = 50
WHERE name = 'ACC INSTALL TINT'
  AND parent_product_id IS NULL;

-- Tinting variants: commission based on number of sides
-- 1 SIDE = ₱50
UPDATE products SET commission_amount = 50
WHERE parent_product_id IN (SELECT id FROM products WHERE name = 'ACC INSTALL TINT' AND parent_product_id IS NULL)
  AND name ILIKE '%1 SIDE%';

-- 2 SIDES = ₱100
UPDATE products SET commission_amount = 100
WHERE parent_product_id IN (SELECT id FROM products WHERE name = 'ACC INSTALL TINT' AND parent_product_id IS NULL)
  AND name ILIKE '%2 SIDE%';

-- 3 SIDES = ₱150
UPDATE products SET commission_amount = 150
WHERE parent_product_id IN (SELECT id FROM products WHERE name = 'ACC INSTALL TINT' AND parent_product_id IS NULL)
  AND name ILIKE '%3 SIDE%';

-- FULL TINT = ₱200 (4 sides)
UPDATE products SET commission_amount = 200
WHERE parent_product_id IN (SELECT id FROM products WHERE name = 'ACC INSTALL TINT' AND parent_product_id IS NULL)
  AND name ILIKE '%FULL TINT%';
