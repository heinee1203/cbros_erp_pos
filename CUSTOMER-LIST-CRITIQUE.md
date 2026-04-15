# Customer List Page — Critique Report

**Date:** 2026-04-14
**Files audited:**
- `apps/web/src/app/customers/page.tsx` (550 lines)
- `apps/web/src/app/customers/[id]/page.tsx` (2,417 lines)
- `apps/api/src/modules/customers/routes.ts` (573 lines)
- `apps/api/src/modules/customers/service.ts` (1,553 lines)
- `apps/web/src/hooks/use-customers-query.ts` (250 lines)
- `packages/database/src/schema/customers.ts` (67 lines)
- `packages/database/src/schema/customer-transactions.ts` (66 lines)
- `packages/database/src/schema/soa-records.ts` (39 lines)

---

## Summary Score: 6/10

The Customer List page is functional and has an impressive backend feature set (SOA generation, payment recording, multi-customer payments, invoice-level allocations, aging report). However, it suffers from a **critical overdue calculation bug** inflating the Overdue KPI to near-100%, a **SQL injection vulnerability** in the SOA search route, misleading data presentation (phone column showing customer codes), and two entirely empty columns wasting screen space. The code is reasonably well-structured but the detail page is a 2,400-line monolith.

---

## What's Working Well

1. **Server-side search with ref number support** — Searching "Q3173" finds the customer via their invoice number and displays the matched reference inline with date and amount. Clever and genuinely useful for AR clerks who get asked "who was invoice Q3173 for?" (`service.ts:50-81`)
2. **Rich filter system** — Type filter chips (Individual/Shop/Fleet/Wholesale), balance/billing status dropdown (With Balance, Unbilled, Fully Billed, No Charges), and date range picker. Server-side where it matters, client-side for quick toggles.
3. **Comprehensive detail page** — Tabbed view with Transactions, Sales History, Statement of Account, SOA History, Payment History, Credit Memos. Payment recording supports split payments (Cash + Check + GCash), EWT deduction, invoice-level allocation, and automatic SOA status recomputation.
4. **SOA generation and reprint** — Full SOA lifecycle: generate from unbilled charges, track status (GENERATED/SENT/PAID/VOID), reprint historical SOAs from stored line items (fixed the Lucky Se7en bug where date-range reprints were wrong).
5. **Multi-customer payment page** — Dedicated page for recording a single check covering multiple customer accounts — common in PH auto parts (fleet companies sending one check for all their branches).
6. **Clean billing status column** — The STATUS column clearly shows "Billed" vs "X unbilled" with appropriate color coding, directly answering "who needs an SOA generated?"
7. **Export CSV** — Works, exports all visible customers with key fields.
8. **Soft delete with balance guard** — Cannot deactivate a customer with outstanding balance (`service.ts:317-320`). Good business rule.

---

## Critical Issues (Must Fix)

### 1. CRITICAL BUG: Overdue calculation is fundamentally wrong — 79/83 is NOT real

**Location:** `apps/api/src/modules/customers/service.ts:1531-1545`

The overdue query checks:
```sql
AND EXISTS (
  SELECT 1 FROM customer_transactions ct
  WHERE ct.customer_id = c.id AND ct.org_id = c.org_id
    AND ct.type = 'CHARGE'
    AND ct.recorded_at < NOW() - (c.payment_terms_days || ' days')::interval
)
```

This finds customers who have **ANY charge transaction** older than their payment terms — *regardless of whether that charge has been paid*. Since charges are never deleted from `customer_transactions`, virtually every customer who has been active for more than 30 days will have at least one old charge record, even if it's been fully paid.

**Result:** 79 out of 83 customers with a balance show as "overdue" — a 95% overdue rate. The only 4 customers NOT overdue would be those whose *entire transaction history* is newer than their payment terms. This is a **false alarm** that makes the KPI card useless and desensitizes users to real overdue accounts.

**The fix needs to:** Check whether unpaid/unallocated charges exist that are older than payment terms. This requires joining with `ar_payment_allocations` or checking if the charge's allocated amount fully covers its amount. A simple approximation: only count unbilled charges (`billed = false`) older than terms, since billed+paid charges are no longer actionable.

