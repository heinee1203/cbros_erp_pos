# Multi-Receipt PO Receiving Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable partial PO receiving with supplier DR numbers, line selection checkboxes, receipt batch headers, and grouped receipt history.

**Architecture:** New `po_receipts` batch header table linked to existing `po_receipt_events` via FK. API receives `supplierDrNo` in the receive endpoint, creates batch header in-transaction. Web UI adds checkbox selection, DR number input, progress bar, and collapsible receipt history grouped by DR.

**Tech Stack:** Drizzle ORM (Postgres), Fastify 5, React (Next.js 15), TanStack Query

---

### Task 1: Database Schema — po_receipts table

**Files:**
- Create: `packages/database/src/schema/po-receipts.ts`
- Modify: `packages/database/src/schema/purchase-orders.ts` (add `poReceiptId` column to `poReceiptEvents`)
- Modify: `packages/database/src/schema/index.ts` (add export)

**Step 1: Create po-receipts.ts schema file**

```typescript
// packages/database/src/schema/po-receipts.ts
import {
  pgTable,
  uuid,
  varchar,
  integer,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { purchaseOrders } from "./purchase-orders";
import { users } from "./users";

export const poReceipts = pgTable(
  "po_receipts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    purchaseOrderId: uuid("purchase_order_id")
      .notNull()
      .references(() => purchaseOrders.id, { onDelete: "cascade" }),
    supplierDrNo: varchar("supplier_dr_no", { length: 100 }).notNull(),
    receivedByUserId: uuid("received_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "set null" }),
    lineCount: integer("line_count").notNull(),
    totalAcceptedQty: integer("total_accepted_qty").notNull(),
    totalRejectedQty: integer("total_rejected_qty").notNull().default(0),
    notes: varchar("notes", { length: 1000 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_po_receipts_po_id").on(table.orgId, table.purchaseOrderId),
    index("idx_po_receipts_dr_no").on(table.orgId, table.supplierDrNo),
    uniqueIndex("idx_po_receipts_unique_dr").on(
      table.orgId,
      table.purchaseOrderId,
      table.supplierDrNo,
    ),
  ],
);
```

**Step 2: Add poReceiptId FK to poReceiptEvents in purchase-orders.ts**

In the `poReceiptEvents` table definition, add after the existing columns (before `createdAt`):

```typescript
    poReceiptId: uuid("po_receipt_id").references(() => poReceipts.id, {
      onDelete: "cascade",
    }),
```

Import `poReceipts` from `./po-receipts` at the top of purchase-orders.ts.

Also add an index in the table's index array:

```typescript
    index("idx_po_receipt_events_receipt_id").on(table.poReceiptId),
```

**Step 3: Export from index.ts**

Add before the `"./staging"` export line:

```typescript
export * from "./po-receipts";
```

**Step 4: Commit**

```bash
git add packages/database/src/schema/po-receipts.ts packages/database/src/schema/purchase-orders.ts packages/database/src/schema/index.ts
git commit -m "feat(db): add po_receipts batch header table and link to receipt events"
```

---

### Task 2: Database Migration

**Files:**
- Create: `packages/database/migrations/0022_po_receipts.sql`

**Step 1: Write migration SQL**

```sql
-- Receipt batch header
CREATE TABLE po_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  purchase_order_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  supplier_dr_no VARCHAR(100) NOT NULL,
  received_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  line_count INTEGER NOT NULL,
  total_accepted_qty INTEGER NOT NULL,
  total_rejected_qty INTEGER NOT NULL DEFAULT 0,
  notes VARCHAR(1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_po_receipts_po_id ON po_receipts (org_id, purchase_order_id);
CREATE INDEX idx_po_receipts_dr_no ON po_receipts (org_id, supplier_dr_no);
CREATE UNIQUE INDEX idx_po_receipts_unique_dr ON po_receipts (org_id, purchase_order_id, supplier_dr_no);

-- Link receipt events to batch header
ALTER TABLE po_receipt_events ADD COLUMN po_receipt_id UUID REFERENCES po_receipts(id) ON DELETE CASCADE;
CREATE INDEX idx_po_receipt_events_receipt_id ON po_receipt_events (po_receipt_id);
```

**Step 2: Run migration**

```bash
cd C:/Users/Admin/Downloads/CLAUDE/APEX_POS && pnpm db:migrate
```

