# Item List Import/Export + PO CSV Template Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add CSV export/import to the Item List page and a downloadable CSV template to the PO creation page.

**Architecture:** Three independent features. (1) Client-side CSV export with optional "export all" API call. (2) Server-side `POST /products/import` endpoint with `dryRun` flag, plus frontend import modal with template download, file upload, preview, and execute. (3) Simple client-side template download link on PO creation page.

**Tech Stack:** Fastify API, Drizzle ORM, Next.js/React, TanStack Query, Zod validation

---

### Task 1: Item List — Export (client-side CSV)

**Files:**
- Modify: `apps/web/src/app/inventory/page.tsx` (lines 350-357 for toolbar Export button, lines 481-484 for bulk Export button)

**Context:** The inventory page has two Export buttons — one in the main toolbar (line 354-357, currently a dead `<button>`) and one in the bulk-selection bar (line 481-484, also dead). The `useProducts` hook fetches paginated data. For "export all", we make a direct `apiFetch` call with `limit=50000`. The `ProductRow` interface in `use-products.ts` has all needed fields: `name`, `sku`, `barcode`, `oemNumber`, `familyName`, `subcategoryName`, `brandName`, `unitPrice`, `costPrice`, `stockLevel`, `reorderPoint`, `isVariablePrice`.

**Step 1: Add the `buildCSV` and `downloadCSV` helper functions**

Add these after the `clearSelection` callback (around line 232) and before the `return` statement:

```typescript
/* ── CSV Export helpers ── */
const buildCSV = useCallback((items: ProductRow[]) => {
  const headers = [
    "Name", "SKU", "Barcode", "OEM Number",
    "Family", "Category", "Sub-category", "Brand",
    "Sell Price", "Cost Price", "Margin %",
    "Stock", "Reorder Point",
    "Variable Price",
  ];

  const escapeCell = (val: unknown) => {
    const str = String(val ?? "");
    if (str.includes(",") || str.includes('"') || str.includes("\n")) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const rows = items.map((item) => {
    const sell = parseFloat(item.unitPrice) || 0;
    const cost = parseFloat(item.costPrice) || 0;
    const margin = sell > 0 ? (((sell - cost) / sell) * 100).toFixed(1) : "";
    return [
      item.name,
      item.sku,
      item.barcode ?? "",
      item.oemNumber ?? "",
      item.familyName ?? "",
      (item as any).categoryName ?? item.category ?? "",
      item.subcategoryName ?? item.subCategoryName ?? "",
      item.brandName ?? "",
      item.unitPrice,
      item.costPrice ?? "",
      margin,
      item.stockLevel,
      item.reorderPoint,
      item.isVariablePrice ? "Yes" : "No",
    ].map(escapeCell);
  });

  return "\ufeff" + [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
}, []);

const downloadCSV = useCallback((csvContent: string, suffix = "") => {
  const date = new Date().toISOString().slice(0, 10);
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `apex-items-${date}${suffix}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}, []);
```

**Step 2: Add the `handleExport` function**

This fetches ALL matching items (not just current page) using the same filter params:

```typescript
const handleExport = useCallback(async () => {
  // Build query params matching current filters
  const params = new URLSearchParams();
  params.set("limit", "50000");
  params.set("sortBy", sortBy);
  params.set("sortDir", sortDir);
  if (debouncedSearch && debouncedSearch.length >= 2) params.set("search", debouncedSearch);
  if (familyFilter) params.set("familyId", familyFilter);
  if (categoryFilter) params.set("subCategoryId", categoryFilter);
  if (subCategoryFilter) params.set("subcategoryId", subCategoryFilter);
  if (stockStatusFilter) params.set("stockStatus", stockStatusFilter);
  if (brandFilter) params.set("brandId", brandFilter);
  params.set("parentOnly", "true");
  if (isAllLocations) params.set("allLocations", "true");

  try {
    const allData = await apiFetch<ProductsResponse>(
      `/products?${params.toString()}`,
      { token, locationId: apiLocationId },
    );
    const items = allData?.data ?? [];
    if (items.length === 0) return;
    downloadCSV(buildCSV(items));
  } catch {
    // Fallback: export current page
    if (products.length === 0) return;
    downloadCSV(buildCSV(products), "-page");
  }
}, [sortBy, sortDir, debouncedSearch, familyFilter, categoryFilter, subCategoryFilter, stockStatusFilter, brandFilter, isAllLocations, token, apiLocationId, products, buildCSV, downloadCSV]);
```

**Step 3: Add the `handleExportSelected` function**

```typescript
const handleExportSelected = useCallback(() => {
  const selected = products.filter((p) => selectedIds.has(p.id));
  if (selected.length === 0) return;
  downloadCSV(buildCSV(selected), "-selected");
}, [products, selectedIds, buildCSV, downloadCSV]);
```

**Step 4: Wire up the buttons**

Add `apiFetch` and `ProductsResponse` to imports at the top of the file:

```typescript
import { apiFetch } from "@/lib/api";
import { useProducts, useDeleteProduct, useProductFamilies, type ProductRow, type ProductsResponse, type SortField, type SortDir } from "@/hooks/use-products";
```

Toolbar Export button (line ~354): add `onClick={handleExport}`:
```typescript
<button onClick={handleExport} className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-[12px] font-medium text-foreground shadow-[0_1px_2px_0_rgba(0,0,0,0.04)] transition-colors hover:bg-muted">
  <Download size={13} />
  Export
