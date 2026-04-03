# Customer Accounts & Accounts Receivable — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a Customer Accounts module that enables credit sales (charge to account), tracks outstanding balances via an immutable AR ledger, supports payment collection, and provides aging reports and statements of account.

**Architecture:** Extend the existing `customers` table with AR columns. New `customer_transactions` immutable ledger table. Balance updates happen inline in the existing `completeSale` transaction (same pattern as inventory deduction). Credit limit override via existing `verifyPin` service.

**Tech Stack:** Drizzle ORM, Fastify 5, Zod validation, React + TanStack Query, browser print with @media print CSS.

---

### Task 1: Schema — Extend customers table & create customer_transactions

**Files:**
- Modify: `packages/database/src/schema/customers.ts`
- Create: `packages/database/src/schema/customer-transactions.ts`
- Modify: `packages/database/src/schema/index.ts` (add export)
- Create: `packages/database/migrations/0034_customer_accounts_ar.sql`

**Step 1: Update customers schema**

In `packages/database/src/schema/customers.ts`, add the new columns and imports:

```typescript
import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  text,
  numeric,
  integer,
  boolean,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";

export const customerTypeEnum = pgEnum("customer_type", [
  "INDIVIDUAL",
  "SHOP",
  "FLEET",
  "WHOLESALE",
]);

export const customers = pgTable(
  "customers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    customerType: customerTypeEnum("customer_type").notNull().default("INDIVIDUAL"),
    contactPerson: varchar("contact_person", { length: 255 }),
    phone: varchar("phone", { length: 50 }).notNull(),
    email: varchar("email", { length: 255 }),
    address: text("address"),
    tin: varchar("tin", { length: 20 }),
    creditLimit: numeric("credit_limit", { precision: 12, scale: 2 })
      .notNull()
      .default("0.00"),
    paymentTermsDays: integer("payment_terms_days").notNull().default(30),
    currentBalance: numeric("current_balance", { precision: 12, scale: 2 })
      .notNull()
      .default("0.00"),
    totalPurchases: numeric("total_purchases", { precision: 14, scale: 2 })
      .notNull()
      .default("0.00"),
    notes: text("notes"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("idx_customers_org_phone").on(table.orgId, table.phone),
    index("idx_customers_org_id").on(table.orgId),
    index("idx_customers_name").on(table.name),
    index("idx_customers_org_type").on(table.orgId, table.customerType),
    index("idx_customers_org_active").on(table.orgId, table.isActive),
  ],
);
```

**Step 2: Create customer-transactions schema**

Create `packages/database/src/schema/customer-transactions.ts`:

```typescript
import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  numeric,
  text,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { customers } from "./customers";
import { users } from "./users";

export const customerTransactionTypeEnum = pgEnum("customer_transaction_type", [
  "CHARGE",
  "PAYMENT",
  "CREDIT_NOTE",
  "ADJUSTMENT",
]);

export const customerTransactions = pgTable(
  "customer_transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "restrict" }),
    type: customerTransactionTypeEnum("type").notNull(),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    balanceAfter: numeric("balance_after", { precision: 12, scale: 2 }).notNull(),
    referenceType: varchar("reference_type", { length: 50 }),
    referenceId: uuid("reference_id"),
    referenceNumber: varchar("reference_number", { length: 100 }),
    paymentMethod: varchar("payment_method", { length: 50 }),
    notes: text("notes"),
    recordedBy: uuid("recorded_by")
      .notNull()
      .references(() => users.id),
    recordedAt: timestamp("recorded_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_ct_org_customer_date").on(
      table.orgId,
      table.customerId,
      table.recordedAt,
    ),
    index("idx_ct_org_reference").on(table.orgId, table.referenceId),
  ],
);
```

**Step 3: Add barrel export**

In `packages/database/src/schema/index.ts`, add after the `customer-vehicles` export:

```typescript
export * from "./customer-transactions";
```

**Step 4: Generate and write migration**

Create `packages/database/migrations/0034_customer_accounts_ar.sql`:

```sql
-- Customer Accounts & AR: extend customers, create customer_transactions

-- Enum for customer classification
DO $$ BEGIN
  CREATE TYPE "customer_type" AS ENUM ('INDIVIDUAL', 'SHOP', 'FLEET', 'WHOLESALE');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Enum for AR transaction types
DO $$ BEGIN
  CREATE TYPE "customer_transaction_type" AS ENUM ('CHARGE', 'PAYMENT', 'CREDIT_NOTE', 'ADJUSTMENT');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Extend customers table with AR columns
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "customer_type" "customer_type" NOT NULL DEFAULT 'INDIVIDUAL';
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "contact_person" varchar(255);
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "email" varchar(255);
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "address" text;
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "tin" varchar(20);
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "credit_limit" numeric(12, 2) NOT NULL DEFAULT '0.00';
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "payment_terms_days" integer NOT NULL DEFAULT 30;
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "current_balance" numeric(12, 2) NOT NULL DEFAULT '0.00';
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "total_purchases" numeric(14, 2) NOT NULL DEFAULT '0.00';
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "is_active" boolean NOT NULL DEFAULT true;

-- Widen notes from VARCHAR(1000) to TEXT
ALTER TABLE "customers" ALTER COLUMN "notes" TYPE text;

-- New indexes
CREATE INDEX IF NOT EXISTS "idx_customers_org_type" ON "customers" ("org_id", "customer_type");
CREATE INDEX IF NOT EXISTS "idx_customers_org_active" ON "customers" ("org_id", "is_active");

-- Customer transactions (immutable AR ledger)
CREATE TABLE IF NOT EXISTS "customer_transactions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "customer_id" uuid NOT NULL REFERENCES "customers"("id") ON DELETE RESTRICT,
  "type" "customer_transaction_type" NOT NULL,
  "amount" numeric(12, 2) NOT NULL,
  "balance_after" numeric(12, 2) NOT NULL,
  "reference_type" varchar(50),
  "reference_id" uuid,
  "reference_number" varchar(100),
  "payment_method" varchar(50),
  "notes" text,
  "recorded_by" uuid NOT NULL REFERENCES "users"("id"),
  "recorded_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_ct_org_customer_date" ON "customer_transactions" ("org_id", "customer_id", "recorded_at");
CREATE INDEX IF NOT EXISTS "idx_ct_org_reference" ON "customer_transactions" ("org_id", "reference_id");
```

**Step 5: Run migration**

```bash
cd C:/Users/Admin/Downloads/CLAUDE/APEX_POS && pnpm db:generate
```

Then verify the generated SQL matches expectations. If Drizzle generate creates a separate migration, that's fine — use it instead of the hand-written one. Then:

```bash
pnpm db:migrate
```

**Step 6: Verify**

```bash
pnpm db:studio
```

Check that `customers` table has new columns and `customer_transactions` table exists.

**Step 7: Commit**

```bash
git add packages/database/src/schema/customers.ts packages/database/src/schema/customer-transactions.ts packages/database/src/schema/index.ts packages/database/migrations/0034_customer_accounts_ar.sql
git commit -m "feat(db): extend customers table with AR fields, create customer_transactions ledger"
```

---

### Task 2: Types — Zod schemas and enums for customer AR

**Files:**
- Modify: `packages/types/src/enums.ts`
- Modify: `packages/types/src/schemas.ts`

**Step 1: Add enums and role constants**

In `packages/types/src/enums.ts`, add after the existing `PaymentMethod` block:

```typescript
export const CustomerType = {
  INDIVIDUAL: "INDIVIDUAL",
  SHOP: "SHOP",
  FLEET: "FLEET",
  WHOLESALE: "WHOLESALE",
} as const;
export type CustomerType = (typeof CustomerType)[keyof typeof CustomerType];

export const CustomerTransactionType = {
  CHARGE: "CHARGE",
  PAYMENT: "PAYMENT",
  CREDIT_NOTE: "CREDIT_NOTE",
  ADJUSTMENT: "ADJUSTMENT",
} as const;
export type CustomerTransactionType =
  (typeof CustomerTransactionType)[keyof typeof CustomerTransactionType];

/** Roles allowed to manage customer accounts (create, edit, record payments) */
export const AR_ROLES = [UserRole.ADMIN, UserRole.MANAGER] as const;
```

