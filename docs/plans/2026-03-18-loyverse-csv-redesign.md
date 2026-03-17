# Loyverse-Style Per-Location CSV Import/Export Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Redesign item CSV import/export to use per-location columns (Available, Price, In stock, Low stock, Optimal stock) for every active location, matching the Loyverse CSV format. Also add `description` column to the products table.

**Architecture:** (1) Add `description` to products schema + migration. (2) New `GET /products/export` API endpoint returning denormalized products with per-location inventory. (3) Update `POST /products/import` to accept per-location data and upsert inventory rows. (4) Rewrite frontend export/import to use dynamic per-location columns.

**Tech Stack:** Drizzle ORM, Fastify, Next.js/React, TanStack Query, Zod

---

### Task 1: Schema — Add `description` column to products

**Files:**
- Modify: `packages/database/src/schema/products.ts` (line ~65, after `oemNumber`)
- Modify: `packages/types/src/schemas.ts` (lines 119, 153-164)

**Step 1: Add column to schema**

In `packages/database/src/schema/products.ts`, add after the `oemNumber` line (line 65):

```typescript
    /** Product description — notes, specs, customer-facing detail */
    description: varchar("description", { length: 2000 }),
```

**Step 2: Add to updateProductSchema**

In `packages/types/src/schemas.ts`, add after line 160 (`parentProductId`):

```typescript
  description: z.string().max(2000).nullable().optional(),
```

Note: `createProductSchema` already has `description` on line 119.

**Step 3: Generate and run migration**

```bash
cd C:/Users/Admin/Downloads/CLAUDE/APEX_POS
pnpm db:generate
pnpm db:migrate
```

**Step 4: Rebuild database package**

```bash
cd packages/database && pnpm build
```

**Step 5: Wire description through create/update routes**

In `apps/api/src/modules/products/routes.ts`:
- The create route (around line 536) already uses `parsed.data` spread. Verify `description` is included in the insert values. If not, add `description: parsed.data.description || null` to the values object.
- The update route (around line 693-721): verify `description` flows through `productUpdates`. Since it uses `const { reorderPoint, newVariants, ...productUpdates } = updates;`, and `description` is part of `updateProductSchema`, it should flow through automatically.

**Step 6: Commit**

```bash
git add packages/database/src/schema/products.ts packages/types/src/schemas.ts
git add packages/database/drizzle/
git commit -m "feat(schema): add description column to products table"
```

---

### Task 2: API — `GET /products/export` endpoint

**Files:**
- Modify: `apps/api/src/modules/products/routes.ts` (add import for `locations` table, add new route before `/import`)

**Context:** The products routes file is 2160 lines. All routes are inside `export const productRoutes: FastifyPluginAsync = async (app) => { ... }` which closes at line 1750. The import route `app.post("/import", ...)` starts at line 1595. Add the new export route BEFORE the import route. Also add `locations` to the import from `@apex/database/schema` on line 3.

**Step 1: Add `locations` to schema import**

Line 3, add `locations` to the destructured import:
```typescript
import { products, inventory, productFamilies, vehicleCompatibility, categories, productSubcategories, brands, locations } from "@apex/database/schema";
```

**Step 2: Add the export route**

Insert before line 1595 (`app.post("/import", ...)`):

