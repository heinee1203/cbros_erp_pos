# Supplier Invoices Page — Re-Critique (v2)

## Data Accuracy (Phase 0 Results)

### Root Cause
The `createInvoice()` backend function (service.ts:263) correctly implements the priority chain:
```
termsDays = data.paymentTermsDays ?? supplier.paymentTermsDays ?? 30
```

But the **frontend always sends `paymentTermsDays: 30`** because the Record Invoice modal defaults to `paymentTerms: "NET_30"` and the TERMS_MAP always resolves — so the `??` fallback to the supplier's stored terms never fires.

### Impact
- **36 suppliers** had mismatched payment terms (supplier terms != 30 but all invoices stored as 30)
- **643 invoices** had incorrect due dates
- Overdue amount was inflated by **₱12.2 million** (49% overstated)

### Suppliers Affected (Top 10 by Invoice Count)
| Supplier | Actual Terms | Was Using | Invoices |
|----------|-------------|-----------|----------|
| Offroad Motor Parts | Net 150 | Net 30 | 114 |
| Bloomfield Sales System | Net 180 | Net 30 | 70 |
| Blazer Car Marketing | Net 180 | Net 30 | 56 |
| JGC8 Motor Parts Center | Net 180 | Net 30 | 48 |
| Seiwa Automotive | Net 180 | Net 30 | 40 |
| Cambridge Motors Parts Sales | Net 180 | Net 30 | 38 |
| Excelsior Marketing (COD) | COD (0) | Net 30 | 37 |
| Axis Marketing | Net 180 | Net 30 | 35 |
| DDPAI Philippines (COD) | COD (0) | Net 30 | 31 |
| Primal Enterprises | Net 120 | Net 30 | 27 |

### Metrics Before/After Fix
| Metric | Before Fix | After Fix | Change |
|--------|-----------|-----------|--------|
| Overdue Amount | ₱24,967,886.77 | ₱12,729,738.57 | -₱12.2M (-49%) |
| Due This Week | ₱2,622,134.38 | ₱1,376,464.86 | -₱1.2M (-47%) |
| Total Open Payables | ₱29,439,255.42 | ₱29,439,255.42 | No change |

### Fixes Applied
1. **Data repair**: SQL UPDATE corrected due_date and payment_terms_days on 643 invoices
2. **Frontend fix**: Record Invoice modal now auto-fills payment terms when supplier is selected
3. **API fix**: `/procurement/suppliers` endpoint now returns `paymentTermsDays` so frontend can map to dropdown

---

## What the First Refactor Got Right
1. Component extraction (1,259 → 435 lines + 6 components)
2. Server-side search replacing broken client-side search
3. Removing dead "Pay" button routing to legacy check-vouchers
4. Adding Edit Invoice and Void Invoice UI
5. CSV export using existing utility
6. Proper error notification instead of silent catch blocks
7. Wiring poReference to sourcePoId

## What the First Refactor Missed
1. **Payment terms data corruption** — the most impactful bug, affecting 643 invoices and ₱12.2M in overdue calculations
2. **Payment terms auto-fill** — modal defaulted to NET_30 regardless of supplier
3. **Deactivated suppliers in dropdowns** — fixed in subsequent commit (filter active for modal, label inactive in filter)
4. **`paymentTermsDays` not returned by API** — procurement endpoint didn't expose it

## Remaining Issues After This Fix
1. The `daysToTermsKey` function falls back to "NET_30" for non-standard terms values (e.g., 45 maps correctly, but 25 would fall back to NET_30). This is acceptable since all current supplier terms use standard values.
2. Voided invoices were excluded from the data repair (correct — no point fixing voided records).
3. JM Far East had 3 invoices with NULL payment_terms_days (Net 15 supplier) — these were also corrected to 15.
