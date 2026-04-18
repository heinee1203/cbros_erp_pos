-- One-time backfill for PAY-2026-0025 misallocation.
--
-- PAY-2026-0025 (₱54,480 CHECK against CBS) was intended to fully pay
-- SOA-2026-0041. The legacy UI sent 11 explicit allocations: 10 against
-- SOA-0041 charges totalling ₱51,230 (Q2503 was capped at 6,250 because
-- of a since-deleted upstream allocation) plus a spillover of ₱3,250 onto
-- Q3045 in SOA-2026-0040. The server's explicit-allocs branch trusted
-- the client list verbatim; both 3a56497 (server guard) and 9d549b9
-- (UI race fix) prevent recurrence.
--
-- This script repairs the data:
--   Move the ₱3,250 from Q3045 (SOA-2026-0040) to Q2503 (SOA-2026-0041)
--   so PAY-2026-0025 covers SOA-2026-0041 in full (6,250 + 3,250 = 9,500
--   = Q2503's full charge amount).
--
-- Run via:
--   docker exec -i apex-postgres psql -U apex -d apex_dev \
--     < apps/api/scripts/backfill-pay-2026-0025.sql
--
-- Then run apps/api/scripts/backfill-pay-2026-0025-recompute.ts to
-- recompute SOA status for both touched charges.

\pset pager off

BEGIN;

\echo '--- Starting state: PAY-2026-0025 allocations (expect 11 rows, last on Q3045 = 3250) ---'
SELECT pa.id, ct.reference_number, ct.billed_soa_id, pa.allocated_amount
FROM ar_payment_allocations pa
JOIN customer_transactions ct ON ct.id = pa.charge_transaction_id
WHERE pa.payment_transaction_id = (
  SELECT id FROM customer_transactions WHERE payment_number = 'PAY-2026-0025'
)
ORDER BY ct.recorded_at, ct.id;

\echo ''
\echo '--- Step 4a: Delete misallocation on Q3045 ---'
DELETE FROM ar_payment_allocations
WHERE payment_transaction_id = (SELECT id FROM customer_transactions WHERE payment_number = 'PAY-2026-0025')
  AND charge_transaction_id = (SELECT id FROM customer_transactions WHERE reference_number = 'Q3045');

\echo ''
\echo '--- Step 4b: Q2503 alloc before update (expect one row, 6250.00) ---'
SELECT id, allocated_amount
FROM ar_payment_allocations
WHERE payment_transaction_id = (SELECT id FROM customer_transactions WHERE payment_number = 'PAY-2026-0025')
  AND charge_transaction_id = (SELECT id FROM customer_transactions WHERE reference_number = 'Q2503');

\echo ''
\echo '--- Step 4c: Update Q2503 from 6250 to 9500 (Q2503''s full charge amount) ---'
UPDATE ar_payment_allocations
SET allocated_amount = '9500.00'
WHERE payment_transaction_id = (SELECT id FROM customer_transactions WHERE payment_number = 'PAY-2026-0025')
  AND charge_transaction_id = (SELECT id FROM customer_transactions WHERE reference_number = 'Q2503');

\echo ''
\echo '--- Step 4d: PAY-2026-0025 total alloc (expect exactly 54480.00) ---'
SELECT SUM(allocated_amount::numeric) AS total
FROM ar_payment_allocations
WHERE payment_transaction_id = (SELECT id FROM customer_transactions WHERE payment_number = 'PAY-2026-0025');

COMMIT;

\echo ''
\echo '--- Post-commit verification ---'
SELECT soa_number, total_payable, paid_amount, status
FROM soa_records
WHERE soa_number IN ('SOA-2026-0041', 'SOA-2026-0040');
\echo '(status will still read PARTIAL until the recompute script runs)'
