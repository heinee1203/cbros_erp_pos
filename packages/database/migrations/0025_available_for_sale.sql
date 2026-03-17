-- Add available_for_sale boolean to inventory table
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS available_for_sale BOOLEAN NOT NULL DEFAULT true;

-- Index for fast POS filtering by location + availability
CREATE INDEX IF NOT EXISTS idx_inventory_available_for_sale ON inventory (location_id, available_for_sale);
