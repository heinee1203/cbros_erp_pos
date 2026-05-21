ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS credit_status VARCHAR(40) NOT NULL DEFAULT 'OK',
  ADD COLUMN IF NOT EXISTS credit_hold_type VARCHAR(40) NOT NULL DEFAULT 'NONE',
  ADD COLUMN IF NOT EXISTS credit_hold_reason TEXT,
  ADD COLUMN IF NOT EXISTS credit_hold_note TEXT,
  ADD COLUMN IF NOT EXISTS credit_hold_approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS credit_hold_approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS merged_into_customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS merged_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS merged_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_customers_org_credit_hold
  ON customers(org_id, credit_hold_type, credit_status);

CREATE INDEX IF NOT EXISTS idx_customers_org_merged
  ON customers(org_id, merged_into_customer_id);

ALTER TABLE customer_collection_notes
  ADD COLUMN IF NOT EXISTS contact_method VARCHAR(40),
  ADD COLUMN IF NOT EXISTS outcome VARCHAR(60),
  ADD COLUMN IF NOT EXISTS priority VARCHAR(20) NOT NULL DEFAULT 'NORMAL',
  ADD COLUMN IF NOT EXISTS promised_amount NUMERIC(12, 2);

CREATE TABLE IF NOT EXISTS customer_disputes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  transaction_id UUID REFERENCES customer_transactions(id) ON DELETE SET NULL,
  soa_id UUID REFERENCES soa_records(id) ON DELETE SET NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'OPEN',
  reason VARCHAR(80) NOT NULL DEFAULT 'DISPUTED',
  disputed_amount NUMERIC(12, 2),
  owner_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  notes TEXT,
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  resolved_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customer_disputes_org_customer
  ON customer_disputes(org_id, customer_id, created_at);

CREATE INDEX IF NOT EXISTS idx_customer_disputes_org_status
  ON customer_disputes(org_id, status);

CREATE INDEX IF NOT EXISTS idx_customer_disputes_transaction
  ON customer_disputes(transaction_id);

CREATE INDEX IF NOT EXISTS idx_customer_disputes_soa
  ON customer_disputes(soa_id);

CREATE TABLE IF NOT EXISTS customer_payment_risk_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  payment_transaction_id UUID REFERENCES customer_transactions(id) ON DELETE SET NULL,
  event_type VARCHAR(40) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'OPEN',
  reference_number VARCHAR(100),
  amount NUMERIC(12, 2),
  reason TEXT,
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customer_payment_risk_org_customer
  ON customer_payment_risk_events(org_id, customer_id, created_at);

CREATE INDEX IF NOT EXISTS idx_customer_payment_risk_org_type
  ON customer_payment_risk_events(org_id, event_type);

CREATE INDEX IF NOT EXISTS idx_customer_payment_risk_payment
  ON customer_payment_risk_events(payment_transaction_id);
