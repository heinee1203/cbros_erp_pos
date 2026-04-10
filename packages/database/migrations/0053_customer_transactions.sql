-- Customer transaction types enum
DO $$ BEGIN
  CREATE TYPE customer_transaction_type AS ENUM ('CHARGE', 'PAYMENT', 'CREDIT_NOTE', 'ADJUSTMENT');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Customer transactions ledger for AR tracking
CREATE TABLE IF NOT EXISTS customer_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  type customer_transaction_type NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  balance_after NUMERIC(12,2) NOT NULL,
  reference_type VARCHAR(50),
  reference_id UUID,
  reference_number VARCHAR(100),
  payment_method VARCHAR(50),
  notes TEXT,
  recorded_by UUID REFERENCES users(id),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customer_txn_org_cust_date ON customer_transactions(org_id, customer_id, recorded_at);
CREATE INDEX IF NOT EXISTS idx_customer_txn_org_ref ON customer_transactions(org_id, reference_id);