**Step 2: Add Zod schemas**

In `packages/types/src/schemas.ts`, replace the existing `createCustomerSchema` block and add new schemas after it:

```typescript
// ══════════════════════════════════════════════
// Customer Accounts & AR
// ══════════════════════════════════════════════

const CUSTOMER_TYPES = ["INDIVIDUAL", "SHOP", "FLEET", "WHOLESALE"] as const;

// ── Customer: Create (updated with AR fields) ──
export const createCustomerSchema = z.object({
  name: z.string().min(1).max(255),
  customerType: z.enum(CUSTOMER_TYPES).default("INDIVIDUAL"),
  contactPerson: z.string().max(255).optional(),
  phone: z.string().min(1).max(50),
  email: z.string().email().max(255).optional(),
  address: z.string().max(2000).optional(),
  tin: z.string().max(20).optional(),
  creditLimit: z.string().default("0.00").refine(
    (val) => /^\d+(\.\d{1,2})?$/.test(val),
    { message: "Credit limit must be a valid decimal" },
  ),
  paymentTermsDays: z.number().int().min(1).max(365).default(30),
  notes: z.string().max(5000).optional(),
});
export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;

// ── Customer: Update ──
export const updateCustomerSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  customerType: z.enum(CUSTOMER_TYPES).optional(),
  contactPerson: z.string().max(255).nullable().optional(),
  phone: z.string().min(1).max(50).optional(),
  email: z.string().email().max(255).nullable().optional(),
  address: z.string().max(2000).nullable().optional(),
  tin: z.string().max(20).nullable().optional(),
  creditLimit: z.string().refine(
    (val) => /^\d+(\.\d{1,2})?$/.test(val),
    { message: "Credit limit must be a valid decimal" },
  ).optional(),
  paymentTermsDays: z.number().int().min(1).max(365).optional(),
  notes: z.string().max(5000).nullable().optional(),
  isActive: z.boolean().optional(),
});
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;

// ── Customer: Record Payment ──
export const recordPaymentSchema = z.object({
  amount: z.string().min(1).refine(
    (val) => /^\d+(\.\d{1,2})?$/.test(val) && parseFloat(val) > 0,
    { message: "Amount must be a positive decimal" },
  ),
  paymentMethod: z.enum(["CASH", "BANK_TRANSFER", "CHECK", "GCASH", "MAYA", "QRPH", "OTHER"]),
  referenceNumber: z.string().max(100).optional(),
  notes: z.string().max(1000).optional(),
});
export type RecordPaymentInput = z.infer<typeof recordPaymentSchema>;

// ── Customer: Manual Adjustment ──
export const customerAdjustmentSchema = z.object({
  amount: z.string().min(1).refine(
    (val) => /^-?\d+(\.\d{1,2})?$/.test(val) && parseFloat(val) !== 0,
    { message: "Amount must be a non-zero decimal (positive to increase, negative to decrease)" },
  ),
  notes: z.string().min(1).max(1000),
});
export type CustomerAdjustmentInput = z.infer<typeof customerAdjustmentSchema>;

// ── Complete Sale: add overrideApproval for credit limit override ──
// (update the existing completeSaleSchema)
export const creditLimitOverrideSchema = z.object({
  pin: z.string().length(4),
});
export type CreditLimitOverrideInput = z.infer<typeof creditLimitOverrideSchema>;
```

Also update `completeSaleSchema` to accept an optional override:

```typescript
export const completeSaleSchema = z.object({
  idempotencyKey: z.string().min(1).max(255),
  payments: z
    .array(
      z.object({
        method: z.enum(PAYMENT_METHODS),
        amount: z.string().min(1),
        reference: z.string().max(255).optional(),
        notes: z.string().max(500).optional(),
      }),
    )
    .optional(),
  allowNegativeStock: z.boolean().optional(),
  overrideApproval: z.object({
    pin: z.string().length(4),
  }).optional(),
});
```

**Step 3: Commit**