```typescript
  // ────────────────────────────────────────────────────
  // GET /products/export — Denormalized export with per-location inventory
  // ────────────────────────────────────────────────────
  app.get("/export", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const query = request.query as Record<string, string>;

    // Parse filter params (reuse same params as GET /products)
    const search = query.search || "";
    const familyId = query.familyId || "";
    const subCategoryId = query.subCategoryId || "";
    const subcategoryId = query.subcategoryId || "";
    const stockStatus = query.stockStatus || "";
    const brandId = query.brandId || "";
    const sortBy = query.sortBy || "name";
    const sortDir = query.sortDir || "asc";

    // Build WHERE conditions
    const conditions: SQL[] = [eq(products.orgId, orgId), eq(products.isActive, true)];

    if (search && search.length >= 2) {
      conditions.push(ilike(products.name, `%${search}%`));
    }
    if (familyId) conditions.push(eq(products.familyId, familyId));
    if (subCategoryId) conditions.push(eq(products.categoryId, subCategoryId));
    if (subcategoryId) conditions.push(eq(products.subcategoryId, subcategoryId));
    if (brandId) conditions.push(eq(products.brandId, brandId));

    // Fetch all active locations for the org
    const orgLocations = await db
      .select({ id: locations.id, name: locations.name })
      .from(locations)
      .where(and(eq(locations.orgId, orgId), eq(locations.isActive, true)))
      .orderBy(asc(locations.name));

    // Fetch products with taxonomy joins
    const productRows = await db
      .select({
        id: products.id,
        name: products.name,
        sku: products.sku,
        barcode: products.barcode,
        oemNumber: products.oemNumber,
        description: products.description,
        unitPrice: products.unitPrice,
        costPrice: products.costPrice,
        isVariablePrice: products.isVariablePrice,
        isParent: products.isParent,
        parentProductId: products.parentProductId,
        familyName: productFamilies.name,
        categoryName: categories.name,
        subcategoryName: productSubcategories.name,
        brandName: brands.name,
      })
      .from(products)
      .leftJoin(productFamilies, eq(products.familyId, productFamilies.id))
      .leftJoin(categories, eq(products.categoryId, categories.id))
      .leftJoin(productSubcategories, eq(products.subcategoryId, productSubcategories.id))
      .leftJoin(brands, eq(products.brandId, brands.id))
      .where(and(...conditions))
      .orderBy(sortDir === "desc" ? desc(SORT_COLUMNS[sortBy] ?? products.name) : asc(SORT_COLUMNS[sortBy] ?? products.name))
      .limit(50000);

    // Fetch ALL inventory rows for these products
    const productIds = productRows.map((p) => p.id);
    let allInventory: Array<{
      productId: string;
      locationId: string;
      stockLevel: number;
      reorderPoint: number;
      optimalStock: number;
      availableForSale: boolean;
    }> = [];

    if (productIds.length > 0) {
      allInventory = await db
        .select({
          productId: inventory.productId,
          locationId: inventory.locationId,
          stockLevel: inventory.stockLevel,
          reorderPoint: inventory.reorderPoint,
          optimalStock: inventory.optimalStock,
          availableForSale: inventory.availableForSale,
        })
        .from(inventory)
        .where(and(
          eq(inventory.orgId, orgId),
          inArray(inventory.productId, productIds),
        ));
    }

    // Build inventory map: productId -> locationId -> row
    const invMap = new Map<string, Map<string, typeof allInventory[0]>>();
    for (const row of allInventory) {
      if (!invMap.has(row.productId)) invMap.set(row.productId, new Map());
      invMap.get(row.productId)!.set(row.locationId, row);
    }

    // Build parent handle map for variants
    const parentIds = [...new Set(productRows.filter((p) => p.parentProductId).map((p) => p.parentProductId!))];
    const parentHandleMap = new Map<string, string>();
    for (const p of productRows) {
      if (p.isParent) {
        const handle = p.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50);
        parentHandleMap.set(p.id, handle);
      }
    }

    // Enrich products with locations
    const enriched = productRows.map((p) => {
      const locMap = invMap.get(p.id) ?? new Map();
      const locData = orgLocations.map((loc) => {
        const inv = locMap.get(loc.id);
        return {
          locationId: loc.id,
          locationName: loc.name,
          availableForSale: inv?.availableForSale ?? true,
          stockLevel: inv?.stockLevel ?? 0,
          reorderPoint: inv?.reorderPoint ?? 0,
          optimalStock: inv?.optimalStock ?? 0,
        };
      });

      let handle = "";
      if (p.isParent) {
        handle = parentHandleMap.get(p.id) ?? "";
      } else if (p.parentProductId) {
        handle = parentHandleMap.get(p.parentProductId) ?? "";
      }

      return {
        ...p,
        handle,
        locations: locData,
      };
    });

    return reply.send({
      data: enriched,
      locations: orgLocations,
    });
  });
```

**Step 3: Verify**

