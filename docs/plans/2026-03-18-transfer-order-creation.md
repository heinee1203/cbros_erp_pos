# Transfer Order: Full-Page Creation + CSV Import + Edit Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add transfer creation page, CSV import, DRAFT editing (API + UI), and list page enhancements to the existing transfer order system.

**Architecture:** New `/procurement/transfer-orders/new` page for creation with product search at source location and CSV import. New API endpoints for DRAFT editing (PATCH transfer, POST/PATCH/DELETE line items). List page gets `+ New Transfer` button, status filter, and summary counts. Detail page gets inline edit mode for DRAFT transfers.

**Tech Stack:** Next.js App Router, Fastify, Drizzle ORM, TanStack Query, Zod

---

### Task 1: API — Add DRAFT editing endpoints

**Files:**
- Modify: `packages/types/src/schemas.ts` (add new Zod schemas after line ~273)
- Modify: `apps/api/src/modules/transfers/service.ts` (add 4 new service functions)
- Modify: `apps/api/src/modules/transfers/routes.ts` (add 4 new route handlers)

**Step 1: Add Zod schemas for edit operations**

In `packages/types/src/schemas.ts`, after the existing `createTransferSchema` (line 273), add:

```typescript
// ── Transfer: Update (DRAFT only) ──
export const updateTransferSchema = z.object({
  notes: z.string().max(1000).optional(),
});
export type UpdateTransferInput = z.infer<typeof updateTransferSchema>;

// ── Transfer: Add Line Item (DRAFT only) ──
export const addTransferItemSchema = z.object({
  productId: z.string().uuid(),
  requestedQty: z.number().int().min(1),
});
export type AddTransferItemInput = z.infer<typeof addTransferItemSchema>;

// ── Transfer: Update Line Item (DRAFT only) ──
export const updateTransferItemSchema = z.object({
  requestedQty: z.number().int().min(1),
});
export type UpdateTransferItemInput = z.infer<typeof updateTransferItemSchema>;
```

**Step 2: Add service functions**

In `apps/api/src/modules/transfers/service.ts`, add these functions at the end (before any closing braces):

```typescript
// ── DRAFT Editing ──

export async function updateTransfer(
  transferId: string,
  orgId: string,
  data: { notes?: string },
) {
  const [transfer] = await db
    .select({ id: stockTransfers.id, status: stockTransfers.status })
    .from(stockTransfers)
    .where(and(eq(stockTransfers.id, transferId), eq(stockTransfers.orgId, orgId)))
    .limit(1);

  if (!transfer) throw new Error("Transfer not found");
  if (transfer.status !== "DRAFT") throw new Error("Only DRAFT transfers can be edited");

  const [updated] = await db
    .update(stockTransfers)
    .set({ notes: data.notes ?? null })
    .where(eq(stockTransfers.id, transferId))
    .returning();

  return updated;
}

export async function addTransferItem(
  transferId: string,
  orgId: string,
  data: { productId: string; requestedQty: number },
) {
  const [transfer] = await db
    .select({ id: stockTransfers.id, status: stockTransfers.status })
    .from(stockTransfers)
    .where(and(eq(stockTransfers.id, transferId), eq(stockTransfers.orgId, orgId)))
    .limit(1);

  if (!transfer) throw new Error("Transfer not found");
  if (transfer.status !== "DRAFT") throw new Error("Only DRAFT transfers can be edited");

  // Check for duplicate product
  const [existing] = await db
    .select({ id: stockTransferItems.id })
    .from(stockTransferItems)
    .where(and(
      eq(stockTransferItems.transferId, transferId),
      eq(stockTransferItems.productId, data.productId),
    ))
    .limit(1);

  if (existing) throw new Error("Product already exists in this transfer");

  const [item] = await db
    .insert(stockTransferItems)
    .values({
      transferId,
      orgId,
      productId: data.productId,
      requestedQty: data.requestedQty,
    })
    .returning();

  return item;
}

export async function updateTransferItem(
  transferId: string,
  itemId: string,
  orgId: string,
  data: { requestedQty: number },
) {
  const [transfer] = await db
    .select({ id: stockTransfers.id, status: stockTransfers.status })
    .from(stockTransfers)
    .where(and(eq(stockTransfers.id, transferId), eq(stockTransfers.orgId, orgId)))
    .limit(1);

  if (!transfer) throw new Error("Transfer not found");
  if (transfer.status !== "DRAFT") throw new Error("Only DRAFT transfers can be edited");

  const [updated] = await db
    .update(stockTransferItems)
    .set({ requestedQty: data.requestedQty })
    .where(and(
      eq(stockTransferItems.id, itemId),
      eq(stockTransferItems.transferId, transferId),
    ))
    .returning();

  if (!updated) throw new Error("Transfer item not found");
  return updated;
}

export async function deleteTransferItem(
  transferId: string,
  itemId: string,
  orgId: string,
) {
  const [transfer] = await db
    .select({ id: stockTransfers.id, status: stockTransfers.status })
    .from(stockTransfers)
    .where(and(eq(stockTransfers.id, transferId), eq(stockTransfers.orgId, orgId)))
    .limit(1);

  if (!transfer) throw new Error("Transfer not found");
  if (transfer.status !== "DRAFT") throw new Error("Only DRAFT transfers can be edited");

  // Ensure at least 1 item remains
  const items = await db
    .select({ id: stockTransferItems.id })
    .from(stockTransferItems)
    .where(eq(stockTransferItems.transferId, transferId));

  if (items.length <= 1) throw new Error("Transfer must have at least one item");

  const [deleted] = await db
    .delete(stockTransferItems)
    .where(and(
      eq(stockTransferItems.id, itemId),
      eq(stockTransferItems.transferId, transferId),
    ))
    .returning();

  if (!deleted) throw new Error("Transfer item not found");
  return deleted;
}
```

