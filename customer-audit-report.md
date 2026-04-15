# Customer Module vs Supplier Module — Parity & Gap Analysis

**Date:** 2026-04-15
**Compared against:** Suppliers module (recently consolidated to 8 sidebar items, 9/10 quality)

---

## Summary Score

| Area | Rating | Notes |
|------|--------|-------|
| Customer master data (create/edit/detail) | 9/10 | Full CRUD, rich edit form, pricing tiers |
| Customer list page (search, filter, sort, cards) | 8/10 | Good KPIs, filters, row actions, batch SOA |
| Customer billing/SOA workflow | 8/10 | Full SOA generation with transaction selection, batch generation |
| SOA history/search | 7/10 | Works but naming inconsistent ("SOA Search" vs "SOA History") |
| Payment recording | 9/10 | Split payments, EWT, SOA-level + invoice-level allocation, receipts |
| AR Aging | 8/10 | 6 buckets, sortable, export CSV, "as of" date picker |
| Customer detail view (tabs, completeness) | 9/10 | 6 tabs: Transactions, Sales, Statement, SOA History, Payments, Credit Memos |
| Naming consistency | 4/10 | "Customer List" vs "Suppliers", "SOA Search" vs "SOA History" |
| Feature parity with Suppliers | 7/10 | Missing: Payment Register, dedicated SOA generation page |
| **Overall** | **7.5/10** | Strong AR engine, but naming and navigation gaps vs Suppliers |

---

## Structural Comparison

### Sidebar Items

| Suppliers Module (8 items) | Customers Module (4 items) | Parity |
|---|---|---|
| Suppliers | Customer List | Name mismatch |
| Supplier Invoices | *(none — charges via POS)* | Intentionally different |
| Supplier Returns | *(none — via Sales Returns)* | Intentionally different |
| Supplier SOA | *(embedded in customer detail)* | Missing dedicated page |
| SOA History | SOA Search | Name mismatch |
| Disbursement Vouchers | *(none — simpler payment model)* | Intentionally different |
| AP Aging Report | AR Aging Report | Consistent |
| Check Register | *(none)* | **Missing** |

### Detail View Comparison

| Feature | Suppliers (Drawer, 6 tabs) | Customers (Full Page, 6 tabs) | Notes |
|---|---|---|---|
| Edit form | Details tab | Edit modal from page | Both work |
| Invoices/Transactions | Invoices tab | Transactions tab | Customer version is richer (shows all transaction types) |
| Purchase Orders | POs tab | *(N/A for customers)* | Intentionally different |
| Returns | Returns tab | Credit Memos tab | Different naming, same concept |
| SOA History | SOAs tab | SOA History tab | Consistent |
| Payment Documents | DVs tab | Payment History tab | Consistent |
| Vehicles | *(N/A)* | Vehicles (stub only) | Customer-only feature, not yet built |

### Feature Comparison

| Feature | Suppliers | Customers | Gap? |
|---|---|---|---|
| KPI summary cards | 4 cards (Total, With Balance, Total Payable, Overdue) | 4 cards (Total Receivables, Overdue, Current, Unbilled) | No gap |
| Search | Name, contact, phone, TIN, mnemonic | Name, phone (Enter to search) | No gap |
| Type filter chips | *(no supplier types)* | Individual/Shop/Fleet/Wholesale | Customer-only |
| Status filter | Active/Inactive, Has Overdue | All/With Balance/Overdue/Unbilled/Billed | No gap |
| Bulk actions | Set Terms | Batch SOA Generation | Different but both present |
| Row actions | Click row → drawer | Click row → full page + action menu | No gap |
| Export CSV | Yes | Yes + Collection List | Customer is better |
| Sort | All columns | Name, Balance | Customer has fewer sortable columns |
| Payment recording | Via DV (multi-step workflow) | Direct recording (split payment, EWT) | Customer is simpler but more flexible |
| Multi-entity payment | *(none)* | Multi-Customer Payment page | Customer is better |
| SOA generation | Dedicated page (select invoices) | Embedded in detail page + batch button | Different approach, both work |
| SOA history/search | Dedicated page with filters | Dedicated page with filters | Both present |
| Aging report | AP Aging (7 buckets, 498 lines) | AR Aging (6 buckets, 280 lines) | Both present |
| Payment register | Check Register (PDC tracking) | *(none)* | **MISSING** |