```bash
cd C:/Users/Admin/Downloads/CLAUDE/APEX_POS/apps/api && npx tsc --noEmit 2>&1 | grep -v stock-levels | grep -v procurement
```

**Step 4: Commit**

```bash
git add apps/api/src/modules/products/routes.ts
git commit -m "feat(api): add GET /products/export with per-location inventory data"
```

---

### Task 3: API — Update `POST /products/import` for per-location data

**Files:**
- Modify: `packages/types/src/schemas.ts` (lines 167-188, the `bulkImportSchema`)
- Modify: `apps/api/src/modules/products/routes.ts` (lines 1595-1749, the import route)

**Step 1: Update the Zod schema**

Replace the existing `importRowSchema` and `bulkImportSchema` (lines 167-188 in `packages/types/src/schemas.ts`) with:

```typescript
// ── Product: Bulk Import ──
const importLocationSchema = z.object({
  locationName: z.string().min(1).max(255),
  availableForSale: z.boolean().default(true),
  price: z.string().nullable().optional(),
  inStock: z.coerce.number().int().min(0).default(0),
  lowStock: z.coerce.number().int().min(0).default(0),
  optimalStock: z.coerce.number().int().min(0).default(0),
});

const importRowSchema = z.object({
  name: z.string().min(1, "Name is required").max(500),
  sku: z.string().min(1, "SKU is required").max(50),
  handle: z.string().max(100).optional(),
  barcode: z.string().max(50).optional(),
  oemNumber: z.string().max(100).optional(),
  family: z.string().max(255).optional(),
  category: z.string().max(255).optional(),
  subcategory: z.string().max(255).optional(),
  brand: z.string().max(255).optional(),
  unitPrice: z.string().optional(),
  costPrice: z.string().optional(),
  description: z.string().max(2000).optional(),
  isVariablePrice: z.boolean().optional(),
  trackStock: z.boolean().optional(),
  locations: z.array(importLocationSchema).optional(),
});

export const bulkImportSchema = z.object({
  dryRun: z.boolean().default(false),
  rows: z.array(importRowSchema).min(1).max(5000),
});
export type BulkImportInput = z.infer<typeof bulkImportSchema>;
export type ImportRow = z.infer<typeof importRowSchema>;
```

**Step 2: Update the import route to handle per-location inventory**

In `apps/api/src/modules/products/routes.ts`, modify the import route (line 1595+). After the existing taxonomy map loading (line 1635), add a location name map:

```typescript
    // 2b. Load location name -> id map
    const orgLocations = await db
      .select({ id: locations.id, name: locations.name })
      .from(locations)
      .where(and(eq(locations.orgId, orgId), eq(locations.isActive, true)));
    const locationNameMap = new Map(orgLocations.map((l) => [l.name.toLowerCase(), l.id]));
```

Then, inside the transaction loop, after each product create/update + the existing single-location inventory logic, add per-location inventory upsert:

After the existing `reorderPoint` update block (line ~1685) for UPDATES, and after the inventory creation block (line ~1723) for CREATES, add:

```typescript
            // Upsert per-location inventory from CSV
            if (row.locations && row.locations.length > 0) {
              const productId = existingId || newProduct.id; // use whichever is relevant
              for (const loc of row.locations) {
                const locId = locationNameMap.get(loc.locationName.toLowerCase());
                if (!locId) continue;

                // Check if inventory row exists
                const [existingInv] = await tx
                  .select({ id: inventory.id })
                  .from(inventory)
                  .where(and(
                    eq(inventory.productId, productId),
                    eq(inventory.locationId, locId),
                  ))
                  .limit(1);

                if (existingInv) {
                  await tx.update(inventory).set({
                    stockLevel: loc.inStock,
                    reorderPoint: loc.lowStock,
                    optimalStock: loc.optimalStock,
                    availableForSale: loc.availableForSale,
                  }).where(eq(inventory.id, existingInv.id));
                } else {
                  await tx.insert(inventory).values({
                    orgId,
                    productId,
                    locationId: locId,
                    stockLevel: loc.inStock,
                    reorderPoint: loc.lowStock,
                    optimalStock: loc.optimalStock,
                    availableForSale: loc.availableForSale,
                  });
                }
              }
            }
```