Expected: Migration applies successfully. Existing `po_receipt_events` rows get NULL `po_receipt_id` — that's fine.

**Step 3: Verify with Drizzle generate (check schema sync)**

```bash
pnpm db:generate
```

Expected: No new migration generated (schema already matches DB). If a migration is generated, it means the Drizzle schema and SQL are in sync. Either way is fine — if a snapshot/journal file is generated, that's just Drizzle's internal tracking.

**Step 4: Commit**

```bash
git add packages/database/migrations/0022_po_receipts.sql
git commit -m "feat(db): migration 0022 — po_receipts table and receipt event FK"
```

---

### Task 3: Types — Add supplierDrNo to receivePOSchema

**Files:**
- Modify: `packages/types/src/schemas.ts:359-374`

**Step 1: Add supplierDrNo field to receivePOSchema**

In `packages/types/src/schemas.ts`, find the `receivePOSchema` definition and add `supplierDrNo` after `idempotencyKey`:

```typescript
export const receivePOSchema = z.object({
  idempotencyKey: z.string().min(1).max(255),
  supplierDrNo: z.string().min(1).max(100),
  lines: z
    .array(
      z.object({
        poLineId: z.string().uuid(),
        receivedAcceptedQty: z.number().int().min(0),
        rejectedQty: z.number().int().min(0),
        unitCost: z.string().min(1),
        notes: z.string().max(500).optional(),
      }),
    )
    .min(1),
  notes: z.string().max(1000).optional(),
});
```

**Step 2: Commit**

```bash
git add packages/types/src/schemas.ts
git commit -m "feat(types): add supplierDrNo to receivePOSchema"
```

---

### Task 4: API Service — Create receipt batch header in receivePO()

**Files:**
- Modify: `apps/api/src/modules/procurement/service.ts:1-12` (imports)
- Modify: `apps/api/src/modules/procurement/service.ts:293-406` (receivePO transaction body)

**Step 1: Add poReceipts import**

At the top of service.ts, add `poReceipts` to the schema import:

```typescript
import {
  purchaseOrders,
  poLines,
  poReceiptEvents,
  poReceipts,    // <-- ADD THIS
  inventory,
  stockJournal,
  locations,
  products,
  suppliers,
} from "@apex/database/schema";
```

**Step 2: Add DR number uniqueness check after status validation (after line 311)**

After the status validation block (`if (currentStatus !== ...)`), add:

```typescript
    // ── Step 2b: Check DR number uniqueness ──
    const existingDr = await tx
      .select({ id: poReceipts.id })
      .from(poReceipts)
      .where(
        and(
          eq(poReceipts.orgId, orgId),
          eq(poReceipts.purchaseOrderId, poId),
          eq(poReceipts.supplierDrNo, input.supplierDrNo),
        ),
      )
      .limit(1);

    if (existingDr.length > 0) {
      throw new Error(
        `DR number "${input.supplierDrNo}" already used on this PO`,
      );
    }
```

**Step 3: Create batch header after receipt line processing (after the `receiptResults` loop ends at ~line 406)**

After all receipt events have been inserted (after the `for (const lineInput of input.lines)` loop), add:

```typescript
    // ── Step 4b: Create receipt batch header ──
    const totalAccepted = receiptResults.reduce(
      (sum, r) => sum + r.acceptedQty,
      0,
    );
    const totalRejected = receiptResults.reduce(
      (sum, r) => sum + r.rejectedQty,
      0,
    );

    const [receipt] = await tx
      .insert(poReceipts)
      .values({
        orgId,
        purchaseOrderId: poId,
        supplierDrNo: input.supplierDrNo,
        receivedByUserId: userId,
        lineCount: receiptResults.length,
        totalAcceptedQty: totalAccepted,
        totalRejectedQty: totalRejected,
        notes: input.notes ?? null,
      })
      .returning();
```

**Step 4: Link receipt events to batch header**

After creating the batch header, update all receipt events from this batch to link them:

```typescript
    // Link receipt events to batch header
    const receiptEventIds = receiptResults.map((r) => r.receiptEventId);
    if (receiptEventIds.length > 0) {
      await tx
        .update(poReceiptEvents)
        .set({ poReceiptId: receipt.id })
        .where(
          sql`${poReceiptEvents.id} = ANY(${receiptEventIds}::uuid[])`,
        );
    }
```