---

## Root Causes of Gaps

### Intentionally Different (No Fix Needed)
1. **No "Customer Invoices" page** — Customer charges originate from POS sales, not manual entry like supplier invoices. The Transactions tab on customer detail serves this purpose.
2. **No "Disbursement Vouchers" equivalent** — AR payments don't require multi-step approval (DRAFT→APPROVED→RELEASED). A shop owner records customer payments directly. The simpler `recordPayment()` is correct for the AR workflow.
3. **No "Supplier Returns" equivalent** — Customer returns are handled via the Sales/Returns module at POS, not the AR module. Credit memos appear as CREDIT_NOTE transactions.
4. **Detail page vs drawer** — Customer detail is a full page (2,417 lines) because it has heavier workflow (payment recording with split payments + EWT + SOA allocation). This is actually better UX than cramming it into a drawer.

### Genuine Gaps (Need Fix)
1. **Naming inconsistency** — "Customer List" should be "Customers"; "SOA Search" should be "SOA History"
2. **No Payment/Receipt Register** — Suppliers have Check Register for tracking all payments; Customers have no equivalent view of all AR payments received across all customers
3. **No dedicated SOA generation page** — Suppliers have a dedicated "Supplier SOA" page; Customer SOA generation is only on the detail page. The batch button on the list page partially addresses this, but there's no per-customer SOA generation page with invoice selection.
4. **Vehicles page is a stub** — Exists in the file system but is not implemented and not in the sidebar.

---

## Detailed Gap Analysis

### Gap 1: Naming Inconsistency
**Current → Proposed:**
- "Customer List" → "Customers" (match "Suppliers")
- "SOA Search" → "SOA History" (match Suppliers "SOA History")

### Gap 2: No Payment Register
The Suppliers module has a Check Register page that shows all checks issued to all suppliers with status tracking (issued, cleared, bounced, cancelled). The Customers module has no equivalent — there's no central view of all payments received from all customers.

**What this would look like:**
- Table: Payment #, Date, Customer, Amount, Method, Reference, SOA, Status
- Filters: date range, payment method, customer
- Shows all PAY-XXXX-YYYY records from `customer_transactions` where type = 'PAYMENT'
- Summary cards: Total collected today/week/month, by payment method

### Gap 3: No Dedicated SOA Generation Page
Suppliers have `/ap/supplier-soa` — a dedicated page where you:
1. Select a supplier
2. See their unbilled invoices
3. Check/uncheck invoices to include
4. Generate the SOA

Customers generate SOAs from the detail page's "Statement of Account" tab. The batch generation button on the list page generates for all customers at once. But there's no middle ground — no page where you pick a specific customer, see their unbilled charges, selectively include/exclude, and generate.

**Assessment:** The current approach (detail page) is actually fine for most workflows because you're usually billing one customer at a time. The batch button covers the "bill everyone" case. A dedicated page would be nice-to-have but not critical.

### Gap 4: Vehicles Page
`/customers/vehicles/page.tsx` is a 15-line stub. Not in sidebar. Would need full implementation.

**Assessment:** Low priority. Vehicle tracking is useful for automotive shops but not critical for AR workflow.

---

## Recommendations

### P0 — Must Fix (Naming, Navigation)
1. Rename "Customer List" → "Customers" in sidebar
2. Rename "SOA Search" → "SOA History" in sidebar + page title

### P1 — Should Fix (Feature Gaps)
3. Add "Payment Register" page — central view of all AR payments received
4. Consider adding "Customer SOA" dedicated page for single-customer SOA generation (or decide the current detail-page approach is sufficient)

### P2 — Nice to Have
5. Implement Vehicles page (or remove the stub)
6. Add PDC tracking for customer checks received (equivalent of Check Register)
7. Add more sortable columns to customer list (last payment date, payment terms)