</button>
```

Bulk-selection Export button (line ~481): add `onClick={handleExportSelected}`:
```typescript
<button onClick={handleExportSelected} className="flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium text-foreground hover:bg-muted transition-colors">
  <Download size={12} />
  Export
</button>
```

**Step 5: Verify and commit**

Run: `cd apps/web && npx next build 2>&1 | tail -20`
Expected: Build succeeds

```bash
git add apps/web/src/app/inventory/page.tsx
git commit -m "feat(inventory): add CSV export for item list (all filtered + selected)"
```

---

### Task 2: API — `POST /products/import` bulk endpoint

**Files:**
- Modify: `apps/api/src/modules/products/routes.ts` (append new route at end, before closing `}`)
- Modify: `packages/types/src/schemas.ts` (add import schema)

**Context:** The products routes file is at 2003 lines. The route plugin function is `productRoutes`. All routes are inside `export const productRoutes: FastifyPluginAsync = async (app) => { ... }`. We need to add `POST /import` which maps to `POST /products/import` due to the `/products` prefix in `app.ts`. The endpoint needs to: load all org SKUs in one query, resolve family/category/subcategory/brand names to IDs, then create or update each row in a single transaction. The `dryRun` flag causes the transaction to be rolled back after validation.

**Step 1: Add the Zod schema in `packages/types/src/schemas.ts`**

Add after the `updateProductSchema` (around line 170):

```typescript
// ── Product: Bulk Import ──
const importRowSchema = z.object({
  name: z.string().min(1, "Name is required").max(500),
  sku: z.string().min(1, "SKU is required").max(50),
  barcode: z.string().max(50).optional(),
  oemNumber: z.string().max(100).optional(),
  family: z.string().max(255).optional(),
  category: z.string().max(255).optional(),
  subcategory: z.string().max(255).optional(),
  brand: z.string().max(255).optional(),
  unitPrice: z.string().optional(),
  costPrice: z.string().optional(),
  reorderPoint: z.coerce.number().int().min(0).optional(),
  isVariablePrice: z.boolean().optional(),
});