**Step 3: Add route handlers**

In `apps/api/src/modules/transfers/routes.ts`:

Add imports at top (line 3-9), extend the existing imports:
```typescript
import {
  createTransferSchema,
  approveTransferSchema,
  startPickingSchema,
  dispatchTransferSchema,
  receiveTransferSchema,
  reportVarianceSchema,
  cancelTransferSchema,
  updateTransferSchema,
  addTransferItemSchema,
  updateTransferItemSchema,
} from "@apex/types";
```

Add to service imports (line 13-25):
```typescript
import {
  createTransfer,
  approveTransfer,
  startPicking,
  dispatchTransfer,
  receiveTransfer,
  reportVariance,
  cancelTransfer,
  getTransfer,
  getTransferByNumber,
  getTransferJournal,
  listTransfers,
  updateTransfer,
  addTransferItem,
  updateTransferItem,
  deleteTransferItem,
} from "./service";
```

Add these routes inside the plugin function, after the `POST /transfers` route (line 79) and before `POST /:id/approve`:

```typescript
  // ─── PATCH /transfers/:id ──────────────────────
  // Update a DRAFT transfer (notes only)
  app.patch("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;
    const { role } = request.user;
    assertTransferRole(role);

    const parsed = updateTransferSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Validation failed", details: parsed.error.flatten() });
    }

    try {
      const result = await updateTransfer(id, orgId, parsed.data);
      return reply.send(result);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // ─── POST /transfers/:id/items ─────────────────
  // Add a line item to a DRAFT transfer
  app.post("/:id/items", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;
    const { role } = request.user;
    assertTransferRole(role);

    const parsed = addTransferItemSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Validation failed", details: parsed.error.flatten() });
    }

    try {
      const result = await addTransferItem(id, orgId, parsed.data);
      return reply.status(201).send(result);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // ─── PATCH /transfers/:id/items/:itemId ────────
  // Update a line item qty on a DRAFT transfer
  app.patch("/:id/items/:itemId", async (request, reply) => {
    const { id, itemId } = request.params as { id: string; itemId: string };
    const { orgId } = request.storeContext!;
    const { role } = request.user;
    assertTransferRole(role);

    const parsed = updateTransferItemSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Validation failed", details: parsed.error.flatten() });
    }

    try {
      const result = await updateTransferItem(id, itemId, orgId, parsed.data);
      return reply.send(result);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // ─── DELETE /transfers/:id/items/:itemId ───────
  // Remove a line item from a DRAFT transfer
  app.delete("/:id/items/:itemId", async (request, reply) => {
    const { id, itemId } = request.params as { id: string; itemId: string };
    const { orgId } = request.storeContext!;
    const { role } = request.user;
    assertTransferRole(role);

    try {
      await deleteTransferItem(id, itemId, orgId);
      return reply.status(204).send();
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });
```

**Step 4: Rebuild types and verify**

```bash
cd C:/Users/Admin/Downloads/CLAUDE/APEX_POS/packages/types && pnpm build
cd C:/Users/Admin/Downloads/CLAUDE/APEX_POS/apps/api && npx tsc --noEmit 2>&1 | grep "error TS"
```

**Step 5: Commit**

```bash
git add packages/types/src/schemas.ts apps/api/src/modules/transfers/service.ts apps/api/src/modules/transfers/routes.ts
git commit -m "feat(api): add DRAFT transfer editing endpoints (PATCH, add/update/delete items)"
```

---

### Task 2: Frontend — New Transfer Creation Page

**Files:**
- Create: `apps/web/src/app/procurement/transfer-orders/new/page.tsx`

**Context:**
- `useLocations` hook returns `LocationRow[]` with `{ id, name, code, type, isActive }`
- `POST /transfers` body: `{ sourceLocationId, destinationLocationId, notes?, items: [{ productId, requestedQty }] }`
- `POST /transfers/:id/approve` body: `{ idempotencyKey, notes? }`
- Product search: `GET /products?search=X&limit=10` with `locationId` header = source location
- Product response includes: `id, name, sku, stockLevel, costPrice, unitPrice`
- `apiFetch` is at `@/lib/api`, `useAuth` at `@/app/auth-context`
- The page lives under Next.js App Router at `/procurement/transfer-orders/new`

