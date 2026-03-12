# APEX POS — Go-Live Cutover Sequence

**Document:** SOP-CUTOVER-001
**Version:** 1.0
**Date:** 7 March 2026
**Classification:** Internal — Management Only

---

## Purpose

This document provides the chronological checklist for transitioning from the legacy system to APEX POS. Each step must be completed in order. The cutover is designed to be executed over a single weekend (Friday evening to Monday morning) with minimal business disruption.

---

## Roles & Responsibilities

| Role | Responsibility | Name |
|------|---------------|------|
| **Cutover Lead** | Oversees entire process, makes go/no-go decisions | ________________ |
| **IT Administrator** | Server deployment, database management, network | ________________ |
| **Warehouse Manager** | Physical stock count supervision | ________________ |
| **Store Manager(s)** | Location stock counts, staff coordination | ________________ |
| **ERP Consultant** | Migration pipeline execution, data validation | ________________ |

---

## Pre-Cutover Checklist (Complete Before Cutover Weekend)

These items must be verified **at least 3 business days** before the cutover date.

| # | Item | Owner | Done |
|---|------|-------|------|
| P1 | UAT sandbox testing **passed** (all 3 scenarios signed off — see SOP-UAT-001) | Cutover Lead | ☐ |
| P2 | Production PostgreSQL 16 server provisioned and accessible | IT Admin | ☐ |
| P3 | `DATABASE_URL` and `ORG_ID` environment variables configured for production | IT Admin | ☐ |
| P4 | Production database migrations applied (`pnpm db:migrate`) | IT Admin | ☐ |
| P5 | Migration staging tables applied (`0007_phase9_migration_staging.sql`) | IT Admin | ☐ |
| P6 | APEX POS web application deployed to production server | IT Admin | ☐ |
| P7 | APEX API deployed and passing `GET /health` check | IT Admin | ☐ |
| P8 | Admin user created via `POST /auth/register` | IT Admin | ☐ |
| P9 | All staff user accounts created with correct roles (MANAGER, CASHIER, WAREHOUSE_STAFF) | Store Mgr | ☐ |
| P10 | Network connectivity tested from all POS terminals/tablets to production server | IT Admin | ☐ |
| P11 | Legacy data export files prepared in CSV/Excel format (see Data Files below) | ERP Consultant | ☐ |
| P12 | Backup/restore procedure tested on a non-production database | IT Admin | ☐ |
| P13 | Day 1 Fallback Plan printed and distributed (see SOP-FALLBACK-001) | Cutover Lead | ☐ |
| P14 | Staff briefing completed — all employees aware of cutover schedule | Store Mgr | ☐ |

### Required Data Files

Place in `tools/migration/data/` before running the ETL pipeline:

| File | Contents | Source |
|------|----------|--------|
| `locations.csv` | All store/warehouse locations (name, code, type, address) | Legacy system export |
| `suppliers.csv` | Supplier directory (name, email, phone, address, lead time) | Legacy system export |
| `products.csv` | Full product catalog (name, SKU, mnemonic_sku, category, prices) | Legacy system export |
| `customers.csv` | Customer list (name, phone, notes) | Legacy system export |
| `vehicles.csv` | Vehicle registry (customer_phone, make, model, year, plate) | Legacy system export |
| `balances.csv` | Opening inventory balances (SKU, location_code, qty) — from physical count | Physical count sheets |

---

## Cutover Sequence

### PHASE 1 — FREEZE (Friday 18:00)

> **Objective:** Stop all transactions in the legacy system to create a clean data cutoff.

| # | Time | Action | Owner | Done |
|---|------|--------|-------|------|
| 1.1 | 18:00 | **Announce system freeze** to all staff — no more sales, no more receiving | Cutover Lead | ☐ |
| 1.2 | 18:00 | Close all open POS terminals in the legacy system | Store Mgr | ☐ |
| 1.3 | 18:05 | Process any remaining pending transactions in legacy system | Cashiers | ☐ |
| 1.4 | 18:15 | **Lock out** the legacy system — disable user logins | IT Admin | ☐ |
| 1.5 | 18:15 | Record legacy system's final transaction number and timestamp | Cutover Lead | ☐ |
| 1.6 | 18:20 | Export final data files from legacy system (products, customers, vehicles, suppliers) | ERP Consultant | ☐ |
| 1.7 | 18:30 | **Backup** legacy database (full backup, stored in 2 locations) | IT Admin | ☐ |

**PHASE 1 CHECKPOINT:**

| | |
|---|---|
| Legacy system locked: | ☐ YES |
| Final transaction #: | ________________ |
| All data files exported: | ☐ YES |
| Legacy DB backed up: | ☐ YES |
| **GO / NO-GO Decision:** | ☐ GO &nbsp;&nbsp;&nbsp; ☐ NO-GO (Reason: _______________) |

---

### PHASE 2 — PHYSICAL STOCK COUNT (Friday 18:30 – Saturday)

> **Objective:** Establish authoritative opening inventory balances from a physical count, not legacy system numbers.

