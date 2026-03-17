# PO Full-Page Creation + Discount Pricing Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the PO creation modal with a dedicated full-page experience at `/procurement/purchase-orders/new`, add CSV import for bulk line items, and add supplier chain discount pricing (list price less %) to all PO line item forms.

**Architecture:** New Next.js page at `apps/web/src/app/procurement/purchase-orders/new/page.tsx`. DB migration adds `list_price` and `discount_chain` nullable columns to `po_lines`. API schemas extended to accept/return new fields. Discount calculation is client-side only (server stores the result in `unit_cost`). CSV import uses client-side parsing with server-side SKU lookup for validation.

**Tech Stack:** Next.js 15 (App Router), React, TanStack Query, Drizzle ORM, Fastify, PostgreSQL, Zod

---

## Task 1: DB Migration — Add discount columns to po_lines

**Files:**
- Modify: `packages/database/src/schema/purchase-orders.ts` (lines 92-134, poLines table)
- Create: Migration file via `pnpm db:generate`

**Step 1: Add columns to schema**

In `packages/database/src/schema/purchase-orders.ts`, add two columns to the `poLines` table definition, after the `unitCost` line (line 110):

```typescript
listPrice: numeric("list_price", { precision: 12, scale: 2 }),
discountChain: varchar("discount_chain", { length: 100 }),
```

Both nullable — existing PO lines won't have them.

**Step 2: Generate migration**

Run: `cd /c/Users/Admin/Downloads/CLAUDE/APEX_POS && pnpm db:generate`

**Step 3: Run migration**

Run: `pnpm db:migrate`

**Step 4: Commit**

```bash
git add packages/database/src/schema/purchase-orders.ts packages/database/drizzle/
git commit -m "feat(db): add list_price and discount_chain columns to po_lines"
```

---

## Task 2: API — Extend schemas and service to handle discount fields

**Files:**
- Modify: `packages/types/src/schemas.ts` (createPOSchema, around line 397)
- Modify: `apps/api/src/modules/procurement/service.ts` (createPO function, line 190)
- Modify: `apps/api/src/modules/procurement/service.ts` (buildPODetail function, line 900)
- Modify: `apps/api/src/modules/procurement/routes.ts` (POST lines, PATCH lines)

**Step 1: Extend createPOSchema**

In `packages/types/src/schemas.ts`, update the line item schema inside `createPOSchema` to accept optional discount fields:

```typescript
export const createPOSchema = z.object({
  supplierId: z.string().uuid(),
  destinationLocationId: z.string().uuid(),
  expectedDeliveryDate: z.string().datetime().optional(),
  notes: z.string().max(1000).optional(),
  lines: z
    .array(
      z.object({
        productId: z.string().uuid(),
        orderedQty: z.number().int().min(1),
        unitCost: z.string().min(1),
        listPrice: z.string().optional(),
        discountChain: z.string().max(100).optional(),
      }),
    )
    .min(1, "At least one PO line is required"),
});
```

**Step 2: Update createPO service to store new fields**

In `apps/api/src/modules/procurement/service.ts`, update the line values mapping (around line 190):

```typescript
const lineValues = input.lines.map((line) => ({
  purchaseOrderId: po.id,
  orgId,
  productId: line.productId,
  orderedQty: line.orderedQty,
  unitCost: line.unitCost,
  listPrice: line.listPrice ?? null,
  discountChain: line.discountChain ?? null,
}));
```

**Step 3: Update buildPODetail to return new fields**

In `apps/api/src/modules/procurement/service.ts`, update the `rawLines` select in `buildPODetail` (around line 900) to include the new columns:

```typescript
const rawLines = await db
  .select({
    id: poLines.id,
    productId: poLines.productId,
    orderedQty: poLines.orderedQty,
    receivedAcceptedQty: poLines.receivedAcceptedQty,
    rejectedQty: poLines.rejectedQty,
    unitCost: poLines.unitCost,
    listPrice: poLines.listPrice,
    discountChain: poLines.discountChain,
    createdAt: poLines.createdAt,
    productName: products.name,
    sku: products.sku,
    mnemonicSku: products.mnemonicSku,
    category: products.category,
    barcode: products.barcode,
    unitPrice: products.unitPrice,
    mnemonicCostCode: products.mnemonicCostCode,
  })
  // ... rest unchanged
```

**Step 4: Update POST /lines route to accept new fields**

In `apps/api/src/modules/procurement/routes.ts`, update the POST `/purchase-orders/:id/lines` handler (around line 432):

