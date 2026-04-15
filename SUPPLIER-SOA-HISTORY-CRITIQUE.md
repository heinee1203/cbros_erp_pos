# Supplier SOA History Page — Critique Report

## Summary Score
Overall: 6.5/10

The page is functional and has received solid recent improvements (aging column, aging filter, footer stats, SOA# shortening). However, it suffers from a monolithic 440-line file, missing invoice preview, no supplier filter dropdown, silent error handling, and a disconnected SOA-to-DV lifecycle that makes it hard for the AP clerk to track payment status. The underlying SOA generation flow (on the separate `/ap/supplier-soa` page) has duplicated reprint logic across 3 locations and fragile confirmation dialogs.

---

## Recent Improvements Already Made
1. Aging column with color-coded badges (Current / 30 / 60 / 90+ Days)
2. Aging filter dropdown (client-side, excludes VOID and zero-balance)
3. Footer summary stats with aging breakdown (90+: ₱X, Total: ₱X)
4. SOA number shortened in display (stripped "SUPP-SOA-" prefix)
5. Overlap fix (layout collision between elements)

---

## What's Working Well
1. **Server-side search** — searches SOA # and supplier name via ILIKE, triggered by Enter key
2. **Status filter** — cleanly implemented with 4 options (All, Generated, Sent, Void)
3. **Pay button** — correctly routes to `/ap/disbursement-vouchers/new?soaId=X&supplierId=Y`, enabling DV pre-fill
4. **Void workflow** — proper confirmation dialog with SOA number, supplier, and amount displayed before voiding
5. **Aging badges** — visually clear color coding (green/amber/orange/red)
6. **Footer aging breakdown** — correctly excludes VOID and zero-balance SOAs from the calculation
7. **Reprint flow** — fetches frozen snapshot data and opens print-friendly HTML in new window
8. **Double-billing guard** — backend prevents same invoice from being included in multiple non-void SOAs
9. **Frozen line item snapshots** — reprints show historical state at generation time, not current invoice state (correct for audit)
10. **Date range filter** — server-side filtering on SOA generation date

---

## Critical Issues

### 1. No PAID / PARTIALLY_PAID Status on SOA Record
**Impact:** The AP clerk cannot filter or sort by payment status. An SOA with totalBalance=0 and totalPaid=totalAmount still shows status "GENERATED" — the user must manually compare the Paid and Balance columns to determine if it's been paid.

**Current state:** SOA statuses are only GENERATED, SENT, VOID. Payment status is derived client-side from `totalPaid` vs `totalAmount`, but never persisted.

**Suggested fix:** Either add PAID/PARTIALLY_PAID status transitions (auto-set when DV is confirmed), or add a computed "Payment Status" column derived from the balance.

### 2. SOA Status Doesn't Auto-Update When DV Is Confirmed
**Impact:** When a DV linked to an SOA is confirmed, the SOA's `total_paid` and `total_balance` are updated, but the SOA `status` stays "GENERATED". There is no automatic transition to reflect that payment has been applied. The user must manually compare amounts.

**Backend evidence:** `confirmDisbursementVoucher()` in service.ts updates SOA's `total_paid` and `total_balance` but never touches `status`.

**Suggested fix:** After DV confirm, check if `total_balance <= 0.005` and auto-set status to "PAID". If partial, set "PARTIALLY_PAID".

### 3. No Invoice Preview Without Reprinting
**Impact:** The AP clerk cannot see which invoices are on an SOA without clicking "Reprint" and waiting for a print window to open. This is slow and wasteful — they just want to peek at the invoice list.

**Suggested fix:** Add an expandable row or detail drawer that shows the SOA's invoice line items inline (invoice #, date, amount, balance at generation).

### 4. Reprint Fails Silently
**Impact:** If the API call to fetch the SOA snapshot fails, the user gets no feedback — the button does nothing.

**Code:** `soa-history/page.tsx` line 130: `catch {}` — empty catch block.

**Suggested fix:** Show error notification on reprint failure.

---

## Data Accuracy Concerns

### 1. Aging Calculation Uses `dateTo` (Period End), Not `generatedAt`
The `getAgingDays()` function (line 42-45) calculates aging from `dateTo` (the latest invoice date in the SOA). This is the correct choice for AP aging (age of the debt), but should be documented since users might expect it to age from the generation date.

### 2. SOA with ₱0 Balance Still Shows "GENERATED"
Live data shows: `SUPP-SOA-2026-0005` has `totalPaid=₱24,500` and `totalBalance=₱0` but status is still "GENERATED". This is misleading — it looks unpaid at a glance because the status badge is blue ("GENERATED"), not green.

### 3. Footer Stats Only Show One Aging Bucket If Data Is Sparse
Current footer: `90+: ₱95,789.28 | Total: ₱95,789.28` — only the 90+ bucket is shown because all non-void, non-zero SOAs happen to be 90+ days old. The display is correct but lacks context (should show all 4 buckets even if zero).

### 4. No Validation That SOA Totals Match Invoice Sums
There is no reconciliation check. If the SOA's `total_amount` drifts from the sum of its line items (due to a bug or manual DB edit), the page would show incorrect data without warning.

---

## UX Problems

### 1. 11 Columns Is Too Many
The table has: SOA #, Supplier, Period, Amount, Paid, Balance, Inv, Aging, Status, Actions — that's a lot for an AP clerk to scan. The "Amount" and "Paid" columns are secondary to "Balance" (what's owed).

**Suggested fix:** Hide Amount and Paid by default. Show Balance as primary. Add "of ₱X" notation for partially paid SOAs (same pattern as the invoice refactor).

### 2. No Supplier Filter Dropdown
The user can only find a specific supplier by typing in the search box. There's no dropdown to select from a list of suppliers.

**Suggested fix:** Add a supplier dropdown like the invoices page has.

### 3. No Sort by Amount or Balance
No columns are sortable. The user can't sort by largest balance (most urgent to pay) or by aging.

**Suggested fix:** Add client-side sorting on at least Balance, Amount, Aging, and Date columns.

### 4. Hard-Coded Limit of 100 Records, No Pagination
The API call uses `limit=100` with no pagination UI. If there are more than 100 SOAs, the user only sees the first 100 with no way to access the rest.

**Suggested fix:** Add cursor-based pagination (same pattern as invoices page).

### 5. No Link to Related DV
When an SOA has been paid via a DV, there's no way to see which DV paid it from this page. The user must go to the DV list and search.

**Suggested fix:** Show DV number next to "Paid" amount, or in the invoice preview drawer.

### 6. Search Requires Enter Key
Unlike the invoices page (which debounces), the SOA history search requires pressing Enter. This is inconsistent UX.

### 7. Supplier Name Clicks Go to List, Not Detail
Clicking a supplier name routes to `/ap/suppliers` (the full list) instead of filtering or highlighting the specific supplier.

### 8. Void Button Visible for SOAs That Can't Be Voided
The Void button only appears for GENERATED status with zero payments, which is correct. But there's no visual explanation for why the Void button is missing on paid SOAs — the user might wonder why they can't void it.

---

## Missing Features (High Priority)

### 1. Invoice Line Item Preview
Expandable row or drawer showing the SOA's invoices without reprinting. Critical for daily AP workflow.

### 2. Payment Status Indicator
Visual indicator for payment state: Unpaid / Partially Paid / Fully Paid. Currently all non-void SOAs show "GENERATED" regardless of payment.

### 3. CSV / Excel Export
Export the current filtered view for reporting. Use existing `downloadCSV` utility.

### 4. Supplier Filter Dropdown
Server-side supplier filter like the invoices page.

### 5. Column Sorting
At minimum: Balance, Amount, Date (ascending/descending).

### 6. "Generate SOA" Quick Action
Currently users must navigate to the separate `/ap/supplier-soa` page to generate SOAs. A button or link on this page would streamline the workflow.

---

## Missing Features (Nice to Have)

### 1. "Mark as Sent" Bulk Action
Select multiple SOAs and change status from GENERATED to SENT.

### 2. DV Link Column
Show the DV number that paid this SOA (if any), clickable to the DV detail.

### 3. SOA-to-SOA Comparison
Compare this month's SOAs vs. last month's for trend analysis.

### 4. Reminder/Follow-Up Workflow
Flag overdue unpaid SOAs for follow-up, with notes.

### 5. Pagination
Cursor-based pagination for >100 SOAs.

### 6. All-Zero Aging Buckets in Footer
Show all 4 aging buckets in footer even when empty (Current: ₱0, 30d: ₱0, etc.)

---

## Code Quality Issues

### 1. Monolithic 440-Line File
`soa-history/page.tsx` is a single file with inline void dialog, data fetching, filtering, table rendering, and footer stats. Should be split into components like the invoices page refactor.

### 2. Unused State Variable
Line 64: `const [total, setTotal] = useState(0)` — set from API response but never rendered or used.

### 3. `any` Types (3 instances)
- Line ~130: `apiFetch<any>` for SOA snapshot
- Line ~131: `.map((i: any) => ...)`
- Line ~92: `catch (err: any)`

### 4. Duplicated Reprint Logic (3 locations across 2 files)
The reprint pattern (fetch snapshot → map invoices → build HTML → window.open → print) is copy-pasted in:
- `soa-history/page.tsx` line 106-131
- `supplier-soa/page.tsx` lines 186-199, 256-278

Should be extracted to a shared utility function.

### 5. Mixed Confirmation Patterns
- `soa-history/page.tsx` uses a custom modal dialog for void confirmation (good)
- `supplier-soa/page.tsx` line 282 uses `window.confirm()` (bad, inconsistent)

### 6. Status Color Constants Not Shared
Status colors are defined inline in both `soa-history/page.tsx` (line 29) and `supplier-soa/page.tsx` (line 493-497) — duplicated and not centralized.

### 7. Aging Logic Duplicated
`getAgingDays()` and aging bucket classification are in `soa-history/page.tsx` but would be needed by any other page that shows SOA aging.

### 8. No Error UI for Reprint/Void Failures
Reprint: empty catch block (line 130)
Void: shows error in notification but reprint doesn't

---

## SOA Generation Flow Issues

### 1. Two Separate Pages for SOA Management
SOA generation lives on `/ap/supplier-soa` and SOA history/review lives on `/ap/soa-history`. The user must navigate between them. Consider whether these should be unified or at least cross-linked.

### 2. No "Quick Generate" From SOA History Page
The AP clerk reviewing old SOAs cannot generate a new SOA from this page — they must navigate to `/ap/supplier-soa`, find the supplier, expand the row, select invoices, then generate. This is 4-5 clicks minimum.

### 3. Check Voucher Button on SOA Generation Page
`supplier-soa/page.tsx` has a "Check Voucher" button that routes to the dead `/ap/check-vouchers/new` module (same bug we fixed on the invoices page). This should be removed or updated.

### 4. "Preview All (no record)" Button Is Confusing
The button label "Preview All (no record)" is unclear. It generates an ephemeral print of all outstanding invoices without creating a persistent SOA. The distinction between this and "Generate SOA" is not obvious to users.

### 5. No Batch SOA Generation
Can only generate SOAs one supplier at a time. For month-end processing of 20+ suppliers, this is tedious.

---

## Print Template Issues

### 1. SOA Print Template Is Clean and Professional
`supplier-soa-html.ts` (108 lines) produces a clean 3-column table (Invoice Date | Invoice # | Amount) with company header, period info, and signature blocks. This is well-structured.

### 2. Company Name Hardcoded
"C-BROS GENUINE AUTOPARTS & ACCESSORIES" is hardcoded in the template. Should come from org settings.

### 3. No Deduction / Credit Summary on Print
If an SOA is paid via DV with deductions (EWT, credit memos), the printed SOA doesn't show what was deducted. Only gross amounts appear.

### 4. No Payment Summary on Reprint
When reprinting a fully-paid SOA, the print doesn't indicate it's been paid or show payment details. Users might confuse it with an active statement.

---

## Relationship with Other Modules

### SOA → Invoices
- **Working correctly:** Invoices are marked `billed=true` when included in an SOA, preventing double-billing.
- **Working correctly:** Voiding an SOA unmarks invoices so they can be re-billed.
- **Missing:** No way to see from the SOA history which invoices are included without reprinting.

### SOA → DV
- **Working correctly:** "Pay" button routes to DV creation with SOA pre-fill.
- **Working correctly:** DV confirmation updates SOA's total_paid and total_balance.
- **Missing:** SOA status doesn't auto-update to PAID when DV is confirmed.
- **Missing:** No reverse link — can't see which DV paid the SOA from this page.
- **Risk:** Voiding an SOA after DV is confirmed creates orphaned DV (DV points to voided SOA).

### SOA → Supplier
- **Partially working:** Supplier name is clickable but routes to the full supplier list, not the specific supplier.

### DV → SOA (reverse direction)
- **Working correctly:** DV voidance reverses payments from SOA invoices.
- **Bug:** When a check bounces, credit memo deduction marks are NOT reversed (they should be).

---

## Recommended Refactor Plan

### Phase 1: Critical Fixes
1. Add payment status indicator (derived column showing Unpaid/Partial/Paid based on balance vs amount)
2. Fix reprint silent failure — show error notification
3. Remove dead "Check Voucher" button from supplier-soa page (same fix as invoices)
4. Add all 4 aging buckets to footer (even when zero)

### Phase 2: UX Improvements
1. Add inline invoice preview (expandable row or drawer)
2. Add supplier filter dropdown
3. Add column sorting (Balance, Amount, Date)
4. Reduce table to fewer visible columns (hide Amount/Paid, merge into Balance)
5. Add debounced search (replace Enter-key requirement)
6. Add CSV export

### Phase 3: Feature Additions
1. Add auto-status transitions (GENERATED → PAID when DV confirmed and balance=0)
2. Add DV link column (show which DV paid the SOA)
3. Add "Generate SOA" link/button on this page
4. Add cursor-based pagination (replace hard-coded limit=100)
5. Add "Mark as Sent" bulk action

### Phase 4: Code Quality
1. Split 440-line page into components (table, filters, footer, void dialog)
2. Extract shared reprint utility (used by both soa-history and supplier-soa pages)
3. Centralize status color constants
4. Extract aging calculation utility
5. Remove unused `total` state variable
6. Replace `any` types with proper interfaces
7. Use consistent confirmation pattern (modal, not window.confirm)