**Impact:** The red "Overdue: 79 customers / ₱3,539,323.92" card is alarming but meaningless. An AR clerk cannot act on it.

### 2. SECURITY: SQL Injection in SOA Search Route

**Location:** `apps/api/src/modules/customers/routes.ts:150-168`

```typescript
const conditions: string[] = [`s.org_id = '${orgId}'`];
if (q.status) conditions.push(`s.status = '${q.status.replace(/'/g, "''")}'`);
if (q.dateFrom) conditions.push(`s.generated_at >= '${q.dateFrom}'`);
if (q.dateTo) conditions.push(`s.generated_at <= '${q.dateTo}'`);
```

The `dateFrom` and `dateTo` parameters are **not escaped at all** — they're interpolated directly into `sql.raw()`. Even `status` and `search` only have single-quote escaping, which may be bypassable depending on Postgres `standard_conforming_strings` setting or via backslash sequences.

**Fix:** Use Drizzle's parameterized `sql` template tag instead of `sql.raw()` with string concatenation. Every other query in the codebase uses parameterized queries correctly — this is the one exception.

### 3. "Phone" Column Actually Shows Customer Codes, Not Phone Numbers

**Live data:** 100 out of 101 customers have "AR-XXXX" in the Phone column (e.g., AR-0012, AR-0086, AR-0101). One has "N/A". Zero have actual phone numbers.

The database schema defines `phone VARCHAR(50)` and the New Customer form placeholder says "0917-XXX-XXXX", but the actual data uses this field as a **customer account code**. This means:
- The "Phone" column header is misleading
- There is no actual phone number stored for any customer
- The customer code (AR-XXXX) is useful but should be labeled "Code" or "Account"
- A separate phone field is needed if phone numbers are desired

---

## Data Accuracy Concerns

### 4. KPI "Total Customers" Changes With Filters — Inconsistent With Other Cards

When the SHOP type filter is active, the "Total Customers" card shows 56 (filtered count) because it uses `customers.length` (line 161). But the other 4 KPI cards (With Balance, Total Receivables, Overdue, Avg Balance) use a separate `summaryQuery` that is **never filtered**. So you see "Total Customers: 56" next to "With Balance: 83" — the 83 is org-wide while the 56 is filtered. This is confusing.

### 5. Aging Report Sums ALL Charges, Not Just Unpaid

**Location:** `apps/api/src/modules/customers/service.ts:1095-1119`

The aging query sums charge amounts by age bucket but doesn't exclude charges that have been paid. A charge from 6 months ago that was fully paid still appears in the "over90" bucket. The `total` column uses `c.current_balance` (correct), but the aging buckets use raw charge amounts (incorrect). This means the sum of aging buckets likely exceeds the customer's actual balance.

### 6. Biscast Has Balance But No Purchases

Observed in live data: customer "Biscast" shows a balance of ₱6,479.55 but Spent shows "—" (totalPurchases = 0). This likely means the balance was created via an ADJUSTMENT transaction rather than a CHARGE, or the `totalPurchases` wasn't updated when the charge was recorded. The `totalPurchases` field on the customers table is a denormalized counter — if it drifts from reality, there's no reconciliation mechanism.

---

## UX Problems

### 7. Two Columns Are Completely Empty — Pure Visual Noise

- **TIER column:** 101/101 customers show "—". No customer has a tier assigned. This column takes 112px of horizontal space for zero information.
- **CREDIT LIMIT column:** 101/101 customers show "—". No credit limit is set for any customer. Another 112px wasted. The detail page shows "Unlimited" for 0.00 credit limit, which is a reasonable interpretation, but the list page just shows dashes.

**Recommendation:** Hide these columns until data is populated, or collapse them into a tooltip/detail view.

### 8. BALANCE vs SPENT Confusion

- **Balance** = current outstanding AR balance (what they owe now)
- **Spent** = total historical purchases (what they've bought all-time, or in the selected period)

These are NOT always equal (47 equal, 54 different in live data). They serve different purposes, but the column names are ambiguous. A customer with ₱0 Balance and ₱31,900 Spent (like Bagama HVAC) is actually a GOOD customer who pays their bills — but the ₱0 balance in red/green doesn't convey that clearly.

When a date range is selected, the "Spent" header changes to "Period" — this is good but subtle.

### 9. No "Last Activity" or "Last Payment" Date

An AR clerk's key question is "when did this customer last pay?" The list shows no temporal information. Adding "Last Payment" or "Last Activity" columns (instead of the empty Tier/Credit Limit) would be far more useful for collection prioritization.

### 10. Overdue Card Is Alarming But Not Actionable

The red "Overdue: 79 customers / ₱3,539,323.92" card creates urgency but offers no path to action. Clicking it does nothing. There's no way to filter the list to show only overdue customers, sort by days overdue, or navigate to a collection worklist. The AR Aging Report page exists in the sidebar but isn't linked from this card.

### 11. No Quick-Action Buttons on List Rows

To record a payment, generate an SOA, or view transactions, the user must click through to the detail page first. For a busy AR clerk processing payments, adding row-level action buttons (or at least a right-click context menu) for "Record Payment" and "Generate SOA" would save clicks.

### 12. Hardcoded "Naga City" in New Customer Form

**Location:** `apps/web/src/app/customers/page.tsx:491-492`

```tsx
<input type="text" disabled value="Naga City"
  className="... bg-muted ... text-muted-foreground" />