export const bulkImportSchema = z.object({
  dryRun: z.boolean().default(false),
  rows: z.array(importRowSchema).min(1).max(5000),
});
export type BulkImportInput = z.infer<typeof bulkImportSchema>;
export type ImportRow = z.infer<typeof importRowSchema>;
```

**Step 2: Add the route in `apps/api/src/modules/products/routes.ts`**

Add before the final closing `};` of the `productRoutes` plugin. This is a large route so here is the full implementation:

```typescript
  // ────────────────────────────────────────────────────
  // POST /products/import — Bulk import (create or update)
  // ────────────────────────────────────────────────────
  app.post("/import", async (request, reply) => {
    const user = request.user!;
    if (!MANAGE_ROLES.includes(user.role)) {
      return reply.status(403).send({ error: "Forbidden" });
    }

    const { bulkImportSchema } = await import("@apex/types");
    const parsed = bulkImportSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "Invalid input",
        details: parsed.error.flatten(),
      });
    }

    const { orgId, locationId } = request.storeContext!;
    const { dryRun, rows } = parsed.data;

    // 1. Load all existing SKUs for org
    const existingProducts = await db
      .select({ id: products.id, sku: products.sku })
      .from(products)
      .where(eq(products.orgId, orgId));
    const skuMap = new Map(existingProducts.map((p) => [p.sku.toLowerCase(), p.id]));

    // 2. Load name->id maps for families, categories, subcategories, brands
    const [allFamilies, allCategories, allSubcategories, allBrands] = await Promise.all([
      db.select({ id: productFamilies.id, name: productFamilies.name })
        .from(productFamilies)
        .where(eq(productFamilies.orgId, orgId)),
      db.select({ id: categories.id, name: categories.name })
        .from(categories)
        .where(eq(categories.orgId, orgId)),
      db.select({ id: productSubcategories.id, name: productSubcategories.name })
        .from(productSubcategories)
        .where(eq(productSubcategories.orgId, orgId)),
      db.select({ id: brands.id, name: brands.name })
        .from(brands)
        .where(eq(brands.orgId, orgId)),
    ]);

    const familyMap = new Map(allFamilies.map((f) => [f.name.toLowerCase(), f.id]));
    const categoryMap = new Map(allCategories.map((c) => [c.name.toLowerCase(), c.id]));
    const subcategoryMap = new Map(allSubcategories.map((s) => [s.name.toLowerCase(), s.id]));
    const brandMap = new Map(allBrands.map((b) => [b.name.toLowerCase(), b.id]));

    // 3. Process rows
    const results: Array<{ row: number; sku: string; name: string; action: "create" | "update" | "error"; error?: string }> = [];
    let created = 0;
    let updated = 0;
    const errors: Array<{ row: number; sku: string; error: string }> = [];

    try {
      await db.transaction(async (tx) => {
        for (let i = 0; i < rows.length; i++) {
          const row = rows[i];
          try {
            const familyId = row.family ? familyMap.get(row.family.toLowerCase()) || null : null;
            const categoryId = row.category ? categoryMap.get(row.category.toLowerCase()) || null : null;
            const subcategoryId = row.subcategory ? subcategoryMap.get(row.subcategory.toLowerCase()) || null : null;
            const brandId = row.brand ? brandMap.get(row.brand.toLowerCase()) || null : null;

            const existingId = skuMap.get(row.sku.toLowerCase());

            if (existingId) {
              // UPDATE
              const updateSet: Record<string, any> = {};
              if (row.name) updateSet.name = row.name;
              if (row.unitPrice) updateSet.unitPrice = row.unitPrice;
              if (row.costPrice) updateSet.costPrice = row.costPrice;
              if (row.barcode) updateSet.barcode = row.barcode;
              if (row.oemNumber !== undefined) updateSet.oemNumber = row.oemNumber || null;
              if (familyId) updateSet.familyId = familyId;
              if (categoryId) updateSet.categoryId = categoryId;
              if (subcategoryId) updateSet.subcategoryId = subcategoryId;
              if (brandId) updateSet.brandId = brandId;
              if (row.isVariablePrice !== undefined) updateSet.isVariablePrice = row.isVariablePrice;

              if (Object.keys(updateSet).length > 0) {
                await tx.update(products).set(updateSet).where(eq(products.id, existingId));
              }

              // Update reorder point in inventory if provided
              if (row.reorderPoint !== undefined && locationId) {
                await tx
                  .update(inventory)
                  .set({ reorderPoint: row.reorderPoint })
                  .where(and(eq(inventory.productId, existingId), eq(inventory.locationId, locationId)));
              }

              updated++;
              results.push({ row: i, sku: row.sku, name: row.name, action: "update" });
            } else {
              // CREATE
              const mnemonicSku = await generateUniqueMnemonicSku(orgId, row.name, tx as any);

              // Generate barcode
              let barcode = row.barcode || null;
              if (!barcode) {
                for (let attempt = 0; attempt < 10; attempt++) {
                  const candidate = generateEan13();
                  const [dup] = await tx
                    .select({ id: products.id })
                    .from(products)
                    .where(and(eq(products.orgId, orgId), eq(products.barcode, candidate)))
                    .limit(1);
                  if (!dup) { barcode = candidate; break; }
                }
              }

              const [product] = await tx
                .insert(products)
                .values({
                  orgId,
                  name: row.name,
                  sku: row.sku,
                  mnemonicSku,
                  category: "HARD_PARTS" as any, // default category enum
                  unitPrice: row.unitPrice || "0.00",
                  costPrice: row.costPrice || "0.00",
                  barcode,
                  oemNumber: row.oemNumber || null,
                  familyId,
                  categoryId,
                  subcategoryId,
                  brandId,
                  isVariablePrice: row.isVariablePrice ?? false,
                })
                .returning();

              // Create inventory row at current location
              if (locationId) {
                await tx.insert(inventory).values({
                  orgId,
                  productId: product.id,
                  locationId,
                  stockLevel: 0,
                  reorderPoint: row.reorderPoint ?? 10,
                  leadTimeDays: 7,
                });
              }

              // Track SKU so subsequent rows referencing same SKU go to update path
              skuMap.set(row.sku.toLowerCase(), product.id);

              created++;
              results.push({ row: i, sku: row.sku, name: row.name, action: "create" });
            }
          } catch (err: any) {
            errors.push({ row: i, sku: row.sku, error: err.message || "Unknown error" });
            results.push({ row: i, sku: row.sku, name: row.name, action: "error", error: err.message });
          }
        }

        // If dry run, roll back the entire transaction
        if (dryRun) {
          throw new Error("__DRY_RUN_ROLLBACK__");
        }
      });
    } catch (err: any) {
      if (err.message === "__DRY_RUN_ROLLBACK__") {
        // Expected — return preview results
        return reply.send({ dryRun: true, created, updated, errors, results });
      }
      throw err;
    }

    return reply.send({ dryRun: false, created, updated, errors, results });
  });
