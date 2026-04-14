-- Add check lifecycle tracking to DV payment lines
ALTER TABLE supplier_dv_payments ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'OUTSTANDING';
ALTER TABLE supplier_dv_payments ADD COLUMN IF NOT EXISTS bounce_reason TEXT;

-- Backfill: confirmed DV checks → RELEASED (they've been disbursed)
UPDATE supplier_dv_payments
SET status = 'RELEASED'
WHERE payment_method = 'CHECK'
  AND dv_id IN (SELECT id FROM supplier_disbursement_vouchers WHERE status = 'CONFIRMED');

-- Backfill: voided DV checks → CANCELLED
UPDATE supplier_dv_payments
SET status = 'CANCELLED'
WHERE payment_method = 'CHECK'
  AND dv_id IN (SELECT id FROM supplier_disbursement_vouchers WHERE status = 'VOIDED');

-- Partial index for fast check register queries
CREATE INDEX IF NOT EXISTS idx_dv_payments_check_register
  ON supplier_dv_payments (payment_method, status)
  WHERE payment_method = 'CHECK';
