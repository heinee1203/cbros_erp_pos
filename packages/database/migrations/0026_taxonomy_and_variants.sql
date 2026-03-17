-- ═══════════════════════════════════════════════
-- Phase 1: Taxonomy
-- ═══════════════════════════════════════════════

-- Add family_id to categories
ALTER TABLE categories
  ADD COLUMN IF NOT EXISTS family_id UUID REFERENCES product_families(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_categories_family_id ON categories (family_id);

-- Create subcategories table
CREATE TABLE IF NOT EXISTS product_subcategories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_subcategories_org_cat_slug
  ON product_subcategories (org_id, category_id, slug);
CREATE INDEX IF NOT EXISTS idx_subcategories_org_category
  ON product_subcategories (org_id, category_id);

-- Add subcategory_id to products
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS subcategory_id UUID REFERENCES product_subcategories(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_products_subcategory_id ON products (subcategory_id);

-- ═══════════════════════════════════════════════
-- Phase 2: Variant Foundation
-- ═══════════════════════════════════════════════

-- Add parent/variant columns to products
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS parent_product_id UUID REFERENCES products(id) ON DELETE CASCADE;
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS is_parent BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_products_parent_id ON products (parent_product_id);
CREATE INDEX IF NOT EXISTS idx_products_is_parent ON products (is_parent) WHERE is_parent = true;

-- Option types (per parent product)
CREATE TABLE IF NOT EXISTS product_option_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_option_types_product_name
  ON product_option_types (org_id, product_id, name);
CREATE INDEX IF NOT EXISTS idx_option_types_product_id
  ON product_option_types (product_id);

-- Option values
CREATE TABLE IF NOT EXISTS product_option_values (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  option_type_id UUID NOT NULL REFERENCES product_option_types(id) ON DELETE CASCADE,
  value VARCHAR(255) NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_option_values_type_value
  ON product_option_values (option_type_id, value);
CREATE INDEX IF NOT EXISTS idx_option_values_type_id
  ON product_option_values (option_type_id);

-- Variant-to-value link
CREATE TABLE IF NOT EXISTS product_variant_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  option_value_id UUID NOT NULL REFERENCES product_option_values(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_variant_options_product_value
  ON product_variant_options (product_id, option_value_id);
CREATE INDEX IF NOT EXISTS idx_variant_options_product_id
  ON product_variant_options (product_id);
CREATE INDEX IF NOT EXISTS idx_variant_options_value_id
  ON product_variant_options (option_value_id);

-- Apply updated_at trigger to new tables
CREATE TRIGGER trg_product_subcategories_updated_at
  BEFORE UPDATE ON product_subcategories
  FOR EACH ROW EXECUTE FUNCTION apex_update_timestamp();
