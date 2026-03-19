-- 0035: Customer Returns — returns + return_lines tables with enums and indexes

-- ── Enum: return_status ──
DO $$
BEGIN
  CREATE TYPE return_status AS ENUM ('DRAFT', 'COMPLETED', 'VOIDED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ── Enum: return_reason ──
DO $$
BEGIN
  CREATE TYPE return_reason AS ENUM ('WRONG_FITMENT', 'DEFECTIVE', 'CUSTOMER_CHANGED_MIND', 'WARRANTY', 'DUPLICATE_PURCHASE', 'OTHER');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ── Enum: refund_method ──
DO $$
BEGIN
  CREATE TYPE refund_method AS ENUM ('CASH', 'ORIGINAL_METHOD', 'STORE_CREDIT', 'ACCOUNT_CREDIT');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ── Enum: return_condition ──
DO $$
BEGIN
  CREATE TYPE return_condition AS ENUM ('RESELLABLE', 'DAMAGED', 'DEFECTIVE');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ── Create returns table ──
CREATE TABLE IF NOT EXISTS returns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES locations(id),
  return_number VARCHAR(50) NOT NULL,
  original_sale_id UUID NOT NULL REFERENCES sales(id),
  customer_id UUID REFERENCES customers(id),
  status return_status NOT NULL DEFAULT 'DRAFT',
  return_reason return_reason NOT NULL,
  reason_notes TEXT,
  subtotal NUMERIC(12,2) NOT NULL DEFAULT '0.00',
  tax_amount NUMERIC(12,2) NOT NULL DEFAULT '0.00',
  total NUMERIC(12,2) NOT NULL DEFAULT '0.00',
  refund_method refund_method NOT NULL,
  refund_reference VARCHAR(100),
  approved_by UUID,
  processed_by UUID,
  completed_at TIMESTAMPTZ,
  voided_at TIMESTAMPTZ,
  voided_by UUID,
  void_reason TEXT,
  notes TEXT,
  idempotency_key VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_returns_org_number ON returns (org_id, return_number);
CREATE INDEX IF NOT EXISTS idx_returns_org_sale ON returns (org_id, original_sale_id);
CREATE INDEX IF NOT EXISTS idx_returns_org_status ON returns (org_id, status);
CREATE INDEX IF NOT EXISTS idx_returns_org_created ON returns (org_id, created_at);

-- ── Create return_lines table ──
CREATE TABLE IF NOT EXISTS return_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  return_id UUID NOT NULL REFERENCES returns(id) ON DELETE CASCADE,
  original_sale_line_id UUID NOT NULL REFERENCES sale_lines(id),
  product_id UUID NOT NULL REFERENCES products(id),
  product_name VARCHAR(255) NOT NULL,
  sku VARCHAR(100) NOT NULL,
  quantity INTEGER NOT NULL,
  unit_price NUMERIC(12,2) NOT NULL,
  line_total NUMERIC(12,2) NOT NULL,
  condition return_condition NOT NULL DEFAULT 'RESELLABLE',
  restock BOOLEAN NOT NULL DEFAULT true,
  restock_location_id UUID REFERENCES locations(id),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_return_lines_return ON return_lines (return_id);
CREATE INDEX IF NOT EXISTS idx_return_lines_sale_line ON return_lines (original_sale_line_id);

-- ── updated_at trigger for returns ──
CREATE OR REPLACE TRIGGER trg_returns_updated_at
  BEFORE UPDATE ON returns
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();