```

**Step 3: Add the `bulkImportSchema` export in `packages/types/src/schemas.ts`**

Make sure `bulkImportSchema` is exported (the `export const` in step 1 handles this).

**Step 4: Verify and commit**

Run: `cd apps/api && npx tsc --noEmit 2>&1 | tail -20`
Expected: No errors

Test manually:
```bash
curl -s -X POST http://localhost:3000/products/import \
  -H "Authorization: Bearer $(curl -s -X POST http://localhost:3000/auth/login -H 'Content-Type: application/json' -d '{"email":"admin@apex.com","password":"admin12345"}' | jq -r '.token')" \
  -H "X-Location-ID: <location-id>" \
  -H "Content-Type: application/json" \
  -d '{"dryRun": true, "rows": [{"name":"Test Import Item","sku":"TEST-IMP-001","unitPrice":"100.00","costPrice":"50.00"}]}' | jq .
```

Expected: `{ "dryRun": true, "created": 1, "updated": 0, "errors": [], "results": [...] }`

```bash
git add packages/types/src/schemas.ts apps/api/src/modules/products/routes.ts
git commit -m "feat(api): add POST /products/import bulk endpoint with dryRun support"
```

---

### Task 3: Item List — Import Modal (frontend)

**Files:**
- Modify: `apps/web/src/app/inventory/page.tsx` (lines 350-353 for Import button, add modal component and state)

**Context:** The Import button on line 350-353 is currently a dead `<button>`. We need to add state for the import modal, CSV parsing logic, preview table, template download, and the execute call. The modal uses the same styling patterns as existing modals (`ModalShell` is imported on line 29). The `apiFetch` import was added in Task 1.

**Step 1: Add import modal state**

Add after the `showQuickAdd` state (line 59):

```typescript
/* Import modal */
const [showImportModal, setShowImportModal] = useState(false);
const [importFile, setImportFile] = useState<File | null>(null);
const [importPreview, setImportPreview] = useState<Array<{
  row: number; sku: string; name: string; action: "create" | "update" | "error"; error?: string;
  raw: Record<string, string>;
}>>([]);
const [importStats, setImportStats] = useState<{ created: number; updated: number; errors: number } | null>(null);
const [importLoading, setImportLoading] = useState(false);
const [importStep, setImportStep] = useState<"upload" | "preview" | "done">("upload");
const importFileRef = useRef<HTMLInputElement>(null);
```

Add `useRef` to the React imports on line 3:
```typescript
import { useState, useCallback, useEffect, useMemo, useRef } from "react";
```

Add `FileUp` to lucide imports (line 7 area):
```typescript
import { Search, Plus, Upload, Download, Trash2, ArrowUpDown, X, Loader2, Layers, FileUp } from "lucide-react";
```

**Step 2: Add template download and CSV parse functions**

Add after the export helper functions (after `handleExportSelected`):

```typescript
/* ── Import helpers ── */
const handleDownloadTemplate = useCallback(() => {
  const headers = "Name,SKU,Barcode,OEM Number,Family,Category,Sub-category,Brand,Sell Price,Cost Price,Reorder Point,Variable Price";
  const sample = "Sample Brake Pad,SAMPLE-001,1234567890123,MB295982,Brakes,Brake Pad,,AKEBONO,2500.00,1630.00,10,No";
  const csv = `\ufeff${headers}\n${sample}\n`;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "apex-item-import-template.csv";
  a.click();
  URL.revokeObjectURL(url);
}, []);

