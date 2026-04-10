-- Add credit card payment tracking fields to customer_transactions
ALTER TABLE customer_transactions ADD COLUMN IF NOT EXISTS batch_number VARCHAR(50);
ALTER TABLE customer_transactions ADD COLUMN IF NOT EXISTS trace_number VARCHAR(50);
ALTER TABLE customer_transactions ADD COLUMN IF NOT EXISTS card_type VARCHAR(20);
