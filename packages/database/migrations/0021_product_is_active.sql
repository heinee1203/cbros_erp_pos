-- Migration 0021: Add is_active soft delete to products

ALTER TABLE products ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_products_is_active ON products (is_active);