const parseImportCSV = useCallback((text: string) => {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];

  // Parse header
  const headerLine = lines[0];
  const headers = headerLine.split(",").map((h) => h.trim().toLowerCase().replace(/[^a-z0-9]/g, ""));

  const colMap: Record<string, number> = {};
  headers.forEach((h, i) => {
    if (["name"].includes(h)) colMap.name = i;
    else if (["sku", "productsku"].includes(h)) colMap.sku = i;
    else if (["barcode"].includes(h)) colMap.barcode = i;
    else if (["oemnumber", "oem"].includes(h)) colMap.oemNumber = i;
    else if (["family", "group"].includes(h)) colMap.family = i;
    else if (["category"].includes(h)) colMap.category = i;
    else if (["subcategory", "subcat"].includes(h)) colMap.subcategory = i;
    else if (["brand"].includes(h)) colMap.brand = i;
    else if (["sellprice", "unitprice", "price"].includes(h)) colMap.unitPrice = i;
    else if (["costprice", "cost"].includes(h)) colMap.costPrice = i;
    else if (["reorderpoint", "reorder"].includes(h)) colMap.reorderPoint = i;
    else if (["variableprice", "variable"].includes(h)) colMap.isVariablePrice = i;
  });

  // Parse data rows (handle quoted fields with commas)
  const dataRows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells: string[] = [];
    let current = "";
    let inQuotes = false;
    for (const ch of lines[i]) {
      if (ch === '"') { inQuotes = !inQuotes; continue; }
      if (ch === "," && !inQuotes) { cells.push(current.trim()); current = ""; continue; }
      current += ch;
    }
    cells.push(current.trim());

    const row: Record<string, string> = {};
    if (colMap.name !== undefined) row.name = cells[colMap.name] || "";
    if (colMap.sku !== undefined) row.sku = cells[colMap.sku] || "";
    if (colMap.barcode !== undefined) row.barcode = cells[colMap.barcode] || "";
    if (colMap.oemNumber !== undefined) row.oemNumber = cells[colMap.oemNumber] || "";
    if (colMap.family !== undefined) row.family = cells[colMap.family] || "";
    if (colMap.category !== undefined) row.category = cells[colMap.category] || "";
    if (colMap.subcategory !== undefined) row.subcategory = cells[colMap.subcategory] || "";
    if (colMap.brand !== undefined) row.brand = cells[colMap.brand] || "";
    if (colMap.unitPrice !== undefined) row.unitPrice = cells[colMap.unitPrice] || "";
    if (colMap.costPrice !== undefined) row.costPrice = cells[colMap.costPrice] || "";
    if (colMap.reorderPoint !== undefined) row.reorderPoint = cells[colMap.reorderPoint] || "";
    if (colMap.isVariablePrice !== undefined) row.isVariablePrice = cells[colMap.isVariablePrice] || "";

    // Skip empty rows
    if (row.sku || row.name) dataRows.push(row);
  }

  return dataRows;
}, []);
```

**Step 3: Add file upload handler and dry-run preview**

```typescript
const handleImportFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0];
  if (!file) return;
  e.target.value = "";
  setImportFile(file);
  setImportLoading(true);

  try {
    const text = await file.text();
    const rows = parseImportCSV(text);
    if (rows.length === 0) {
      setImportPreview([]);
      setImportStats(null);
      setImportStep("preview");
      setImportLoading(false);
      return;
    }

    // Send to API for dry run
    const payload = {
      dryRun: true,
      rows: rows.map((r) => ({
        name: r.name || "",
        sku: r.sku || "",
        barcode: r.barcode || undefined,
        oemNumber: r.oemNumber || undefined,
        family: r.family || undefined,
        category: r.category || undefined,
        subcategory: r.subcategory || undefined,
        brand: r.brand || undefined,
        unitPrice: r.unitPrice || undefined,
        costPrice: r.costPrice || undefined,
        reorderPoint: r.reorderPoint ? parseInt(r.reorderPoint) : undefined,
        isVariablePrice: r.isVariablePrice ? r.isVariablePrice.toLowerCase() === "yes" : undefined,
      })),
    };

    const res = await apiFetch<{
      dryRun: boolean;
      created: number;
      updated: number;
      errors: Array<{ row: number; sku: string; error: string }>;
      results: Array<{ row: number; sku: string; name: string; action: "create" | "update" | "error"; error?: string }>;
    }>("/products/import", {
      method: "POST",
      body: JSON.stringify(payload),
      token,
      locationId: apiLocationId,
    });

    setImportPreview(res.results.map((r) => ({ ...r, raw: rows[r.row] || {} })));
    setImportStats({ created: res.created, updated: res.updated, errors: res.errors.length });
    setImportStep("preview");
  } catch (err: any) {
    setImportPreview([]);
    setImportStats(null);
    setImportStep("preview");
  } finally {
    setImportLoading(false);
  }
}, [parseImportCSV, token, apiLocationId]);
```

**Step 4: Add execute import handler**

```typescript
const handleImportExecute = useCallback(async () => {
  if (!importFile) return;
  setImportLoading(true);

  try {
    const text = await importFile.text();
    const rows = parseImportCSV(text);

    const payload = {
      dryRun: false,
      rows: rows.map((r) => ({
        name: r.name || "",
        sku: r.sku || "",
        barcode: r.barcode || undefined,
        oemNumber: r.oemNumber || undefined,
        family: r.family || undefined,
        category: r.category || undefined,
        subcategory: r.subcategory || undefined,
        brand: r.brand || undefined,
        unitPrice: r.unitPrice || undefined,
        costPrice: r.costPrice || undefined,
        reorderPoint: r.reorderPoint ? parseInt(r.reorderPoint) : undefined,
        isVariablePrice: r.isVariablePrice ? r.isVariablePrice.toLowerCase() === "yes" : undefined,
      })),
    };

    const res = await apiFetch<{
      dryRun: boolean;
      created: number;
      updated: number;
      errors: Array<{ row: number; sku: string; error: string }>;
      results: Array<{ row: number; sku: string; name: string; action: string }>;
    }>("/products/import", {
      method: "POST",
      body: JSON.stringify(payload),
      token,
      locationId: apiLocationId,
    });

    setImportStats({ created: res.created, updated: res.updated, errors: res.errors.length });
    setImportStep("done");
  } catch {
    // keep preview visible
  } finally {
    setImportLoading(false);
  }
}, [importFile, parseImportCSV, token, apiLocationId]);

