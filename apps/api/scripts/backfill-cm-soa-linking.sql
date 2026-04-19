-- One-time backfill: link credit memos to SOAs for pre-311ba10 SOAs.
--
-- Before commit 311ba10 (2026-04-10), generateSOA() inserted soa_line_items
-- only for CHARGE transactions; CREDIT_NOTEs were tallied into
-- soa_records.total_credits but never linked structurally. Result:
-- Record Payment modal couldn't surface them, Selected Invoices total
-- disagreed with the SOA payable header by the CM amount.
--
-- This script links UNAMBIGUOUS cases only: SOAs with total_credits > 0
-- and no CM line items, where the customer's still-unbilled CMs in the
-- SOA's date range (date_from .. date_to + 1 day buffer) sum exactly to
-- total_credits.
--
-- Run via:
--   docker exec -i apex-postgres psql -U apex -d apex_dev \
--     < apps/api/scripts/backfill-cm-soa-linking.sql
--
-- Phase B.1 classification confirmed: 10 SOAs, 14 CMs, ₱23,910 of credit.
-- 0 AMBIGUOUS, 0 ORPHAN_SOA. SOA-2026-0084/0148 already linked by prior
-- one-off scripts and excluded by the NOT EXISTS clause.

\pset pager off
\pset format aligned

BEGIN;

-- Build the unambiguous set as a TEMP TABLE so the INSERT and UPDATE
-- both reference the exact same classification (no CTE re-evaluation drift).
CREATE TEMP TABLE unambiguous_cm_links ON COMMIT DROP AS
WITH soas_missing_cms AS (
  SELECT sr.id AS soa_id, sr.soa_number, sr.customer_id,
    sr.date_from, sr.date_to, sr.total_credits
  FROM soa_records sr
  WHERE sr.total_credits > 0
    AND sr.status != 'VOID'
    AND NOT EXISTS (
      SELECT 1 FROM soa_line_items sli
      JOIN customer_transactions ct ON ct.id = sli.transaction_id
      WHERE sli.soa_id = sr.id AND ct.type = 'CREDIT_NOTE'
    )
),
candidate_cms AS (
  SELECT smc.soa_id, smc.soa_number, smc.customer_id, smc.total_credits,
    ct.id AS cm_id, ct.amount AS cm_amount, ct.recorded_at
  FROM soas_missing_cms smc
  JOIN customer_transactions ct
    ON ct.customer_id = smc.customer_id
    AND ct.type = 'CREDIT_NOTE'
    AND ct.billed = false
    AND ct.recorded_at >= smc.date_from
    AND ct.recorded_at <= smc.date_to + INTERVAL '1 day'
),
soa_sums AS (
  SELECT soa_id, soa_number, customer_id, total_credits,
    SUM(cm_amount) AS cand_sum
  FROM candidate_cms
  GROUP BY soa_id, soa_number, customer_id, total_credits
)
SELECT cc.soa_id, cc.soa_number, cc.cm_id, cc.cm_amount
FROM candidate_cms cc
JOIN soa_sums ss ON ss.soa_id = cc.soa_id
WHERE ABS(ss.cand_sum - ss.total_credits) < 0.005;

\echo '--- Dry run: rows to backfill (expect 14 across 10 SOAs) ---'
SELECT COUNT(*) AS link_count, COUNT(DISTINCT soa_id) AS soa_count, SUM(cm_amount)::numeric AS total_credit_to_link
FROM unambiguous_cm_links;

\echo ''
\echo '--- 1. Insert soa_line_items rows (ON CONFLICT DO NOTHING) ---'
INSERT INTO soa_line_items (soa_id, transaction_id)
SELECT soa_id, cm_id FROM unambiguous_cm_links
ON CONFLICT DO NOTHING;

\echo ''
\echo '--- 2. Mark CMs as billed and set billed_soa_id ---'
UPDATE customer_transactions ct
SET billed = true, billed_soa_id = u.soa_id
FROM unambiguous_cm_links u
WHERE ct.id = u.cm_id
  AND ct.billed = false;

\echo ''
\echo '--- 3. Verify: every backfilled SOA now has CM line items summing to total_credits ---'
SELECT sr.soa_number, sr.total_credits,
  COUNT(sli.id) FILTER (WHERE ct.type = 'CREDIT_NOTE') AS cm_line_items,
  COALESCE(SUM(ct.amount) FILTER (WHERE ct.type = 'CREDIT_NOTE'), 0)::numeric AS cm_total_linked,
  CASE WHEN ABS(COALESCE(SUM(ct.amount) FILTER (WHERE ct.type = 'CREDIT_NOTE'), 0) - sr.total_credits) < 0.005
       THEN 'OK' ELSE 'MISMATCH' END AS status
FROM soa_records sr
JOIN soa_line_items sli ON sli.soa_id = sr.id
JOIN customer_transactions ct ON ct.id = sli.transaction_id
WHERE sr.id IN (SELECT DISTINCT soa_id FROM unambiguous_cm_links)
GROUP BY sr.id, sr.soa_number, sr.total_credits
ORDER BY sr.soa_number;

COMMIT;

\echo ''
\echo '--- Post-commit: confirm pre-311ba10 SOAs missing CMs is now empty (sanity) ---'
WITH soas_missing_cms AS (
  SELECT sr.id, sr.soa_number, sr.total_credits
  FROM soa_records sr
  WHERE sr.total_credits > 0
    AND sr.status != 'VOID'
    AND NOT EXISTS (
      SELECT 1 FROM soa_line_items sli
      JOIN customer_transactions ct ON ct.id = sli.transaction_id
      WHERE sli.soa_id = sr.id AND ct.type = 'CREDIT_NOTE'
    )
)
SELECT COUNT(*) AS still_missing_after_backfill FROM soas_missing_cms;
