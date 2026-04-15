# Supplier Module Audit Report

## Executive Summary

The system has **two separate Supplier list pages** pointing to the **same database table**, creating confusion, maintenance burden, and inconsistent editing capabilities. The AP version (`/ap/suppliers`, 879 lines) is the canonical, full-featured page. The Procurement version (`/procurement/suppliers`, 395 lines) is a lightweight duplicate that should be eliminated. Supplier Returns (`/procurement/supplier-returns`, 1,671 lines across 3 files) is well-built with complete workflow, stock impact, and financial impact tracking.

**Overall Rating: 7/10** — AP Suppliers is solid (8/10), Procurement Suppliers is redundant (-1), Supplier Returns is good (8/10), cross-module integration could be tighter (-1).

---

## 2A: Inventory -> Suppliers Page (`/procurement/suppliers`)

| Aspect | Current State |
|--------|--------------|
| Route | `/procurement/suppliers` |
| Purpose | Lightweight vendor directory for PO creation |
| Data source (table) | `suppliers` (SAME table as AP) |
| Line count | 395 lines |
| Columns displayed | 6: Name, Code, Email, Phone, Address, Actions |
| Search/filter | Basic text search only, no advanced filters |
| CRUD operations | Create (modal), Edit (modal), Delete (confirmation dialog) |
| Supplier detail view | Simple edit modal — no tabs, no financial data |
| Fields editable | name, mnemonicCode, contactEmail, contactPhone, address |
| Bulk actions | None |
| Export | None |
| Summary cards | None |
| Pagination | None (loads all) |
| Sorting | Basic name sort only |
| Linked to POs? | No — no PO creation from supplier |
| Linked to invoices? | No |
| Linked to returns? | No |
| Contact info | Email, phone, address — NO contact person |
| Payment terms | Not shown or editable |
| Credit limit | Not shown or editable |
| Tax info | Not shown or editable (TIN field exists in DB) |
| Bank details | Not shown or editable |
| Notes | Not shown or editable |

**Verdict: REDUNDANT.** Every feature here exists in the AP Suppliers page with more capability.

---

## 2B: Inventory -> Supplier Returns Page (`/procurement/supplier-returns`)