**Alternative approach (simpler):** Instead of updating after insert, modify the receipt event insert (at ~line 381-396) to include `poReceiptId`. BUT this requires creating the batch header BEFORE the receipt events. Since we need totalAccepted/totalRejected for the header, and those come from validated results, we'd need to: 1) validate all lines first, 2) create header, 3) insert events with header ID. Let's use the update-after approach since it's simpler and doesn't require restructuring the loop.

**Step 5: Add receipt to return value**

In the return block at the end of the transaction (~line 556-566), add the receipt:

```typescript
    return {
      po: updatedPO,
      receipt: {
        id: receipt.id,
        supplierDrNo: receipt.supplierDrNo,
        lineCount: receipt.lineCount,
        totalAcceptedQty: receipt.totalAcceptedQty,
        totalRejectedQty: receipt.totalRejectedQty,
      },
      receiptEvents: receiptResults.map((r) => ({
        receiptEventId: r.receiptEventId,
        poLineId: r.poLineId,
        productId: r.productId,
        acceptedQty: r.acceptedQty,
        rejectedQty: r.rejectedQty,
        unitCost: r.unitCost,
      })),
    };
```

**Step 6: Commit**

```bash
git add apps/api/src/modules/procurement/service.ts
git commit -m "feat(api): create po_receipts batch header in receivePO transaction"
```

---

### Task 5: API Route — GET receipts endpoint

**Files:**
- Modify: `apps/api/src/modules/procurement/service.ts` (add `getPOReceipts` function)
- Modify: `apps/api/src/modules/procurement/routes.ts` (add GET endpoint)

**Step 1: Add getPOReceipts service function**

At the bottom of service.ts (before `closeWithVariance`), add:

```typescript
/**
 * Get all receipt batches for a PO, each with its line events.
 * Ordered by created_at DESC (most recent first).
 */
export async function getPOReceipts(poId: string, orgId: string) {
  // Fetch receipt headers
  const receipts = await db
    .select({
      id: poReceipts.id,
      supplierDrNo: poReceipts.supplierDrNo,
      lineCount: poReceipts.lineCount,
      totalAcceptedQty: poReceipts.totalAcceptedQty,
      totalRejectedQty: poReceipts.totalRejectedQty,
      receivedByUserId: poReceipts.receivedByUserId,
      notes: poReceipts.notes,
      createdAt: poReceipts.createdAt,
    })
    .from(poReceipts)
    .where(
      and(
        eq(poReceipts.orgId, orgId),
        eq(poReceipts.purchaseOrderId, poId),
      ),
    )
    .orderBy(sql`${poReceipts.createdAt} DESC`);

  if (receipts.length === 0) return [];

  // Fetch user names for all receivers
  const receiverIds = [...new Set(receipts.map((r) => r.receivedByUserId))];
  const receiverRows = await db
    .select({ id: users.id, fullName: users.fullName })
    .from(users)
    .where(sql`${users.id} = ANY(${receiverIds}::uuid[])`);
  const receiverMap = new Map(receiverRows.map((r) => [r.id, r.fullName]));

  // Fetch all receipt events for these receipts, joined with product info
  const receiptIds = receipts.map((r) => r.id);
  const events = await db
    .select({
      id: poReceiptEvents.id,
      poReceiptId: poReceiptEvents.poReceiptId,
      productId: poReceiptEvents.productId,
      acceptedQty: poReceiptEvents.receivedAcceptedQty,
      rejectedQty: poReceiptEvents.rejectedQty,
      unitCost: poReceiptEvents.unitCost,
      notes: poReceiptEvents.notes,
      productName: products.name,
      sku: products.sku,
      mnemonicSku: products.mnemonicSku,
    })
    .from(poReceiptEvents)
    .innerJoin(products, eq(poReceiptEvents.productId, products.id))
    .where(sql`${poReceiptEvents.poReceiptId} = ANY(${receiptIds}::uuid[])`)
    .orderBy(asc(poReceiptEvents.createdAt));

  // Group events by receipt ID
  const eventsByReceipt = new Map<string, typeof events>();
  for (const event of events) {
    const key = event.poReceiptId!;
    if (!eventsByReceipt.has(key)) eventsByReceipt.set(key, []);
    eventsByReceipt.get(key)!.push(event);
  }

  return receipts.map((r) => ({
    id: r.id,
    supplierDrNo: r.supplierDrNo,
    lineCount: r.lineCount,
    totalAcceptedQty: r.totalAcceptedQty,
    totalRejectedQty: r.totalRejectedQty,
    receivedBy: receiverMap.get(r.receivedByUserId) ?? "Unknown",
    notes: r.notes,
    createdAt: r.createdAt,
    lines: (eventsByReceipt.get(r.id) ?? []).map((e) => ({
      productName: e.productName,
      sku: e.sku,
      mnemonicSku: e.mnemonicSku,
      acceptedQty: e.acceptedQty,
      rejectedQty: e.rejectedQty,
      unitCost: e.unitCost,
      notes: e.notes,
    })),
  }));
}
```

