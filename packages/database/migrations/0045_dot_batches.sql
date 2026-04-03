-- Product columns for tire tracking
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_tire BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE products ADD COLUMN IF NOT EXISTS max_tire_age_years INTEGER;

-- DOT batch tracking table
CREATE TABLE IF NOT EXISTS dot_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id),
  location_id UUID NOT NULL REFERENCES locations(id),

  dot_code TEXT NOT NULL,
  manufacture_week INTEGER,
  manufacture_year INTEGER,
  manufacture_date DATE,

  quantity_received INTEGER NOT NULL DEFAULT 0,
  quantity_in_stock INTEGER NOT NULL DEFAULT 0,
  quantity_sold INTEGER NOT NULL DEFAULT 0,
  quantity_returned INTEGER NOT NULL DEFAULT 0,

  purchase_order_id UUID REFERENCES purchase_orders(id),
  po_number VARCHAR(50),
  received_at TIMESTAMPTZ,
  received_by UUID REFERENCES users(id),
  supplier_id UUID REFERENCES suppliers(id),
  supplier_name TEXT,
  cost_price NUMERIC(12,2),

  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT dot_batches_positive_stock CHECK (quantity_in_stock >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_dot_batches_unique
  ON dot_batches(org_id, product_id, location_id, dot_code, purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_dot_batches_product_location
  ON dot_batches(product_id, location_id);
CREATE INDEX IF NOT EXISTS idx_dot_batches_org_product
  ON dot_batches(org_id, product_id);
CREATE INDEX IF NOT EXISTS idx_dot_batches_manufacture
  ON dot_batches(manufacture_date);
