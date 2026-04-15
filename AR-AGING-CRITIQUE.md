# AR Aging Report — Critique Report

## Summary Score
**Overall: 3/10** — The report has correct structure but fundamentally broken aging calculation that makes the numbers misleading.

---

## Aging Calculation Analysis

| Aspect | Finding | Assessment |
|--------|---------|------------|
| **Base date** | `recorded_at` (transaction date) | WRONG — should use due date (invoice date + payment terms) |
| **Payment terms** | NOT factored in | CRITICAL BUG — all customers are Net 30 but terms are ignored |
| **Per-transaction or per-customer** | Per-transaction (CHARGE only) | Correct approach, wrong execution |
| **Payment allocation** | NOT used in aging | CRITICAL — payments not subtracted from charge buckets |
| **Credit memos** | NOT factored into buckets | BUG — credits reduce balance but not bucket amounts |
| **Voided items** | No explicit exclusion | Minor concern |

### The Core Bug: Bucket Sums ≠ Total Column

**Measured mismatch: ₱1,791,151.52** (49% inflation)

| Metric | Value |
|--------|-------|
| Bucket sum (charges only) | ₱5,413,449.44 |
| Actual AR balance | ₱3,622,297.92 |
| Mismatch | ₱1,791,151.52 |

The aging buckets sum GROSS CHARGE amounts (`ct.type = 'CHARGE'`) but the Total column uses NET balance (`c.current_balance`). Every customer who has ever made a payment or received a credit will show inflated bucket numbers that don't add up to their total.

**Example — CBS:**
- Total (current_balance): ₱303,640
- Bucket sum: ₱361,370 (Current ₱47,395 + 31-60 ₱100,340 + 61-90 ₱114,315 + 90+ ₱99,320)
- Difference: ₱57,730 = ₱54,480 payments + ₱3,250 credits

The report tells you CBS has ₱99,320 over 90 days, but some of that may have been paid. There's no way to know from the aging data.

---

## What's Working Well

1. **Correct table structure** — Customer + 4 aging buckets + Total is standard format
2. **Sorted by largest balance** — default descending by total is the right default
3. **CSV export** — functional, generates correct headers
4. **Summary cards** — Total Receivables and Customers with Balance
5. **Totals row** at bottom of table
6. **Performance** — denormalized `current_balance` avoids full transaction scan for totals
7. **Per-transaction aging** — each CHARGE is aged individually (correct approach)

---

## Critical Issues

### 1. BUCKET AMOUNTS ARE GROSS, NOT NET (Severity: CRITICAL)
**Location:** `service.ts` line 1099-1102

Buckets sum `ct.amount` for CHARGE transactions only. Payments and credits are NOT subtracted. A customer who charged ₱100K and paid ₱90K shows ₱100K across buckets but ₱10K in Total. The buckets are meaningless for collection decisions.

**Impact:** Collections clerk sees ₱99K in 90+ for CBS, but some of that is already paid. They can't trust the bucket amounts for prioritization.

**Fix:** Use `ar_payment_allocations` to compute NET per-charge balance, then age the remaining balance. Or compute aging from the NET perspective: distribute `current_balance` across age buckets proportionally to unpaid charges.

### 2. PAYMENT TERMS NOT FACTORED IN (Severity: HIGH)
**Location:** `service.ts` line 1099 — uses `NOW() - INTERVAL '30 days'`

All 83 customers are Net 30. A charge from 25 days ago is in the "Current" bucket — technically correct since it's within terms. But a COD charge from 2 days ago should be "Overdue" immediately. The aging doesn't consider `payment_terms_days` at all.

**Current:** Aging = `today - recorded_at`
**Correct:** Aging = `today - (recorded_at + payment_terms_days)` — age from due date, not charge date

