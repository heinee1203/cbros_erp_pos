# Customer Invoices — Excel-Style Grid Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single-customer "Record Customer Invoices" modal on `/customers/invoices` with an inline Excel-style grid where each row is an independent invoice (own customer, date, invoice #, due date, amount), keyboard-driven, per-row customer autocomplete.

**Architecture:** Controlled `<input>` cells inside a CSS-grid layout. One state array of row objects; cell focus managed via a `refs` 2D matrix. Submit groups rows by `customerId` and POSTs once per customer to the existing `POST /customers/invoices/batch`. No new backend. The recorded-invoices table below is untouched.

**Tech Stack:** Next.js 15 + React 19, Tailwind 4, TanStack Query (for refetch), existing `apiFetch` helper, lucide-react icons, sonner toasts.

---

## File Structure

**Create:**
- `apps/web/src/components/invoices/invoice-entry-grid.tsx` — the grid component. Owns row state, keyboard handlers, customer-autocomplete popover, submit orchestration.

**Modify:**
- `apps/web/src/app/customers/invoices/page.tsx` — delete `CreateInvoiceModal` (lines 382-389 usage + 485-629 definition + lines 487-494 `DraftRow` helpers that are modal-only). Replace the "+ Create Invoice" button at line 236-239 with nothing (the grid lives inline above the filters). Mount `<InvoiceEntryGrid />` just above the Filters card. Keep Edit/Delete modals.

**Unchanged but read:**
- `apps/web/src/lib/api.ts` — `apiFetch` helper.
- `apps/web/src/lib/format.ts` — `fmtPeso`, `fmtDate`.
- `apps/web/src/hooks/use-customers-query.ts` — shape reference for customer rows.
- `apps/api/src/modules/customers/routes.ts` — batch endpoint already exists at `POST /customers/invoices/batch` accepting `{ customerId, invoices[], notes? }`.

**Out of scope:** backend changes, the recorded-invoices `<table>`, Edit/Delete modals, the filter row, KPI cards.

---

## Audit Findings (for commit body)

