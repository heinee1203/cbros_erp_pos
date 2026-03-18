-- Dynamic Reorder Engine: tables, enums, and product columns

CREATE TYPE reorder_priority AS ENUM ('CRITICAL', 'URGENT', 'NORMAL');
CREATE TYPE reorder_status AS ENUM ('PENDING', 'ORDERED', 'DISMISSED');

CREATE TABLE IF NOT EXISTS reorder_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  sku VARCHAR(50) NOT NULL,
  product_name VARCHAR(500) NOT NULL,
  supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  supplier_name VARCHAR(255),
  current_stock INTEGER NOT NULL DEFAULT 0,
  pending_inbound INTEGER NOT NULL DEFAULT 0,
  avg_daily_demand NUMERIC(12,4) NOT NULL DEFAULT 0,
  demand_std_dev NUMERIC(12,4) NOT NULL DEFAULT 0,
  avg_lead_time NUMERIC(8,1) NOT NULL DEFAULT 7,
  service_level_z NUMERIC(4,2) NOT NULL DEFAULT 1.65,
  safety_stock NUMERIC(10,1) NOT NULL DEFAULT 0,
  reorder_point NUMERIC(10,1) NOT NULL DEFAULT 0,
  suggested_qty INTEGER NOT NULL DEFAULT 0,
  target_stock INTEGER NOT NULL DEFAULT 0,
  abc_class VARCHAR(1) NOT NULL DEFAULT 'C',
  priority reorder_priority NOT NULL,
  status reorder_status NOT NULL DEFAULT 'PENDING',
  notes TEXT,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actioned_at TIMESTAMPTZ,
  actioned_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_reorder_org_product ON reorder_suggestions (org_id, product_id);
CREATE INDEX IF NOT EXISTS idx_reorder_org_priority ON reorder_suggestions (org_id, priority);
CREATE INDEX IF NOT EXISTS idx_reorder_org_status ON reorder_suggestions (org_id, status);
CREATE INDEX IF NOT EXISTS idx_reorder_org_supplier ON reorder_suggestions (org_id, supplier_id);

CREATE TABLE IF NOT EXISTS reorder_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  setting_key VARCHAR(100) NOT NULL,
  setting_value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_reorder_settings_org_key ON reorder_settings (org_id, setting_key);

ALTER TABLE products ADD COLUMN IF NOT EXISTS reorder_enabled BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE products ADD COLUMN IF NOT EXISTS custom_reorder_point INTEGER;
