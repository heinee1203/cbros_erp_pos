-- Add technician_id column to historical_sales for Loyverse labor backfill
ALTER TABLE historical_sales ADD COLUMN IF NOT EXISTS technician_id UUID;
CREATE INDEX IF NOT EXISTS idx_hist_technician ON historical_sales(technician_id) WHERE technician_id IS NOT NULL;
