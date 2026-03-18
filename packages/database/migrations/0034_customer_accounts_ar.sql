-- 0034: Customer Accounts & AR — extend customers, create customer_transactions ledger

-- ── Enum: customer_type ──
DO $$
BEGIN
  CREATE TYPE customer_type AS ENUM ('INDIVIDUAL', 'SHOP', 'FLEET', 'WHOLESALE');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ── Enum: customer_transaction_type ──
DO $$
BEGIN
  CREATE TYPE customer_transaction_type AS ENUM ('CHARGE', 'PAYMENT', 'CREDIT_NOTE', 'ADJUSTMENT');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ── Extend customers table ──
ALTER TABLE customers ADD COLUMN IF NOT EXISTS customer_type customer_type NOT NULL DEFAULT 'INDIVIDUAL';
ALTER TABLE customers ADD COLUMN IF NOT EXISTS contact_person VARCHAR(255);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS email VARCHAR(255);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS tin VARCHAR(20);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS credit_limit NUMERIC(12,2) NOT NULL DEFAULT '0.00';
ALTER TABLE customers ADD COLUMN IF NOT EXISTS payment_terms_days INTEGER NOT NULL DEFAULT 30;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS current_balance NUMERIC(12,2) NOT NULL DEFAULT '0.00';
ALTER TABLE customers ADD COLUMN IF NOT EXISTS total_purchases NUMERIC(14,2) NOT NULL DEFAULT '0.00';
ALTER TABLE customers ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- Widen notes from varchar(1000) to text
ALTER TABLE customers ALTER COLUMN notes TYPE text;

-- New indexes on customers
CREATE INDEX IF NOT EXISTS idx_customers_org_type ON customers (org_id, customer_type);
CREATE INDEX IF NOT EXISTS idx_customers_org_active ON customers (org_id, is_active);

-- ── Create customer_transactions ledger (append-only) ──
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
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customer_txn_org_cust_date ON customer_transactions (org_id, customer_id, recorded_at);
CREATE INDEX IF NOT EXISTS idx_customer_txn_org_ref ON customer_transactions (org_id, reference_id);
