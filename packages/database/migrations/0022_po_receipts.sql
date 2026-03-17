-- Receipt batch header
CREATE TABLE po_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  purchase_order_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  supplier_dr_no VARCHAR(100) NOT NULL,
  received_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  line_count INTEGER NOT NULL,
  total_accepted_qty INTEGER NOT NULL,
  total_rejected_qty INTEGER NOT NULL DEFAULT 0,
  notes VARCHAR(1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_po_receipts_po_id ON po_receipts (org_id, purchase_order_id);
CREATE INDEX idx_po_receipts_dr_no ON po_receipts (org_id, supplier_dr_no);
CREATE UNIQUE INDEX idx_po_receipts_unique_dr ON po_receipts (org_id, purchase_order_id, supplier_dr_no);

-- Link receipt events to batch header
ALTER TABLE po_receipt_events ADD COLUMN po_receipt_id UUID REFERENCES po_receipts(id) ON DELETE CASCADE;
CREATE INDEX idx_po_receipt_events_receipt_id ON po_receipt_events (po_receipt_id);
