-- Migration 0020: Reclassify CARD payments + add sale_payments.method index

-- Reclassify existing CARD payments to CREDIT_CARD
UPDATE sale_payments SET method = 'CREDIT_CARD' WHERE method = 'CARD';

-- Index on sale_payments.method for Z-reading cash reconciliation queries
CREATE INDEX IF NOT EXISTS idx_sale_payments_method ON sale_payments (method);
