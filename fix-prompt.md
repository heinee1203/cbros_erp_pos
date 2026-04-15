# Fix Prompt: Supplier Module Consolidation & Gaps

## Context
Audit found the system has TWO Supplier list pages (`/procurement/suppliers` at 395 lines and `/ap/suppliers` at 879+926 lines) querying the same `suppliers` database table. The AP version is the canonical, full-featured page. The Procurement version is a lightweight duplicate that should be eliminated. Supplier Returns is well-built and kept as-is.

## Priority Order

### P0 — Critical (Eliminate Redundancy)

#### 1. Remove Procurement Suppliers Page
**Why:** Duplicate page with fewer features, creates confusion, allows incomplete supplier records.

**Files to modify:**
- `apps/web/src/app/sidebar.tsx` — remove "Suppliers" link from the Inventory group (keep it only in the Suppliers/AP group)
- `apps/web/src/app/procurement/suppliers/page.tsx` — replace with a redirect to `/ap/suppliers`

**Sidebar change:** The Inventory group currently has:
```
Inventory (Package icon)
├── Stock Levels
├── Purchase Orders
├── Backorders
├── Transfer Orders
├── Stock Adjustments
├── Inventory Counts
├── Suppliers          ← REMOVE THIS
├── Supplier Returns   ← KEEP (move to Suppliers group)
├── Inventory History
├── Stock Monitor
└── Stock Velocity
```

Move "Supplier Returns" from the Inventory sidebar group to the Suppliers/AP sidebar group:
```
Suppliers (CreditCard icon)
├── Suppliers
├── Supplier Invoices
├── Supplier Returns   ← MOVED HERE
├── Supplier SOA
├── SOA History
├── Disbursement Vouchers
├── AP Aging Report
└── Check Register
```

#### 2. Replace Check Vouchers Tab with Disbursement Vouchers Tab
**Why:** Check Vouchers is the legacy payment module (removed from sidebar). The detail drawer should show Disbursement Vouchers instead.

**File:** `apps/web/src/app/ap/suppliers/supplier-detail-drawer.tsx`

**Change:** Replace the "CVs" tab with a "DVs" tab that fetches from `GET /ap/disbursement-vouchers?supplierId={id}&limit=100` and shows: DV #, Payment Date, Amount, Status.

---

### P1 — Important (Fill Critical Gaps)

#### 3. Add Returns Tab to Supplier Detail Drawer
**Why:** No way to see a supplier's return history from the supplier detail.

**File:** `apps/web/src/app/ap/suppliers/supplier-detail-drawer.tsx`

**Add:** A "Returns" tab that fetches from `GET /supplier-returns?supplierId={id}&limit=100` and shows: RTV #, Date, Items, Total Cost, Credit, Status. Each RTV # links to `/procurement/supplier-returns/{rtvId}`.

#### 4. Add PO History Tab to Supplier Detail Drawer
**Why:** No way to see a supplier's purchase order history from the supplier detail.

**File:** `apps/web/src/app/ap/suppliers/supplier-detail-drawer.tsx`

**Add:** A "POs" tab that fetches from `GET /procurement/purchase-orders?supplierId={id}&limit=100` and shows: PO #, Date, Items, Total, Status. Each PO # links to `/procurement/purchase-orders/{poId}`.

#### 5. Show avgLeadTimeDays in Supplier Detail Drawer
**Why:** This field exists in the DB and is used by procurement, but is invisible in the canonical AP supplier page.

**File:** `apps/web/src/app/ap/suppliers/supplier-detail-drawer.tsx`

**Add:** "Avg Lead Time (days)" field to the edit form, in the "Credit Terms" section alongside Payment Terms and Credit Limit.

#### 6. Add Filter by Overdue Status
**Why:** AP clerk needs to quickly find "suppliers with overdue invoices" — currently impossible without scrolling.

**File:** `apps/web/src/app/ap/suppliers/page.tsx`

**Add:** A filter toggle/chip: "Has Overdue" that filters to suppliers where `overdueCount > 0`. This is client-side filtering (already have the data).

---

### P2 — Nice to Have

#### 7. Add Payment Terms Filter
Filter suppliers by payment terms bucket (COD, Net 30, Net 60+, etc.) — client-side filter on existing data.

#### 8. Add Bulk Activate/Deactivate
Checkbox selection already exists. Add a "Set Status" bulk action alongside "Set Terms".

#### 9. Improve Address Field
Currently a single textarea. Consider structured fields (street, city, province, zip) for better searching and BIR compliance. Low priority — the current textarea works.

#### 10. Add Last Payment Date to AP Rollups
Would require joining DV data in `listSuppliersWithAPStats`. Shows when the supplier was last paid — useful for cash flow management.

---

## Tab Order for Supplier Detail Drawer (After Fix)

```
1. Details (Edit form)
2. Invoices
3. POs        ← NEW
4. Returns    ← NEW  
5. SOAs
6. DVs        ← REPLACED (was "CVs")
```

## Files Changed Summary

| File | Change |
|------|--------|
| `apps/web/src/app/sidebar.tsx` | Remove Procurement "Suppliers" link, move "Supplier Returns" to Suppliers group |
| `apps/web/src/app/procurement/suppliers/page.tsx` | Replace with redirect to `/ap/suppliers` |
| `apps/web/src/app/ap/suppliers/supplier-detail-drawer.tsx` | Replace CVs tab with DVs, add POs tab, add Returns tab, add avgLeadTimeDays field |
| `apps/web/src/app/ap/suppliers/page.tsx` | Add "Has Overdue" filter chip |

## Verification

After implementing:
1. Navigate to `/procurement/suppliers` — should redirect to `/ap/suppliers`
2. Sidebar "Inventory" group no longer has "Suppliers" link
3. Sidebar "Suppliers" group now includes "Supplier Returns"
4. Supplier detail drawer has 6 tabs: Details, Invoices, POs, Returns, SOAs, DVs
5. POs tab shows purchase orders for the supplier
6. Returns tab shows RTVs for the supplier  
7. DVs tab shows disbursement vouchers (not legacy check vouchers)
8. avgLeadTimeDays is visible and editable in the edit form
9. "Has Overdue" filter works on the supplier list page
10. No broken links or 404s