| # | Time | Action | Owner | Done |
|---|------|--------|-------|------|
| 2.1 | 18:30 | Distribute **printed count sheets** to each location (warehouse + stores) | Warehouse Mgr | ☐ |
| 2.2 | 18:30 | Each sheet lists: SKU, Product Name, Location Code, blank "Count" column | — | ☐ |
| 2.3 | Overnight | **Count every SKU** at every location. Two counters per aisle (double-count for accuracy) | All Staff | ☐ |
| 2.4 | Sat AM | Compare double-count results. Investigate any discrepancies > 2 units | Warehouse Mgr | ☐ |
| 2.5 | Sat AM | Enter final counts into `balances.csv` file: columns `sku`, `location_code`, `opening_qty` | ERP Consultant | ☐ |
| 2.6 | Sat PM | Spot-check 10% of high-value SKUs against the CSV | Store Mgr | ☐ |

**PHASE 2 CHECKPOINT:**

| | |
|---|---|
| All locations counted: | ☐ YES |
| Double-count discrepancies resolved: | ☐ YES |
| balances.csv created with ______ rows: | ☐ YES |
| Spot-check passed: | ☐ YES |
| **GO / NO-GO Decision:** | ☐ GO &nbsp;&nbsp;&nbsp; ☐ NO-GO (Reason: _______________) |

---

### PHASE 3 — ETL EXECUTION (Saturday Evening)

> **Objective:** Run the APEX migration pipeline to load all data into the production database.

| # | Time | Action | Owner | Done |
|---|------|--------|-------|------|
| 3.1 | 18:00 | Place all 6 data files in `tools/migration/data/` on the production server | IT Admin | ☐ |
| 3.2 | 18:05 | **Take a database snapshot** before migration (for rollback capability) | IT Admin | ☐ |
| 3.3 | 18:10 | Run: `pnpm migrate` (full pipeline: Extract → Stage → Validate → Promote → Reconcile) | ERP Consultant | ☐ |
| 3.4 | — | Monitor console output for each phase completion | ERP Consultant | ☐ |
| 3.5 | — | **Extract & Stage:** Confirm all 6 files detected and rows staged | ERP Consultant | ☐ |
| 3.6 | — | **Validate:** Review validation output — note rejected row counts | ERP Consultant | ☐ |
| 3.7 | — | **Promote:** Monitor product promotion progress (46k products, ~5 minutes) | ERP Consultant | ☐ |
| 3.8 | — | **Reconcile:** Review reconciliation report | ERP Consultant | ☐ |

**Expected Console Output (healthy run):**

```
═══════════════════════════════════════════════
  APEX POS — Data Migration ETL Pipeline
═══════════════════════════════════════════════

── Phase 1+2: Extract & Stage ──
  Found 6 data files: locations.csv, suppliers.csv, products.csv, ...
  Processing: locations.csv → locations
  Processing: suppliers.csv → suppliers
  ...
  Staging complete: 6 batches created.

── Phase 3: Validate ──
  Validating locations batch xxxxxxxx...
    Valid: XX, Rejected: 0
  ...
  Validation complete.

── Phase 4: Promote ──
  Promoting locations batch xxxxxxxx...
    Promoted: XX locations (0 skipped)
  ...
    Products promoted: 5000 / 46000
    Products promoted: 10000 / 46000
    ...
    Products promoted: 46000 / 46000
  Promotion complete.

── Phase 5: Reconcile ──
  Overall: XXXXX of XXXXX rows promoted (100.0%)

  Migration pipeline complete.
```

---

### PHASE 4 — RECONCILIATION & VALIDATION (Saturday Evening / Sunday)

> **Objective:** Verify migrated data matches source files and physical counts.

| # | Time | Action | Owner | Done |
|---|------|--------|-------|------|
| 4.1 | — | Open reconciliation report at `tools/migration/data/reconciliation-report.txt` | ERP Consultant | ☐ |
| 4.2 | — | **Verify promotion rate:** should be ≥ 98% (some rejections expected for bad legacy data) | ERP Consultant | ☐ |
| 4.3 | — | **Review rejections:** Open `reconciliation-report.json` — check each rejected row's `validationErrors` | ERP Consultant | ☐ |
| 4.4 | — | Categorize rejections: data quality issues (fixable) vs. orphaned records (expected) | ERP Consultant | ☐ |
| 4.5 | — | If rejections are fixable: correct source CSV, re-run `pnpm migrate --phase extract` through reconcile | ERP Consultant | ☐ |
| 4.6 | — | **Spot-check live data in APEX:** | — | ☐ |
| 4.6a | — | Log into APEX POS → verify location count matches expected | Store Mgr | ☐ |
| 4.6b | — | Search for 10 random products by SKU → verify names, prices, categories correct | ERP Consultant | ☐ |
| 4.6c | — | Search for 5 random products by mnemonic SKU → verify mnemonic lookup works | ERP Consultant | ☐ |
| 4.6d | — | Search for 5 customers by phone → verify names, vehicle lists correct | Store Mgr | ☐ |
| 4.6e | — | Check inventory at warehouse for 10 high-volume SKUs → match physical count sheet | Warehouse Mgr | ☐ |
| 4.6f | — | Check inventory at retail store for 10 SKUs → match physical count sheet | Store Mgr | ☐ |
| 4.7 | — | **Verify KINGSCOBRA regeneration:** Pick 5 products → decode `mnemonic_cost_code` → confirm matches `current_cost_price` in centavos | ERP Consultant | ☐ |
| 4.8 | — | **Verify opening balance journals:** Run query: `SELECT COUNT(*) FROM stock_journal WHERE reference_type = 'OPENING_BALANCE'` → count should match `balances.csv` row count | IT Admin | ☐ |

