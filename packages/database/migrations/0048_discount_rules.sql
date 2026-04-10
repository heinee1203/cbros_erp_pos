-- Customer pricing tiers
CREATE TABLE IF NOT EXISTS customer_tiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  default_discount NUMERIC(5,2) DEFAULT 0,
  color VARCHAR(7),
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customer_tiers_org ON customer_tiers(org_id);

-- Discount rules
CREATE TABLE IF NOT EXISTS discount_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  type VARCHAR(30) NOT NULL,
  value NUMERIC(10,2) NOT NULL,
  scope VARCHAR(30) NOT NULL DEFAULT 'all',
  scope_ids TEXT,
  min_quantity INTEGER,
  min_amount NUMERIC(10,2),
  customer_tier_id UUID REFERENCES customer_tiers(id) ON DELETE SET NULL,
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  priority INTEGER NOT NULL DEFAULT 0,
  stackable BOOLEAN NOT NULL DEFAULT false,
  location_ids TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_discount_rules_org ON discount_rules(org_id);
CREATE INDEX IF NOT EXISTS idx_discount_rules_active ON discount_rules(org_id, is_active);
CREATE INDEX IF NOT EXISTS idx_discount_rules_tier ON discount_rules(customer_tier_id);

-- Add tier_id to customers table
ALTER TABLE customers ADD COLUMN IF NOT EXISTS tier_id UUID REFERENCES customer_tiers(id) ON DELETE SET NULL;