**Step 2: Add imports needed**

Ensure `users` is imported from schema (add to existing import if missing).
Ensure `getPOReceipts` is imported in routes.ts.

**Step 3: Add GET route in routes.ts**

After the existing `receipt-events` endpoint block (~line 268), add:

```typescript
  // ─── GET /procurement/purchase-orders/:id/receipts ──
  // Get receipt batches grouped by DR number
  app.get(
    "/purchase-orders/:id/receipts",
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const { orgId } = request.storeContext!;
      const { role } = request.user;
      assertProcurementRole(role);

      const receipts = await getPOReceipts(id, orgId);
      return reply.send({ data: receipts });
    },
  );
```

Update the import at the top of routes.ts to include `getPOReceipts`.

**Step 4: Commit**

```bash
git add apps/api/src/modules/procurement/service.ts apps/api/src/modules/procurement/routes.ts
git commit -m "feat(api): GET /purchase-orders/:id/receipts endpoint with DR grouping"
```

---

### Task 6: Web Hooks — Update mutation + add receipts query

**Files:**
- Modify: `apps/web/src/hooks/use-po-mutations.ts:209-234`
- Modify: `apps/web/src/hooks/use-po-query.ts` (add types + hook)

**Step 1: Update ReceiptLineInput and useReceivePOMutation to include supplierDrNo**

In `use-po-mutations.ts`, update the `useReceivePOMutation` function:

```typescript
export function useReceivePOMutation(
  token: string,
  locationId: string,
  poNo: string,
) {
  return usePOMutation<{
    supplierDrNo: string;
    lines: ReceiptLineInput[];
    notes?: string;
  }>(token, locationId, poNo, {
    buildPath: (id) => `/procurement/purchase-orders/${id}/receive`,
    buildBody: (input, key) => ({
      idempotencyKey: key,
      supplierDrNo: input.supplierDrNo,
      lines: input.lines,
      notes: input.notes,
    }),
  });
}
```

**Step 2: Add receipt types and usePOReceipts hook to use-po-query.ts**

Append to the bottom of `use-po-query.ts`:

```typescript
// ── Receipt Batch Types ──

export interface POReceiptLine {
  productName: string;
  sku: string;
  mnemonicSku: string;
  acceptedQty: number;
  rejectedQty: number;
  unitCost: string;
  notes: string | null;
}

export interface POReceipt {
  id: string;
  supplierDrNo: string;
  lineCount: number;
  totalAcceptedQty: number;
  totalRejectedQty: number;
  receivedBy: string;
  notes: string | null;
  createdAt: string;
  lines: POReceiptLine[];
}

/**
 * Fetch receipt batches for a PO, grouped by DR number.
 */
export function usePOReceipts(
  poId: string,
  token: string,
  locationId: string,
) {
  return useQuery<{ data: POReceipt[] }>({
    queryKey: ["po-receipts", poId],
    queryFn: () =>
      apiFetch<{ data: POReceipt[] }>(
        `/procurement/purchase-orders/${poId}/receipts`,
        { token, locationId },
      ),
    enabled: !!poId && !!token && !!locationId,
    staleTime: 15_000,
  });
}
```

**Step 3: Invalidate po-receipts on receive success**

In `use-po-mutations.ts`, in the `onSuccess` callback of the generic `usePOMutation` (~line 93-95), add:

```typescript
      queryClient.invalidateQueries({ queryKey: ["po-receipts"] });
```

**Step 4: Commit**

```bash
git add apps/web/src/hooks/use-po-mutations.ts apps/web/src/hooks/use-po-query.ts
git commit -m "feat(web): add supplierDrNo to receive mutation, add usePOReceipts hook"
```

---

### Task 7: Web UI — ReceivingGrid with checkboxes + DR number input

**Files:**
- Modify: `apps/web/src/app/procurement/purchase-orders/[poNo]/page.tsx` (ReceivingGrid component, ~lines 246-823)

