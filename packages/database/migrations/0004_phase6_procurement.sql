-- Phase 6: Procurement / Purchase Orders Migration
-- Creates: purchase_order_status enum, purchase_orders, po_lines, po_receipt_events
-- Alters: products (adds current_cost_price, mnemonic_cost_code)

-- 1. Create purchase_order_status enum
CREATE TYPE purchase_order_status AS ENUM (
  'DRAFT',
  'SUBMITTED',
  'PARTIALLY_RECEIVED',
  'FULLY_RECEIVED',
  'CLOSED_WITH_VARIANCE',
  'CANCELLED'
);

-- 2. Add new columns to products table
ALTER TABLE products
  ADD COLUMN current_cost_price NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  ADD COLUMN mnemonic_cost_code VARCHAR(10);

-- 3. Create purchase_orders table
CREATE TABLE purchase_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  po_no VARCHAR(50) NOT NULL,
  supplier_id UUID NOT NULL REFERENCES suppliers(id),
  destination_location_id UUID NOT NULL REFERENCES locations(id),
  status purchase_order_status NOT NULL DEFAULT 'DRAFT',
  expected_delivery_date TIMESTAMPTZ,
  notes VARCHAR(1000),
  created_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  submitted_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  cancelled_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  closed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  submitted_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  idempotency_key VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_purchase_orders_org_id ON purchase_orders(org_id);
CREATE INDEX idx_purchase_orders_status ON purchase_orders(status);
CREATE INDEX idx_purchase_orders_supplier_id ON purchase_orders(supplier_id);
CREATE INDEX idx_purchase_orders_destination ON purchase_orders(destination_location_id);
CREATE UNIQUE INDEX idx_purchase_orders_org_po_no ON purchase_orders(org_id, po_no);
CREATE UNIQUE INDEX idx_purchase_orders_idempotency_key ON purchase_orders(idempotency_key);

-- 4. Create po_lines table
CREATE TABLE po_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id),
  ordered_qty INTEGER NOT NULL,
  received_accepted_qty INTEGER NOT NULL DEFAULT 0,
  rejected_qty INTEGER NOT NULL DEFAULT 0,
  unit_cost NUMERIC(12, 2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_po_ordered_qty_positive CHECK (ordered_qty > 0),
  CONSTRAINT chk_po_received_accepted_non_negative CHECK (received_accepted_qty >= 0),
  CONSTRAINT chk_po_rejected_non_negative CHECK (rejected_qty >= 0),
  CONSTRAINT chk_po_received_lte_ordered CHECK (received_accepted_qty + rejected_qty <= ordered_qty)
);

CREATE INDEX idx_po_lines_purchase_order_id ON po_lines(purchase_order_id);
CREATE INDEX idx_po_lines_product_id ON po_lines(product_id);

-- 5. Create po_receipt_events table (append-only immutable ledger)
CREATE TABLE po_receipt_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  purchase_order_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  po_line_id UUID NOT NULL REFERENCES po_lines(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id),
  location_id UUID NOT NULL REFERENCES locations(id),
  received_accepted_qty INTEGER NOT NULL,
  rejected_qty INTEGER NOT NULL,
  unit_cost NUMERIC(12, 2) NOT NULL,
  notes VARCHAR(500),
  received_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  idempotency_key VARCHAR(255) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_receipt_qty_positive CHECK (received_accepted_qty + rejected_qty > 0),
  CONSTRAINT chk_receipt_accepted_non_negative CHECK (received_accepted_qty >= 0),
  CONSTRAINT chk_receipt_rejected_non_negative CHECK (rejected_qty >= 0)
);

CREATE INDEX idx_po_receipt_events_po_id ON po_receipt_events(purchase_order_id);
CREATE INDEX idx_po_receipt_events_po_line_id ON po_receipt_events(po_line_id);
CREATE INDEX idx_po_receipt_events_product_id ON po_receipt_events(product_id);