```typescript
const [line] = await db
  .insert(poLines)
  .values({
    purchaseOrderId: id,
    orgId,
    productId: body.productId,
    orderedQty: body.orderedQty,
    unitCost: body.unitCost,
    listPrice: body.listPrice ?? null,
    discountChain: body.discountChain ?? null,
  })
  .returning();
```

**Step 5: Update PATCH /lines route to accept new fields**

In `apps/api/src/modules/procurement/routes.ts`, update the PATCH handler's updates block (around line 499):

```typescript
const updates: Record<string, any> = {};
if (body.orderedQty !== undefined) updates.orderedQty = body.orderedQty;
if (body.unitCost !== undefined) updates.unitCost = body.unitCost;
if (body.productId !== undefined) updates.productId = body.productId;
if (body.listPrice !== undefined) updates.listPrice = body.listPrice;
if (body.discountChain !== undefined) updates.discountChain = body.discountChain;
```

**Step 6: Update POLine type in web**

In `apps/web/src/hooks/use-po-query.ts`, add to the `POLine` interface:

```typescript
export interface POLine {
  // ... existing fields ...
  listPrice: string | null;
  discountChain: string | null;
}
```

**Step 7: Commit**

```bash
git add packages/types/src/schemas.ts apps/api/src/modules/procurement/ apps/web/src/hooks/use-po-query.ts
git commit -m "feat(api): accept list_price and discount_chain on PO line endpoints"
```

---

## Task 3: Create Full-Page PO Creation — `/procurement/purchase-orders/new`

**Files:**
- Create: `apps/web/src/app/procurement/purchase-orders/new/page.tsx`
- Modify: `apps/web/src/app/procurement/purchase-orders/page.tsx` (replace modal with Link)

**Step 1: Create the new page file**

Create `apps/web/src/app/procurement/purchase-orders/new/page.tsx` with:

- "use client" directive
- Back link to `/procurement/purchase-orders`
- **Order Details section**: Supplier dropdown (with `[code] name` format + `+ New` button), Destination dropdown (non-TRANSIT_BUFFER), Expected Delivery date input, Notes textarea. 2-column grid layout.
- **Inline New Supplier form**: Expandable panel below supplier dropdown. Fields: name*, code (2 chars), email, phone. "Add & Select" button that POSTs to `/procurement/suppliers` and auto-selects.
- **Line Items section**:
  - Product search input (queries `/products?search=...&limit=10`, shows dropdown with name, SKU, cost)
  - CSV Import button (hidden file input, `.csv` accept)
  - Lines table with columns: #, Item (name + SKU), Qty (input), List Price (input), Discount (input, comma-separated %), Net Cost (calculated, read-only OR manual override), Line Total (calculated), trash icon
  - Grand total footer
- **Action Buttons**: Sticky bottom bar with Cancel, Save as Draft, Submit PO
- **Discount calculation logic**:
  ```typescript
  function calculateNetCost(listPrice: number, discountChain: string): number {
    if (!listPrice || listPrice <= 0) return 0;
    const discounts = discountChain
      .split(",")
      .map(s => parseFloat(s.trim()))
      .filter(d => !isNaN(d) && d > 0 && d < 100);
    let net = listPrice;
    for (const discount of discounts) {
      net = net * (1 - discount / 100);
    }
    return Math.round(net * 100) / 100;
  }
  ```

**Line state interface:**
```typescript
interface POLineInput {
  localId: string;
  productId: string;
  productName: string;
  sku: string;
  orderedQty: number;
  listPrice: string;
  discountChain: string;
  netCost: string;
  isManualCost: boolean;
}
```

**Key behaviors:**
- Adding a product: `listPrice = product.costPrice`, `discountChain = ""`, `netCost = product.costPrice`, `isManualCost = false`
- Adding duplicate product: increment qty instead
- Changing list price: recalc netCost unless isManualCost
- Changing discount: recalc netCost, set isManualCost = false
- Clearing discount + typing net cost directly: set isManualCost = true
- Net Cost field: read-only (grey bg) when auto-calculated, editable when isManualCost
- Line Total = orderedQty * parseFloat(netCost)
- Grand Total = sum of all line totals

**Save logic:**
- "Save as Draft": POST to `/procurement/purchase-orders` with `unitCost = netCost` per line, plus `listPrice` and `discountChain`. On success, redirect to `/procurement/purchase-orders/{poNo}`.
- "Submit PO": Same POST, then immediately POST to `/procurement/purchase-orders/{id}/submit`. Redirect on success.

