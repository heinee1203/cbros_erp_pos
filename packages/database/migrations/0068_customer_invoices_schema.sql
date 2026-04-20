-- Migration 0068: add source + due_date to customer_transactions for the
-- Customer Invoices page (AR mirror of Supplier Invoices).
--
-- Decisions (from the build plan):
--   D2 — add due_date to customer_transactions; skip customer-master payment terms.
--   D5 — source enum: MANUAL / POS / IMPORT. Backfill from reference_type.
--   D6 — IMPORT included in the schema even though no AR import path exists yet.
--
-- Both columns are added with safe defaults; no other table touched.

ALTER TABLE customer_transactions
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'MANUAL'
    CHECK (source IN ('MANUAL', 'POS', 'IMPORT')),
  ADD COLUMN IF NOT EXISTS due_date date;

-- Backfill source from the existing reference_type discriminator.
--   reference_type='sale'         → POS  (POS chargeCustomerAccount, current code at customers/service.ts:1156)
--   reference_type='credit_sale'  → POS  (legacy/seeded value; same origin)
--   reference_type='manual_charge' → MANUAL (recordManualCharge)
--   everything else (NULL, etc.)  → MANUAL (column default; no IMPORT data yet)
UPDATE customer_transactions
SET source = CASE
  WHEN reference_type IN ('sale', 'credit_sale') THEN 'POS'
  ELSE 'MANUAL'
END
WHERE type = 'CHARGE';

-- Index for the source filter on the Customer Invoices list endpoint.
-- Composite (org_id, source) so the multi-tenant scope hits the index too.
CREATE INDEX IF NOT EXISTS idx_customer_txn_org_source
  ON customer_transactions (org_id, source)
  WHERE type = 'CHARGE';

-- due_date stays NULL on historical rows — no reasonable inferred default.
-- The UI will render "—" for NULL; Overdue KPI ignores NULL due_dates.