1. **Page structure** — `/apps/web/src/app/customers/invoices/page.tsx` holds Header+KPI, Filter row, Recorded-invoices table, and three modals (`CreateInvoiceModal`, `EditInvoiceModal`, `DeleteInvoiceConfirm`). Only `CreateInvoiceModal` is being replaced.
2. **Create endpoint** — `POST /customers/invoices/batch` at [routes.ts:310](apps/api/src/modules/customers/routes.ts#L310). Per-customer: payload is `{ customerId, invoices: [{ referenceNumber, recordedAt, dueDate, amount }], notes? }`. All-or-nothing. No multi-customer batch endpoint exists — grid groups by customer client-side and calls once per customer.
3. **Customer search** — `GET /customers?search=X&limit=10` returns `{ data: Customer[] }` including `paymentTermsDays`, `currentBalance`, and `phone` (code). Used instead of `/customers/search` so dropdown can show `Net 30 · ₱X,XXX balance`.
4. **Recorded table** — `GET /customers/invoices` drives the existing table. Refresh via the existing `fetchData()` closure after successful submit.

---

## Task 1: Scaffold the empty grid file with one row

**Files:**
- Create: `apps/web/src/components/invoices/invoice-entry-grid.tsx`

- [ ] **Step 1: Create the skeleton component**

Write exactly:

```tsx
"use client";

import { useState, useCallback } from "react";
import { Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtPeso } from "@/lib/format";

export interface InvoiceGridRow {
  id: string;
  customerId: string | null;
  customerLabel: string; // "Customer Name (AR-XXXX)" once selected
  invoiceNumber: string;
  invoiceDate: string;   // YYYY-MM-DD
  dueDate: string;       // YYYY-MM-DD
  amount: string;        // raw user input
}

function todayISO(): string { return new Date().toISOString().slice(0, 10); }
function plusDaysISO(base: string, days: number): string {
  const d = new Date(base + "T00:00:00"); d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
function newRow(): InvoiceGridRow {
  return {
    id: Math.random().toString(36).slice(2),
    customerId: null,
    customerLabel: "",
    invoiceNumber: "",
    invoiceDate: todayISO(),
    dueDate: plusDaysISO(todayISO(), 30),
    amount: "",
  };
}

export interface InvoiceEntryGridProps {
  token: string;
  locationId: string;
  onSubmitted: () => void;
}

export function InvoiceEntryGrid({ token, locationId, onSubmitted }: InvoiceEntryGridProps) {
  const [rows, setRows] = useState<InvoiceGridRow[]>(() => [newRow()]);
  const [notes, setNotes] = useState("");

  const updateRow = useCallback((id: string, patch: Partial<InvoiceGridRow>) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }, []);
  const addRow = useCallback(() => setRows((prev) => [...prev, newRow()]), []);
  const removeRow = useCallback((id: string) => {
    setRows((prev) => (prev.length === 1 ? prev : prev.filter((r) => r.id !== id)));
  }, []);

  const validRows = rows.filter((r) =>
    r.customerId && r.invoiceNumber.trim() && r.invoiceDate && r.dueDate &&
    parseFloat(r.amount) > 0 && r.dueDate >= r.invoiceDate
  );
  const total = validRows.reduce((s, r) => s + parseFloat(r.amount), 0);

  // Column template: #, DATE, CUSTOMER(flex), INVOICE#, DUE, AMOUNT, delete
  const gridCols = "40px 120px minmax(240px,1fr) 140px 120px 140px 32px";

  return (
    <div className="mb-3 rounded-xl border border-border bg-background shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div>
          <h2 className="text-[13px] font-semibold text-foreground">Encode Invoices</h2>
          <p className="text-[11px] text-muted-foreground">Each row is an independent invoice. Tab to move across, Enter for next row.</p>
        </div>
        <button
          onClick={addRow}
          className="flex h-7 items-center gap-1 rounded-md border border-border bg-background px-2 text-[11px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Plus size={12} /> Add Row
        </button>
      </div>

      {/* Header row */}
      <div
        className="grid gap-1 border-b border-border bg-muted/40 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
        style={{ gridTemplateColumns: gridCols }}
      >
        <span>#</span>
        <span>Date</span>
        <span>Customer</span>
        <span>Invoice #</span>
        <span>Due Date</span>
        <span className="text-right">Amount</span>
        <span />
      </div>

      {/* Body rows — stubbed read-only placeholders for Task 1 */}
      {rows.map((r, idx) => (
        <div
          key={r.id}
          className="grid gap-1 border-b border-border/50 px-3 py-1 items-center last:border-b-0"
          style={{ gridTemplateColumns: gridCols }}
        >
          <span className="text-[11px] text-muted-foreground">{idx + 1}</span>
          <span className="text-[11px] text-muted-foreground">{r.invoiceDate}</span>
          <span className="text-[11px] text-muted-foreground">{r.customerLabel || "—"}</span>
          <span className="text-[11px] text-muted-foreground">{r.invoiceNumber || "—"}</span>
          <span className="text-[11px] text-muted-foreground">{r.dueDate}</span>
          <span className="text-[11px] text-right tabular-nums text-muted-foreground">{r.amount || "0.00"}</span>
          <button
            onClick={() => removeRow(r.id)}
            disabled={rows.length === 1}
            className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-red-50 hover:text-red-600 disabled:opacity-30 disabled:pointer-events-none"
          >
            <Trash2 size={12} />
          </button>
        </div>
      ))}

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-border bg-muted/20 px-3 py-1.5">
        <span className="text-[11px] text-muted-foreground">
          {validRows.length} of {rows.length} valid
        </span>
        <span className="text-[11px] font-semibold tabular-nums text-foreground">
          Total: {fmtPeso(total)}
        </span>
      </div>

      {/* Notes + submit row will be built in Task 7. Suppress unused-var lint for now. */}
      <div className="hidden">{notes}{token}{locationId}{(() => { onSubmitted; setNotes; return null; })()}</div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no errors attributable to this file.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/invoices/invoice-entry-grid.tsx
git commit -m "scaffold(invoices): empty InvoiceEntryGrid component with one row"
```

---

## Task 2: Wire the grid onto the page (behind existing modal)

**Files:**
- Modify: `apps/web/src/app/customers/invoices/page.tsx` — import the grid, mount it above the Filters card. Keep the modal for now so we can compare side-by-side while building.

- [ ] **Step 1: Add import and mount**

At top of file, add:

```tsx
import { InvoiceEntryGrid } from "@/components/invoices/invoice-entry-grid";
```

Immediately before the Filters card (before line `{/* Filters */}`), insert:

```tsx
<InvoiceEntryGrid
  token={token ?? ""}
  locationId={locationId ?? ""}
  onSubmitted={fetchData}
/>
```

- [ ] **Step 2: Verify in browser**

Start preview (port 3003), navigate to `/customers/invoices`. Confirm: grid card renders above filters with one placeholder row, header row visible, "Add Row" works (click it, row count increases), delete works (except when only one row).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/customers/invoices/page.tsx
git commit -m "wire(invoices): mount InvoiceEntryGrid above filters (modal still present for comparison)"
```

---

## Task 3: Replace placeholders with editable cells (no keyboard nav yet)

**Files:**
- Modify: `apps/web/src/components/invoices/invoice-entry-grid.tsx`

- [ ] **Step 1: Replace body-row spans with inputs**

Replace the body-row `<div>` (the one inside `{rows.map(...)}`) with:

```tsx
{rows.map((r, idx) => {
  const amountNum = parseFloat(r.amount);
  const isValid =
    r.customerId && r.invoiceNumber.trim() && r.invoiceDate && r.dueDate &&
    amountNum > 0 && r.dueDate >= r.invoiceDate;
  const hasData =
    r.customerId || r.invoiceNumber || r.amount;
  const showInvalid = hasData && !isValid;

  return (
    <div
      key={r.id}
      className={cn(
        "grid gap-1 border-b border-border/50 px-3 py-1 items-center last:border-b-0",
        showInvalid && "border-l-2 border-l-red-400"
      )}
      style={{ gridTemplateColumns: gridCols }}
    >
      <span className="text-[11px] text-muted-foreground">{idx + 1}</span>

      <input
        type="date"
        value={r.invoiceDate}
        onChange={(e) => {
          const next = e.target.value;
          updateRow(r.id, {
            invoiceDate: next,
            // if due was auto-set and invoice date moves, keep relative offset
            dueDate: r.dueDate && next ? plusDaysISO(next, daysBetween(r.invoiceDate, r.dueDate)) : r.dueDate,
          });
        }}
        className="h-7 rounded border border-border bg-background px-2 text-[12px] outline-none focus:border-primary/40"
      />

      {/* Customer cell — Task 4 replaces this with a popover. */}
      <input
        type="text"
        value={r.customerLabel}
        onChange={(e) => updateRow(r.id, { customerLabel: e.target.value, customerId: null })}
        placeholder="Type to search..."
        className="h-7 rounded border border-border bg-background px-2 text-[12px] outline-none focus:border-primary/40"
      />

      <input
        type="text"
        value={r.invoiceNumber}
        onChange={(e) => updateRow(r.id, { invoiceNumber: e.target.value })}
        placeholder="INV-001"
        className="h-7 rounded border border-border bg-background px-2 text-[12px] outline-none focus:border-primary/40"
      />

      <input
        type="date"
        value={r.dueDate}
        onChange={(e) => updateRow(r.id, { dueDate: e.target.value })}
        className="h-7 rounded border border-border bg-background px-2 text-[12px] outline-none focus:border-primary/40"
      />

      <input
        type="number"
        step="0.01"
        min="0"
        value={r.amount}
        onChange={(e) => updateRow(r.id, { amount: e.target.value })}
        placeholder="0.00"
        className="h-7 rounded border border-border bg-background px-2 text-[12px] tabular-nums text-right outline-none focus:border-primary/40"
      />

      <button
        onClick={() => removeRow(r.id)}
        disabled={rows.length === 1}
        title={rows.length === 1 ? "At least one row required" : "Remove row"}
        className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-red-50 hover:text-red-600 disabled:opacity-30 disabled:pointer-events-none"
      >
        <Trash2 size={12} />
      </button>
    </div>
  );
})}
```

Also add the `daysBetween` helper beside `plusDaysISO`:

```tsx
function daysBetween(fromISO: string, toISO: string): number {
  if (!fromISO || !toISO) return 30;
  const ms = new Date(toISO + "T00:00:00").getTime() - new Date(fromISO + "T00:00:00").getTime();
  return Math.round(ms / 86400000);
}
```

And remove the `<div className="hidden">…</div>` stub — we'll use `notes`/`onSubmitted` in Task 7 and can suppress lint via explicit `void` there.

- [ ] **Step 2: Suppress unused-param noise until Task 7**

Prefix the props in the function signature with `_` or add a `void` line so TS/eslint doesn't flag them. Specifically, inside the function body right before the `return`, add:

```tsx
void token; void locationId; void onSubmitted; void notes; void setNotes;
```

(These are deliberate placeholders — Task 7 removes them.)

- [ ] **Step 3: Verify in browser**

Reload `/customers/invoices`. Type in Invoice #, Amount, pick Date via picker. Row should accept input. Red left-border appears when a row has data but isn't valid. Counter bottom-left says `0 of 1 valid` until all fields pass.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/invoices/invoice-entry-grid.tsx
git commit -m "feat(invoices): editable cells for date/customer-text/invoice#/due/amount"
```

---

## Task 4: Customer cell autocomplete (mouse first, keyboard in Task 6)

**Files:**
- Modify: `apps/web/src/components/invoices/invoice-entry-grid.tsx`

- [ ] **Step 1: Add customer search hook + type**

Near the top of the file (below the existing imports), add:

```tsx
import { useEffect, useRef } from "react";
import { apiFetch } from "@/lib/api";

interface CustomerSearchResult {
  id: string;
  name: string;
  phone: string | null;
  paymentTermsDays: number;
  currentBalance: string;
}

function useCustomerSearch(token: string, locationId: string, query: string) {
  const [results, setResults] = useState<CustomerSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!token || !locationId || query.trim().length < 1) { setResults([]); return; }
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await apiFetch<{ data: CustomerSearchResult[] }>(
          `/customers?search=${encodeURIComponent(query.trim())}&limit=10`,
          { token, locationId },
        );
        setResults(res.data || []);
      } catch {
        setResults([]);
      } finally { setLoading(false); }
    }, 200);
    return () => clearTimeout(timer);
  }, [token, locationId, query]);
  return { results, loading };
}
```

Also extend `useState` import: change `import { useState, useCallback } from "react";` to `import { useState, useCallback, useEffect, useRef } from "react";` and remove the duplicate `useEffect/useRef` import added above.

- [ ] **Step 2: Extract CustomerCell subcomponent**

Below the `InvoiceEntryGrid` component (same file), add:

```tsx
function CustomerCell({
  row, token, locationId, onSelect,
}: {
  row: InvoiceGridRow;
  token: string;
  locationId: string;
  onSelect: (c: CustomerSearchResult) => void;
}) {
  const [query, setQuery] = useState(row.customerLabel);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const { results, loading } = useCustomerSearch(token, locationId, query);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Keep query in sync if external change (e.g., row reset after submit)
  useEffect(() => { setQuery(row.customerLabel); }, [row.customerLabel]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const commit = (c: CustomerSearchResult) => {
    onSelect(c);
    setQuery(`${c.name}${c.phone ? ` (${c.phone})` : ""}`);
    setOpen(false);
  };

  return (
    <div ref={wrapRef} className="relative">
      <input
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setHighlight(0);
        }}
        onFocus={() => setOpen(true)}
        placeholder="Type to search..."
        className={cn(
          "h-7 w-full rounded border bg-background px-2 text-[12px] outline-none focus:border-primary/40",
          row.customerId ? "border-border" : "border-border"
        )}
      />
      {open && (query.trim().length > 0 || results.length > 0) && (
        <div className="absolute left-0 top-8 z-30 w-[280px] rounded-lg border border-border bg-background shadow-lg max-h-60 overflow-y-auto">
          {loading && <div className="px-3 py-1.5 text-[11px] text-muted-foreground">Searching…</div>}
          {!loading && results.length === 0 && query.trim().length > 0 && (
            <div className="px-3 py-1.5 text-[11px] text-muted-foreground">No match</div>
          )}
          {results.map((c, i) => (
            <button
              key={c.id}
              onMouseDown={(e) => { e.preventDefault(); commit(c); }}
              onMouseEnter={() => setHighlight(i)}
              className={cn(
                "block w-full text-left px-3 py-1.5 text-[12px]",
                i === highlight ? "bg-accent" : "hover:bg-accent/60"
              )}
            >
              <div className="font-medium text-foreground truncate">{c.name}</div>
              <div className="text-[10px] text-muted-foreground truncate">
                {c.phone ?? "—"} · Net {c.paymentTermsDays} · Balance {fmtPeso(parseFloat(c.currentBalance || "0"))}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Swap the plain text input in the body row for `<CustomerCell />`**

Replace the Customer `<input>` built in Task 3 with:

```tsx
<CustomerCell
  row={r}
  token={token}
  locationId={locationId}
  onSelect={(c) => {
    const label = `${c.name}${c.phone ? ` (${c.phone})` : ""}`;
    const newDue = plusDaysISO(r.invoiceDate || todayISO(), c.paymentTermsDays);
    updateRow(r.id, {
      customerId: c.id,
      customerLabel: label,
      dueDate: newDue,
    });
  }}
/>
```

- [ ] **Step 4: Verify in browser**

Reload, type `adayo` in the Customer cell. Dropdown appears with ≥1 match; line 1 shows name; line 2 shows code + `Net 30 · Balance ₱…`. Click a match. Cell displays `Customer Name (AR-XXXX)`. Due Date column auto-updates to invoice date + `paymentTermsDays`. Red border disappears once all fields valid.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/invoices/invoice-entry-grid.tsx
git commit -m "feat(invoices): per-row customer autocomplete with auto due-date"
```

---

## Task 5: Keyboard navigation across the grid

**Files:**
- Modify: `apps/web/src/components/invoices/invoice-entry-grid.tsx`

- [ ] **Step 1: Introduce a cell focus ref matrix**

Near the top of the component body:

```tsx
const CELL_ORDER = ["date", "customer", "invoiceNumber", "dueDate", "amount"] as const;
type CellKey = typeof CELL_ORDER[number];

const cellRefs = useRef(new Map<string, HTMLElement>());
const setCellRef = (rowId: string, key: CellKey) => (el: HTMLElement | null) => {
  const mapKey = `${rowId}:${key}`;
  if (el) cellRefs.current.set(mapKey, el);
  else cellRefs.current.delete(mapKey);
};
const focusCell = (rowId: string, key: CellKey) => {
  const el = cellRefs.current.get(`${rowId}:${key}`);
  if (el) { el.focus(); if ("select" in el && typeof (el as any).select === "function") (el as any).select(); }
};
```

- [ ] **Step 2: Write a keyboard handler used by every cell**

Add below the helpers:

```tsx
type KeyHandlerArgs = {
  e: React.KeyboardEvent<HTMLElement>;
  rowId: string;
  col: CellKey;
};

const handleCellKey = ({ e, rowId, col }: KeyHandlerArgs) => {
  const rowIdx = rows.findIndex((r) => r.id === rowId);
  if (rowIdx === -1) return;
  const colIdx = CELL_ORDER.indexOf(col);

  const moveRight = () => {
    if (colIdx < CELL_ORDER.length - 1) {
      focusCell(rowId, CELL_ORDER[colIdx + 1]);
    } else {
      // last col: jump to first col of next row, add row if at end
      const nextRow = rows[rowIdx + 1];
      if (nextRow) focusCell(nextRow.id, CELL_ORDER[0]);
      else {
        const nr = newRow();
        setRows((prev) => [...prev, nr]);
        // defer focus to next tick after render
        setTimeout(() => focusCell(nr.id, CELL_ORDER[0]), 0);
      }
    }
  };
  const moveLeft = () => {
    if (colIdx > 0) focusCell(rowId, CELL_ORDER[colIdx - 1]);
    else {
      const prevRow = rows[rowIdx - 1];
      if (prevRow) focusCell(prevRow.id, CELL_ORDER[CELL_ORDER.length - 1]);
    }
  };
  const moveDown = () => {
    const nextRow = rows[rowIdx + 1];
    if (nextRow) focusCell(nextRow.id, col);
    else {
      const nr = newRow();
      setRows((prev) => [...prev, nr]);
      setTimeout(() => focusCell(nr.id, col), 0);
    }
  };
  const moveUp = () => {
    const prevRow = rows[rowIdx - 1];
    if (prevRow) focusCell(prevRow.id, col);
  };

  if (e.key === "Tab" && !e.shiftKey) { e.preventDefault(); moveRight(); return; }
  if (e.key === "Tab" && e.shiftKey)  { e.preventDefault(); moveLeft(); return; }
  if (e.key === "Enter")              { e.preventDefault(); moveDown(); return; }
  if (e.key === "ArrowDown" && (col === "date" || col === "dueDate" || col === "amount")) {
    e.preventDefault(); moveDown(); return;
  }
  if (e.key === "ArrowUp" && (col === "date" || col === "dueDate" || col === "amount")) {
    e.preventDefault(); moveUp(); return;
  }
  if (e.key === "Escape")             { (e.target as HTMLElement).blur(); return; }
};
```

- [ ] **Step 3: Attach `ref` + `onKeyDown` to each cell input**

For the date, invoiceNumber, dueDate, and amount `<input>` elements add:

```tsx
ref={setCellRef(r.id, "date")}              // adjust key per cell
onKeyDown={(e) => handleCellKey({ e, rowId: r.id, col: "date" })}
```

For the CustomerCell, extend its props to accept `inputRef` and `onKeyDown`, forward them onto its `<input>`:

```tsx
// In CustomerCell's props:
inputRef?: (el: HTMLInputElement | null) => void;
onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
// In CustomerCell's <input>:
ref={props.inputRef}
onKeyDown={(e) => {
  // intercept dropdown navigation first
  if (open && results.length > 0) {
    if (e.key === "ArrowDown") { e.preventDefault(); setHighlight((h) => Math.min(h + 1, results.length - 1)); return; }
    if (e.key === "ArrowUp")   { e.preventDefault(); setHighlight((h) => Math.max(h - 1, 0)); return; }
    if (e.key === "Enter" && results[highlight]) {
      e.preventDefault();
      commit(results[highlight]);
      props.onKeyDown?.(e); // advance to next cell via parent
      return;
    }
    if (e.key === "Escape") { setOpen(false); return; }
  }
  props.onKeyDown?.(e);
}}
```

And in the grid row, wire:

```tsx
<CustomerCell
  row={r}
  token={token}
  locationId={locationId}
  inputRef={setCellRef(r.id, "customer")}
  onKeyDown={(e) => handleCellKey({ e, rowId: r.id, col: "customer" })}
  onSelect={...}
/>
```

- [ ] **Step 4: Verify in browser — keyboard-only entry of one full row**

1. Click into the first Date cell, pick a date.
2. Press Tab → focus moves to Customer.
3. Type `adayo`, ArrowDown/ArrowUp to highlight, Enter selects → focus advances to Invoice #.
4. Type `INV-999`, Tab → Due Date focused.
5. Tab → Amount focused, type `1000`.
6. Enter → a new row is appended and Date cell of the new row is focused.
7. Shift+Tab from the new Date → wraps back to Amount of the previous row.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/invoices/invoice-entry-grid.tsx
git commit -m "feat(invoices): keyboard navigation (Tab/Shift+Tab/Enter/Arrow/Escape) across grid"
```

---

## Task 6: Per-row validation polish and batch footer

**Files:**
- Modify: `apps/web/src/components/invoices/invoice-entry-grid.tsx`

Most validation already landed in Task 3. This task is the footer + notes + cancel wiring.

- [ ] **Step 1: Replace the simple footer with the full footer**

Replace the footer `<div>` (the `flex items-center justify-between border-t …`) with:

```tsx
{/* Notes + footer */}
<div className="border-t border-border px-3 py-2 space-y-2">
  <div>
    <label className="block text-[10px] font-medium text-muted-foreground mb-0.5">Notes (shared across batch, optional)</label>
    <textarea
      value={notes}
      onChange={(e) => setNotes(e.target.value)}
      rows={2}
      placeholder="Applies to every valid row submitted"
      className="w-full rounded border border-border bg-background px-2 py-1 text-[12px] outline-none focus:border-primary/40"
    />
  </div>
  <div className="flex items-center justify-between">
    <span className={cn(
      "text-[11px]",
      validRows.length === rows.length ? "text-emerald-600" : "text-muted-foreground"
    )}>
      {validRows.length} of {rows.length} valid &nbsp;·&nbsp; Total: <span className="font-semibold tabular-nums text-foreground">{fmtPeso(total)}</span>
    </span>
    <div className="flex items-center gap-2">
      <button
        onClick={handleCancel}
        className="rounded-lg px-3 py-1.5 text-[11px] font-medium text-muted-foreground hover:bg-muted"
      >
        Cancel
      </button>
      <button
        onClick={handleSubmit}
        disabled={validRows.length === 0 || submitting}
        className="rounded-lg bg-primary px-3 py-1.5 text-[11px] font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
      >
        {submitting ? "Recording…" : `Record ${validRows.length} ${validRows.length === 1 ? "Invoice" : "Invoices"}`}
      </button>
    </div>
  </div>
</div>
```

- [ ] **Step 2: Add the stubs `handleCancel`, `handleSubmit`, `submitting`**

Below `setNotes`:

```tsx
const [submitting, setSubmitting] = useState(false);

const handleCancel = () => {
  const hasData = rows.some((r) => r.customerId || r.invoiceNumber || r.amount);
  if (hasData && !window.confirm("Discard all entered rows?")) return;
  setRows([newRow()]);
  setNotes("");
};

const handleSubmit = async () => {
  // Implemented in Task 7
  void submitting; void token; void locationId; void onSubmitted;
};
```

And delete the `void token; void locationId; …` line from Task 3 — the real bindings arrive in Task 7.

- [ ] **Step 3: Verify in browser**

Reload. Footer now shows Notes textarea and Cancel / Record buttons. Record button disabled until ≥1 valid row. Clicking Cancel on dirty grid prompts for confirmation, then resets to one empty row.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/invoices/invoice-entry-grid.tsx
git commit -m "feat(invoices): batch footer with notes, cancel, and submit button"
```

---

## Task 7: Submit handler — group by customer, parallel batch POSTs, partial failure

**Files:**
- Modify: `apps/web/src/components/invoices/invoice-entry-grid.tsx`

- [ ] **Step 1: Add `rowError` state + import toast**

At top of file:

```tsx
import { toast } from "sonner";
```

In state:

```tsx
const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
```

- [ ] **Step 2: Replace the `handleSubmit` stub with the real implementation**

```tsx
const handleSubmit = async () => {
  if (validRows.length === 0) return;
  setSubmitting(true);
  setRowErrors({});

  // Group valid rows by customerId
  const byCustomer = new Map<string, InvoiceGridRow[]>();
  for (const r of validRows) {
    const key = r.customerId!;
    const arr = byCustomer.get(key) ?? [];
    arr.push(r);
    byCustomer.set(key, arr);
  }

  type BatchResult = { customerId: string; rowIds: string[]; ok: boolean; error?: string; created?: number };
  const results = await Promise.all(
    Array.from(byCustomer.entries()).map(async ([customerId, custRows]): Promise<BatchResult> => {
      try {
        const res = await apiFetch<{ created: number }>("/customers/invoices/batch", {
          method: "POST",
          token, locationId,
          body: JSON.stringify({
            customerId,
            notes: notes.trim() || undefined,
            invoices: custRows.map((r) => ({
              referenceNumber: r.invoiceNumber.trim(),
              recordedAt: r.invoiceDate ? `${r.invoiceDate}T00:00:00Z` : undefined,
              dueDate: r.dueDate || undefined,
              amount: parseFloat(r.amount),
            })),
          }),
        });
        return { customerId, rowIds: custRows.map((r) => r.id), ok: true, created: res.created };
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to record invoices";
        return { customerId, rowIds: custRows.map((r) => r.id), ok: false, error: msg };
      }
    })
  );

  const successRowIds = new Set(results.filter((r) => r.ok).flatMap((r) => r.rowIds));
  const failedResults = results.filter((r) => !r.ok);
  const totalCreated = results.reduce((s, r) => s + (r.created ?? 0), 0);
  const distinctCustomers = results.filter((r) => r.ok).length;

  // Keep failed rows; drop successful rows (or reset to one empty if all succeeded)
  setRows((prev) => {
    const remaining = prev.filter((r) => !successRowIds.has(r.id));
    return remaining.length === 0 ? [newRow()] : remaining;
  });
  const nextErrors: Record<string, string> = {};
  for (const f of failedResults) {
    for (const rid of f.rowIds) nextErrors[rid] = f.error ?? "Failed";
  }
  setRowErrors(nextErrors);

  if (failedResults.length === 0) {
    toast.success(`Recorded ${totalCreated} ${totalCreated === 1 ? "invoice" : "invoices"} for ${distinctCustomers} ${distinctCustomers === 1 ? "customer" : "customers"}`);
    setNotes("");
    onSubmitted();
  } else if (results.some((r) => r.ok)) {
    toast.warning(`Recorded ${totalCreated} invoices. ${failedResults.length} customer batch${failedResults.length === 1 ? "" : "es"} failed — see highlighted rows.`);
    onSubmitted();
  } else {
    toast.error(failedResults[0].error ?? "Failed to record invoices");
  }

  setSubmitting(false);
};
```

- [ ] **Step 3: Display per-row error inline**

In the body-row renderer, just below the delete button, add (inside the outer row `<div>`, as a second child that spans full width):

Change the body row wrapper to a Fragment containing two divs:

```tsx
return (
  <div
    key={r.id}
    className={cn(
      "grid gap-1 border-b border-border/50 px-3 py-1 items-center last:border-b-0",
      showInvalid && "border-l-2 border-l-red-400",
      rowErrors[r.id] && "border-l-2 border-l-red-500 bg-red-50/40"
    )}
    style={{ gridTemplateColumns: gridCols }}
  >
    {/* …existing cells… */}
    {rowErrors[r.id] && (
      <div className="col-span-7 text-[10px] text-red-600 pt-0.5">
        {rowErrors[r.id]}
      </div>
    )}
  </div>
);
```

Adjust the `col-span-7` to match the actual column count (seven = # + 5 inputs + delete).

- [ ] **Step 4: Remove the leftover stub `void` lines**

Confirm no `void token; void locationId; void onSubmitted;` remain.

- [ ] **Step 5: Verify in browser — multi-customer keyboard-only flow**

1. Row 1: Customer A, INV-001, 1000
2. Enter to new row. Row 2: Customer B, INV-002, 2500
3. Enter to new row. Row 3: Customer A again, INV-003, 500
4. Click Record (or keyboard-focus and Enter).
5. Expect a single toast: `Recorded 3 invoices for 2 customers`.
6. Grid resets to one empty row; notes cleared.
7. Scroll down: the recorded-invoices table has INV-001, INV-002, INV-003 at the top.

Partial-failure smoke test: enter the same Invoice # twice for the same customer (should trigger a DB-unique-constraint error from the batch endpoint). That one customer's batch fails; the other succeeds; failed rows stay with red background and error text.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/invoices/invoice-entry-grid.tsx
git commit -m "feat(invoices): submit groups rows by customer and batches POSTs with partial-failure handling"
```

---

## Task 8: Remove the legacy "Create Invoice" modal

**Files:**
- Modify: `apps/web/src/app/customers/invoices/page.tsx`

- [ ] **Step 1: Delete the modal and its trigger**

Remove:
- The `"+ Create Invoice"` button inside the filter row (currently at roughly lines 236-239).
- The `{showCreate && <CreateInvoiceModal …/>}` block (lines 383-389).
- The `CreateInvoiceModal` component definition (lines 485-629).
- The `DraftRow` interface and `newDraftRow` factory (lines 487-494) — they were modal-only.
- The `const [showCreate, setShowCreate] = useState(false);` line.
- Imports no longer used: `Plus`, `Trash2`, `useRef` inside the page (only if also no longer used by the remaining code). Audit before deleting.

Also remove the `todayISO` and `plusDaysISO` helpers from `page.tsx` (lines 90-94) if they're no longer referenced — the grid owns its own copies.

- [ ] **Step 2: Type-check**

Run: `cd apps/web && npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 3: Verify in browser**

Reload `/customers/invoices`. Confirm:
- No "+ Create Invoice" button.
- Grid is the only entry surface.
- Edit and Delete flows on existing invoices still work (unchanged modals).

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/customers/invoices/page.tsx
git commit -m "refactor(invoices): remove legacy Create Invoice modal — grid is the entry surface"
```

---

## Task 9: Final verification sweep

- [ ] **Step 1: Clean build**

Run: `cd apps/web && pnpm build`
Expected: build succeeds, zero TS errors, zero warnings attributable to changed files.

- [ ] **Step 2: Console sweep**

In the browser at `/customers/invoices`:
- Encode three invoices keyboard-only across two customers.
- Open DevTools console: zero errors, zero React key/warning messages.
- Inspect network: two `POST /customers/invoices/batch` requests (one per customer), both 201.

- [ ] **Step 3: Evidence capture**

Take a short note of row-before-the-fold count and the rendered recorded-invoices table after submit. No screenshots required — text description in the final commit's description is enough.

- [ ] **Step 4: Push branch**

```bash
git log --oneline -10   # sanity check commit sequence
# Push when ready — DO NOT force push
```

---

## Out of scope (explicit)

- Multi-customer batch API endpoint (follow-up: one request for all rows).
- Paste-from-Excel tab-separated bulk paste.
- Mobile / small-screen layout — desktop admin page only.
- Invoice # auto-suggestion per customer.
