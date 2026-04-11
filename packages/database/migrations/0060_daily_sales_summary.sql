-- Daily sales summary: one row per org per business day, tracking sales
-- totals for every division (cash + on-account) plus AR collections.
-- Amounts stored in CENTAVOS (integer) for numeric precision.
-- Seeded from the legacy SALES_CBROS Excel workbook; going forward,
-- populated manually through the admin dashboard entry form.

CREATE TABLE IF NOT EXISTS daily_sales_summary (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Business date
  date DATE NOT NULL,

  -- Auto Parts
  ap_old_sales        INTEGER NOT NULL DEFAULT 0,  -- A/P - OLD
  ap_new_sales        INTEGER NOT NULL DEFAULT 0,  -- A/P - NEW (C Autoparts)
  ap_on_account       INTEGER NOT NULL DEFAULT 0,  -- A/P ON ACCT

  -- Accessories
  ac_sales            INTEGER NOT NULL DEFAULT 0,  -- A/C
  ac_on_account       INTEGER NOT NULL DEFAULT 0,  -- A/C ON ACCT

  -- Service
  service_sales       INTEGER NOT NULL DEFAULT 0,  -- SERVICE
  service_on_account  INTEGER NOT NULL DEFAULT 0,  -- S - ON ACCT

  -- Painting
  painting_sales      INTEGER NOT NULL DEFAULT 0,  -- PAINTING
  painting_on_account INTEGER NOT NULL DEFAULT 0,  -- P- ON ACCT

  -- Junior branch
  junior_sales        INTEGER NOT NULL DEFAULT 0,  -- JUNIOR

  -- Collections
  payments            INTEGER NOT NULL DEFAULT 0,  -- PAYMENT (AR collections)

  -- Provenance
  source VARCHAR(20) NOT NULL DEFAULT 'IMPORT',
  notes VARCHAR(500),
  recorded_by UUID REFERENCES users(id) ON DELETE SET NULL,

  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One row per org per day — prevents duplicate imports and powers the
-- admin dashboard's date-range aggregation queries.
CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_sales_org_date
  ON daily_sales_summary (org_id, date);

CREATE INDEX IF NOT EXISTS idx_daily_sales_date
  ON daily_sales_summary (date);
