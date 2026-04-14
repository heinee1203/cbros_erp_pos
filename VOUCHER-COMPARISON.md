# Check Vouchers vs Disbursement Vouchers — Comparison

## Check Vouchers (CV)

- **Database table:** `check_vouchers` + `check_voucher_lines` + `cv_number_sequence`
- **Existing records:** 0 (no production data)
- **Schema (20 cols):** id, orgId, cvNumber, supplierId, checkDate, checkNumber, bankName, bankAccount, totalAmount, deductions, netAmount, status, approvedBy/At, printedAt, releasedAt, clearedAt, voidedAt/By, voidReason, notes, preparedBy, timestamps
- **Line items:** `check_voucher_lines` — links each CV to specific invoices with per-invoice amounts + deductions
- **Status flow:** DRAFT → APPROVED → PRINTED → RELEASED → CLEARED → (VOIDED/STALE) — 7 states
- **Payment methods:** Check only
- **Workflow:** 2-step wizard: Step 1 = select invoices + adjust per-invoice amounts, Step 2 = check details
- **Invoice update:** On CLEAR — updates invoice paidAmount/balance/status
- **Void behavior:** Cannot void after CLEARED. No invoice reversal on void.
- **SOA integration:** None — works with raw open invoices, no SOA reference
- **Deductions:** Per-invoice deduction amounts + reasons

## Disbursement Vouchers (DV)

- **Database table:** `supplier_disbursement_vouchers` + `dv_number_sequence`
- **Existing records:** 1 (voided test record)
- **Schema (18 cols):** id, orgId, dvNumber, supplierId, soaId (nullable), amount, paymentMethod, checkNumber, checkDate, bankName, paymentDate, remarks, status, printedAt, confirmedAt, voidedAt/By, voidReason, createdBy, timestamps
- **Line items:** None — inherits from SOA's `supplier_soa_line_items` when soaId is set
- **Status flow:** DRAFT → PRINTED → CONFIRMED → (VOIDED) — 4 states
- **Payment methods:** CHECK, CASH, BANK_TRANSFER, ONLINE
- **Workflow:** Single-page form, pre-filled from SOA History's "Pay" button
- **Invoice update:** On CONFIRM — allocates payment to SOA invoices (FIFO, oldest first)
- **Void behavior:** Can void even after CONFIRMED. Full reversal of SOA totals + invoice paidAmount/balance/status.
- **SOA integration:** Direct soaId FK, pre-fills from SOA, updates SOA totals on confirm/void
- **Deductions:** None

## Overlap

- Both create numbered payment documents (CV-YYYY-XXXXXX / DV-YYYY-XXXXXX)
- Both link to a supplier
- Both have check-specific fields (checkNumber, checkDate, bankName)
- Both update invoice paidAmount/balance/status when payment is finalized
- Both have print capability
- Both support void with reason (ADMIN only)
- Both use same number sequence pattern (year-based auto-increment with FOR UPDATE lock)

## Unique to Check Vouchers

- **Per-invoice line items** — explicit selection of which invoices to pay, with adjustable amounts
- **Per-invoice deductions** — deduction amount + reason per line
- **Multi-step approval** — APPROVED → PRINTED → RELEASED before clearing (4 intermediate steps)
- **Bank account selection** from master table
- **Gross/Deductions/Net** calculation
- **Cursor-based pagination** on list page
- **2-step wizard form** (invoice selection → check details)
- **Cannot void after clearing** — no reversal

## Unique to Disbursement Vouchers

- **Multiple payment methods** — CHECK, CASH, BANK_TRANSFER, ONLINE
- **SOA reference** — direct link to supplier SOA, inherits invoice list
- **Standalone payments** — can create without SOA (utilities, rent, etc.)
- **Void reversal** — voiding a CONFIRMED DV reverses invoice payments + SOA totals
- **Simpler workflow** — 4 states vs 7 states
- **Single-page form** — no wizard
- **SOA History integration** — "Pay" button redirects directly to DV creation

## Recommendation

- [x] **MERGE** — combine unique features from both into one module

**Rationale:**
1. **Zero CV production data** — no records to migrate, no users to retrain
2. **DV already covers the primary use case** — SOA-driven payments with proper paper trail
3. **CV has useful features DV lacks** — per-invoice line items, deductions, bank account master. These should be added to DV over time.
4. **DV has features CV lacks** — multi-method payments, SOA binding, void reversal. These would be harder to retrofit onto CV.
5. **Maintaining two parallel systems is confusing** — one "Disbursement Voucher" module that handles all payment types is cleaner.

**Suggested migration path:**
- Keep DV as the active module (already in sidebar)
- CV sidebar link already removed (done)
- CV code + table kept for reference but unused
- Future: add per-invoice line items + deductions to DV when needed