Also add `description` to the product create and update value objects:
- In the UPDATE block (~line 1657): add `if (row.description !== undefined) updateValues.description = row.description;`
- In the CREATE block (~line 1694-1712): add `description: row.description || null,` to the insert values

**Step 3: Rebuild types package**

```bash
cd C:/Users/Admin/Downloads/CLAUDE/APEX_POS/packages/types && pnpm build
```

**Step 4: Verify**

```bash
cd C:/Users/Admin/Downloads/CLAUDE/APEX_POS/apps/api && npx tsc --noEmit 2>&1 | grep -v stock-levels | grep -v procurement
```

**Step 5: Commit**

```bash
git add packages/types/src/schemas.ts apps/api/src/modules/products/routes.ts
git commit -m "feat(api): update POST /products/import for per-location inventory and description"
```

---

### Task 4: Frontend — Rewrite export with per-location columns

**Files:**
- Modify: `apps/web/src/app/inventory/page.tsx` (lines 178-260: `buildCSV`, `downloadCSV`, `handleExport`, `handleExportSelected`)

**Context:** The inventory page is 1083 lines. The export functions are at lines 178-260. The page already imports `useLocations` is NOT imported — add `import { useLocations, type LocationRow } from "@/hooks/use-locations";`. The `useAuth` hook provides `token`.

**Step 1: Add `useLocations` import and hook call**

At top of file (after line 17 imports):
```typescript
import { useLocations, type LocationRow } from "@/hooks/use-locations";
```

Inside the component (after the `useAuth` call on line 40):
```typescript
const locationsQuery = useLocations(token);
const orgLocations = useMemo(() => {
  return (locationsQuery.data?.data ?? []).filter((l) => l.isActive);
}, [locationsQuery.data]);
```

**Step 2: Define export response type**

Add above the component or at top-level:
```typescript
interface ExportProduct {
  id: string;
  name: string;
  sku: string;
  barcode: string | null;
  oemNumber: string | null;
  description: string | null;
  unitPrice: string;
  costPrice: string;
  isVariablePrice: boolean;
  isParent: boolean;
  parentProductId: string | null;
  handle: string;
  familyName: string | null;
  categoryName: string | null;
  subcategoryName: string | null;
  brandName: string | null;
  locations: Array<{
    locationId: string;
    locationName: string;
    availableForSale: boolean;
    stockLevel: number;
    reorderPoint: number;
    optimalStock: number;
  }>;
}

interface ExportResponse {
  data: ExportProduct[];
  locations: Array<{ id: string; name: string }>;
}
```

**Step 3: Rewrite `buildCSV` for per-location columns**

Replace the existing `buildCSV` (lines 185-215) with:

```typescript
  const buildCSV = useCallback((items: ExportProduct[], locs: Array<{ id: string; name: string }>): string => {
    const staticHeaders = [
      "Handle", "Name", "SKU", "Barcode", "OEM Number",
      "Family", "Category", "Sub-category", "Brand",
      "Default Price", "Cost", "Variable Price", "Track Stock", "Description",
    ];
    const locationHeaders = locs.flatMap((loc) => [
      `Available for sale [${loc.name}]`,
      `Price [${loc.name}]`,
      `In stock [${loc.name}]`,
      `Low stock [${loc.name}]`,
      `Optimal stock [${loc.name}]`,
    ]);
    const headers = [...staticHeaders, ...locationHeaders];

    const lines = [headers.map(escapeCSVCell).join(",")];
    for (const item of items) {
      const staticCells = [
        item.handle ?? "",
        item.name ?? "",
        item.sku ?? "",
        item.barcode ?? "",
        item.oemNumber ?? "",
        item.familyName ?? "",
        item.categoryName ?? "",
        item.subcategoryName ?? "",
        item.brandName ?? "",
        item.unitPrice ?? "0.00",
        item.costPrice ?? "0.00",
        item.isVariablePrice ? "Y" : "N",
        "Y", // Track Stock — always Y for now
        item.description ?? "",
      ];

      const locationCells = locs.flatMap((loc) => {
        const inv = item.locations.find((l) => l.locationId === loc.id);
        return [
          inv?.availableForSale ? "Y" : "N",
          "", // Price per location — future feature, leave blank
          String(inv?.stockLevel ?? 0),
          String(inv?.reorderPoint ?? 0),
          String(inv?.optimalStock ?? 0),
        ];
      });

      lines.push([...staticCells, ...locationCells].map(escapeCSVCell).join(","));
    }
    return "\uFEFF" + lines.join("\n");
  }, [escapeCSVCell]);
```