This is the largest change. Modify the ReceivingGrid component to add:

**Step 1: Add `checked` to LineState and `supplierDrNo` + `drError` state**

In the `LineState` interface, add:
```typescript
    checked: boolean;
```

In the initial state builder, set `checked: false` for each line.

Add new state variables:
```typescript
  const [supplierDrNo, setSupplierDrNo] = useState("");
  const [drError, setDrError] = useState<string | null>(null);
```

**Step 2: Add select-all logic**

```typescript
  const allChecked = receivableLines.length > 0 &&
    receivableLines.every((l) => lineStates[l.id]?.checked);
  const someChecked = receivableLines.some((l) => lineStates[l.id]?.checked);

  const toggleAll = useCallback(() => {
    setLineStates((prev) => {
      const next = { ...prev };
      const newVal = !allChecked;
      for (const line of receivableLines) {
        if (next[line.id]) {
          next[line.id] = { ...next[line.id], checked: newVal };
        }
      }
      return next;
    });
  }, [allChecked, receivableLines]);

  const toggleLine = useCallback((lineId: string) => {
    setLineStates((prev) => ({
      ...prev,
      [lineId]: { ...prev[lineId], checked: !prev[lineId]?.checked },
    }));
  }, []);
```

**Step 3: Modify scan handler to also check the line and fill remaining qty**

In the `handleScan` callback, after the existing highlight logic, add inside the `if (matchedLine)` block:

```typescript
          // Auto-check the line and fill remaining qty
          const remaining =
            matchedLine.orderedQty -
            matchedLine.receivedAcceptedQty -
            matchedLine.rejectedQty;
          if (next[matchedLine.id]) {
            next[matchedLine.id] = {
              ...next[matchedLine.id],
              highlighted: true,
              checked: true,
              acceptedQty: remaining,
              error: null,
            };
          }
```

**Step 4: Update hasValidLines to only consider checked lines**

```typescript
  const hasValidLines = useMemo(() => {
    return receivableLines.some((line) => {
      const state = lineStates[line.id];
      if (!state || !state.checked) return false;
      return (
        (state.acceptedQty > 0 || state.rejectedQty > 0) && !state.error
      );
    });
  }, [receivableLines, lineStates]);
```

**Step 5: Update hasAnyErrors to only consider checked lines**

```typescript
  const hasAnyErrors = useMemo(() => {
    return receivableLines.some((l) => {
      const s = lineStates[l.id];
      return s?.checked && s.error !== null;
    });
  }, [receivableLines, lineStates]);
```

**Step 6: Compute selection summary**

```typescript
  const selectedCount = receivableLines.filter(
    (l) => lineStates[l.id]?.checked,
  ).length;
  const selectedAccepted = receivableLines.reduce((sum, l) => {
    const s = lineStates[l.id];
    return sum + (s?.checked ? s.acceptedQty : 0);
  }, 0);
```

**Step 7: Update handlePostReceipt to include supplierDrNo and filter by checked**

```typescript
  const handlePostReceipt = useCallback(() => {
    if (!hasValidLines || hasAnyErrors || receiveMut.isSubmitting) return;
    if (!supplierDrNo.trim()) {
      setDrError("Supplier DR number is required");
      return;
    }
    setDrError(null);

    const lines: ReceiptLineInput[] = receivableLines
      .filter((line) => {
        const state = lineStates[line.id];
        return (
          state?.checked &&
          (state.acceptedQty > 0 || state.rejectedQty > 0)
        );
      })
      .map((line) => {
        const state = lineStates[line.id]!;
        return {
          poLineId: line.id,
          receivedAcceptedQty: state.acceptedQty,
          rejectedQty: state.rejectedQty,
          unitCost: state.unitCost,
        };
      });

    receiveMut.submit(po.id, {
      supplierDrNo: supplierDrNo.trim(),
      lines,
      notes: receiptNotes.trim() || undefined,
    });
  }, [
    hasValidLines,
    hasAnyErrors,
    receiveMut,
    receivableLines,
    lineStates,
    po.id,
    receiptNotes,
    supplierDrNo,
  ]);
```

**Step 8: Clear DR number on success**

In the existing `useEffect` that watches `receiveMut.status`, also clear `supplierDrNo`:

