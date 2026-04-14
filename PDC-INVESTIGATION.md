# PDC Report Integration — Investigation

## PDC Report Page
- **Exists:** YES
- **Sidebar location:** Under "Suppliers" (AP group), after "AP Aging Report"
- **Route:** `/ap/reports/pdcs`
- **Frontend file:** `apps/web/src/app/ap/reports/pdcs/page.tsx`

## PDC Database
- **Table:** None — no dedicated PDC table
- **Data source:** Queries the `check_vouchers` table directly
- **Query logic** (in `getPDCReport()` at `service.ts` line 2326):
  - Selects CVs where `check_date > today` (future/post-dated) OR status = `RELEASED` and not yet `CLEARED`
  - Excludes `VOIDED` and `CLEARED` CVs
  - Joins with `suppliers` for supplier name
  - Returns: cvNo, supplierName, checkNo, bankName, checkDate, amount, status

## PDC Report UI Features
- **Summary cards:** Total Outstanding, Maturing This Week, Maturing This Month, Past Maturity
- **Filters:** Bank name, Status (Released/Printed), Maturity date range, Text search (CV#, check#, supplier)
- **Table columns:** CV#, Supplier, Check#, Bank, Check Date, Amount, Status (sortable)

## Current Integration
- **Connected to Check Vouchers:** YES — queries `check_vouchers` table directly
- **Connected to Disbursement Vouchers:** NO — does not know about `supplier_disbursement_vouchers` or `supplier_dv_payments`
- **Auto-creates PDC entry on check save:** NO — there is no separate PDC table. PDC is a read-only report that dynamically queries outstanding CVs with future check dates.

## Gap Analysis
The PDC report currently shows zero data because:
1. The `check_vouchers` table has **0 records** (never used in production)
2. Check payments are now recorded through `supplier_disbursement_vouchers` (new DV module)
3. The new `supplier_dv_payments` child table (being added) will store check details including `check_date`
4. The PDC report query needs to be updated to include DV check payments

## Recommendation
- [x] **PDC needs wiring to DV** — the report should query `supplier_dv_payments` where `payment_method = 'CHECK'` and either `transaction_date > today` (post-dated) or the parent DV is in `PRINTED` status (not yet confirmed/cleared)

### Suggested Fix (future task)
Update `getPDCReport()` to UNION the CV query with a DV query:

```sql
-- Existing: check_vouchers where check_date > today
UNION ALL
-- New: supplier_dv_payments where payment_method = 'CHECK'
--      AND transaction_date > today
--      AND parent DV status IN ('DRAFT', 'PRINTED')
--      (exclude CONFIRMED since those are settled, and VOIDED)
```

This keeps backward compatibility with any future CV data while adding DV check payments to the PDC report.