**Step 2: Update PO list page**

In `apps/web/src/app/procurement/purchase-orders/page.tsx`:
- Replace `<button onClick={() => setShowNewPO(true)}>` with `<Link href="/procurement/purchase-orders/new">`
- Remove the `NewPODialog` component and related state (`showNewPO`, the entire dialog function)
- Remove the `{showNewPO && <NewPODialog .../>}` render

**Step 3: Commit**

```bash
git add apps/web/src/app/procurement/purchase-orders/new/page.tsx apps/web/src/app/procurement/purchase-orders/page.tsx
git commit -m "feat(web): full-page PO creation with discount pricing and inline supplier"
```

---

## Task 4: CSV Import with Preview Modal

**Files:**
- Modify: `apps/web/src/app/procurement/purchase-orders/new/page.tsx` (add CSV handling)

**Step 1: Add CSV import logic**

Inside the new page component, add:

- `fileInputRef` for hidden file input
- `csvPreview` state: `Array<{ sku: string; qty: number; cost: string; discount: string }>`
- `showCsvPreview` state
- `matchedProducts` state: parallel array of `ProductRow | null`

**CSV parser:**
```typescript
const handleCSVUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0];
  if (!file) return;
  const text = await file.text();
  const rows = text.split("\n").map(row =>
    row.split(",").map(cell => cell.trim().replace(/^"|"$/g, ""))
  );
  if (rows.length < 2) return; // need header + data

  const header = rows[0].map(h => h.toLowerCase().replace(/[^a-z0-9]/g, ""));
  const skuIdx = header.findIndex(h => ["sku","productsku","itemsku","barcode"].includes(h));
  const qtyIdx = header.findIndex(h => ["qty","quantity","orderedqty","order"].includes(h));
  const costIdx = header.findIndex(h => ["cost","unitcost","price","purchasecost","listprice"].includes(h));
  const discountIdx = header.findIndex(h => ["discount","discountchain","less"].includes(h));

  if (skuIdx === -1) return; // no SKU column

  const parsed = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row[skuIdx]?.trim()) continue;
    parsed.push({
      sku: row[skuIdx].trim(),
      qty: qtyIdx >= 0 ? (parseInt(row[qtyIdx]) || 1) : 1,
      cost: costIdx >= 0 ? (row[costIdx] || "0.00") : "0.00",
      discount: discountIdx >= 0 ? (row[discountIdx] || "") : "",
    });
  }

  setCsvPreview(parsed);
  setShowCsvPreview(true);
  // Trigger SKU lookup...
};
```

**SKU lookup:** For each CSV row, search `/products?search={sku}&limit=1` and match by exact SKU or barcode. Show matched product name or "Not found" warning.

**Preview modal:**
- Table: SKU, Match, Qty, Cost, Discount, Status (checkmark or warning)
- Footer: "X matched, Y not found"
- Buttons: Cancel, "Import X Matched Items"
- Import action: For each matched item, call `addLine()` with the product, then update qty/cost/discount from CSV data

**Step 2: Commit**

```bash
git add apps/web/src/app/procurement/purchase-orders/new/page.tsx
git commit -m "feat(web): CSV import with preview modal for PO line items"
```

---

## Task 5: Add Discount Pricing to PO Detail Edit Mode

**Files:**
- Modify: `apps/web/src/app/procurement/purchase-orders/[poNo]/page.tsx`

**Step 1: Update EditLine interface**

Add discount fields to the `EditLine` interface (around line 146):

```typescript
interface EditLine {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  orderedQty: number;
  listPrice: string;
  discountChain: string;
  unitCost: string;       // net cost
  isManualCost: boolean;
  receivedAcceptedQty: number;
  rejectedQty: number;
  isNew?: boolean;
}
```

**Step 2: Update enterEditMode to populate new fields**

Update `enterEditMode` (around line 161) to map new fields from `po.lines`:

```typescript
setEditLines(
  po.lines.map((l) => ({
    id: l.id,
    productId: l.productId,
    productName: l.productName,
    sku: l.sku,
    orderedQty: l.orderedQty,
    listPrice: l.listPrice ?? l.unitCost,
    discountChain: l.discountChain ?? "",
    unitCost: l.unitCost,
    isManualCost: !l.discountChain,
    receivedAcceptedQty: l.receivedAcceptedQty,
    rejectedQty: l.rejectedQty,
  })),
);
```

**Step 3: Update addLine to include discount fields**

Update `addLine` (around line 210):