| Aspect | Current State |
|--------|--------------|
| Route | `/procurement/supplier-returns` (list), `/new` (create), `/[rtvId]` (detail) |
| Purpose | Track returns to vendors (RTV) with full lifecycle |
| Data source (table) | `supplier_returns` + `supplier_return_lines` + `supplier_return_status_history` |
| Line count | 1,671 lines across 3 files (259 + 662 + 750) |
| Workflow | DRAFT -> SUBMITTED -> ACKNOWLEDGED -> CREDIT_RECEIVED -> CLOSED |
| Columns displayed | 8: RTV #, Date, Supplier, Items, Total Cost, Credit, Status, Actions |
| Search/filter | Text search (RTV#, supplier), status dropdown, supplier dropdown |
| Create return | Full form: supplier, location, reason, source PO, line items with product search |
| Return reasons | 7: DEFECTIVE, DAMAGED_ON_DELIVERY, WRONG_ITEM, OVERSHIPMENT, WARRANTY, EXPIRED, OTHER |
| Stock impact | YES — SUBMITTED deducts inventory via stock_journal; CANCELLED reverses |
| Financial impact | YES — CREDIT_RECEIVED records credit amount; integrates with AP via rtvCreditAmount on invoices |
| Print/export | Print return slip from detail page |
| Summary cards | 3: Open RTVs, Pending Credit, Credit This Month |
| Linked to supplier? | Yes (supplierId FK) |
| Linked to invoice? | Indirectly (rtvCreditAmount applied to supplier_invoices) |
| Linked to credit memo? | Yes — credit_type: CREDIT_MEMO, REPLACEMENT, CASH_REFUND, DEDUCTED_FROM_NEXT_PO |

**Verdict: WELL-BUILT.** Complete workflow with stock and financial impact. Keep as-is.

---

## 2C: AP -> Suppliers Page (`/ap/suppliers`)

| Aspect | Current State |
|--------|--------------|
| Route | `/ap/suppliers` |
| Purpose | Full supplier master data with AP financial rollups |
| Data source (table) | `suppliers` (SAME table as procurement) |
| Line count | 879 lines (page) + 926 lines (detail drawer) = 1,805 lines |
| Columns displayed | 10: Checkbox, Supplier+Code, Contact Person, Phone, Terms, Credit Limit, Open Inv, Total Payable, Oldest Overdue, Status |
| Search/filter | Text search (name, contact, phone, TIN, mnemonic), inactive toggle |
| CRUD operations | Create (drawer), Edit (drawer), Deactivate/Reactivate (toggle with confirmation) |
| Supplier detail view | Right-side drawer with 4 tabs |
| Fields editable | ALL: name, contactPerson, phone, email, address, TIN, mnemonicCode, paymentTermsDays, creditLimit, bankName/Number/Name, notes, isActive |
| Bulk actions | Set payment terms (up to 200 suppliers) |
| Export | CSV export (11 columns) |
| Summary cards | 4: Total Suppliers, With Balance, Total Payable, Overdue |
| AP rollups | Yes: openCount, totalPayable, overdueCount, overdueAmount, oldestOverdueDate per supplier |
| Linked to invoices? | Yes — Invoices tab in drawer |
| Linked to SOAs? | Yes — SOA History tab in drawer |
| Linked to DVs/CVs? | Yes — Check Vouchers tab in drawer |
| Sorting | 8 sortable columns |

**Verdict: CANONICAL.** This is the authoritative Suppliers page.

---

## 3A: DUPLICATE FUNCTIONALITY

### Confirmed: SAME TABLE, TWO PAGES

Both `/procurement/suppliers` and `/ap/suppliers` query the **same `suppliers` table** from `@apex/database/schema`. There is no separate inventory supplier table.

| Comparison | Procurement (`/procurement/suppliers`) | AP (`/ap/suppliers`) |
|------------|----------------------------------------|----------------------|
| Lines | 395 | 1,805 (page + drawer) |
| Columns | 6 | 10 + detail drawer |
| Fields editable | 5 | 14 |
| Summary cards | 0 | 4 |
| Bulk ops | 0 | 1 (set terms) |
| Export | No | CSV |
| Detail view | Simple modal | 4-tab drawer |
| AP rollups | No | Yes |
| Active/inactive | No toggle | Full toggle with confirmation |
| Search depth | Name only | Name, contact, phone, TIN, code |

**Recommendation: REMOVE the Procurement Suppliers page.** Redirect `/procurement/suppliers` to `/ap/suppliers`. The AP page has everything the procurement page has, plus much more. Remove the "Suppliers" link from the Inventory sidebar group (keep it only in the Suppliers/AP group).

---

## 3B: MISSING FEATURES — AP Suppliers Page (Canonical)

| Feature | Present? | Rating | Notes |
|---------|----------|--------|-------|
| **Master data** | | | |
| Supplier name | Yes | 10 | |
| Contact person | Yes | 10 | |
| Phone number | Yes | 10 | |
| Email | Yes | 10 | |
| Address (full) | Yes | 8 | Single textarea, not structured (street/city/zip) |
| TIN (BIR requirement) | Yes | 10 | Searchable |
| Business type (individual/corp) | No | 0 | Missing — BIR requires this for withholding tax rates |
| **Financial** | | | |
| Payment terms | Yes | 10 | Full dropdown with auto-fill on invoice creation |
| Credit limit | Yes | 9 | Shows "Unlimited" for 0, but no enforcement/warning |
| Bank details | Yes | 10 | Name, account number, account name |
| Currency | No | 3 | Column exists in DB (default PHP) but not editable in UI |
| **Inventory** | | | |
| Lead time (days) | Partial | 5 | `avgLeadTimeDays` in DB but NOT shown in AP drawer |
| Minimum order amount | No | 0 | Not in schema |
| Preferred supplier per product | No | 2 | `product_suppliers` table exists but not used in UI |
| Product catalog | No | 2 | `product_suppliers` junction table exists, no UI |
| **AP rollups** | | | |
| Total payable | Yes | 10 | Per-row aggregate |
| Open invoice count | Yes | 10 | Per-row aggregate |
| Overdue amount | Yes | 10 | Per-row with oldest date |
| Payment history summary | No | 0 | Missing — no last payment date or total paid |
| Last payment date | No | 0 | Would need DV/CV query |
| **Operations** | | | |
| Active/inactive toggle | Yes | 10 | With confirmation |
| Notes | Yes | 10 | |
| Document attachments | No | 0 | Not in schema |
| Supplier rating | No | 0 | Not in schema |
| **Search & Filter** | | | |
| Multi-field search | Yes | 9 | Name, contact, phone, TIN, code |
| Filter by status | Yes | 8 | Active/inactive toggle |
| Filter by payment terms | No | 0 | Missing |
| Filter by overdue status | No | 0 | Missing — can't filter "suppliers with overdue invoices" |
| Sort by any column | Yes | 9 | 8 sortable columns |
| **Bulk operations** | | | |
| Bulk set terms | Yes | 10 | Up to 200 |
| Bulk activate/deactivate | No | 0 | Missing |
| Bulk export | Yes | 10 | CSV |
| Bulk import | No | 0 | Missing |
| **Detail view tabs** | | | |
| Supplier profile header | Yes | 8 | Name, status, mnemonic |
| Invoices tab | Yes | 8 | List with status badges |
| SOA history tab | Yes | 8 | List with period/status |
| Check vouchers tab | Yes | 7 | Legacy — should be DV tab instead |
| PO history tab | No | 0 | Missing — important for procurement |
| Returns history tab | No | 0 | Missing — should show RTVs |
| Payment history tab | No | 0 | Missing — no DV/payment listing |
| Credit memo tab | No | 0 | Missing |

**Overall Rating: 7.5/10**

---

## 3C: MISSING FEATURES — Supplier Returns

| Feature | Present? | Rating | Notes |
|---------|----------|--------|-------|
| Create return from supplier | Yes | 10 | Full form with product search |
| Return reason codes | Yes | 10 | 7 reasons |
| Return items with quantities | Yes | 10 | Line items with cost, condition |
| Return approval workflow | Yes | 9 | 5 statuses + cancel |
| Auto-adjust stock on submission | Yes | 10 | Deducts via stock_journal |
| Generate credit memo | Yes | 8 | Records credit amount/type |
| Link to replacement PO | No | 0 | Not implemented |
| Track return shipping | No | 0 | No tracking number field |
| Partial returns | Yes | 9 | Line-by-line quantities |
| Return against specific PO | Yes | 8 | Optional source_po_id |
| Photo evidence | No | 0 | Not in schema |
| Print return slip | Yes | 9 | HTML print from detail page |
| Supplier confirmation tracking | Partial | 5 | ACKNOWLEDGED status exists but no external confirmation |
| Return history per supplier | No | 3 | Not accessible from supplier detail drawer |
| Return analytics | No | 0 | No reports on return rates per supplier |

**Overall Rating: 8/10** — Well-built core workflow, missing some enterprise features.

---

## 3D: INCONSISTENCIES

### 1. Duplicate Sidebar Entries
- **Inventory group**: "Suppliers" -> `/procurement/suppliers`
- **Suppliers group**: "Suppliers" -> `/ap/suppliers`
- User sees two "Suppliers" links in different sidebar groups, both showing the same data.

### 2. Different Edit Capabilities
- Procurement modal: 5 editable fields (name, code, email, phone, address)
- AP drawer: 14 editable fields (everything above + TIN, terms, credit limit, bank details, notes, contact person)
- A supplier edited via Procurement modal loses TIN, bank, etc. context.

### 3. Different Create Flows
- Procurement: `POST /procurement/suppliers` — creates with minimal fields
- AP: `POST /ap/suppliers` — creates with full fields including bank details
- Both create rows in the same table, but procurement creates incomplete records.

### 4. Check Vouchers Tab Instead of Disbursement Vouchers
- The supplier detail drawer shows a "Check Vouchers" tab, but check vouchers are the LEGACY payment module (removed from sidebar). Should show "Disbursement Vouchers" instead.

### 5. Missing Cross-Links
- Supplier Returns page has no link back to supplier detail
- Supplier detail drawer has no Returns tab
- No way to see a supplier's PO history from the detail drawer

### 6. avgLeadTimeDays Orphaned
- Procurement `createSupplier` accepts `avgLeadTimeDays` but the AP drawer doesn't show or edit it
- The field exists in the DB but is invisible in the canonical supplier page

---

## Summary Ratings

| Module | Rating | Key Strengths | Key Gaps |
|--------|--------|---------------|----------|
| AP Suppliers Page | 8/10 | Full CRUD, AP rollups, CSV export, bulk terms | No PO/Returns tabs, legacy CV tab |
| AP Supplier Drawer | 8/10 | 14 editable fields, 4 tabs | No DV tab, no returns tab, no PO tab |
| Procurement Suppliers | 3/10 | Simple and fast | Redundant, incomplete, should be removed |
| Supplier Returns | 8/10 | Complete workflow, stock + financial impact | No return analytics, no shipping tracking |
| Cross-Module Integration | 5/10 | Same DB table, credit flows to AP | Missing tabs, no navigation links |