**Impact:** A charge made 45 days ago to a Net-60 customer shows as "31-60 days" (suggesting it's overdue) when it's actually still within terms (15 days before due). False alarm for the collections clerk.

### 3. NO "AS OF" DATE SELECTOR (Severity: MEDIUM)
**Impact:** Cannot run point-in-time aging for month-end close. Cannot compare aging month-over-month. Every financial report needs an "as of" date for audit and reconciliation.

### 4. NO DRILL-DOWN TO TRANSACTIONS (Severity: MEDIUM)
**Impact:** Clerk sees a customer owes ₱130K in the 90+ bucket but can't see WHICH charges are overdue. Must navigate away to find the detail. A drill-down from any bucket cell to its constituent transactions is standard.

---

## Data Accuracy Concerns

1. **Cross-reference with Customer List ₱3.6M total:** ✅ MATCHES (₱3,622,297.92)
2. **Bucket sums vs Total column:** ❌ MISMATCH by ₱1.79M (49% inflated)
3. **Customer count:** ✅ MATCHES (83 customers with balance)
4. **Top customer (Lass Automotive ₱743,625):** Charges ₱756,255 - Credits ₱12,630 = ₱743,625 ✅ balance correct, but bucket sum would be ₱756,255 ❌

---

## Missing Standard Features

1. **"As of" date selector** — can't run for past dates
2. **Payment-terms-adjusted aging** — "Current" should mean "within terms", not "within 30 days"
3. **Net aging** (charges minus allocated payments) — buckets show gross, not net
4. **Per-customer drill-down** — click bucket → see individual charges
5. **Customer type filter** (Individual/Shop/Fleet/Wholesale) — no filtering
6. **Percentage of total per bucket** — how much is current vs severely overdue?
7. **Print-friendly layout** — no print view
8. **Date range filter** — can't filter to specific period
9. **SOA integration** — can't generate SOA from the aging report
10. **Trending/comparison** — can't compare to last month's aging

---

## UX Problems

1. **Misleading bucket numbers** — user sees bucket amounts that are HIGHER than the total, which is confusing and breaks trust in the report
2. **No visual emphasis on overdue** — 90+ days should be red/bold; currently same styling as other buckets
3. **Only 2 summary cards** — should also show Overdue Amount, Average Days Outstanding
4. **No way to take action** — can't generate SOA, send reminder, or record payment from this page
5. **No empty bucket indicator** — ₱0 values show as "₱0.00" instead of "—" for visual clarity

---

## Code Quality Issues

1. **Monolithic page** (362 lines) — should be split into components (table, cards, filters, export)
2. **Aging logic is server-side** — correct, but the SQL is a single hardcoded query with no parameterization for bucket boundaries or date offsets
3. **No index for aging query** — `customer_transactions` lacks a composite index on `(org_id, type, recorded_at)`, potential full scan
4. **`ar_payment_allocations` table exists but unused** — the correct payment allocation infrastructure is built but the aging report ignores it
5. **60-second stale time** on React Query — reasonable for a report
6. **No error boundary** — loading state exists but no granular error handling

---

## Recommended Refactor Plan

### Phase 1: Fix Aging Calculation (URGENT)

The #1 fix is making bucket amounts NET (after payments) instead of GROSS.

**Approach A (Ideal):** Use `ar_payment_allocations` to compute per-charge remaining balance, then age each charge's remaining balance:
```sql
-- For each CHARGE: remaining = charge.amount - SUM(allocations to this charge)
-- Then age each charge's REMAINING balance based on its due date
```

**Approach B (Simpler):** Distribute `current_balance` across age buckets proportionally to gross charges. This gives approximate NET aging without per-charge allocation tracking.

### Phase 2: Report Layout & Features

1. Add "As of" date selector (default: today)
2. Add customer type filter dropdown
3. Add percentage column per bucket
4. Color-code 90+ bucket (red), 61-90 (orange)
5. Add click-to-drill-down on bucket cells
6. Split into components (AgingTable, AgingFilters, AgingSummary)
7. Add print layout

### Phase 3: Actionable Features

1. Row click → navigate to customer detail
2. Bulk action: select customers → generate SOAs
3. "Export overdue" button (only 90+ customers)
4. Add "Days Since Last Payment" column
5. Month-over-month comparison view