**Step 1: Create the page**

Create `apps/web/src/app/procurement/transfer-orders/new/page.tsx` with the following complete implementation:

```typescript
"use client";

import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Search,
  Upload,
  Download,
  Trash2,
  Loader2,
  AlertCircle,
  CheckCircle2,
  XCircle,
  AlertTriangle,
} from "lucide-react";
import { useAuth } from "@/app/auth-context";
import { useLocations, type LocationRow } from "@/hooks/use-locations";
import { apiFetch } from "@/lib/api";

/* ─── Types ─── */
interface TransferLine {
  localId: string;
  productId: string;
  productName: string;
  sku: string;
  availableStock: number;
  transferQty: number;
}

interface CSVPreviewRow {
  sku: string;
  qty: number;
  productId?: string;
  productName?: string;
  availableStock?: number;
  status: "ready" | "insufficient" | "not_found";
  message?: string;
}

/* ─── Page ─── */
export default function NewTransferPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { token, locationId: authLocationId } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  /* Locations */
  const locationsQuery = useLocations(token);
  const allLocations = useMemo(() => {
    return (locationsQuery.data?.data ?? []).filter(
      (l: LocationRow) => l.isActive && l.type !== "TRANSIT_BUFFER"
    );
  }, [locationsQuery.data]);

  /* Form state */
  const [sourceLocationId, setSourceLocationId] = useState("");
  const [destinationLocationId, setDestinationLocationId] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<TransferLine[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  /* Product search */
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [showResults, setShowResults] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  const searchResults = useQuery<{ data: any[] }>({
    queryKey: ["transfer-product-search", debouncedSearch, sourceLocationId],
    queryFn: () =>
      apiFetch<{ data: any[] }>(
        `/products?search=${encodeURIComponent(debouncedSearch)}&limit=10`,
        { token, locationId: sourceLocationId }
      ),
    enabled: debouncedSearch.length >= 2 && !!sourceLocationId,
    staleTime: 10_000,
  });

  /* CSV preview */
  const [csvPreview, setCsvPreview] = useState<CSVPreviewRow[]>([]);
  const [showCsvPreview, setShowCsvPreview] = useState(false);
  const [csvLoading, setCsvLoading] = useState(false);

  /* Derived */
  const totalItems = lines.length;
  const totalUnits = lines.reduce((sum, l) => sum + l.transferQty, 0);
  const canSave =
    !!sourceLocationId &&
    !!destinationLocationId &&
    sourceLocationId !== destinationLocationId &&
    lines.length > 0 &&
    lines.every((l) => l.transferQty > 0 && l.transferQty <= l.availableStock);

  /* ─── Handlers ─── */
  const addLine = useCallback(
    (product: any) => {
      if (lines.some((l) => l.productId === product.id)) return;
      setLines((prev) => [
        ...prev,
        {
          localId: crypto.randomUUID(),
          productId: product.id,
          productName: product.name,
          sku: product.sku,
          availableStock: product.stockLevel ?? 0,
          transferQty: Math.min(1, product.stockLevel ?? 0),
        },
      ]);
      setSearchQuery("");
      setShowResults(false);
    },
    [lines]
  );

  const updateLine = useCallback(
    (localId: string, field: keyof TransferLine, value: any) => {
      setLines((prev) =>
        prev.map((l) => (l.localId === localId ? { ...l, [field]: value } : l))
      );
    },
    []
  );

  const removeLine = useCallback((localId: string) => {
    setLines((prev) => prev.filter((l) => l.localId !== localId));
  }, []);

  const handleSave = useCallback(
    async (mode: "DRAFT" | "SUBMIT") => {
      if (!canSave) return;
      setIsSaving(true);
      try {
        const result = await apiFetch<any>("/transfers", {
          method: "POST",
          body: JSON.stringify({
            sourceLocationId,
            destinationLocationId,
            notes: notes.trim() || undefined,
            items: lines.map((l) => ({
              productId: l.productId,
              requestedQty: l.transferQty,
            })),
          }),
          token,
          locationId: authLocationId,
        });

        if (mode === "SUBMIT" && result?.id) {
          await apiFetch(`/transfers/${result.id}/approve`, {
            method: "POST",
            body: JSON.stringify({
              idempotencyKey: crypto.randomUUID(),
            }),
            token,
            locationId: authLocationId,
          });
        }

        queryClient.invalidateQueries({ queryKey: ["transfers"] });
        router.push(
          `/procurement/transfer-orders/${result.transferNo ?? result.transfer_no}`
        );
      } catch (err: any) {
        alert(err.message || "Failed to create transfer");
      } finally {
        setIsSaving(false);
      }
    },
    [
      canSave,
      sourceLocationId,
      destinationLocationId,
      notes,
      lines,
      token,
      authLocationId,
      queryClient,
      router,
    ]
  );

  /* CSV template */
  const handleDownloadTemplate = useCallback(() => {
    const csv = "\uFEFFSKU,Transfer Qty\nSDG-30003,10\nAN-468WK,1\nDB-1390,5\n";
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "apex-transfer-import-template.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, []);

  /* CSV upload + preview */
  const handleCSVUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!sourceLocationId) {
        alert("Select a source location first");
        return;
      }
      const file = e.target.files?.[0];
      if (!file) return;
      e.target.value = "";

      setCsvLoading(true);
      try {
        const text = await file.text();
        const rowLines = text
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter(Boolean);
        if (rowLines.length < 2) {
          alert("CSV must have a header row and at least one data row");
          return;
        }

        const dataRows = rowLines.slice(1);
        const preview: CSVPreviewRow[] = [];

        for (const row of dataRows) {
          const cells = row.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
          const sku = cells[0] || "";
          const qty = parseInt(cells[1]) || 0;
          if (!sku) continue;

          try {
            const resp = await apiFetch<{ data: any[] }>(
              `/products?search=${encodeURIComponent(sku)}&limit=5`,
              { token, locationId: sourceLocationId }
            );
            const match = resp.data?.find(
              (p: any) =>
                p.sku === sku || p.barcode === sku || p.mnemonicSku === sku
            );

            if (!match) {
              preview.push({ sku, qty, status: "not_found", message: "SKU not found" });
            } else if ((match.stockLevel ?? 0) < qty) {
              preview.push({
                sku,
                qty,
                productId: match.id,
                productName: match.name,
                availableStock: match.stockLevel ?? 0,
                status: "insufficient",
                message: `Only ${match.stockLevel ?? 0} available`,
              });
            } else {
              preview.push({
                sku,
                qty,
                productId: match.id,
                productName: match.name,
                availableStock: match.stockLevel ?? 0,
                status: "ready",
              });
            }
          } catch {
            preview.push({ sku, qty, status: "not_found", message: "Lookup failed" });
          }
        }

        setCsvPreview(preview);
        setShowCsvPreview(true);
      } finally {
        setCsvLoading(false);
      }
    },
    [sourceLocationId, token]
  );

  const importReadyItems = useCallback(() => {
    const ready = csvPreview.filter((r) => r.status === "ready" && r.productId);
    for (const r of ready) {
      if (lines.some((l) => l.productId === r.productId)) continue;
      setLines((prev) => [
        ...prev,
        {
          localId: crypto.randomUUID(),
          productId: r.productId!,
          productName: r.productName!,
          sku: r.sku,
          availableStock: r.availableStock!,
          transferQty: r.qty,
        },
      ]);
    }
    setShowCsvPreview(false);
    setCsvPreview([]);
  }, [csvPreview, lines]);

  /* ─── Render ─── */
  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="mb-6">
        <Link
          href="/procurement/transfer-orders"
          className="mb-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft size={12} /> Back to Transfer Orders
        </Link>
        <h2 className="text-lg font-semibold">New Transfer Order</h2>
        <p className="text-sm text-muted-foreground">
          Move stock between locations
        </p>
      </div>

      {/* Transfer Details */}
      <div className="mb-6 rounded-xl border border-border bg-background p-4 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Transfer Details
        </h3>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              From *
            </label>
            <select
              value={sourceLocationId}
              onChange={(e) => {
                setSourceLocationId(e.target.value);
                setLines([]);
              }}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="">Select source...</option>
              {allLocations.map((l) => (
                <option
                  key={l.id}
                  value={l.id}
                  disabled={l.id === destinationLocationId}
                >
                  {l.name} ({l.code})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              To *
            </label>
            <select
              value={destinationLocationId}
              onChange={(e) => setDestinationLocationId(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="">Select destination...</option>
              {allLocations.map((l) => (
                <option
                  key={l.id}
                  value={l.id}
                  disabled={l.id === sourceLocationId}
                >
                  {l.name} ({l.code})
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Reason for transfer, special instructions..."
              className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
        </div>
      </div>

      {/* Transfer Items */}
      <div className="mb-6 flex-1 rounded-xl border border-border bg-background shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Transfer Items
          </h3>
          <div className="flex items-center gap-2">
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={!sourceLocationId || csvLoading}
              className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
            >
              {csvLoading ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Upload size={12} />
              )}
              Import CSV
            </button>
            <button
              onClick={handleDownloadTemplate}
              className="text-xs text-primary hover:underline"
            >
              <Download size={12} className="mr-1 inline" />
              Template
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={handleCSVUpload}
            />
          </div>
        </div>

        {/* Product search */}
        <div className="relative border-b border-border px-4 py-3">
          <Search
            size={14}
            className="absolute left-7 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setShowResults(true);
            }}
            onFocus={() => setShowResults(true)}
            placeholder={
              sourceLocationId
                ? "Search products at source location..."
                : "Select source location first"
            }
            disabled={!sourceLocationId}
            className="w-full rounded-md border border-border bg-background py-2 pl-8 pr-3 text-sm outline-none placeholder:text-muted-foreground focus:border-primary disabled:opacity-50"
          />
          {showResults &&
            debouncedSearch.length >= 2 &&
            searchResults.data?.data &&
            searchResults.data.data.length > 0 && (
              <div className="absolute left-4 right-4 z-20 mt-1 max-h-[240px] overflow-y-auto rounded-lg border border-border bg-background shadow-lg">
                {searchResults.data.data.map((p: any) => (
                  <button
                    key={p.id}
                    onClick={() => addLine(p)}
                    disabled={lines.some((l) => l.productId === p.id)}
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-accent disabled:opacity-40"
                  >
                    <div>
                      <div className="font-medium">{p.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {p.sku}
                      </div>
                    </div>
                    <div className="text-right">
                      {(p.stockLevel ?? 0) > 0 ? (
                        <span className="text-xs font-medium text-green-600">
                          {p.stockLevel} available
                        </span>
                      ) : (
                        <span className="text-xs font-medium text-red-500">
                          Out of stock
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
        </div>

        {/* Lines table */}
        {lines.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            {sourceLocationId
              ? "Search for products above or import a CSV file"
              : "Select a source location to start adding items"}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <th className="px-3 py-2 text-left w-8">#</th>
                <th className="px-3 py-2 text-left">Item</th>
                <th className="px-3 py-2 text-left">SKU</th>
                <th className="px-3 py-2 text-right">Available</th>
                <th className="px-3 py-2 text-right">Transfer Qty</th>
                <th className="px-3 py-2 w-10" />
              </tr>
            </thead>
            <tbody>
              {lines.map((line, i) => (
                <tr key={line.localId} className="border-b border-border">
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {i + 1}
                  </td>
                  <td className="px-3 py-2 font-medium">{line.productName}</td>
                  <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                    {line.sku}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <span
                      className={
                        line.availableStock > 0
                          ? "text-green-600"
                          : "text-red-500"
                      }
                    >
                      {line.availableStock}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <input
                      type="number"
                      min={1}
                      max={line.availableStock}
                      value={line.transferQty}
                      onChange={(e) => {
                        const qty = Math.min(
                          Math.max(parseInt(e.target.value) || 0, 0),
                          line.availableStock
                        );
                        updateLine(line.localId, "transferQty", qty);
                      }}
                      className="w-[70px] rounded border border-border px-2 py-1 text-right text-sm"
                    />
                    {line.transferQty > line.availableStock && (
                      <div className="mt-0.5 text-[10px] text-destructive">
                        Exceeds stock
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <button
                      onClick={() => removeLine(line.localId)}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {lines.length > 0 && (
          <div className="border-t border-border bg-muted/30 px-4 py-2 text-right text-xs text-muted-foreground">
            {totalItems} item{totalItems !== 1 ? "s" : ""} &middot;{" "}
            {totalUnits} unit{totalUnits !== 1 ? "s" : ""}
          </div>
        )}
      </div>

      {/* CSV Preview Modal */}
      {showCsvPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="mx-4 w-full max-w-2xl rounded-xl bg-background p-6 shadow-xl">
            <h3 className="mb-1 text-base font-semibold">
              Import Transfer Items
            </h3>
            <p className="mb-4 text-xs text-muted-foreground">
              Source:{" "}
              {allLocations.find((l) => l.id === sourceLocationId)?.name}
            </p>

            <div className="max-h-[300px] overflow-y-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40 text-xs font-semibold uppercase text-muted-foreground">
                    <th className="px-3 py-2 text-left">Item</th>
                    <th className="px-3 py-2 text-left">SKU</th>
                    <th className="px-3 py-2 text-right">Available</th>
                    <th className="px-3 py-2 text-right">Qty</th>
                    <th className="px-3 py-2 text-center">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {csvPreview.map((r, i) => (
                    <tr key={i} className="border-b border-border">
                      <td className="px-3 py-2 text-sm">
                        {r.productName || "—"}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">
                        {r.sku}
                      </td>
                      <td className="px-3 py-2 text-right text-xs">
                        {r.availableStock ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-right text-xs">
                        {r.qty}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {r.status === "ready" && (
                          <CheckCircle2
                            size={14}
                            className="inline text-green-600"
                          />
                        )}
                        {r.status === "insufficient" && (
                          <span className="inline-flex items-center gap-1 text-xs text-orange-600">
                            <AlertTriangle size={12} /> {r.message}
                          </span>
                        )}
                        {r.status === "not_found" && (
                          <span className="inline-flex items-center gap-1 text-xs text-red-500">
                            <XCircle size={12} /> {r.message}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-3 flex items-center justify-between">
              <div className="text-xs text-muted-foreground">
                {csvPreview.filter((r) => r.status === "ready").length} ready
                &middot;{" "}
                {csvPreview.filter((r) => r.status === "not_found").length} not
                found &middot;{" "}
                {csvPreview.filter((r) => r.status === "insufficient").length}{" "}
                insufficient
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setShowCsvPreview(false);
                    setCsvPreview([]);
                  }}
                  className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
                >
                  Cancel
                </button>
                <button
                  onClick={importReadyItems}
                  disabled={
                    csvPreview.filter((r) => r.status === "ready").length === 0
                  }
                  className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  Import{" "}
                  {csvPreview.filter((r) => r.status === "ready").length} Ready
                  Items
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Action bar */}
      <div className="sticky bottom-0 flex items-center justify-between border-t border-border bg-background px-6 py-4">
        <button
          onClick={() => router.push("/procurement/transfer-orders")}
          className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
        >
          Cancel
        </button>
        <div className="flex items-center gap-3">
          <button
            onClick={() => handleSave("DRAFT")}
            disabled={!canSave || isSaving}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
          >
            {isSaving ? (
              <Loader2 size={14} className="inline animate-spin mr-1" />
            ) : null}
            Save as Draft
          </button>
          <button
            onClick={() => handleSave("SUBMIT")}
            disabled={!canSave || isSaving}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {isSaving ? (
              <Loader2 size={14} className="inline animate-spin mr-1" />
            ) : null}
            Save & Submit for Approval
          </button>
        </div>
      </div>
    </div>
  );
}
```