**Step 4: Rewrite `handleExport` to call `/products/export`**

Replace the existing `handleExport` (lines 230-255) with:

```typescript
  const handleExport = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      params.set("sortBy", sortBy);
      params.set("sortDir", sortDir);
      if (debouncedSearch && debouncedSearch.length >= 2) params.set("search", debouncedSearch);
      if (familyFilter) params.set("familyId", familyFilter);
      if (categoryFilter) params.set("subCategoryId", categoryFilter);
      if (subCategoryFilter) params.set("subcategoryId", subCategoryFilter);
      if (stockStatusFilter) params.set("stockStatus", stockStatusFilter);
      if (brandFilter) params.set("brandId", brandFilter);

      const resp = await apiFetch<ExportResponse>(
        `/products/export?${params.toString()}`,
        { token, locationId: apiLocationId },
      );
      downloadCSV(buildCSV(resp.data, resp.locations));
    } catch {
      // Fallback: basic export without per-location data (shouldn't happen)
    }
  }, [sortBy, sortDir, debouncedSearch, familyFilter, categoryFilter, subCategoryFilter, stockStatusFilter, brandFilter, token, apiLocationId, buildCSV, downloadCSV]);
```

**Step 5: Update `handleExportSelected`**

Since selected export also needs per-location data, call the same endpoint but filter client-side:

```typescript
  const handleExportSelected = useCallback(async () => {
    if (selectedIds.size === 0) return;
    try {
      const resp = await apiFetch<ExportResponse>(
        `/products/export`,
        { token, locationId: apiLocationId },
      );
      const selected = resp.data.filter((p) => selectedIds.has(p.id));
      downloadCSV(buildCSV(selected, resp.locations));
    } catch {}
  }, [selectedIds, token, apiLocationId, buildCSV, downloadCSV]);
```

**Step 6: Remove old `getMarginPercent` usage from buildCSV**

The old `buildCSV` used `getMarginPercent`. The new one doesn't include Margin % (not in Loyverse format). No changes needed to the import — just make sure the old function is removed cleanly.

**Step 7: Verify and commit**

```bash
cd C:/Users/Admin/Downloads/CLAUDE/APEX_POS/apps/web && npx next build 2>&1 | tail -10
git add apps/web/src/app/inventory/page.tsx
git commit -m "feat(inventory): rewrite CSV export with per-location columns"
```

---

### Task 5: Frontend — Rewrite template download + import parser for per-location columns

**Files:**
- Modify: `apps/web/src/app/inventory/page.tsx` (lines 262-436: `handleDownloadTemplate`, `parseImportCSV`, `mapCSVRowToPayload`, `handleImportFileUpload`, `handleImportExecute`)

**Step 1: Rewrite `handleDownloadTemplate` to be dynamic**

Replace the existing `handleDownloadTemplate` (lines 263-276) with:

```typescript
  const handleDownloadTemplate = useCallback(() => {
    const locs = orgLocations;
    const staticHeaders = [
      "Handle", "Name", "SKU", "Barcode", "OEM Number",
      "Family", "Category", "Sub-category", "Brand",
      "Default Price", "Cost", "Variable Price", "Track Stock", "Description",
    ];
    const locationHeaders = locs.flatMap((loc) => [
      `Available for sale [${loc.name}]`,
      `Price [${loc.name}]`,
      `In stock [${loc.name}]`,
      `Low stock [${loc.name}]`,
      `Optimal stock [${loc.name}]`,
    ]);
    const headers = [...staticHeaders, ...locationHeaders];

    // Sample row
    const staticSample = [
      "sample-handle", "Sample Brake Pad", "SAMPLE-001", "1234567890123", "MB-000001",
      "Brakes", "Brake Pad", "", "AKEBONO",
      "2500.00", "1630.00", "N", "Y", "Sample item - delete this row",
    ];
    const locationSample = locs.flatMap(() => ["Y", "", "0", "10", "25"]);
    const sampleRow = [...staticSample, ...locationSample];

    const csv = "\uFEFF" + headers.map(escapeCSVCell).join(",") + "\n" + sampleRow.map(escapeCSVCell).join(",") + "\n";
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "apex-item-import-template.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [orgLocations, escapeCSVCell]);
```