const resetImport = useCallback(() => {
  setShowImportModal(false);
  setImportFile(null);
  setImportPreview([]);
  setImportStats(null);
  setImportStep("upload");
  setImportLoading(false);
}, []);
```

**Step 5: Wire up the Import button**

Replace the dead Import button (line ~350-353) with:
```typescript
<button onClick={() => { resetImport(); setShowImportModal(true); }} className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-[12px] font-medium text-foreground shadow-[0_1px_2px_0_rgba(0,0,0,0.04)] transition-colors hover:bg-muted">
  <Upload size={13} />
  Import
</button>
```

**Step 6: Add the import modal JSX**

Add before the closing `</div>` of the component (before `{/* Detail Drawer */}` or right before the `DetailDrawer` rendering):

```tsx
{/* ── Import Modal ── */}
{showImportModal && (
  <ModalShell title="Import Items from CSV" onClose={resetImport} wide>
    {importStep === "upload" && (
      <div className="space-y-4">
        <div className="space-y-2">
          <p className="text-sm font-medium">1. Download the template CSV file</p>
          <button
            onClick={handleDownloadTemplate}
            className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-accent transition-colors"
          >
            <Download size={14} />
            Download Template
          </button>
        </div>

        <div className="space-y-1">
          <p className="text-sm font-medium">2. Fill in your items and save the file</p>
          <p className="text-xs text-muted-foreground">Required columns: Name and SKU. All other columns are optional.</p>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">3. Upload the completed file</p>
          <div
            onClick={() => importFileRef.current?.click()}
            className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed border-border p-6 transition-colors hover:border-primary/40 hover:bg-accent/50"
          >
            <FileUp size={24} className="text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Click to choose CSV file or drag and drop</span>
          </div>
          <input
            ref={importFileRef}
            type="file"
            accept=".csv"
            onChange={handleImportFileUpload}
            className="hidden"
          />
        </div>

        {importLoading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 size={14} className="animate-spin" />
            Analyzing file...
          </div>
        )}

        <div className="rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
          Existing items with matching SKUs will be <strong>updated</strong>, new SKUs will be <strong>created</strong>.
        </div>
      </div>
    )}

    {importStep === "preview" && (
      <div className="space-y-3">
        {importPreview.length === 0 ? (
          <p className="text-sm text-muted-foreground">No valid rows found in the CSV file. Make sure you have a header row and at least one data row with Name and SKU.</p>
        ) : (
          <>
            <div className="flex items-center gap-3 text-sm">
              {importStats && (
                <>
                  <span className="inline-flex items-center gap-1 rounded-full bg-green-100 dark:bg-green-900/30 px-2 py-0.5 text-xs font-medium text-green-700 dark:text-green-400">
                    {importStats.created} new
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 dark:bg-blue-900/30 px-2 py-0.5 text-xs font-medium text-blue-700 dark:text-blue-400">
                    {importStats.updated} updates
                  </span>
                  {importStats.errors > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-red-100 dark:bg-red-900/30 px-2 py-0.5 text-xs font-medium text-red-700 dark:text-red-400">
                      {importStats.errors} errors
                    </span>
                  )}
                </>
              )}
            </div>
            <div className="max-h-64 overflow-auto rounded-md border border-border">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm">
                  <tr>
                    <th className="px-2 py-1.5 text-left font-medium">Name</th>
                    <th className="px-2 py-1.5 text-left font-medium">SKU</th>
                    <th className="px-2 py-1.5 text-right font-medium">Sell</th>
                    <th className="px-2 py-1.5 text-right font-medium">Cost</th>
                    <th className="px-2 py-1.5 text-center font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {importPreview.map((r, i) => (
                    <tr key={i} className={r.action === "error" ? "bg-red-50 dark:bg-red-950/20" : ""}>
                      <td className="px-2 py-1.5 max-w-[200px] truncate">{r.name}</td>
                      <td className="px-2 py-1.5 font-mono">{r.sku}</td>
                      <td className="px-2 py-1.5 text-right font-mono">{r.raw?.unitPrice || "—"}</td>
                      <td className="px-2 py-1.5 text-right font-mono">{r.raw?.costPrice || "—"}</td>
                      <td className="px-2 py-1.5 text-center">
                        {r.action === "create" && <span className="text-green-600">New</span>}
                        {r.action === "update" && <span className="text-blue-600">Update</span>}
                        {r.action === "error" && <span className="text-red-600" title={r.error}>Error</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button onClick={resetImport} className="rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-accent transition-colors">
            Cancel
          </button>
          {importPreview.length > 0 && (
            <button
              onClick={handleImportExecute}
              disabled={importLoading}
              className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {importLoading && <Loader2 size={14} className="animate-spin" />}
              Import {importPreview.filter((r) => r.action !== "error").length} Items
            </button>
          )}
        </div>
      </div>
    )}

    {importStep === "done" && (
      <div className="space-y-3">
        <div className="rounded-md bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 px-3 py-3 text-sm text-green-800 dark:text-green-200">
          Import complete!
          {importStats && (
            <span className="ml-1">
              {importStats.created} created, {importStats.updated} updated
              {importStats.errors > 0 && `, ${importStats.errors} errors`}
            </span>
          )}
        </div>
        <div className="flex justify-end">
          <button onClick={resetImport} className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
            Done
          </button>
        </div>
      </div>
    )}
  </ModalShell>
)}
```

**Step 7: Check that `ModalShell` supports a `wide` prop**

Read `apps/web/src/app/inventory/components/modal-shell.tsx` — if the `wide` prop doesn't exist, add `wide?: boolean` to the props and apply `max-w-2xl` when true (vs the default `max-w-md`).

**Step 8: Invalidate query cache after import**

In the `handleImportExecute` success path, add after setting `importStep("done")`:

```typescript
// Add queryClient to component
const queryClient = useQueryClient();
// ... then in success:
queryClient.invalidateQueries({ queryKey: ["products"] });
```

Add `useQueryClient` to imports:
```typescript
import { useQueryClient } from "@tanstack/react-query";
```

**Step 9: Verify and commit**

Run: `cd apps/web && npx next build 2>&1 | tail -20`
Expected: Build succeeds

```bash
git add apps/web/src/app/inventory/page.tsx apps/web/src/app/inventory/components/modal-shell.tsx
git commit -m "feat(inventory): add import modal with CSV upload, dry-run preview, and bulk execute"
```

---

### Task 4: PO CSV Template Download

**Files:**
- Modify: `apps/web/src/app/procurement/purchase-orders/new/page.tsx` (around line 782-798 where Import CSV button lives)

**Context:** The PO creation page already has CSV import with a file input + upload handler. We just need to add a "Download template" link next to the existing "Import CSV" button and a handler to generate the template CSV.

**Step 1: Add the template download handler**

Add after the existing `handleCSVImport` function (around line 519):

```typescript
const handleDownloadPOTemplate = () => {
  const headers = "SKU,Qty,List Price,Discount,Notes";
  const sample1 = 'SDG-30003,10,26500,"20,5,3",Sample with chain discount';
  const sample2 = "DB-1390,20,1550,15,Sample with single discount";
  const sample3 = "14624134,5,3400,,Sample with no discount";
  const csv = `\ufeff${headers}\n${sample1}\n${sample2}\n${sample3}\n`;

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "apex-po-import-template.csv";
  a.click();
  URL.revokeObjectURL(url);
};
```

**Step 2: Add the "Download template" link next to the Import CSV button**

Find the "Import CSV" button block (around line 782-798). After the `</button>` for Import CSV (line ~791) and before the `<input ref={fileInputRef}` (line ~792), add:

```tsx
<button
  type="button"
  onClick={handleDownloadPOTemplate}
  className="text-xs text-primary hover:underline"
>
  Download template
</button>
```

**Step 3: Verify and commit**

Run: `cd apps/web && npx next build 2>&1 | tail -20`
Expected: Build succeeds

```bash
git add apps/web/src/app/procurement/purchase-orders/new/page.tsx
git commit -m "feat(po): add downloadable CSV template for PO line import"
```

---

### Task 5: Build verification and final commit

**Files:** All modified files from Tasks 1-4

**Step 1: Full build check**

Run: `cd apps/web && npx next build 2>&1 | tail -30`
Expected: Build succeeds with no type errors

Run: `cd apps/api && npx tsc --noEmit 2>&1 | tail -10`
Expected: No errors

**Step 2: Manual smoke test**

1. Open `http://localhost:3001` → navigate to Item List
2. Click Export → CSV downloads with all items
3. Click Import → modal opens → Download Template works → Upload a CSV → preview shows → execute works
4. Navigate to Procurement → Purchase Orders → New
5. "Download template" link visible next to Import CSV → downloads CSV with 3 sample rows

**Step 3: Final commit (if any fixes needed)**

```bash
git add -A
git commit -m "feat: item list import/export + PO CSV template download"
```
