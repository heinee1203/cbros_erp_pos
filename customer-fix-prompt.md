# Fix Prompt: Customer Module — Naming Consistency & Payment Register

## Context
Audit found the Customers module (4 sidebar items) has naming inconsistencies with the recently consolidated Suppliers module (8 sidebar items), and is missing a Payment Register (the AR equivalent of the Supplier Check Register). The Customers module is otherwise strong (7.5/10) — this fix brings it to parity.

## Priority Order

### P0 — Critical (Naming Consistency)

#### 1. Rename "Customer List" → "Customers" in Sidebar
**Why:** Suppliers sidebar says "Suppliers", not "Supplier List". Inconsistent naming creates cognitive friction.

**Files to modify:**
- `apps/web/src/app/sidebar.tsx` — Change the label from "Customer List" to "Customers"

**Change:**
```typescript
// Before:
{ label: "Customer List", href: "/customers", match: /^\/customers$/ },
// After:
{ label: "Customers", href: "/customers", match: /^\/customers$/ },
```

#### 2. Rename "SOA Search" → "SOA History" in Sidebar + Page Title
**Why:** Suppliers sidebar says "SOA History". Customers says "SOA Search". Same function, different name.

**Files to modify:**
- `apps/web/src/app/sidebar.tsx` — Change the label from "SOA Search" to "SOA History"
- `apps/web/src/app/customers/soa-search/page.tsx` — Change the page title/heading from "SOA Search" to "SOA History"

---

### P1 — Important (Feature Gap)

#### 3. Add Payment Register Page
**Why:** Suppliers have a Check Register showing all payments issued. Customers have no equivalent — there's no central view of all payments received across all customers.

**What to build:**

**New page:** `apps/web/src/app/customers/payment-register/page.tsx`

**Page structure (follow the pattern of SOA Search page at `apps/web/src/app/customers/soa-search/page.tsx`):**

**Header:**
- Title: "Payment Register"  
- Subtitle: "All customer payments received"

**Summary cards (4 cards):**
- Total Collected (all time or filtered period)
- Today's Collections
- This Week
- This Month

**Filters:**
- Search (payment # PAY-XXXX, customer name)
- Payment method dropdown (All, Cash, Check, Bank Transfer, Credit Card, GCash, Maya, QRPH)
- Date range picker
- Customer dropdown (optional — from `/customers?limit=200`)

**Table columns:**
| Column | Width | Source |
|--------|-------|--------|
| Payment # | ~140px | `paymentNumber` (PAY-YYYY-XXXX) |
| Date | ~120px | `recordedAt` |
| Customer | flex | Customer name (join) |
| Amount | ~140px, right | `amount` |
| Method | ~120px | `paymentMethod` |
| Reference | ~140px | `referenceNumber` or check #, bank name |
| SOA | ~100px | Notes field often contains `[SOA: SOA-YYYY-XXXX]` |
| Recorded By | ~120px | User name (join) |

**Sort:** Default by date descending (newest first). Sortable columns: Date, Amount, Customer.

**Export CSV:** All filtered payments.

**Print:** Collection summary (printable HTML, similar to Collection List on customer page).

**Pagination:** Client-side, same pattern as invoice table (25/50/100 per page).

**Data source — Backend:**

**New route:** `GET /customers/payments` in `apps/api/src/modules/customers/routes.ts`

**Query:**
```sql
SELECT ct.id, ct.payment_number, ct.recorded_at, ct.amount,
  ct.payment_method, ct.reference_number, ct.notes,
  ct.batch_number, ct.trace_number, ct.card_type,
  ct.payment_lines,
  c.name AS customer_name, c.phone AS customer_code,
  u.name AS recorded_by_name
FROM customer_transactions ct
JOIN customers c ON c.id = ct.customer_id
LEFT JOIN users u ON u.id = ct.recorded_by
WHERE ct.org_id = $orgId AND ct.type = 'PAYMENT'
  -- filters: dateFrom, dateTo, paymentMethod, customerId, search
ORDER BY ct.recorded_at DESC
```

This query uses existing tables — no schema changes needed.

**Add to sidebar:**
```typescript
{ label: "Payment Register", href: "/customers/payment-register", match: /^\/customers\/payment-register/ },
```

Place it after "SOA History" (renamed from "SOA Search") and before "Multi-Customer Payment".

**New sidebar order:**
```
Customers
├── Customers              ← renamed from "Customer List"
├── AR Aging Report
├── SOA History            ← renamed from "SOA Search"
├── Payment Register       ← NEW
└── Multi-Customer Payment
```

---

### P2 — Nice to Have

#### 4. Add More Sortable Columns to Customer List
Currently only Name and Balance are sortable. Add:
- Last Payment date (oldest first useful for collections)
- Payment Terms

**File:** `apps/web/src/app/customers/page.tsx`
- Add `lastPaymentDate` and `paymentTermsDays` to the `SortField` union
- Add sort cases in the `useMemo` sort function
- Make the Last Payment and (if added) Terms column headers into `<button>` elements with sort indicators

#### 5. Implement Vehicles Page
`apps/web/src/app/customers/vehicles/page.tsx` is a 15-line stub. Full implementation would include:
- List of customer vehicles (make, model, year, plate number)
- Link vehicles to service history (job cards)
- Search/filter by plate number, make, model
- CRUD operations

**Complexity:** Medium. Requires UI + existing backend routes (`GET/POST /customers/:id/vehicles`).

**Assessment:** Low priority for AR workflow. Defer unless service module needs it.

#### 6. PDC Tracking for Customer Checks
Some customers pay with post-dated checks. Track:
- Check number, bank, date, amount, customer
- Status: Received → Deposited → Cleared / Bounced
- Alert for checks approaching deposit date

**Assessment:** Would need new schema table `ar_post_dated_checks`. Medium complexity. Defer.

---

## Files Changed Summary

| File | Change | Priority |
|------|--------|----------|
| `apps/web/src/app/sidebar.tsx` | Rename "Customer List" → "Customers", "SOA Search" → "SOA History", add "Payment Register" link | P0/P1 |
| `apps/web/src/app/customers/soa-search/page.tsx` | Rename page title to "SOA History" | P0 |
| `apps/web/src/app/customers/payment-register/page.tsx` | **NEW** — Payment Register page | P1 |
| `apps/api/src/modules/customers/routes.ts` | Add `GET /customers/payments` route | P1 |
| `apps/api/src/modules/customers/service.ts` | Add `listPayments()` function | P1 |
| `apps/web/src/app/customers/page.tsx` | Add more sortable columns (optional) | P2 |

## Verification

After implementing:
1. Sidebar shows "Customers" (not "Customer List")
2. Sidebar shows "SOA History" (not "SOA Search")
3. SOA History page title says "SOA History" (not "SOA Search")
4. `/customers/soa-search` still works (page file is the same, just title changed)
5. New "Payment Register" link in sidebar under Customers
6. Payment Register page loads and shows all payments
7. Filters work: date range, payment method, search
8. Export CSV works
9. Pagination works (25/50/100 per page)
10. No broken links or 404s
