-- Technicians table for mechanic/installer management and commission tracking
CREATE TABLE IF NOT EXISTS technicians (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  name VARCHAR(200) NOT NULL,
  nickname VARCHAR(50),
  role VARCHAR(50) DEFAULT 'mechanic',
  phone VARCHAR(20),
  commission_type VARCHAR(30) NOT NULL DEFAULT 'percentage',
  commission_rate DECIMAL(7,2) NOT NULL DEFAULT 0,
  commission_rate_alt DECIMAL(7,2),
  location_id UUID REFERENCES locations(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_technicians_org_id ON technicians(org_id);
CREATE INDEX IF NOT EXISTS idx_technicians_org_active ON technicians(org_id, is_active);

-- Update sale_lines.technician_id to reference technicians instead of users
-- First drop the old FK (if it exists) then add the new one
DO $$
BEGIN
  -- Drop the old FK to users if it exists
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name LIKE '%technician%' AND table_name = 'sale_lines'
  ) THEN
    EXECUTE (
      SELECT 'ALTER TABLE sale_lines DROP CONSTRAINT ' || constraint_name
      FROM information_schema.table_constraints
      WHERE constraint_name LIKE '%technician%' AND table_name = 'sale_lines'
      LIMIT 1
    );
  END IF;
END $$;

-- Add FK to technicians table (optional — keeps it flexible)
-- Not adding strict FK so historical data with user UUIDs isn't broken
-- New sales will use technician UUIDs going forward
