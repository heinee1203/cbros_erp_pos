# DV & SOA Investigation Report

## A1. Credit Memos

- **Dedicated credit_memos table:** NO — does not exist
- **Where CMs are referenced:** The `supplier_returns` table has:
  - `creditType` enum: CREDIT_MEMO, REPLACEMENT, CASH_REFUND, DEDUCTED_FROM_NEXT_PO
  - `creditAmount` (numeric 12,2)
  - `creditReference` (varchar 100) — stores CM reference number
- **Frontend CM references:** None found
- **Recommendation:** Keep free-text CM deduction input on DV form. Build a dedicated CM module as future work — it's a bigger project.

## A2. Supplier Payment Terms

- **Column exists:** YES — `paymentTermsDays` (integer, NOT NULL, default 30)
- **Location:** `packages/database/src/schema/suppliers.ts` line 34
- **Comment:** "Net payment terms in days. 0 = COD. Defaults to Net 30."
- **Bulk update:** `bulkUpdateSupplierTerms()` exists in AP service
- **UI:** Payment terms dropdown in supplier detail drawer with COD through Net 180
- **No changes needed** — already fully implemented

## A3. Void Audit

- **Schema fields:** All three exist:
  - `voidReason` (varchar 500)
  - `voidedAt` (timestamp with TZ)
  - `voidedBy` (UUID)
- **Backend:** `voidDisbursementVoucher(orgId, dvId, userId, reason)` — accepts and saves all three fields
- **Frontend:** Currently uses `prompt("Void reason:")` — works but basic. Should upgrade to a proper modal dialog with reason dropdown + text input.
- **Display:** Voided DVs show red VOIDED badge but void reason/date not displayed on list page

## A4. SOA Aging

- **SOA date fields:** `dateFrom` (date), `dateTo` (date), `generatedAt` (timestamp)
- **Invoice date fields:** `invoiceDate` (date), `dueDate` (date)
- **SOA History columns:** SOA #, Supplier, Period, Amount, Paid, Balance, Inv Count, Status, Actions
- **Aging can be calculated as:** `today - dateTo` (days since SOA period end)

## A5. Supplier SOA PDF

- **Current columns:** DATE, INVOICE #, AMOUNT — already simplified (3 columns only)
- **DUE DATE, PAID, BALANCE:** Already removed in earlier task
- **No changes needed**

## A6. DV Numbering

- **Current sequence:** last_number = 6 (DV-2026-000001 through DV-2026-000006)
- **Records:** 4 VOIDED (test data), 2 PRINTED
- **Gaps from voided test records:** Normal, no reset needed
- **Format:** DV-YYYY-NNNNNN (per org, per year)