**Step 2: Rewrite `mapCSVRowToPayload` to detect per-location columns**

Replace the existing `mapCSVRowToPayload` (lines 331-352) with:

```typescript
  const mapCSVRowToPayload = useCallback((row: Record<string, string>, rawHeaders: string[]) => {
    const get = (...keys: string[]) => {
      for (const k of keys) {
        const normalized = k.toLowerCase().replace(/[^a-z0-9]/g, "");
        if (row[normalized] !== undefined && row[normalized] !== "") return row[normalized];
      }
      return "";
    };

    // Detect per-location columns from raw headers
    const locationData: Array<{
      locationName: string;
      availableForSale: boolean;
      price: string | null;
      inStock: number;
      lowStock: number;
      optimalStock: number;
    }> = [];

    // Match headers like "Available for sale [C Autoparts]" etc.
    const locNameSet = new Set<string>();
    for (const h of rawHeaders) {
      const match = h.match(/^(?:Available for sale|In stock|Low stock|Optimal stock|Price)\s*\[(.+)\]$/i);
      if (match) locNameSet.add(match[1]);
    }

    for (const locName of locNameSet) {
      const norm = (prefix: string) => `${prefix}[${locName}]`.toLowerCase().replace(/[^a-z0-9\[\]]/g, "");
      const getCol = (prefix: string) => {
        const key = norm(prefix);
        // Find the normalized header key that contains this pattern
        for (const [k, v] of Object.entries(row)) {
          if (k === key || k.includes(locName.toLowerCase().replace(/[^a-z0-9]/g, ""))) {
            // More precise match needed
          }
        }
        return row[key] ?? "";
      };

      // Simpler approach: use rawHeaders to find exact indices
      const availKey = rawHeaders.find((h) => h.match(new RegExp(`^available\\s*for\\s*sale\\s*\\[${locName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\]$`, "i")));
      const priceKey = rawHeaders.find((h) => h.match(new RegExp(`^price\\s*\\[${locName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\]$`, "i")));
      const stockKey = rawHeaders.find((h) => h.match(new RegExp(`^in\\s*stock\\s*\\[${locName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\]$`, "i")));
      const lowKey = rawHeaders.find((h) => h.match(new RegExp(`^low\\s*stock\\s*\\[${locName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\]$`, "i")));
      const optKey = rawHeaders.find((h) => h.match(new RegExp(`^optimal\\s*stock\\s*\\[${locName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\]$`, "i")));

      const getNorm = (key?: string) => key ? (row[key.toLowerCase().replace(/[^a-z0-9]/g, "")] ?? "") : "";

      locationData.push({
        locationName: locName,
        availableForSale: getNorm(availKey).toUpperCase() === "Y",
        price: getNorm(priceKey) || null,
        inStock: parseInt(getNorm(stockKey)) || 0,
        lowStock: parseInt(getNorm(lowKey)) || 0,
        optimalStock: parseInt(getNorm(optKey)) || 0,
      });
    }

    return {
      name: get("name"),
      sku: get("sku"),
      handle: get("handle"),
      barcode: get("barcode"),
      oemNumber: get("oemnumber", "oem"),
      family: get("family"),
      category: get("category"),
      subcategory: get("subcategory", "sub-category"),
      brand: get("brand"),
      unitPrice: get("defaultprice", "sellprice", "unitprice", "price"),
      costPrice: get("cost", "costprice"),
      description: get("description"),
      isVariablePrice: ["yes", "y", "true", "1"].includes(get("variableprice", "variable").toLowerCase()),
      trackStock: !["no", "n", "false", "0"].includes(get("trackstock", "track").toLowerCase()),
      locations: locationData.length > 0 ? locationData : undefined,
    };
  }, []);
```

**Step 3: Update `parseImportCSV` to preserve raw headers**

The existing `parseImportCSV` (lines 278-329) normalizes headers. We need to also return the raw headers for location column detection. Modify it to return `{ rows: Record<string, string>[], rawHeaders: string[] }` instead of just `Record<string, string>[]`.

Change the return type and add `rawHeaders` to the return:

```typescript
  const parseImportCSV = useCallback((text: string): { rows: Record<string, string>[]; rawHeaders: string[] } => {
    // ... existing parsing logic ...
    const headerCells = parseLine(lines[0]);
    // Return raw headers alongside normalized data
    return { rows, rawHeaders: headerCells };
  }, []);
```

**Step 4: Update `handleImportFileUpload` and `handleImportExecute`**

Update callers of `parseImportCSV` to destructure `{ rows, rawHeaders }` and pass `rawHeaders` to `mapCSVRowToPayload`:

In `handleImportFileUpload` (~line 354):
```typescript
      const { rows: parsed, rawHeaders } = parseImportCSV(text);
      // ...
      const payload = parsed.map((r) => mapCSVRowToPayload(r, rawHeaders));
```

In `handleImportExecute` (~line 400):
```typescript
      const { rows: parsed, rawHeaders } = parseImportCSV(text);
      const payload = parsed.map((r) => mapCSVRowToPayload(r, rawHeaders));
```

**Step 5: Update import preview summary**

In the preview modal JSX, add a line showing per-location info when present:

After the stats badges, add:
```tsx
{importPreview.some((r) => r.raw?.locations) && (
  <span className="text-xs text-muted-foreground">
    with per-location inventory data
  </span>
)}
```

**Step 6: Verify and commit**

```bash
cd C:/Users/Admin/Downloads/CLAUDE/APEX_POS/apps/web && npx next build 2>&1 | tail -10
git add apps/web/src/app/inventory/page.tsx
git commit -m "feat(inventory): rewrite import template and parser for per-location columns"
```

---

### Task 6: Build verification and smoke test

**Step 1: Full builds**

```bash
cd C:/Users/Admin/Downloads/CLAUDE/APEX_POS
cd packages/database && pnpm build
cd ../types && pnpm build
cd ../../apps/web && npx next build 2>&1 | tail -10
cd ../api && npx tsc --noEmit 2>&1 | grep -v stock-levels | grep -v procurement
```

**Step 2: Smoke test the export API**

```bash
# Get token
TOKEN=$(curl -s -X POST http://localhost:3000/auth/login -H 'Content-Type: application/json' -d '{"email":"admin@apex.com","password":"admin12345"}' | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).token))")

# Get a location ID
curl -s http://localhost:3000/locations -H "Authorization: Bearer $TOKEN" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const r=JSON.parse(d);console.log(r.data[0].id, r.data[0].name)})"

# Test export endpoint
curl -s "http://localhost:3000/products/export" -H "Authorization: Bearer $TOKEN" -H "X-Location-ID: <LOCATION_ID>" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const r=JSON.parse(d);console.log('Products:', r.data.length, 'Locations:', r.locations.length);if(r.data[0])console.log('First product locations:', r.data[0].locations.length)})"
```

**Step 3: Test import dry run with per-location data**

```bash
curl -s -X POST http://localhost:3000/products/import \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Location-ID: <LOCATION_ID>" \
  -H "Content-Type: application/json" \
  -d '{"dryRun":true,"rows":[{"name":"Test Import","sku":"TEST-LOC-001","unitPrice":"100.00","costPrice":"50.00","locations":[{"locationName":"C Autoparts","availableForSale":true,"inStock":10,"lowStock":5,"optimalStock":20}]}]}' | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d)))"
```

**Step 4: Final commit if needed**

```bash
git add -A
git commit -m "feat: loyverse-style per-location CSV import/export"
```
