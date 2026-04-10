CREATE TABLE IF NOT EXISTS payment_number_sequence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  year INTEGER NOT NULL,
  last_number INTEGER NOT NULL DEFAULT 0,
  UNIQUE(org_id, year)
);

ALTER TABLE customer_transactions ADD COLUMN IF NOT EXISTS payment_number VARCHAR(20);
