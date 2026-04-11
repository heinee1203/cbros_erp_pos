-- Expand suppliers table with AP master fields to match the customers
-- schema shape. Lets the new Supplier List page capture contact person,
-- tax id, credit terms, bank details, notes, and active/inactive status.
-- All new columns default so existing data remains valid.

ALTER TABLE suppliers
  ADD COLUMN IF NOT EXISTS contact_person        VARCHAR(255),
  ADD COLUMN IF NOT EXISTS tin                   VARCHAR(20),
  ADD COLUMN IF NOT EXISTS payment_terms_days    INTEGER       NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS credit_limit          NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS bank_name             VARCHAR(100),
  ADD COLUMN IF NOT EXISTS bank_account_number   VARCHAR(50),
  ADD COLUMN IF NOT EXISTS bank_account_name     VARCHAR(255),
  ADD COLUMN IF NOT EXISTS notes                 TEXT,
  ADD COLUMN IF NOT EXISTS is_active             BOOLEAN       NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_suppliers_org_active
  ON suppliers(org_id, is_active);

CREATE INDEX IF NOT EXISTS idx_suppliers_name
  ON suppliers(name);
