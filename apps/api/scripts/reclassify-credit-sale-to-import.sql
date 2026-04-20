-- One-time backfill: reclassify CHARGE rows with reference_type='credit_sale'
-- from source='POS' to source='IMPORT'.
--
-- The Phase 1 Customer Invoices migration (0068) classified 'credit_sale'
-- as POS via this rule:
--   WHEN reference_type IN ('sale', 'credit_sale') THEN 'POS'
--
-- Investigation (post-1099fb2 diagnostic) confirmed:
--   - 'credit_sale' is written ONLY by the 30+ apps/api/scripts/add-*.ts
--     historical-data import scripts. Notes always say "Credit Sale",
--     reference_id is NULL (no real sale row to link to).
--   - Live POS chargeCustomerAccount writes 'sale' (singular). Zero rows
--     of that shape exist today.
--   - Customer-facing /customers/invoices was therefore showing 1,194
--     imported rows under the "POS" filter. Misleading.
--
-- Run via:
--   docker exec -i apex-postgres psql -U apex -d apex_dev \
--     < apps/api/scripts/reclassify-credit-sale-to-import.sql
--
-- Migration 0068's CASE rule has been amended in the same commit so a
-- fresh-DB apply produces the correct classification without needing
-- this backfill.

\pset pager off
\pset format aligned

BEGIN;

\echo '--- Before: source distribution ---'
SELECT source, COUNT(*) AS n
FROM customer_transactions
WHERE type = 'CHARGE'
GROUP BY source
ORDER BY n DESC;

UPDATE customer_transactions
SET source = 'IMPORT'
WHERE type = 'CHARGE' AND reference_type = 'credit_sale';

\echo ''
\echo '--- After: expect 1194 IMPORT, 57 MANUAL, 0 POS ---'
SELECT source, COUNT(*) AS n
FROM customer_transactions
WHERE type = 'CHARGE'
GROUP BY source
ORDER BY n DESC;

COMMIT;
