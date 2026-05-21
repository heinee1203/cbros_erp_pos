ALTER TABLE suppliers
  ADD COLUMN IF NOT EXISTS bank_verified_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS bank_verified_by uuid REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_suppliers_bank_verified
  ON suppliers(org_id, bank_verified_at);