```typescript
  useEffect(() => {
    if (
      receiveMut.status === "success" ||
      receiveMut.status === "already_processed"
    ) {
      const timer = setTimeout(() => {
        receiveMut.reset();
        setSupplierDrNo("");
        setDrError(null);
        refetch();
      }, 1_500);
      return () => clearTimeout(timer);
    }
  }, [receiveMut.status, receiveMut, refetch]);
```

**Step 9: Add DR number input above the scan field in JSX**

Before the scan assist field div, add:

```jsx
      {/* ── Supplier DR Number ── */}
      <div className="mb-3">
        <label className="mb-1 block text-xs font-semibold text-foreground">
          Supplier DR Number <span className="text-destructive">*</span>
        </label>
        <input
          type="text"
          value={supplierDrNo}
          onChange={(e) => {
            setSupplierDrNo(e.target.value);
            if (drError) setDrError(null);
          }}
          placeholder="e.g. DR-2024-0892"
          disabled={receiveMut.isSubmitting}
          className={`w-full max-w-sm rounded-md border bg-background px-3 py-2 text-sm font-medium outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary/20 disabled:opacity-50 ${
            drError ? "border-destructive" : "border-border"
          }`}
        />
        {drError && (
          <p className="mt-1 text-xs text-destructive">{drError}</p>
        )}
      </div>
```

**Step 10: Add checkbox column to table**

Add a header checkbox after `<tr className="border-b border-border bg-muted/60">`:

```jsx
              <th scope="col" className="w-10 px-2 py-1.5">
                <input
                  type="checkbox"
                  checked={allChecked}
                  ref={(el) => {
                    if (el) el.indeterminate = someChecked && !allChecked;
                  }}
                  onChange={toggleAll}
                  disabled={receiveMut.isSubmitting}
                  className="h-3.5 w-3.5 rounded border-border accent-primary"
                />
              </th>
```

In each row `<tr>`, add as the FIRST `<td>`:

```jsx
                  <td className="px-2 py-1.5">
                    {isReceivable && (
                      <input
                        type="checkbox"
                        checked={state?.checked ?? false}
                        onChange={() => toggleLine(line.id)}
                        disabled={receiveMut.isSubmitting}
                        className="h-3.5 w-3.5 rounded border-border accent-primary"
                      />
                    )}
                  </td>
```

**Step 11: Dim unchecked rows**

Update the row className to include dim for unchecked receivable lines:

```jsx
                  className={`border-b border-border transition-colors ${
                    isHighlighted
                      ? "bg-primary/5 ring-1 ring-inset ring-primary/20"
                      : i % 2 === 0
                        ? "bg-background"
                        : "bg-muted/20"
                  } ${!isReceivable ? "opacity-40" : ""} ${
                    isReceivable && !state?.checked ? "opacity-50" : ""
                  }`}
```

**Step 12: Update selection summary and post button text**

Replace the Post Receipt button text to show DR + counts:

```jsx
        <button
          type="button"
          onClick={handlePostReceipt}
          disabled={
            !hasValidLines ||
            hasAnyErrors ||
            !supplierDrNo.trim() ||
            receiveMut.isSubmitting
          }
          className="rounded-md bg-success px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-success/90 disabled:cursor-not-allowed disabled:opacity-40 transition-colors"
        >
          {receiveMut.isSubmitting ? (
            <span className="flex items-center gap-2">
              <Spinner /> Posting Receipt...
            </span>
          ) : supplierDrNo.trim() ? (
            `Post Receipt for ${supplierDrNo.trim()}`
          ) : (
            "Post Receipt"
          )}
        </button>
        <span className="text-xs text-muted-foreground">
          {hasAnyErrors
            ? "Fix validation errors before posting"
            : !supplierDrNo.trim()
              ? "Enter supplier DR number"
              : !hasValidLines
                ? "Select lines and enter quantities"
                : `${selectedCount} lines, ${selectedAccepted} units accepted`}
        </span>
```

**Step 13: Add "Select All" summary text above table**

Before the table div, after the scan field:

```jsx
      {/* ── Selection summary ── */}
      <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
        <span>
          {selectedCount} of {receivableLines.length} remaining lines selected
        </span>
      </div>
```

**Step 14: Commit**

```bash
git add apps/web/src/app/procurement/purchase-orders/\[poNo\]/page.tsx
git commit -m "feat(web): checkbox line selection + DR number input in ReceivingGrid"
```

---

### Task 8: Web UI — Receipt Progress Bar