**Step 2: Verify build**

```bash
cd C:/Users/Admin/Downloads/CLAUDE/APEX_POS/apps/web && npx next build 2>&1 | tail -10
```

**Step 3: Commit**

```bash
git add apps/web/src/app/procurement/transfer-orders/new/page.tsx
git commit -m "feat(web): add transfer order creation page with product search and CSV import"
```

---

### Task 3: Frontend — List page enhancements + link to create

**Files:**
- Modify: `apps/web/src/app/procurement/transfer-orders/page.tsx`

**Step 1: Add + New Transfer button, status filter, summary counts**

Replace the entire file content. Key changes from current code:
- Add `Plus` to lucide imports
- Add `+ New Transfer` button next to search
- Add status filter dropdown
- Add summary counts (drafts, in transit, received)
- Show `lineCount` per row
- Filter by status in `useMemo`

In the file `apps/web/src/app/procurement/transfer-orders/page.tsx`:

1. **Add `Plus` to lucide imports** (line 5): Change to `import { ArrowRightLeft, Search, X, Package, Plus } from "lucide-react";`

2. **Add status filter state** (after line 26): `const [statusFilter, setStatusFilter] = useState("");`

3. **Update filtered memo** (lines 30-39) to include status filtering:
```typescript
  const filtered = useMemo(() => {
    let list = transfers;
    if (statusFilter) {
      list = list.filter((t) => t.status === statusFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (t) =>
          t.transferNo.toLowerCase().includes(q) ||
          t.sourceLocationName.toLowerCase().includes(q) ||
          t.destinationLocationName.toLowerCase().includes(q)
      );
    }
    return list;
  }, [transfers, search, statusFilter]);
```