```bash
git add packages/types/src/enums.ts packages/types/src/schemas.ts
git commit -m "feat(types): add customer AR schemas, enums, and credit limit override"
```

---

### Task 3: Backend — Customer AR service

**Files:**
- Create: `apps/api/src/modules/customers/service.ts`

**Step 1: Create the service**

Create `apps/api/src/modules/customers/service.ts` with these functions:

1. **`listCustomers(orgId, opts)`** — search (ILIKE on name, phone, email), filter by type/hasBalance/isActive, sortBy, cursor pagination. Returns `{ data, nextCursor, hasMore }`.

2. **`getCustomer(customerId, orgId)`** — full customer detail + last 10 transactions.

3. **`createCustomer(input, orgId)`** — insert with all AR fields.

4. **`updateCustomer(customerId, input, orgId)`** — PATCH update.

5. **`softDeleteCustomer(customerId, orgId)`** — set `is_active=false` only if `current_balance = 0`.

6. **`recordPayment(customerId, input, orgId, userId)`** — in a transaction:
   - `SELECT FOR UPDATE` on customer row
   - Validate amount > 0 and amount <= current_balance
   - Update `current_balance -= amount`
   - Insert `customer_transactions` record with type=PAYMENT, balanceAfter
   - Return the transaction record

7. **`recordAdjustment(customerId, input, orgId, userId)`** — in a transaction:
   - `SELECT FOR UPDATE` on customer row
   - Parse amount (positive = increase balance, negative = decrease)
   - Update `current_balance += amount`
   - Insert `customer_transactions` record with type=ADJUSTMENT, balanceAfter
   - Return the transaction record

8. **`listTransactions(customerId, orgId, opts)`** — filter by type, date range. Cursor pagination newest first.

9. **`chargeCustomerAccount(tx, customerId, orgId, saleId, saleNo, amount, userId, overridePin?)`** — called from completeSale. In the SAME transaction (tx passed in):
   - Lock customer row with `SELECT FOR UPDATE`
   - Validate customer exists and is_active
   - Check credit limit: if `credit_limit > 0` and `current_balance + amount > credit_limit`:
     - If no overridePin: throw error with code `CREDIT_LIMIT_EXCEEDED`, overage, currentBalance, creditLimit
     - If overridePin: call `verifyPin(orgId, pin)`, throw if invalid
   - Update `current_balance += amount`, `total_purchases += amount`
   - Insert `customer_transactions` with type=CHARGE, reference_type='sale', reference_id=saleId, reference_number=saleNo

**Key patterns to follow:**
- Use `db.transaction()` for all balance-modifying operations
- Use `sql\`SELECT ... FOR UPDATE\`` for row-level locking (same as `lockInventoryRow` in sales service)
- Use `and()`, `eq()`, `ilike()`, `desc()` from drizzle-orm
- Return `{ data, nextCursor, hasMore }` for paginated queries

**Step 2: Commit**

```bash
git add apps/api/src/modules/customers/service.ts
git commit -m "feat(api): customer AR service with payments, adjustments, and charge-to-account"
```

---

### Task 4: Backend — Customer AR routes

**Files:**
- Modify: `apps/api/src/modules/customers/routes.ts`

**Step 1: Rewrite routes.ts**

Replace the existing `routes.ts` with the full CRUD + AR endpoints. Keep the existing `/search`, `POST /`, and vehicle endpoints. Add:

- **GET /** — list with search, type filter, hasBalance filter, sortBy, cursor pagination
- **GET /:id** — customer detail with recent transactions
- **PATCH /:id** — update customer (AR_ROLES)
- **DELETE /:id** — soft-delete if balance = 0 (ADMIN only)
- **GET /:id/transactions** — transaction ledger with filters
- **POST /:id/payments** — record payment (AR_ROLES)
- **POST /:id/adjustments** — manual adjustment (ADMIN only)

**Route structure pattern** (follow existing sales/routes.ts):
```typescript
import { AR_ROLES } from "@apex/types";
import { createCustomerSchema, updateCustomerSchema, recordPaymentSchema, customerAdjustmentSchema } from "@apex/types";
import { listCustomers, getCustomer, createCustomer, updateCustomer, softDeleteCustomer, recordPayment, recordAdjustment, listTransactions } from "./service";

function assertArRole(role: string) {
  if (!AR_ROLES.includes(role as any)) {
    throw new Error("Insufficient role for customer account operations");
  }
}

function assertAdmin(role: string) {
  if (role !== "ADMIN") {
    throw new Error("Only ADMIN can perform this operation");
  }
}
```

Each handler: parse query/body with Zod safeParse, call service, return response.

For **GET /**, parse query params: `search`, `type`, `hasBalance` (string "true"/"false"), `sortBy`, `cursor`, `limit`.

For **POST /:id/payments**, return 400 if amount > balance with clear message.

**Step 2: Commit**

```bash
git add apps/api/src/modules/customers/routes.ts
git commit -m "feat(api): customer CRUD + AR routes (payments, adjustments, transactions)"
```

---

### Task 5: Backend — Reports endpoints (aging, SOA, summary)

**Files:**
- Create: `apps/api/src/modules/customers/reports.ts`
- Modify: `apps/api/src/modules/customers/routes.ts` (register reports sub-plugin)

OR register as separate routes in the existing routes file.

**Step 1: Implement report functions in service.ts**

Add to `apps/api/src/modules/customers/service.ts`:

1. **`getAgingReport(orgId)`** — query all customers with balance > 0. For each, query their CHARGE transactions and group by age buckets (0-30, 31-60, 61-90, 90+ days since recorded_at). Use SQL `CASE WHEN` for bucket calculation:

```sql
SELECT
  c.id, c.name, c.current_balance,
  SUM(CASE WHEN ct.recorded_at >= NOW() - INTERVAL '30 days' THEN ct.amount ELSE 0 END) as "current",
  SUM(CASE WHEN ct.recorded_at < NOW() - INTERVAL '30 days' AND ct.recorded_at >= NOW() - INTERVAL '60 days' THEN ct.amount ELSE 0 END) as "days31to60",
  SUM(CASE WHEN ct.recorded_at < NOW() - INTERVAL '60 days' AND ct.recorded_at >= NOW() - INTERVAL '90 days' THEN ct.amount ELSE 0 END) as "days61to90",
  SUM(CASE WHEN ct.recorded_at < NOW() - INTERVAL '90 days' THEN ct.amount ELSE 0 END) as "over90"
FROM customers c
JOIN customer_transactions ct ON ct.customer_id = c.id AND ct.type = 'CHARGE'
WHERE c.org_id = $1 AND c.current_balance > 0
GROUP BY c.id, c.name, c.current_balance
ORDER BY c.current_balance DESC
```

Note: This is a simplified aging approach — it ages individual CHARGE transactions, not net-of-payments. Payments reduce the `current_balance` but don't cancel specific charges. This is the pool-based approach specified in the design (v1, out of scope: partial payment allocation to specific invoices).

2. **`getSOA(customerId, orgId, from, to)`** — fetch all transactions in date range, ordered by recorded_at ASC. Include opening balance (sum of all transactions before `from` date). Return: `{ customer, openingBalance, transactions[], closingBalance }`.

3. **`getARSummary(orgId)`** — aggregate query:
   - Total receivables: `SUM(current_balance) WHERE current_balance > 0`
   - Customer count with balance: `COUNT(*) WHERE current_balance > 0`
   - Average DSO: `AVG(EXTRACT(EPOCH FROM NOW() - latest_charge_date) / 86400)` for customers with balance

**Step 2: Add report routes**

In `routes.ts`, add these before the `/:id` routes (so `/reports/*` doesn't match as `:id`):

- **GET /reports/aging** — returns aging report array
- **GET /reports/soa/:customerId?from=&to=** — returns SOA data
- **GET /reports/summary** — returns AR summary

**Step 3: Commit**

```bash
git add apps/api/src/modules/customers/service.ts apps/api/src/modules/customers/routes.ts
git commit -m "feat(api): AR reports — aging, SOA, and summary endpoints"
```

---

### Task 6: Backend — Sales integration (charge to account in completeSale)

**Files:**
- Modify: `apps/api/src/modules/sales/service.ts` (completeSale function)
- Modify: `packages/types/src/schemas.ts` (completeSaleSchema already updated in Task 2)

**Step 1: Modify completeSale**

In `apps/api/src/modules/sales/service.ts`, after the payment records insertion (line ~507) and before the shift logic:

```typescript
// ── Charge-to-Account: update customer AR balance ──
const accountPayment = input.payments?.find((p) => p.method === "ACCOUNT");
if (accountPayment) {
  if (!sale.customer_id) {
    throw new Error("Cannot charge to account without a customer on the sale");
  }
  await chargeCustomerAccount(
    tx,
    sale.customer_id,
    orgId,
    saleId,
    sale.sale_no,
    grandTotal,
    userId,
    input.overrideApproval?.pin,
  );
}
```

Import `chargeCustomerAccount` from the customer service.

**Step 2: Handle the CREDIT_LIMIT_EXCEEDED error in sales routes**

In `apps/api/src/modules/sales/routes.ts`, the `POST /:id/complete` handler should catch the specific error:

```typescript
try {
  const result = await completeSale(saleId, orgId, userId, parsed.data);
  return reply.send(result);
} catch (err: any) {
  if (err.code === "CREDIT_LIMIT_EXCEEDED") {
    return reply.status(409).send({
      error: err.message,
      code: "CREDIT_LIMIT_EXCEEDED",
      overage: err.overage,
      currentBalance: err.currentBalance,
      creditLimit: err.creditLimit,
    });
  }
  return reply.status(400).send({ error: err.message });
}
```

In the service, throw a custom error:

```typescript
class CreditLimitError extends Error {
  code = "CREDIT_LIMIT_EXCEEDED";
  constructor(
    public overage: number,
    public currentBalance: number,
    public creditLimit: number,
  ) {
    super(
      `Charge would exceed credit limit by ₱${overage.toFixed(2)}`,
    );
  }
}
```

**Step 3: Verify existing tests still pass**

```bash
cd C:/Users/Admin/Downloads/CLAUDE/APEX_POS && pnpm build
```

**Step 4: Commit**

```bash
git add apps/api/src/modules/sales/service.ts apps/api/src/modules/sales/routes.ts apps/api/src/modules/customers/service.ts
git commit -m "feat(api): charge-to-account in completeSale with credit limit override"
```

---

### Task 7: Frontend — Customer hooks and API functions

**Files:**
- Create: `apps/web/src/hooks/use-customers-query.ts`

**Step 1: Create query hooks**

```typescript
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

// Types
export interface Customer {
  id: string;
  orgId: string;
  name: string;
  customerType: "INDIVIDUAL" | "SHOP" | "FLEET" | "WHOLESALE";
  contactPerson: string | null;
  phone: string;
  email: string | null;
  address: string | null;
  tin: string | null;
  creditLimit: string;
  paymentTermsDays: number;
  currentBalance: string;
  totalPurchases: string;
  notes: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerTransaction {
  id: string;
  customerId: string;
  type: "CHARGE" | "PAYMENT" | "CREDIT_NOTE" | "ADJUSTMENT";
  amount: string;
  balanceAfter: string;
  referenceType: string | null;
  referenceId: string | null;
  referenceNumber: string | null;
  paymentMethod: string | null;
  notes: string | null;
  recordedBy: string;
  recordedAt: string;
}

export interface CustomerListFilters {
  search?: string;
  type?: string;
  hasBalance?: boolean;
  sortBy?: string;
  cursor?: string;
  limit?: number;
}

// Hooks
export function useCustomerList(token, locationId, filters) { ... }
export function useCustomer(token, locationId, customerId) { ... }
export function useCustomerTransactions(token, locationId, customerId, filters) { ... }
export function useAgingReport(token, locationId) { ... }
export function useSOA(token, locationId, customerId, from, to) { ... }
export function useARSummary(token, locationId) { ... }
```

Follow the pattern from `use-sales-query.ts`: queryKey includes filters and locationId, enabled guard on token && locationId, staleTime 15_000.

**Step 2: Commit**

```bash
git add apps/web/src/hooks/use-customers-query.ts
git commit -m "feat(web): customer AR query hooks"
```

---

### Task 8: Frontend — Customer List Page

**Files:**
- Modify: `apps/web/src/app/customers/page.tsx` (replace PageShell placeholder)

**Step 1: Build the customer list page**

Replace the PageShell with a full page:

1. **Header**: Users icon, "Customer List" title, "+ New Customer" button (visible for ADMIN/MANAGER)
2. **Summary cards row**:
   - Total customers with balance (amber if > 0)
   - Total receivables in PHP
   - Overdue count + amount (red)
3. **Filter bar**:
   - Search input (debounced 300ms, searches name/phone/email)
   - Type filter chips: All | Individual | Shop | Fleet | Wholesale
4. **Table**:
   - Columns: Customer (name + contact_person subtitle), Type badge, Phone, Credit Limit, Balance (color-coded: green=0, amber=within terms, red=overdue), Last Activity
   - Balance color logic: `currentBalance === "0.00"` → green, overdue (check payment_terms_days vs last charge date) → red, else → amber
   - Row click → `router.push(\`/customers/${id}\`)`
   - Sort by clicking column headers (name, balance, totalPurchases)
5. **Pagination**: cursor-based, "Load More" button when hasMore=true

**Step 2: Build the Create/Edit Customer Modal**

Inline in the same file or a separate component. Fields:
- Name*, Phone*, Customer Type dropdown, Contact Person, Email, Address (textarea), TIN, Credit Limit (PHP), Payment Terms (days dropdown: 7, 15, 30, 60), Notes

POST to `/customers` for create, PATCH to `/customers/:id` for edit.

**Step 3: Commit**

```bash
git add apps/web/src/app/customers/page.tsx
git commit -m "feat(web): customer list page with search, filters, summary cards, and CRUD modal"
```

---

### Task 9: Frontend — Customer Detail Page

**Files:**
- Create: `apps/web/src/app/customers/[id]/page.tsx`

**Step 1: Build the detail page**

1. **Header section**:
   - Customer name (large), type badge, active/inactive badge
   - Contact info row: phone, email, address
   - Prominent balance display: current balance in large text (color-coded), credit limit, payment terms
   - Action buttons: "Record Payment" (opens modal), "Print SOA" (opens SOA tab + triggers print), "Edit" (opens edit modal)

2. **Tabs** (use simple state-based tab switching):

   **Tab 1: Transactions** (default)
   - Full ledger table: Date, Type (badge: CHARGE=blue, PAYMENT=green, CREDIT_NOTE=amber, ADJUSTMENT=gray), Description (reference_number or notes), Debit, Credit, Balance After
   - Filter by type dropdown, date range inputs
   - Cursor pagination newest first

   **Tab 2: Sales History**
   - Reuse the sales list query filtered by `customerId`
   - Table: Sale No, Date, Status, Grand Total
   - Click → navigate to sale detail

   **Tab 3: Statement of Account**
   - Date range picker (default: current month)
   - SOA table: Date, Description, Debit, Credit, Running Balance
   - Opening balance row at top, closing balance row at bottom
   - "Print" button → `window.print()` with `@media print` hiding non-SOA elements

**Step 2: Build the Record Payment Modal**

Triggered from detail page header or customer list:
- Amount input (default to full current_balance)
- Payment Method dropdown: CASH, BANK_TRANSFER, CHECK, GCASH, MAYA, QRPH, OTHER
- Reference Number input
- Notes textarea
- "Apply Payment" button
- Validation: amount > 0, amount <= currentBalance

POST to `/customers/:id/payments`, refetch customer + transactions on success.

**Step 3: Commit**

```bash
git add apps/web/src/app/customers/[id]/page.tsx
git commit -m "feat(web): customer detail page with transactions, sales history, SOA, and payment modal"
```

---

### Task 10: Frontend — AR Aging Report Page

**Files:**
- Create: `apps/web/src/app/customers/reports/aging/page.tsx`

**Step 1: Build the aging report page**

1. **Header**: BarChart3 icon, "AR Aging Report" title
2. **Summary row**: Total receivables, total customers with balance
3. **Table**:
   - Columns: Customer (name), Current (0-30), 31-60, 61-90, Over 90, Total
   - Currency formatted with commas and 2 decimals
   - Totals row at bottom (bold, summing each column)
   - Sort by total descending by default
4. **Export button**: "Export CSV" — generate CSV string from table data, trigger download via Blob + URL.createObjectURL

**Step 2: Commit**

```bash
git add apps/web/src/app/customers/reports/aging/page.tsx
git commit -m "feat(web): AR aging report page with CSV export"
```

---

### Task 11: Frontend — SOA Print Styles

**Files:**
- Modify: `apps/web/src/app/customers/[id]/page.tsx` (SOA tab)
- Modify: `apps/web/src/app/globals.css` (add @media print rules)

**Step 1: Add print styles**

In `globals.css`, add:

```css
@media print {
  /* Hide everything except the SOA content */
  body > *:not(.print-soa-container) {
    display: none !important;
  }
  .no-print {
    display: none !important;
  }
  .print-soa-container {
    display: block !important;
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
  }
}
```

**Step 2: SOA print layout**

In the Statement tab, wrap SOA content in a `print-soa-container` div. Format:
- Company header (from org settings if available, else "APEX AUTO PARTS")
- "Statement of Account" title
- Customer name, address, date range, terms
- Transaction table with Debit/Credit/Balance columns
- Opening balance, all transactions, closing balance
- Footer: Total Due, Overdue amount

The "Print" button calls `window.print()`.

**Step 3: Commit**

```bash
git add apps/web/src/app/customers/[id]/page.tsx apps/web/src/app/globals.css
git commit -m "feat(web): SOA print layout with @media print styles"
```

---

### Task 12: Frontend — Sidebar Navigation Update

**Files:**
- Modify: `apps/web/src/app/sidebar.tsx`

**Step 1: Update sidebar nav**

Find the existing "Customers" group in NAV_TOP and update it to include the AR report:

```typescript
{
  kind: "group",
  label: "Customers",
  icon: Users,
  match: /^\/customers/,
  children: [
    { label: "Customer List", href: "/customers" },
    { label: "AR Aging Report", href: "/customers/reports/aging" },
  ],
},
```

This group should already exist in the sidebar (the exploration showed it with "Customer List" and "Customer Vehicles"). Update it — replace "Customer Vehicles" with "AR Aging Report" (vehicles are accessed from the customer detail page, not a standalone nav item).

**Step 2: Verify navigation works**

```bash
cd C:/Users/Admin/Downloads/CLAUDE/APEX_POS && pnpm dev
```

Navigate to `/customers` and `/customers/reports/aging` in the browser.

**Step 3: Commit**

```bash
git add apps/web/src/app/sidebar.tsx
git commit -m "feat(web): update sidebar nav with AR Aging Report under Customers"
```

---

### Task 13: Build verification and integration test

**Step 1: Build check**

```bash
cd C:/Users/Admin/Downloads/CLAUDE/APEX_POS && pnpm build
```

Fix any TypeScript errors.

**Step 2: Start dev server and verify API**

```bash
pnpm dev
```

Test with curl:

```bash
# Create a customer
curl -X POST http://localhost:3000/customers \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -H "X-Location-ID: <location-id>" \
  -d '{"name":"Test Shop","phone":"09171234567","customerType":"SHOP","creditLimit":"50000.00"}'

# List customers
curl http://localhost:3000/customers?search=Test \
  -H "Authorization: Bearer <token>" \
  -H "X-Location-ID: <location-id>"

# Record payment
curl -X POST http://localhost:3000/customers/<id>/payments \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -H "X-Location-ID: <location-id>" \
  -d '{"amount":"1000.00","paymentMethod":"CASH","referenceNumber":"OR-001"}'

# Aging report
curl http://localhost:3000/customers/reports/aging \
  -H "Authorization: Bearer <token>" \
  -H "X-Location-ID: <location-id>"
```

**Step 3: Final commit**

```bash
git add -A
git commit -m "feat: customer accounts & AR module — complete implementation"
```