```typescript
const addLine = useCallback((product: ProductRow) => {
  const tempId = `new-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  setEditLines((prev) => [
    ...prev,
    {
      id: tempId,
      productId: product.id,
      productName: product.name,
      sku: product.sku,
      orderedQty: 1,
      listPrice: product.costPrice || "0",
      discountChain: "",
      unitCost: product.costPrice || "0",
      isManualCost: false,
      receivedAcceptedQty: 0,
      rejectedQty: 0,
      isNew: true,
    },
  ]);
}, []);
```

**Step 4: Add discount-aware line update handlers**

Add `calculateNetCost` function and specialized handlers for list price, discount, and manual net cost changes. Update the generic `updateLine` or add new handlers:

```typescript
function calculateNetCost(listPrice: number, discountChain: string): number {
  if (!listPrice || listPrice <= 0) return 0;
  const discounts = discountChain
    .split(",")
    .map(s => parseFloat(s.trim()))
    .filter(d => !isNaN(d) && d > 0 && d < 100);
  let net = listPrice;
  for (const discount of discounts) {
    net = net * (1 - discount / 100);
  }
  return Math.round(net * 100) / 100;
}
```

**Step 5: Update handleSave to send new fields**

In `handleSave` (around line 255), include `listPrice` and `discountChain` in both POST (new lines) and PATCH (existing lines) calls.

For new lines:
```typescript
body: JSON.stringify({
  productId: line.productId,
  orderedQty: line.orderedQty,
  unitCost: line.unitCost,
  listPrice: line.listPrice,
  discountChain: line.discountChain,
}),
```

For modified existing lines, also check if listPrice/discountChain changed.

**Step 6: Update EditableGrid to show discount columns**

Update the `EditableGrid` component (line 1266) to add List Price, Discount, and Net Cost columns:

Table headers: `Item | Qty | List Price | Discount | Net Cost | Total | (trash)`

Each row:
- List Price: editable input
- Discount: editable text input (placeholder "20, 5, 3")
- Net Cost: read-only grey span when auto-calculated, editable input when isManualCost. Show "manual" badge when overridden.
- Total: qty * netCost

**Step 7: Update ReadOnlyGrid to show discount info**

Update `ReadOnlyGrid` (line 1488) to show list price and discount columns when present:

Headers: `Item | Mnemonic | Ordered | List Price | Discount | Net Cost | Accepted | Rejected | Remaining`

Display discount chain as `20/5/3` format. Show `—` when no discount.

**Step 8: Update editGrandTotal calculation**

Update the `editGrandTotal` memo to use `unitCost` (which is the net cost):
```typescript
const editGrandTotal = useMemo(
  () => editLines.reduce((sum, l) => sum + l.orderedQty * (parseFloat(l.unitCost) || 0), 0),
  [editLines],
);
```
(This is already correct since `unitCost` stores the net cost.)

**Step 9: Commit**

```bash
git add apps/web/src/app/procurement/purchase-orders/[poNo]/page.tsx
git commit -m "feat(web): discount pricing in PO detail edit mode and read-only view"
```

---

## Task 6: Build Verification and Manual Testing

**Step 1: Build the web app**

Run: `cd /c/Users/Admin/Downloads/CLAUDE/APEX_POS/apps/web && npx next build`
Expected: Build passes with zero errors.

**Step 2: Start dev server and verify**

Run: `pnpm dev` from monorepo root

**Step 3: Verify all scenarios**

1. PO list page: "+ New Purchase Order" navigates to `/procurement/purchase-orders/new`
2. New PO page: Supplier dropdown shows all suppliers with mnemonic codes
3. "+ New" supplier inline form → creates supplier → auto-selects it
4. Product search → type name/SKU → results appear → click to add
5. Adding same product twice → increments qty instead of duplicating
6. Enter List Price ₱26,500 → enter Discount "20, 5, 3" → Net Cost = ₱19,535.80
7. Change discount to "20" → Net recalculates to ₱21,200.00
8. Clear discount → Net = List Price
9. Override: type net cost directly → "manual" indicator shows
10. Line Total = Net Cost × Qty
11. Grand Total = sum of all Line Totals
12. CSV import → file picker → parsed → preview with matches → import
13. "Save as Draft" → creates PO → redirects to detail page
14. "Submit PO" → creates + submits → redirects with SUBMITTED status
15. Edit existing PO → discount fields populated → editable → save works
16. Read-only PO view → shows list price and discount chain per line

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat: PO full-page creation with discount pricing and CSV import"
```
