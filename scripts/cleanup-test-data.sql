-- ============================================================
-- CBROS ERP — Cleanup All Test/Transactional Data
-- ============================================================
-- Verified against actual DB: 82 tables exist
-- ============================================================

BEGIN;

SET session_replication_role = 'replica';

-- ── Group 1: Warranty & Promo usage ──
TRUNCATE warranty_claims CASCADE;
TRUNCATE warranty_records CASCADE;
TRUNCATE promo_usage CASCADE;

-- ── Group 2: Sales chain ──
TRUNCATE sale_line_serials CASCADE;
TRUNCATE sale_payments CASCADE;
TRUNCATE sale_lines CASCADE;
TRUNCATE sales CASCADE;

-- ── Group 3: Supplier Returns ──
TRUNCATE supplier_return_status_history CASCADE;
TRUNCATE supplier_return_lines CASCADE;
TRUNCATE supplier_returns CASCADE;

-- ── Group 4: PO chain ──
TRUNCATE backorders CASCADE;
TRUNCATE po_receipt_events CASCADE;
TRUNCATE po_receipts CASCADE;
TRUNCATE po_lines CASCADE;
TRUNCATE purchase_orders CASCADE;

-- ── Group 5: Inventory Counts ──
TRUNCATE inventory_count_items CASCADE;
TRUNCATE inventory_counts CASCADE;

-- ── Group 6: Stock Transfers ──
TRUNCATE stock_transfer_receipts CASCADE;
TRUNCATE stock_transfer_items CASCADE;
TRUNCATE stock_transfers CASCADE;

-- ── Group 7: Serial & DOT ──
TRUNCATE serial_numbers CASCADE;
TRUNCATE dot_batches CASCADE;

-- ── Group 8: Job Cards ──
TRUNCATE job_card_state_log CASCADE;
TRUNCATE job_card_labor CASCADE;
TRUNCATE job_card_parts CASCADE;
TRUNCATE job_cards CASCADE;

-- ── Group 9: AP / Financial ──
TRUNCATE check_voucher_lines CASCADE;
TRUNCATE check_vouchers CASCADE;
TRUNCATE supplier_invoices CASCADE;
TRUNCATE recurring_expenses CASCADE;

-- ── Group 10: Journals & Logs ──
TRUNCATE stock_journal CASCADE;
TRUNCATE notifications CASCADE;
TRUNCATE reorder_suggestions CASCADE;

-- Tables that may not exist yet (created in recent migrations)
DO $$ BEGIN
  EXECUTE 'TRUNCATE audit_logs CASCADE';
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- ── Group 11: Shifts ──
TRUNCATE shifts CASCADE;

-- ── Group 12: Reset inventory to 0 ──
UPDATE inventory SET stock_level = 0, reserved_level = 0;

-- ── Group 13: Reset stock metrics ──
UPDATE stock_metrics
   SET sold_1m = 0, sold_3m = 0, sold_6m = 0, sold_12m = 0,
       days_of_stock = NULL, last_sale_date = NULL;

-- ── Group 14: Reset supplier metrics ──
UPDATE supplier_metrics
   SET po_count_6m = 0, avg_lead_time_days = NULL,
       min_lead_time_days = NULL, max_lead_time_days = NULL,
       reliability_pct = NULL, last_po_date = NULL;

SET session_replication_role = 'origin';

COMMIT;

\echo '=== Verification ==='
SELECT 'sales' AS "table", count(*) AS "rows" FROM sales
UNION ALL SELECT 'sale_lines', count(*) FROM sale_lines
UNION ALL SELECT 'purchase_orders', count(*) FROM purchase_orders
UNION ALL SELECT 'stock_transfers', count(*) FROM stock_transfers
UNION ALL SELECT 'serial_numbers', count(*) FROM serial_numbers
UNION ALL SELECT 'stock_journal', count(*) FROM stock_journal
UNION ALL SELECT 'job_cards', count(*) FROM job_cards
UNION ALL SELECT 'historical_sales (KEPT)', count(*) FROM historical_sales
UNION ALL SELECT 'products (KEPT)', count(*) FROM products
UNION ALL SELECT 'inventory (total qty)', sum(stock_level) FROM inventory
ORDER BY 1;