4. **Add summary counts** (after the filtered memo):
```typescript
  const drafts = transfers.filter((t) => t.status === "DRAFT").length;
  const inTransit = transfers.filter((t) =>
    ["APPROVED", "PICKING", "DISPATCHED", "PARTIALLY_RECEIVED"].includes(t.status)
  ).length;
  const received = transfers.filter((t) =>
    ["RECEIVED", "CLOSED_WITH_VARIANCE"].includes(t.status)
  ).length;
```

5. **Add "+ New Transfer" button** in the header div (after the `<div>` with h2/p, before `</div>` closing the `justify-between` wrapper):
```tsx
        <Link
          href="/procurement/transfer-orders/new"
          className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
        >
          <Plus size={14} /> New Transfer
        </Link>
```

6. **Add status filter and counts** between search and table:
```tsx
      {/* Filters + summary */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span>{transfers.length} total</span>
          <span>{drafts} drafts</span>
          <span>{inTransit} in transit</span>
          <span>{received} received</span>
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-md border border-border bg-background px-2 py-1 text-xs"
        >
          <option value="">All Statuses</option>
          <option value="DRAFT">Draft</option>
          <option value="APPROVED">Approved</option>
          <option value="PICKING">Picking</option>
          <option value="DISPATCHED">Dispatched</option>
          <option value="PARTIALLY_RECEIVED">Partially Received</option>
          <option value="RECEIVED">Received</option>
          <option value="CLOSED_WITH_VARIANCE">Closed w/ Variance</option>
          <option value="CANCELLED">Cancelled</option>
        </select>
      </div>
```

