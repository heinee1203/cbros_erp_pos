-- One-time backfill: link DV-2026-000026 and DV-2026-000027 to their SOAs.
--
-- Both DVs were created via the (now-closed) "+ New Voucher" UI path that
-- submitted with empty soaIds, producing orphan rows: soa_id NULL, zero
-- junction rows. They were CONFIRMED but their SOAs stayed at GENERATED/BILLED
-- because confirmDisbursementVoucher silently no-oped on empty soaAllocations.
--
-- Convention verified against working DV-2026-000011:
--   allocated_amount = SOA gross (NOT DV net). EWT deductions do not reduce
--   the junction allocation; the full gross being settled is recorded.
--
-- DV-26 → SOA-0013 (Drakester): gross 204,683.96 = SOA total exact match
-- DV-27 → SOA-0015 (Tyremart):  SOA gross 25,729.12; DV net 25,499.40 after
--                               229.72 EWT 1% (deduction row already persisted)
--
-- Run via:
--   docker exec -i apex-postgres psql -U apex -d apex_dev \
--     < apps/api/scripts/backfill-dv-soa-orphans-2026.sql
--
-- SOA status recompute is a separate follow-up (after this commit lands).

\pset pager off
\pset format aligned

BEGIN;

DO $$
DECLARE
  v_dv26_id  uuid;
  v_dv27_id  uuid;
  v_soa13_id uuid;
  v_soa15_id uuid;
BEGIN
  SELECT id INTO v_dv26_id  FROM supplier_disbursement_vouchers WHERE dv_number = 'DV-2026-000026';
  SELECT id INTO v_dv27_id  FROM supplier_disbursement_vouchers WHERE dv_number = 'DV-2026-000027';
  SELECT id INTO v_soa13_id FROM supplier_soa_records           WHERE soa_number = 'SUPP-SOA-2026-0013';
  SELECT id INTO v_soa15_id FROM supplier_soa_records           WHERE soa_number = 'SUPP-SOA-2026-0015';

  IF v_dv26_id IS NULL OR v_dv27_id IS NULL OR v_soa13_id IS NULL OR v_soa15_id IS NULL THEN
    RAISE EXCEPTION 'Required IDs not found — aborting (dv26=%, dv27=%, soa13=%, soa15=%)',
      v_dv26_id, v_dv27_id, v_soa13_id, v_soa15_id;
  END IF;

  -- 1. Legacy column on each DV
  UPDATE supplier_disbursement_vouchers SET soa_id = v_soa13_id WHERE id = v_dv26_id AND soa_id IS NULL;
  UPDATE supplier_disbursement_vouchers SET soa_id = v_soa15_id WHERE id = v_dv27_id AND soa_id IS NULL;

  -- 2. Junction rows (allocated_amount = SOA gross, mirrors working DV-11)
  INSERT INTO supplier_dv_soas (dv_id, soa_id, allocated_amount, created_at)
  VALUES
    (v_dv26_id, v_soa13_id, 204683.96, NOW()),
    (v_dv27_id, v_soa15_id,  25729.12, NOW())
  ON CONFLICT DO NOTHING;
END $$;

\echo ''
\echo '--- Verify: each DV now has 1 junction row + legacy soa_id set ---'
SELECT dv.dv_number,
  COUNT(j.id) AS junction_count,
  dv.soa_id IS NOT NULL AS legacy_col_set,
  STRING_AGG(soa.soa_number, ', ' ORDER BY soa.soa_number) AS linked_soas
FROM supplier_disbursement_vouchers dv
LEFT JOIN supplier_dv_soas j ON j.dv_id = dv.id
LEFT JOIN supplier_soa_records soa ON soa.id = j.soa_id
WHERE dv.dv_number IN ('DV-2026-000026', 'DV-2026-000027')
GROUP BY dv.dv_number, dv.soa_id
ORDER BY dv.dv_number;

\echo ''
\echo '--- Verify: SOA-0013 + SOA-0015 still GENERATED (recompute is a separate commit) ---'
SELECT soa_number, status, total_amount, total_paid
FROM supplier_soa_records
WHERE soa_number IN ('SUPP-SOA-2026-0013', 'SUPP-SOA-2026-0015')
ORDER BY soa_number;

COMMIT;
