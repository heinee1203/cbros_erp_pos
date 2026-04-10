ALTER TABLE customer_transactions ADD COLUMN IF NOT EXISTS payment_lines JSONB;
