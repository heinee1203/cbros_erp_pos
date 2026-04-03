-- Add FULFILLED value to backorder_status enum
ALTER TYPE backorder_status ADD VALUE IF NOT EXISTS 'FULFILLED' AFTER 'INCLUDED_IN_PO';

-- Add new columns for partial receipt workflow
ALTER TABLE backorders
  ADD COLUMN IF NOT EXISTS product_name TEXT,
  ADD COLUMN IF NOT EXISTS sku VARCHAR(50),
  ADD COLUMN IF NOT EXISTS supplier_name TEXT,
  ADD COLUMN IF NOT EXISTS quantity_ordered INTEGER,
  ADD COLUMN IF NOT EXISTS quantity_received INTEGER,
  ADD COLUMN IF NOT EXISTS quantity_outstanding INTEGER,
  ADD COLUMN IF NOT EXISTS original_po_line_id UUID REFERENCES po_lines(id),
  ADD COLUMN IF NOT EXISTS unit_cost NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS wait_until DATE,
  ADD COLUMN IF NOT EXISTS new_supplier_id UUID REFERENCES suppliers(id),
  ADD COLUMN IF NOT EXISTS new_supplier_name TEXT;

-- Index for auto-fulfill lookups (find backorders by target PO)
CREATE INDEX IF NOT EXISTS idx_backorders_org_target_po ON backorders(org_id, target_po_id);

-- Index for overdue checks
CREATE INDEX IF NOT EXISTS idx_backorders_pending_wait
  ON backorders(wait_until)
  WHERE status = 'PENDING' AND wait_until IS NOT NULL;
