# Customer Accounts & Accounts Receivable — Design

**Date:** 2026-03-19
**Status:** Approved

## Design Decisions

1. **Extend existing `customers` table** with AR columns (credit_limit, current_balance, etc.) rather than creating a separate accounts table. Avoids unnecessary joins.
2. **No `is_charge` column on sales.** Charge status derived from `sale_payments.method = 'ACCOUNT'`. Single source of truth, no sync drift.
3. **Immutable transaction ledger.** `customer_transactions` has no `updated_at`. Corrections via ADJUSTMENT entries only.
4. **Inline balance updates in sales transaction.** When a sale completes with ACCOUNT payment, the customer balance update happens in the same DB transaction as inventory deduction. Same pattern, guaranteed atomicity.
5. **Credit limit override via manager PIN.** API returns `409 CREDIT_LIMIT_EXCEEDED` with overage details. Frontend prompts for manager PIN, retries with `overrideApproval`. API verifies PIN belongs to ADMIN/MANAGER in same org.

## Schema Changes

### Extend `customers` table

New columns:
- `customer_type` ENUM(INDIVIDUAL, SHOP, FLEET, WHOLESALE) NOT NULL DEFAULT 'INDIVIDUAL'
- `contact_person` VARCHAR(255) nullable
- `email` VARCHAR(255) nullable
- `address` TEXT nullable
- `tin` VARCHAR(20) nullable
- `credit_limit` NUMERIC(12,2) DEFAULT 0 (0 = unlimited/trust-based)
- `payment_terms_days` INTEGER DEFAULT 30
- `current_balance` NUMERIC(12,2) DEFAULT 0
- `total_purchases` NUMERIC(14,2) DEFAULT 0
- `is_active` BOOLEAN DEFAULT true
- `notes` widened from VARCHAR(1000) to TEXT

New indexes: `(org_id, customer_type)`, `(org_id, is_active)`

### New `customer_transactions` table

Immutable AR ledger. Columns: id, org_id, customer_id, type (ENUM: CHARGE, PAYMENT, CREDIT_NOTE, ADJUSTMENT), amount (always positive), balance_after, reference_type, reference_id, reference_number, payment_method, notes, recorded_by, recorded_at.

Indexes: `(org_id, customer_id, recorded_at)`, `(org_id, reference_id)`

### Sales table — no changes

Charge status derived from sale_payments.method = 'ACCOUNT'.

## API Endpoints

### Customer CRUD — `/customers` (enhance existing)

- GET /customers — search (ILIKE name/phone/email), filter by type/hasBalance, sortBy, cursor pagination
- GET /customers/:id — full detail + recent transactions (last 10)
- POST /customers — create with all fields. ADMIN, MANAGER
- PATCH /customers/:id — update. ADMIN, MANAGER
- DELETE /customers/:id — soft-delete (is_active=false), only if balance = 0. ADMIN

### Transactions — `/customers/:id/transactions`

- GET /customers/:id/transactions — ledger, filter by type/date range, cursor pagination newest first
- POST /customers/:id/payments — record payment, lock row, update balance. ADMIN, MANAGER
- POST /customers/:id/adjustments — manual adjustment. ADMIN only

### Reports — `/customers/reports`

- GET /customers/reports/aging — AR aging buckets per customer
- GET /customers/reports/soa/:customerId — SOA with date range, running balance
- GET /customers/reports/summary — total receivables, count, avg DSO

### Sales integration (completeSale)

When sale_payments has method=ACCOUNT:
1. Validate customer exists and is_active
2. SELECT FOR UPDATE on customer row
3. Check credit limit (if > 0): current_balance + amount <= credit_limit
4. If exceeded: 409 CREDIT_LIMIT_EXCEEDED with overage, prompt manager PIN override
5. On override: verify PIN against ADMIN/MANAGER user in same org
6. Update current_balance += charge, total_purchases += grandTotal
7. Insert customer_transactions with type=CHARGE

## Frontend

### Sidebar — "Customers" group after Sales
- Customer List → /customers
- AR Aging Report → /customers/reports/aging

### Customer List Page — /customers
- Search, type filter chips, summary cards (total with balance, receivables, overdue)
- Table with color-coded balance column
- Click → detail page

### Customer Detail Page — /customers/:id
- Header with name, type, credit limit, balance
- Quick actions: Record Payment, Print SOA, Edit
- Tabs: Transactions, Sales History, Statement

### Record Payment Modal
- Amount (default full balance), payment method, reference number, notes

### AR Aging Report — /customers/reports/aging
- Aging bucket table with totals, CSV export

### SOA Print
- Browser print with @media print CSS, date range picker
