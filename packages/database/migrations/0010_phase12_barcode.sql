-- Phase 12: Barcode support for products
-- Every sellable item/SKU gets a unique 13-digit EAN-13 barcode

ALTER TABLE products ADD COLUMN barcode VARCHAR(13);

-- Only non-null barcodes must be unique (within the org)
CREATE UNIQUE INDEX idx_products_barcode_unique
  ON products (org_id, barcode)
  WHERE barcode IS NOT NULL;

-- Enforce exactly 13 digits when set
ALTER TABLE products ADD CONSTRAINT chk_barcode_format
  CHECK (barcode IS NULL OR barcode ~ '^\d{13}$');

-- B-Tree index for barcode lookups
CREATE INDEX idx_products_barcode ON products (barcode) WHERE barcode IS NOT NULL;
