-- SOA tracking: records of generated statements and billing status
CREATE TABLE IF NOT EXISTS soa_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  customer_id UUID NOT NULL REFERENCES customers(id),
  soa_number VARCHAR(20) NOT NULL,
  date_from DATE NOT NULL,
  date_to DATE NOT NULL,
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  generated_by UUID REFERENCES users(id),
  total_charges NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_credits NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_payable NUMERIC(12,2) NOT NULL DEFAULT 0,
  transaction_count INTEGER NOT NULL DEFAULT 0,
  status VARCHAR(20) DEFAULT 'GENERATED',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_soa_records_org_customer ON soa_records(org_id, customer_id);
CREATE INDEX IF NOT EXISTS idx_soa_records_org_number ON soa_records(org_id, soa_number);

-- Line items linking SOA to specific transactions
CREATE TABLE IF NOT EXISTS soa_line_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  soa_id UUID NOT NULL REFERENCES soa_records(id) ON DELETE CASCADE,
  transaction_id UUID NOT NULL REFERENCES customer_transactions(id),
  UNIQUE(soa_id, transaction_id)
);

-- Add billing tracking to customer_transactions
ALTER TABLE customer_transactions ADD COLUMN IF NOT EXISTS billed BOOLEAN DEFAULT false;
ALTER TABLE customer_transactions ADD COLUMN IF NOT EXISTS billed_soa_id UUID REFERENCES soa_records(id);

-- SOA number sequence
CREATE TABLE IF NOT EXISTS soa_number_sequence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  year INTEGER NOT NULL,
  last_number INTEGER NOT NULL DEFAULT 0,
  UNIQUE(org_id, year)
);
