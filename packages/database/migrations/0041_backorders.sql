DO $$ BEGIN
  CREATE TYPE backorder_priority AS ENUM ('HIGH', 'NORMAL', 'LOW');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE backorder_status AS ENUM ('PENDING', 'INCLUDED_IN_PO', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS backorders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id),
  supplier_id UUID NOT NULL REFERENCES suppliers(id),
  quantity INTEGER NOT NULL,
  original_po_id UUID REFERENCES purchase_orders(id),
  original_po_number VARCHAR(50),
  reason VARCHAR(255),
  priority backorder_priority NOT NULL DEFAULT 'NORMAL',
  status backorder_status NOT NULL DEFAULT 'PENDING',
  target_po_id UUID REFERENCES purchase_orders(id),
  target_po_number VARCHAR(50),
  requested_by UUID,
  needed_by_date DATE,
  notes TEXT,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_backorders_org_status ON backorders(org_id, status);
CREATE INDEX IF NOT EXISTS idx_backorders_org_supplier_status ON backorders(org_id, supplier_id, status);
CREATE INDEX IF NOT EXISTS idx_backorders_org_product_status ON backorders(org_id, product_id, status);
CREATE INDEX IF NOT EXISTS idx_backorders_org_original_po ON backorders(org_id, original_po_id);