**Files:**
- Modify: `apps/web/src/app/procurement/purchase-orders/[poNo]/page.tsx` (PODetailView, ~line 104-232)

**Step 1: Compute progress metrics**

Inside `PODetailView`, before the return, add:

```typescript
  const totalOrdered = po.lines.reduce((sum, l) => sum + l.orderedQty, 0);
  const totalReceived = po.lines.reduce(
    (sum, l) => sum + l.receivedAcceptedQty,
    0,
  );
  const totalRejected = po.lines.reduce((sum, l) => sum + l.rejectedQty, 0);
  const totalRemaining = totalOrdered - totalReceived - totalRejected;
  const pctReceived =
    totalOrdered > 0 ? Math.round((totalReceived / totalOrdered) * 100) : 0;
  const receiptCount = po.receiptEvents.length > 0
    ? new Set(po.receiptEvents.map((e) => e.idempotencyKey.split(":RECEIPT:")[0])).size
    : 0;
```

Note: `receiptCount` is approximate from events. Once we switch to the receipts query this will be exact. For now this heuristic works — each `receivePO` call uses one idempotencyKey prefix.

**Step 2: Add progress bar in JSX**

After the timeline grid and before the receiving grid section, add:

```jsx
      {/* ── Receipt Progress ── */}
      {!isDraft && (
        <div className="rounded-lg border border-border p-3">
          <div className="mb-2 flex items-center justify-between text-xs">
            <span className="font-medium text-foreground">
              {totalOrdered} items ordered
            </span>
            <span className="text-muted-foreground">
              {totalReceived} received
              {totalRejected > 0 && ` · ${totalRejected} rejected`}
              {totalRemaining > 0 && ` · ${totalRemaining} remaining`}
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-success transition-all duration-500"
              style={{ width: `${pctReceived}%` }}
            />
          </div>
          <div className="mt-1.5 text-[10px] text-muted-foreground">
            {pctReceived}% received
          </div>
        </div>
      )}
```

**Step 3: Commit**

```bash
git add apps/web/src/app/procurement/purchase-orders/\[poNo\]/page.tsx
git commit -m "feat(web): receipt progress bar on PO detail page"
```

---

### Task 9: Web UI — Grouped Receipt History

**Files:**
- Modify: `apps/web/src/app/procurement/purchase-orders/[poNo]/page.tsx` (ReceiptHistory component + PODetailView)

**Step 1: Add imports for usePOReceipts**

At the top of the file, add to the existing use-po-query imports:

```typescript
import {
  usePOQuery,
  usePOReceipts,
  type PODetail,
  type POLine,
  type POReceipt,
} from "@/hooks/use-po-query";
```

**Step 2: Replace ReceiptHistory component**

Replace the entire `ReceiptHistory` function with:

```typescript
function ReceiptHistory({ po }: { po: PODetail }) {
  const { token, locationId } = useAuth();
  const receiptsQuery = usePOReceipts(po.id, token, locationId);
  const receipts = receiptsQuery.data?.data ?? [];

  // Default: most recent (first) expanded, rest collapsed
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // Expand first receipt on initial load
  useEffect(() => {
    if (receipts.length > 0 && expandedIds.size === 0) {
      setExpandedIds(new Set([receipts[0].id]));
    }
  }, [receipts]);

  const toggleReceipt = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Fallback: if no receipts from new endpoint, show legacy flat view
  if (receipts.length === 0 && po.receiptEvents.length > 0) {
    return <LegacyReceiptHistory po={po} />;
  }

  if (receipts.length === 0) return null;

  return (
    <section>
      <SectionHeader>
        Receipt History ({receipts.length} receipt{receipts.length !== 1 ? "s" : ""})
      </SectionHeader>
      <div className="space-y-3">
        {receipts.map((receipt) => {
          const isExpanded = expandedIds.has(receipt.id);
          return (
            <div
              key={receipt.id}
              className="overflow-hidden rounded-lg border border-border"
            >
              {/* Header — always visible, clickable */}
              <button
                type="button"
                onClick={() => toggleReceipt(receipt.id)}
                className="flex w-full items-center justify-between bg-muted/40 px-4 py-2.5 text-left transition-colors hover:bg-muted/60"
              >
                <div>
                  <span className="text-sm font-bold text-foreground">
                    {receipt.supplierDrNo}
                  </span>
                  <span className="ml-3 text-xs text-muted-foreground">
                    Received by {receipt.receivedBy} &middot;{" "}
                    {receipt.lineCount} line{receipt.lineCount !== 1 ? "s" : ""} &middot;{" "}
                    {receipt.totalAcceptedQty} units accepted
                    {receipt.totalRejectedQty > 0 &&
                      ` · ${receipt.totalRejectedQty} rejected`}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {new Date(receipt.createdAt).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  <svg
                    className={`h-4 w-4 text-muted-foreground transition-transform ${
                      isExpanded ? "rotate-180" : ""
                    }`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </div>
              </button>

              {/* Expandable line detail */}
              {isExpanded && (
                <div className="border-t border-border">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-muted/30">
                        <th scope="col" className="px-4 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          Product
                        </th>
                        <th scope="col" className="px-3 py-1.5 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          Accepted
                        </th>
                        <th scope="col" className="px-3 py-1.5 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          Rejected
                        </th>
                        <th scope="col" className="px-3 py-1.5 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          Unit Cost
                        </th>
                        <th scope="col" className="px-3 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          Notes
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {receipt.lines.map((line, i) => (
                        <tr
                          key={i}
                          className={`border-b border-border last:border-0 ${
                            i % 2 === 0 ? "bg-background" : "bg-muted/20"
                          }`}
                        >
                          <td className="px-4 py-1.5">
                            <div className="text-xs font-medium">
                              {line.productName}
                            </div>
                            <div className="flex items-center gap-1.5 mt-px">
                              <span className="rounded bg-primary/10 px-1 py-0.5 font-mono text-[10px] font-bold tracking-wider text-primary">
                                {line.mnemonicSku}
                              </span>
                              <span className="font-mono text-[10px] text-muted-foreground">
                                {line.sku}
                              </span>
                            </div>
                          </td>
                          <td className="px-3 py-1.5 text-right tabular-nums text-success font-medium">
                            {line.acceptedQty > 0
                              ? `+${line.acceptedQty}`
                              : "\u2014"}
                          </td>
                          <td className="px-3 py-1.5 text-right tabular-nums text-destructive font-medium">
                            {line.rejectedQty > 0
                              ? `-${line.rejectedQty}`
                              : "\u2014"}
                          </td>
                          <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                            {line.unitCost}
                          </td>
                          <td className="px-3 py-1.5 text-muted-foreground truncate max-w-[200px]">
                            {line.notes ?? "\u2014"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {receipt.notes && (
                    <div className="border-t border-border px-4 py-2 text-xs text-muted-foreground">
                      <strong>Notes:</strong> {receipt.notes}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
```

**Step 3: Rename old ReceiptHistory to LegacyReceiptHistory**

Keep the old flat receipt history as a fallback for POs that were received before this feature (events without `po_receipt_id`). Just rename:

```typescript
function LegacyReceiptHistory({ po }: { po: PODetail }) {
  // ... existing flat table code unchanged ...
}
```

**Step 4: Update PODetailView to always show ReceiptHistory**

Change the conditional rendering from:

```jsx
      {po.receiptEvents.length > 0 && (
        <ReceiptHistory po={po} />
      )}
```

To:

```jsx
      {(po.receiptEvents.length > 0 || !isDraft) && (
        <ReceiptHistory po={po} />
      )}
```

This ensures we show receipt history for any non-draft PO (the component itself handles the empty state).

**Step 5: Commit**

```bash
git add apps/web/src/app/procurement/purchase-orders/\[poNo\]/page.tsx
git commit -m "feat(web): collapsible receipt history grouped by DR number"
```

---

### Task 10: Verify end-to-end

**Step 1: Start API and verify it compiles**

```bash
cd C:/Users/Admin/Downloads/CLAUDE/APEX_POS && pnpm dev
```

Check for TypeScript compilation errors. Fix any type issues.

**Step 2: Verify API endpoint**

Test the receive endpoint accepts `supplierDrNo`:
- Login as admin (POST /auth/login)
- Create a PO, submit it
- Receive with `supplierDrNo` in the body
- GET the receipts endpoint and verify grouping

**Step 3: Verify web UI**

- Open a SUBMITTED PO detail page
- Verify checkbox column appears
- Verify DR number input appears
- Verify dimming of unchecked rows
- Verify scan fills qty + checks box
- Verify progress bar appears

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat: multi-receipt PO receiving with DR numbers, checkboxes, and grouped history"
```
