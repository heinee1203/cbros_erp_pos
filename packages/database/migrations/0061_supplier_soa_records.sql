-- Supplier SOA history — full parallel to customer SOAs (see 0055_soa_records.sql).
-- Persistent statements of account for suppliers, with:
--   * supplier_soa_records       — one row per generated SOA
--   * supplier_soa_line_items    — snapshot of each invoice's amount/paid/balance
--                                  at generation time (immutable audit trail)
--   * supplier_soa_number_sequence — yearly counter for SUPP-SOA-YYYY-NNNN numbers
-- Plus billed/billed_soa_id columns on supplier_invoices so we can filter
-- already-billed invoices out of the "Generate SOA" picker UI.

-- ─── Supplier SOA records ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS supplier_soa_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES suppliers(id),
  soa_number VARCHAR(30) NOT NULL,

  date_from DATE NOT NULL,
  date_to DATE NOT NULL,

  generated_at TIMESTAMPTZ DEFAULT NOW(),
  generated_by UUID REFERENCES users(id),

  -- Snapshot totals at generation time
  total_amount  NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_paid    NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_balance NUMERIC(14,2) NOT NULL DEFAULT 0,
  invoice_count INTEGER       NOT NULL DEFAULT 0,

  -- GENERATED | SENT | VOID
  status VARCHAR(20) NOT NULL DEFAULT 'GENERATED',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_supplier_soa_records_org_supplier
  ON supplier_soa_records(org_id, supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_soa_records_org_number
  ON supplier_soa_records(org_id, soa_number);

-- ─── Line items (snapshot per included invoice) ───────────────────────
CREATE TABLE IF NOT EXISTS supplier_soa_line_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  soa_id UUID NOT NULL REFERENCES supplier_soa_records(id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL REFERENCES supplier_invoices(id),
  -- Frozen values at generation time — reprint shows these, not the
  -- invoice's mutable current state
  invoice_amount        NUMERIC(14,2) NOT NULL,
  paid_at_generation    NUMERIC(14,2) NOT NULL DEFAULT 0,
  balance_at_generation NUMERIC(14,2) NOT NULL,
  UNIQUE(soa_id, invoice_id)
);

CREATE INDEX IF NOT EXISTS idx_supplier_soa_line_items_invoice
  ON supplier_soa_line_items(invoice_id);

-- ─── Yearly sequence counter ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS supplier_soa_number_sequence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  year INTEGER NOT NULL,
  last_number INTEGER NOT NULL DEFAULT 0,
  UNIQUE(org_id, year)
);

-- ─── Billing flags on supplier_invoices ──────────────────────────────
-- Matches the pattern used on customer_transactions.billed / billed_soa_id.
-- Null billed_soa_id means either (a) never billed, or (b) the SOA it
-- belonged to was voided and the invoice is eligible for inclusion again.
ALTER TABLE supplier_invoices
  ADD COLUMN IF NOT EXISTS billed BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE supplier_invoices
  ADD COLUMN IF NOT EXISTS billed_soa_id UUID REFERENCES supplier_soa_records(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_supplier_invoices_billed_soa
  ON supplier_invoices(billed_soa_id);