7. **Add Items column header** in the table (after "Created" th, before "Action" th):
```tsx
              <th scope="col" className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Items
              </th>
```

8. **Add items/units cell** in each row (after `fmtDate(t.createdAt)` td, before "View" td). Update colSpan in empty state from 7 to 8:
```tsx
                  <td className="px-3 py-2 text-right text-xs text-muted-foreground">
                    {t.lineCount ?? "—"}
                  </td>
```

**Step 2: Verify and commit**

```bash
cd C:/Users/Admin/Downloads/CLAUDE/APEX_POS/apps/web && npx next build 2>&1 | tail -10
git add apps/web/src/app/procurement/transfer-orders/page.tsx
git commit -m "feat(web): enhance transfer list page with new button, status filter, summary counts"
```

---

### Task 4: Frontend — Edit mode for DRAFT transfers on detail page

**Files:**
- Modify: `apps/web/src/app/procurement/transfer-orders/[transferNo]/page.tsx`

**Context:** The detail page is 1111 lines. It displays transfer info and has action modals for approve/dispatch/receive/variance/cancel. For DRAFT transfers, we need to add an "Edit" button that toggles inline editing mode.

**Step 1: Add edit state and handlers**

Add after the existing state declarations (around line 50-60):

```typescript
  /* Edit mode (DRAFT only) */
  const [editMode, setEditMode] = useState(false);
  const [editLines, setEditLines] = useState<Array<{
    id: string;
    productId: string;
    productName: string;
    sku: string;
    requestedQty: number;
    isNew?: boolean;
  }>>([]);
  const [editNotes, setEditNotes] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [editSearch, setEditSearch] = useState("");
  const [debouncedEditSearch, setDebouncedEditSearch] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedEditSearch(editSearch), 300);
    return () => clearTimeout(t);
  }, [editSearch]);
```