**PHASE 4 CHECKPOINT — CRITICAL GO/NO-GO:**

| | |
|---|---|
| Promotion rate: | ______% |
| Rejections reviewed and acceptable: | ☐ YES |
| Product spot-check passed (10/10): | ☐ YES |
| Customer spot-check passed (5/5): | ☐ YES |
| Inventory spot-check passed (20/20): | ☐ YES |
| KINGSCOBRA codes verified (5/5): | ☐ YES |
| Opening balance journal count matches: | ☐ YES |
| **FINAL GO / NO-GO Decision:** | ☐ **GO-LIVE** &nbsp;&nbsp;&nbsp; ☐ **ROLLBACK** (see Rollback Procedure) |

---

### PHASE 5 — GO-LIVE (Monday Morning)

> **Objective:** Open the new system for business.

| # | Time | Action | Owner | Done |
|---|------|--------|-------|------|
| 5.1 | 07:00 | Cutover Lead sends **GO-LIVE confirmation** to all staff | Cutover Lead | ☐ |
| 5.2 | 07:00 | Distribute printed Day 1 Fallback Plan (SOP-FALLBACK-001) to every terminal | Cutover Lead | ☐ |
| 5.3 | 07:15 | All staff log into APEX POS with their assigned credentials | All Staff | ☐ |
| 5.4 | 07:15 | Each user selects their assigned location | All Staff | ☐ |
| 5.5 | 07:15 | ERP Consultant and IT Admin on-site at primary location for support | Support Team | ☐ |
| 5.6 | 07:30 | **First live transaction** — supervised by Cutover Lead | Cashier + Lead | ☐ |
| 5.7 | 07:30 | Verify: sale completed, stock deducted, sale number assigned | Cutover Lead | ☐ |
| 5.8 | 08:00 | Open remaining POS terminals for normal business | Store Mgr | ☐ |
| 5.9 | 12:00 | **Midday check-in:** Review first morning's transactions, any issues? | Cutover Lead | ☐ |
| 5.10 | 17:00 | **End-of-day review:** Transaction count, inventory spot-check on 5 fast-moving SKUs | Store Mgr | ☐ |

---

### PHASE 6 — HYPERCARE (Days 1–5)

> **Objective:** Intensive monitoring and support for the first business week.

| # | Day | Action | Owner | Done |
|---|-----|--------|-------|------|
| 6.1 | Day 1–5 | ERP Consultant available on-site or on-call during business hours | ERP Consultant | ☐ |
| 6.2 | Day 1–5 | IT Admin monitors server health, database performance, error logs | IT Admin | ☐ |
| 6.3 | Day 1 | Run `GET /health` check every 2 hours | IT Admin | ☐ |
| 6.4 | Day 2 | Verify PO receiving workflow with first real supplier delivery | Warehouse Mgr | ☐ |
| 6.5 | Day 3 | Verify first inter-store transfer end-to-end | Store Mgr | ☐ |
| 6.6 | Day 3 | Verify first job card lifecycle end-to-end (real customer) | Store Mgr | ☐ |
| 6.7 | Day 5 | Run BI reports (Reports page) — verify KPIs populate correctly | Cutover Lead | ☐ |
| 6.8 | Day 5 | **Formal hypercare exit:** All critical workflows executed successfully | Cutover Lead | ☐ |

---

## Rollback Procedure

If a **NO-GO** decision is made at any Phase 4 checkpoint:

| # | Action | Owner | Time |
|---|--------|-------|------|
| R1 | **Stop** — do not open APEX POS to staff | Cutover Lead | Immediate |
| R2 | Restore production database from Phase 3 pre-migration snapshot | IT Admin | ~15 min |
| R3 | Re-enable legacy system user logins | IT Admin | ~5 min |
| R4 | Send **ROLLBACK notification** to all staff: "Use legacy system until further notice" | Cutover Lead | Immediate |
| R5 | Investigate root cause of data issues | ERP Consultant | — |
| R6 | Fix data files and schedule re-attempt for next weekend | Cutover Lead | — |

---

## Emergency Contacts

| Role | Name | Phone | Available |
|------|------|-------|-----------|
| Cutover Lead | ________________ | ________________ | Cutover weekend + Day 1–5 |
| IT Administrator | ________________ | ________________ | Cutover weekend + Day 1–5 |
| ERP Consultant | ________________ | ________________ | Cutover weekend + Day 1–5 |
| Warehouse Manager | ________________ | ________________ | Count night + Day 1–5 |
| Store Manager | ________________ | ________________ | Count night + Day 1–5 |

---

*End of Document — SOP-CUTOVER-001*
