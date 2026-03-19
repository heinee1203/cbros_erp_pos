-- 0036: Supplier Returns (RTV) — supplier_returns + lines + status_history tables with enums

-- ── Enum: supplier_return_status ──
DO $$
BEGIN
  CREATE TYPE supplier_return_status AS ENUM (
    'DRAFT', 'SUBMITTED', 'ACKNOWLEDGED', 'CREDIT_RECEIVED',
    'CLOSED', 'CLOSED_WITHOUT_CREDIT', 'CANCELLED'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ── Enum: supplier_return_reason ──
DO $$
BEGIN
  CREATE TYPE supplier_return_reason AS ENUM (
    'DEFECTIVE', 'DAMAGED_ON_DELIVERY', 'WRONG_ITEM',
    'OVERSHIPMENT', 'WARRANTY', 'EXPIRED', 'OTHER'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ── Enum: supplier_return_credit_type ──
DO $$
BEGIN
  CREATE TYPE supplier_return_credit_type AS ENUM (
    'CREDIT_MEMO', 'REPLACEMENT', 'CASH_REFUND', 'DEDUCTED_FROM_NEXT_PO'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ── Enum: supplier_return_condition ──
DO $$
BEGIN
  CREATE TYPE supplier_return_condition AS ENUM (
    'DEFECTIVE', 'DAMAGED', 'WRONG_ITEM', 'EXPIRED', 'OTHER'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ── Extend stock journal reference type enum ──
ALTER TYPE journal_reference_type ADD VALUE IF NOT EXISTS 'SUPPLIER_RETURN';
ALTER TYPE journal_reference_type ADD VALUE IF NOT EXISTS 'SUPPLIER_RETURN_CANCEL';

-- ── Table: supplier_returns ──
CREATE TABLE IF NOT EXISTS supplier_returns (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  location_id     UUID NOT NULL REFERENCES locations(id),
  rtv_number      VARCHAR(50) NOT NULL,
  supplier_id     UUID NOT NULL REFERENCES suppliers(id),
  status          supplier_return_status NOT NULL DEFAULT 'DRAFT',
  reason          supplier_return_reason NOT NULL,
  reason_notes    TEXT,
  total_cost      NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  credit_amount   NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  credit_type     supplier_return_credit_type,
  credit_reference VARCHAR(100),
  source_po_id    UUID REFERENCES purchase_orders(id),
  source_customer_return_id UUID,
  submitted_at    TIMESTAMPTZ,
  acknowledged_at TIMESTAMPTZ,
  credit_received_at TIMESTAMPTZ,
  closed_at       TIMESTAMPTZ,
  cancelled_at    TIMESTAMPTZ,
  cancelled_by    UUID,
  cancel_reason   TEXT,
  created_by      UUID,
  notes           TEXT,
  idempotency_key VARCHAR(255),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Indexes: supplier_returns ──
CREATE UNIQUE INDEX IF NOT EXISTS idx_supplier_returns_org_number
  ON supplier_returns (org_id, rtv_number);
CREATE INDEX IF NOT EXISTS idx_supplier_returns_org_supplier
  ON supplier_returns (org_id, supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_returns_org_status
  ON supplier_returns (org_id, status);
CREATE INDEX IF NOT EXISTS idx_supplier_returns_org_po
  ON supplier_returns (org_id, source_po_id);
CREATE INDEX IF NOT EXISTS idx_supplier_returns_org_created
  ON supplier_returns (org_id, created_at);

-- ── Table: supplier_return_lines ──
CREATE TABLE IF NOT EXISTS supplier_return_lines (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_return_id          UUID NOT NULL REFERENCES supplier_returns(id) ON DELETE CASCADE,
  product_id                  UUID NOT NULL REFERENCES products(id),
  product_name                VARCHAR(255) NOT NULL,
  sku                         VARCHAR(100) NOT NULL,
  quantity                    INTEGER NOT NULL,
  cost_price                  NUMERIC(12,2) NOT NULL,
  line_total                  NUMERIC(12,2) NOT NULL,
  condition                   supplier_return_condition NOT NULL,
  source_po_line_id           UUID REFERENCES po_lines(id),
  source_customer_return_line_id UUID,
  notes                       TEXT,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Indexes: supplier_return_lines ──
CREATE INDEX IF NOT EXISTS idx_supplier_return_lines_return
  ON supplier_return_lines (supplier_return_id);

-- ── Table: supplier_return_status_history ──
CREATE TABLE IF NOT EXISTS supplier_return_status_history (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_return_id  UUID NOT NULL REFERENCES supplier_returns(id) ON DELETE CASCADE,
  from_status         VARCHAR(50),
  to_status           VARCHAR(50) NOT NULL,
  changed_by          UUID,
  notes               TEXT,
  changed_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Indexes: supplier_return_status_history ──
CREATE INDEX IF NOT EXISTS idx_sr_status_history_return
  ON supplier_return_status_history (supplier_return_id);

-- ── updated_at trigger for supplier_returns ──
CREATE OR REPLACE TRIGGER trg_supplier_returns_updated_at
  BEFORE UPDATE ON supplier_returns
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();