Add a product search query for edit mode:
```typescript
  const editSearchResults = useQuery<{ data: any[] }>({
    queryKey: ["transfer-edit-search", debouncedEditSearch, transfer?.sourceLocationId],
    queryFn: () =>
      apiFetch<{ data: any[] }>(
        `/products?search=${encodeURIComponent(debouncedEditSearch)}&limit=10`,
        { token, locationId: transfer?.sourceLocationId ?? locationId }
      ),
    enabled: editMode && debouncedEditSearch.length >= 2 && !!transfer?.sourceLocationId,
    staleTime: 10_000,
  });
```

Add enterEditMode and save handlers:
```typescript
  const enterEditMode = useCallback(() => {
    if (!transfer) return;
    setEditLines(
      transfer.items.map((item) => ({
        id: item.id,
        productId: item.productId,
        productName: item.productName,
        sku: item.sku,
        requestedQty: item.requestedQty,
      }))
    );
    setEditNotes(transfer.notes ?? "");
    setEditMode(true);
  }, [transfer]);

  const handleEditSave = useCallback(async () => {
    if (!transfer) return;
    setEditSaving(true);
    try {
      // Update notes if changed
      if (editNotes !== (transfer.notes ?? "")) {
        await apiFetch(`/transfers/${transfer.id}`, {
          method: "PATCH",
          body: JSON.stringify({ notes: editNotes }),
          token,
          locationId,
        });
      }

      const originalIds = new Set(transfer.items.map((i) => i.id));
      const editIds = new Set(editLines.filter((l) => !l.isNew).map((l) => l.id));

      // Delete removed lines
      for (const original of transfer.items) {
        if (!editIds.has(original.id)) {
          await apiFetch(`/transfers/${transfer.id}/items/${original.id}`, {
            method: "DELETE",
            token,
            locationId,
          });
        }
      }

      // Update changed lines
      for (const line of editLines) {
        if (line.isNew) continue;
        const original = transfer.items.find((i) => i.id === line.id);
        if (original && original.requestedQty !== line.requestedQty) {
          await apiFetch(`/transfers/${transfer.id}/items/${line.id}`, {
            method: "PATCH",
            body: JSON.stringify({ requestedQty: line.requestedQty }),
            token,
            locationId,
          });
        }
      }

      // Add new lines
      for (const line of editLines) {
        if (!line.isNew) continue;
        await apiFetch(`/transfers/${transfer.id}/items`, {
          method: "POST",
          body: JSON.stringify({
            productId: line.productId,
            requestedQty: line.requestedQty,
          }),
          token,
          locationId,
        });
      }

      // Refresh and exit edit mode
      queryClient.invalidateQueries({ queryKey: ["transfer", transferNo] });
      setEditMode(false);
    } catch (err: any) {
      alert(err.message || "Failed to save changes");
    } finally {
      setEditSaving(false);
    }
  }, [transfer, editLines, editNotes, token, locationId, queryClient, transferNo]);
```

**Step 2: Add "Edit" button for DRAFT**

In the header area (where status badge is displayed), add an Edit button when status is DRAFT:

```tsx
{transfer.status === "DRAFT" && !editMode && (
  <button
    onClick={enterEditMode}
    className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
  >
    Edit Transfer
  </button>
)}
{editMode && (
  <div className="flex gap-2">
    <button
      onClick={() => setEditMode(false)}
      className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
    >
      Cancel
    </button>
    <button
      onClick={handleEditSave}
      disabled={editSaving || editLines.length === 0}
      className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
    >
      {editSaving ? "Saving..." : "Save Changes"}
    </button>
  </div>
)}
```

**Step 3: Replace items table with editable version when in edit mode**

When `editMode` is true, render an editable table instead of the read-only one. The editable table includes:
- Product search to add new lines
- Qty inputs per line
- Delete buttons per line (disabled if only 1 line)
- Notes textarea

When `editMode` is false, render the existing read-only table unchanged.

```tsx
{editMode ? (
  <div className="rounded-xl border border-border bg-background p-4">
    {/* Edit notes */}
    <div className="mb-4">
      <label className="mb-1 block text-xs font-medium text-muted-foreground">Notes</label>
      <textarea
        value={editNotes}
        onChange={(e) => setEditNotes(e.target.value)}
        rows={2}
        className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm"
      />
    </div>

    {/* Search to add */}
    <div className="relative mb-3">
      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
      <input
        type="text"
        value={editSearch}
        onChange={(e) => setEditSearch(e.target.value)}
        placeholder="Search products to add..."
        className="w-full rounded-md border border-border bg-background py-2 pl-8 pr-3 text-sm outline-none"
      />
      {debouncedEditSearch.length >= 2 && editSearchResults.data?.data?.length > 0 && (
        <div className="absolute z-20 mt-1 w-full max-h-[200px] overflow-y-auto rounded-lg border bg-background shadow-lg">
          {editSearchResults.data.data.map((p: any) => (
            <button
              key={p.id}
              onClick={() => {
                if (editLines.some((l) => l.productId === p.id)) return;
                setEditLines((prev) => [...prev, {
                  id: crypto.randomUUID(),
                  productId: p.id,
                  productName: p.name,
                  sku: p.sku,
                  requestedQty: 1,
                  isNew: true,
                }]);
                setEditSearch("");
              }}
              disabled={editLines.some((l) => l.productId === p.id)}
              className="flex w-full items-center justify-between px-3 py-2 text-sm text-left hover:bg-accent disabled:opacity-40"
            >
              <span>{p.name}</span>
              <span className="text-xs text-muted-foreground">{p.sku}</span>
            </button>
          ))}
        </div>
      )}
    </div>

    {/* Editable lines table */}
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b bg-muted/40 text-xs font-semibold uppercase text-muted-foreground">
          <th className="px-3 py-2 text-left">Item</th>
          <th className="px-3 py-2 text-left">SKU</th>
          <th className="px-3 py-2 text-right">Qty</th>
          <th className="px-3 py-2 w-10" />
        </tr>
      </thead>
      <tbody>
        {editLines.map((line) => (
          <tr key={line.id} className="border-b border-border">
            <td className="px-3 py-2 font-medium">
              {line.productName}
              {line.isNew && <span className="ml-2 text-[10px] text-primary font-semibold">NEW</span>}
            </td>
            <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{line.sku}</td>
            <td className="px-3 py-2 text-right">
              <input
                type="number"
                min={1}
                value={line.requestedQty}
                onChange={(e) => {
                  const qty = Math.max(parseInt(e.target.value) || 1, 1);
                  setEditLines((prev) => prev.map((l) => l.id === line.id ? { ...l, requestedQty: qty } : l));
                }}
                className="w-[70px] rounded border border-border px-2 py-1 text-right text-sm"
              />
            </td>
            <td className="px-3 py-2 text-center">
              <button
                onClick={() => setEditLines((prev) => prev.filter((l) => l.id !== line.id))}
                disabled={editLines.length <= 1}
                className="text-muted-foreground hover:text-destructive disabled:opacity-30"
              >
                <Trash2 size={14} />
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
) : (
  /* existing read-only items table unchanged */
)}
```

**Step 4: Add necessary imports**

At the top of the file, add to lucide imports: `Search, Trash2, Loader2`
Add: `import { useEffect } from "react";` if not present
Add: `import { useQueryClient } from "@tanstack/react-query";`

Inside component: `const queryClient = useQueryClient();`

**Step 5: Verify and commit**

```bash
cd C:/Users/Admin/Downloads/CLAUDE/APEX_POS/apps/web && npx next build 2>&1 | tail -10
git add apps/web/src/app/procurement/transfer-orders/[transferNo]/page.tsx
git commit -m "feat(web): add inline edit mode for DRAFT transfers on detail page"
```

---

### Task 5: Build verification

**Step 1: Full builds**

```bash
cd C:/Users/Admin/Downloads/CLAUDE/APEX_POS
cd packages/types && pnpm build
cd ../../apps/api && npx tsc --noEmit 2>&1 | grep "error TS"
cd ../web && npx next build 2>&1 | tail -10
```

**Step 2: Commit any fixes**

```bash
git add -A && git status
# If clean, no commit needed
```