```

The City field is hardcoded and disabled. This won't scale to multiple locations and the value isn't even sent to the backend. It's confusing — either make it editable or remove it.

---

## Redundant/Unnecessary Elements

| Element | Issue | Recommendation |
|---------|-------|----------------|
| TIER column | 0/101 populated | Hide until tiers are configured |
| CREDIT LIMIT column | 0/101 populated | Hide until credit limits are set |
| "Phone" label | Shows AR-XXXX codes | Rename to "Code" / "Account No." |
| City field (form) | Hardcoded "Naga City" | Remove or make editable |
| Avg Balance KPI | Calculated client-side from two other KPIs | Low-value metric, consider replacing with "Unbilled" count |

---

## Missing Features (High Priority)

### Must-have for AR workflow:

1. **Overdue filter on list page** — "Show only overdue customers" with days-overdue sort. Currently no way to filter the list to actionable overdue accounts.

2. **Quick payment recording from list** — Row-level "Record Payment" button or a batch payment mode where the clerk can process multiple payments without navigating in/out of detail pages.

3. **Collection list print** — A printable collection summary that a field collector can take: customer name, AR code, address, amount due, last payment date. This is standard in PH auto parts AR workflows.

4. **Last payment date visible on list** — When did this customer last pay? Critical for collection prioritization. Currently requires clicking into each customer's detail page.

5. **Batch SOA generation** — Generate SOAs for all unbilled customers at once. Currently must be done one-by-one through each customer's detail page. There are 36 customers with unbilled charges — doing them individually is tedious.

6. **Credit limit enforcement at POS** — Credit limits exist in the schema (`credit_limit` column) but no customer has one set. There's a `CreditLimitError` class in `service.ts:14-23` suggesting it's partially implemented, but it's not enforced in the POS checkout flow based on the fact that zero customers have limits configured.

### Nice-to-have:

7. **Customer notes visible on hover/list** — Notes exist in the schema but aren't shown on the list page.
8. **PDC (Post-Dated Check) tracking** — Common in PH; checks received but not yet deposited. The `checkDate` field exists on payments but there's no PDC management view.
9. **SMS/notification for overdue** — Not present. Would require integration with a PH SMS gateway.
10. **Customer merge** — If duplicates exist, there's no way to merge two customer records.
11. **Customer statement email** — No email capability for sending SOAs.
12. **Running balance in list** — Show how the balance has changed over time (trending up/down indicator).

---

## Code Quality Issues

### 13. Detail Page Is a 2,417-Line Monolith

**Location:** `apps/web/src/app/customers/[id]/page.tsx` — 2,417 lines in a single file

This file contains:
- Customer header and info cards
- Edit customer modal
- Transaction list with filters
- Transaction action modals (reassign, edit amount, delete)
- Statement of Account tab with SOA generation
- SOA history tab
- Payment recording modal with split payments, EWT, invoice-level allocation
- Payment receipt builder
- Auto-highlight from query params
- Auto-open payment from query params

This is the largest single component file in the frontend. It should be broken into at least 6-8 sub-components.

### 14. `any` Types Scattered Throughout

- `routes.ts:40` — `AR_ROLES.includes(role as any)`
- `routes.ts:358` — `const body = request.body as any`
- `service.ts:85` — `eq(customers.customerType, opts.type as any)`
- `service.ts:255` — `(input as any).tierId || null`
- `[id]/page.tsx:127` — `const [actionTx, setActionTx] = useState<any>(null)`
- `[id]/page.tsx:140` — `setCustomerSearchResults([] as any[])`
- `[id]/page.tsx:242-246` — Multiple `any` for SOA invoice state

### 15. Correlated Subqueries on Every Row in `listCustomers`

**Location:** `apps/api/src/modules/customers/service.ts:131-141`

Every customer row triggers 2 correlated subqueries (always):
- `unbilledCount` — `SELECT COUNT(*) FROM customer_transactions WHERE ...`
- `totalChargeCount` — `SELECT COUNT(*) FROM customer_transactions WHERE ...`

Plus 2 more when date range is provided (`periodPurchases`, `periodTxnCount`), and 1 more for ref search (`matchedRef`). With `limit: 200` in the frontend, that's up to 200 × 5 = 1,000 correlated subqueries in a single SQL statement. Postgres handles this reasonably well for 200 rows, but it's not optimal.

**Alternative:** A single `LEFT JOIN LATERAL` or CTE that computes billing stats once per customer.

### 16. `formatPeso` / `fmtPeso` Duplicated Across Files

- `apps/web/src/app/customers/page.tsx:35-39` — `fmtPeso()`
- `apps/web/src/app/customers/[id]/page.tsx:37-39` — `formatPeso()`
- `apps/web/src/app/customers/multi-payment/page.tsx:11-14` — `fmtPeso()`
- `apps/web/src/app/customers/reports/aging/page.tsx:80+` — `formatPeso()`
- `apps/web/src/lib/format.ts` already exists (used by `soa-search/page.tsx`)

Four copy-pasted peso formatters when a shared utility already exists.

### 17. Search Requires Enter Key — No Debounced Auto-search

The search input has `onKeyDown` handler that only fires on Enter (`page.tsx:262`). There's no debounced auto-search. The `submitSearch` button is tiny (12px icon). A user typing and waiting will see nothing happen until they press Enter. The placeholder says "press Enter" which mitigates confusion, but debounced search would be better UX.

This is actually a deliberate choice (server-side search with explicit submit to avoid excess API calls), which is reasonable. But it's inconsistent with other pages in the app.

---

## Relationship With Other Modules

| Module | Integration | Status |
|--------|-------------|--------|
| **POS** | When a charge sale is made at POS, a CHARGE transaction is created in `customer_transactions` and `currentBalance` is updated | Working |
| **SOA** | Full lifecycle: generate, send, track payments, reprint | Working |
| **Payments** | Record against customer balance with FIFO allocation | Working |
| **Aging Report** | Separate page at `/customers/reports/aging` | Working (but bucket sums may include paid charges) |
| **SOA Search** | Cross-customer SOA lookup at `/customers/soa-search` | Working (SQL injection risk) |
| **Multi-Payment** | Single payment across multiple customers at `/customers/multi-payment` | Working |
| **Vehicles** | Customer vehicles stored in `customer_vehicles` table, UI at `/customers/vehicles` | Exists |
| **Discounts/Tiers** | `tierId` links to `customer_tiers` for pricing | Schema exists, 0 customers assigned |
| **Mobile App** | Not investigated, but customer search API exists at `/customers/search` for POS autocomplete | Likely used |

---

## Philippine Business Context Assessment

| PH Requirement | Status | Notes |
|----------------|--------|-------|
| Charge account -> SOA -> Collection workflow | Implemented | Core flow works |
| Payment terms per customer | Implemented | COD, Net 7/15/30/60 options |
| SOA generation and reprint | Implemented | With stored line items for accurate reprints |
| Collection list for field collectors | **Missing** | Need printable collection summary |
| PDC (Post-Dated Check) tracking | **Partial** | checkDate field exists but no PDC management view |
| Official Receipt for payments | **Partial** | Payment receipt prints, but not BIR-compliant OR format |
| EWT (Expanded Withholding Tax) | Implemented | BIR 2307 reference field, rate-based or manual |
| Credit limit enforcement | **Not active** | Schema exists, CreditLimitError class exists, 0 customers configured |
| TIN tracking | Implemented | Field exists on customer form |
| Multiple locations | **Hardcoded** | City hardcoded to "Naga City" in form |
| Check payment tracking | Implemented | Bank, check number, check date captured |

---

## Recommended Refactor Plan

### Phase 1: Critical Fixes (Do First)

1. **Fix overdue calculation** (`service.ts:1531-1545`) — Join with `ar_payment_allocations` to only count customers with genuinely unpaid charges older than terms. Alternatively, check for unbilled charges (`billed = false`) past due date as a simpler heuristic.

2. **Fix SQL injection in SOA search** (`routes.ts:150-168`) — Replace `sql.raw()` with Drizzle's parameterized `sql` template tag. This is a 20-minute fix.

3. **Fix aging report bucket calculation** (`service.ts:1095-1119`) — Exclude paid/allocated charges from aging buckets, or switch to computing aging from the customer's current balance decomposed by oldest unpaid charges.

### Phase 2: Data & UX Cleanup

4. **Rename Phone column to "Code" / "Account"** — Reflect actual data usage (AR-XXXX codes).

5. **Hide empty columns** — Conditionally hide TIER and CREDIT LIMIT columns when no data is populated. Show them when at least one customer has data.

6. **Add "Last Payment" column** — Replace one of the empty columns with last payment date, fetched via a single subquery.

7. **Make Overdue card clickable** — Link to the AR Aging Report page, or apply an "overdue" filter to the current list.

8. **Make KPI cards consistent** — Either filter all KPIs by current filters, or make "Total Customers" always show org-wide total.

### Phase 3: Feature Additions

9. **Batch SOA generation** — "Generate All Unbilled SOAs" button that processes all customers with unbilled charges in one action.

10. **Collection list print** — Printable summary of all customers with outstanding balance, sorted by amount or days overdue.

11. **Break up detail page** — Extract `PaymentModal`, `TransactionList`, `SOATab`, `EditCustomerModal` into separate component files from the 2,417-line monolith.

12. **Add overdue filter** — New dropdown option or chip to filter list to only overdue customers with days-overdue sort.

13. **Shared `fmtPeso` utility** — Replace 4 duplicate peso formatters with the existing `apps/web/src/lib/format.ts`.

### Phase 4: Business Enhancements

14. **Credit limit enforcement** — Wire up the existing `CreditLimitError` to the POS checkout flow, add credit limit configuration UX.

15. **Collection list for field collectors** — Printable list with route/area grouping.

16. **PDC management** — View/manage post-dated checks received, with deposit date tracking.

---

## Appendix: Live Data Snapshot (2026-04-14)

| Metric | Value |
|--------|-------|
| Total Customers | 101 |
| With Balance (>₱0) | 83 |
| No Balance (₱0) | 18 |
| Total Receivables | ₱3,622,297.92 |
| Reported Overdue | 79 (LIKELY BUG) |
| Avg Balance (w/ balance) | ₱43,642.14 |
| Highest Balance | Lass Automotive: ₱743,625.00 |
| Unbilled Customers | 36 |
| Tier Assigned | 0/101 |
| Credit Limit Set | 0/101 |
| Phone = AR-Code | 100/101 |
| Customer Types | SHOP: 56, INDIVIDUAL: ~45 |
