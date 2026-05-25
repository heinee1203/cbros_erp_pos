# Item List — Pre-Flight Verification Results

**Date:** 2026-04-16
**Purpose:** Resolve five open verification items from the Item List audit (`docs/audits/item-list-audit-2026-04-16.md`) before Phase 1a implementation begins.
**Mode:** Read-only. No source files modified.

---

## Summary

| # | Item | Topic | Classification |
|---|---|---|---|
| 1 | NV-9 | Search-bar ILIKE scope (main list `GET /products`) | **NEW BUG — add Bug 13 to Phase 1b** |
| 2 | NV-10 | React-Query cache-key coverage | RESOLVED — no action |
| 3 | NV-11 | HBA-2 RBAC gate on `+` filter-dropdown buttons | CONFIRMED — HBA-2 stays in Phase 1a |
| 4 | Bug 10 matrix | Public catalog API write-path | RESOLVED — no action |
| 5 | R-1 deletion | Broader `grouped` grep across repo | RESOLVED — R-1 deletion cleared |

**Headline:** One new MEDIUM bug (Bug 13 — main list search ignores `mnemonic_sku`) falls out of preflight and is promoted into the main audit. HBA-2 confirmed un-gated and remains in Phase 1a scope. R-1 deletion is cleared to proceed. All three remaining runtime-dependent NV items (NV-4, NV-5, NV-6) remain open — they require a running DB/API and are flagged in the main audit.

---

## Item 1 — NV-9: Search-bar ILIKE scope

**Commands run:**

```bash
grep -nE "ILIKE|ilike" apps/api/src/modules/products/routes.ts | head -40
sed -n '200,290p' apps/api/src/modules/products/routes.ts
grep -nE "name:|sku:|barcode:|oem|mnemonic|supplier|tag|vehicle" packages/database/src/schema/products.ts
```

**Raw output (trimmed to relevant lines):**

ILIKE locations in `apps/api/src/modules/products/routes.ts`:
```
4:import { eq, and, ilike, sql, ... } from "drizzle-orm";
172: conditions.push(sql`(${products.name} ILIKE ${term + "%"})`);
177: conditions.push(sql`(${products.sku} ILIKE ${term + "%"} OR EXISTS (SELECT 1 FROM products child WHERE child.parent_product_id = ${products.id} AND child.sku ILIKE ${term + "%"}))`);
182: conditions.push(sql`(${products.barcode} ILIKE ${term + "%"} OR EXISTS (SELECT 1 FROM products child WHERE child.parent_product_id = ${products.id} AND child.barcode ILIKE ${term + "%"}))`);
194–207: comma multi-term path — name, sku, barcode, oemNumber, brands.name, child(name, sku)
213–247: non-comma single-term path — name, sku, barcode, oemNumber, categories.name, child(sku, barcode, name), vehicle_compatibility(make, model, engine, notes), product_tags → tags.name
252–275: non-comma multi-term path — name (per term), sku, barcode, oemNumber, vehicle_compatibility, product_tags
286: OEM filter — oemNumber, name, sku, barcode
```

(`mnemonic_sku` appears at `:521` and `:543` — but in the separate `GET /products/search` trigram endpoint, not the main list.)

Schema fields on `products`:
```
38:    name: varchar("name", { length: 500 }).notNull(),
39:    sku: varchar("sku", { length: 50 }).notNull(),
40:    mnemonicSku: varchar("mnemonic_sku", { length: 10 }).notNull(),
55:    barcode: varchar("barcode", { length: 50 }),
68:    oemNumber: varchar("oem_number", { length: 100 }),
82:    primarySupplierId: uuid("primary_supplier_id").references(() => suppliers.id, ...),
112:    index("idx_products_mnemonic_sku").on(table.mnemonicSku),
127:    index("idx_products_oem_number").on(table.oemNumber),
```

No `supplier_code` column on `products` — only an FK to `suppliers`.

**Deliverable table (main list `GET /products` only):**

| Field | In schema? | In list ILIKE chain? | User-facing expectation | Classification |
|---|---|---|---|---|
| `name` | YES (:38) | YES (all paths) | searchable | OK |
| `sku` | YES (:39) | YES (all paths) | searchable | OK |
| `barcode` | YES (:55) | YES (all paths) | searchable | OK |
| `oem_number` | YES (:68) | YES (all paths) | searchable | OK |
| `mnemonic_sku` | YES (:40) | **NO in main list** (but YES in `/products/search` at :521, :543) | searchable (KINGSCOBRA) | **NEW BUG 13 — MEDIUM** |
| `supplier_code` | NO on `products` (only `primarySupplierId` FK at :82) | N/A | not reachable via this table | Out of scope |
| child SKUs | YES (via `parent_product_id`) | YES (:205, :232) | searchable | OK |
| child barcodes | YES | YES (:233) single-term; **NO in multi-term path** | searchable | Documented asymmetry (per user decision — not a bug) |
| `category.name` | YES (join) | YES (:228) single-term only | arguable | Documented asymmetry |
| vehicle compatibility | YES (table) | YES (:238–239, :266–267) | arguable | OK |
| `product_tags` | YES (via `tags`) | YES (:243–245, :272–273) | arguable | OK |
| `brands.name` | YES (join) | YES only in comma multi-term (:201) | arguable | Documented asymmetry |

**Classification: NEW BUG — add Bug 13 to Phase 1b.**

Draft paragraph for the main audit:

> **Bug 13 — [MEDIUM] Main list search ignores `mnemonic_sku`**
> `apps/api/src/modules/products/routes.ts:213–277` builds the ILIKE chain for `GET /products` without any `mnemonic_sku` branch. The dedicated `GET /products/search` trigram endpoint includes it (`:521, :543`), so the feature *is* wired at the schema level (`packages/database/src/schema/products.ts:40, :112`) — just not on the main list. **Repro:** type a KINGSCOBRA mnemonic into the Item List search — zero results. Paste the same string into the detail-search surface — hit. **Fix:** add one clause `OR ${products.mnemonicSku} ILIKE ${startPattern}` (substitute the correct pattern shape per path — `startPattern` for single-term at :221, `fullSearchTerm` for multi-term at :252). Phase 1b, blast radius = single file.

On the search-path asymmetries (child barcodes, `category.name`, `brands.name` inconsistent across comma / multi-term / single-term paths): per user decision, **documented only, not filed as bugs.** They become a future refactor candidate when someone consolidates the three search paths into one unified ILIKE builder.

---

## Item 2 — NV-10: React-Query cache-key coverage

**Commands run:**

```bash
grep -nE "queryKey" apps/web/src/hooks/use-products.ts apps/web/src/app/inventory/page.tsx
sed -n '1,80p' apps/web/src/hooks/use-products.ts
```

**Raw output (trimmed to the critical block):**

`apps/web/src/hooks/use-products.ts` queryKey:
```
120:    queryKey: [
121:      "products",
122:      locationId,
123:      search,
124:      familyId,
125:      category,
126:      stockStatus,
127:      subCategoryId,
128:      subcategoryId,
129:      brandId,
130:      vehicleMake,
131:      sortBy,
132:      sortDir,
133:      page,
134:      limit,
135:      grouped,
136:      parentOnly,
137:      allLocations,
138:      excludeSO,
139:      excludeDC,
140:    ],
```

Call site at `apps/web/src/app/inventory/page.tsx:292–307`:
```
search: debouncedSearch,
familyId: familyFilter || undefined,
subCategoryId: categoryFilter || undefined,
subcategoryId: subCategoryFilter || undefined,
stockStatus: stockStatusFilter,
brandId: brandFilter || undefined,
sortBy, sortDir, page, limit: pageSize,
parentOnly: true,
allLocations: isAllLocations,
excludeSO: hideSO || undefined,
excludeDC: hideDC || undefined,
```

**Deliverable table:**

| Filter input | In queryKey? | Notes |
|---|---|---|
| `search` (submittedSearch) | YES (:123) | — |
| `familyId` | YES (:124) | — |
| `categoryFilter` → server `subCategoryId` | YES (:127) | indexed under server name |
| `subCategoryFilter` → server `subcategoryId` | YES (:128) | indexed under server name |
| `stockStatusFilter` | YES (:126, as `stockStatus`) | — |
| `brandFilter` | YES (:129, as `brandId`) | — |
| `sortBy` | YES (:131) | — |
| `sortDir` | YES (:132) | — |
| `page` | YES (:133) | — |
| `pageSize` | YES (:134, as `limit`) | — |
| `locationId` | YES (:122) | — |
| `isAllLocations` | YES (:137, as `allLocations`) | — |
| `hideSO` | YES (:138, as `excludeSO`) | — |
| `hideDC` | YES (:139, as `excludeDC`) | — |
| `parentOnly` | YES (:136) | — |
| `grouped` (R-1 deletion) | YES (:135) | will be removed with the hook's param |

**Classification: RESOLVED — no action.** Every filter input is part of the queryKey. No stale-cache bug.

---

## Item 3 — NV-11: HBA-2 RBAC gate on `+` filter-dropdown buttons

**Commands run:**

```bash
grep -nE "setAddModal|QuickAddEntityModal|canEdit|isStaff" apps/web/src/app/inventory/page.tsx
sed -n '1020,1100p' apps/web/src/app/inventory/page.tsx
sed -n '1460,1490p' apps/web/src/app/inventory/page.tsx
```

**Raw output (trimmed):**

```
171:  const isStaff = user?.role === "STAFF";
172:  const canEdit = !isStaff; // STAFF cannot add/edit/delete/import/export
210:  const [addModal, setAddModal] = useState<"family" | "category" | "subcategory" | "brand" | null>(null);
967:          {canEdit && (
1030:          <button onClick={() => setAddModal("family")} ... title="Add Family">
1050:          <button onClick={() => setAddModal("category")} ... title="Add Category">
1065:          <button onClick={() => setAddModal("subcategory")} ... title="Add Sub-category">
1093:          <button onClick={() => setAddModal("brand")} ... title="Add Brand">
1411:                      canEdit={canEdit}
1467:        <QuickAddEntityModal
1471:          onClose={() => setAddModal(null)}
```

Read of `:1020–1100` confirms the `{canEdit && (` wrapper at `:967` closes **before** the filter-dropdown row begins — each of the four `+` buttons at `:1030`, `:1050`, `:1065`, `:1093` sits unconditionally inside the filter row.

**Deliverable table:**

| Button | Line | Rendered conditionally on `canEdit`? | If not, what guards it? |
|---|---|---|---|
| Families `+` | 1030 | **NO** | nothing |
| Categories `+` | 1050 | **NO** | nothing |
| Sub-categories `+` | 1065 | **NO** | nothing |
| Brands `+` | 1093 | **NO** | nothing |

**Classification: HBA-2 confirmed — stays in Phase 1a.**

Fix pattern (apply identically to each of the four buttons):
```tsx
{canEdit && (
  <button onClick={() => setAddModal("family")} className="h-8 rounded-lg rounded-l-none border border-l-0 border-border bg-background px-1.5 text-primary hover:bg-muted transition-colors" title="Add Family">
    <Plus size={13} />
  </button>
)}
```

Or (cleaner): hoist a single `{canEdit && <>…</>}` fragment around the four `select + button` pairs, since the buttons are visually tied to their selects.

---

## Item 4 — Bug 10 matrix: public catalog API write-path

**Commands run:**

```bash
grep -nE "fastify\.(post|patch|put|delete)|\.route\(" apps/api/src/modules/catalog/routes.ts
sed -n '1,60p' apps/api/src/modules/catalog/routes.ts
```

**Raw output (trimmed — full file read, 269 LOC):**

```
11:export const catalogRoutes: FastifyPluginAsync = async (app) => {
13:  app.addHook("onRequest", async (request, reply) => {  // API-key auth only
38:  app.get("/search", async (request, reply) => { ... });
168:  app.get("/items/:id", async (request, reply) => { ... });
232:  app.get("/items/:id/stock", async (request, reply) => { ... });
```

Three handlers, all `app.get`. Zero `app.post / app.patch / app.put / app.delete`. The `addHook("onRequest", …)` is API-key validation — not a mutation path.

**Classification: RESOLVED — no action.** Bug 10 matrix row `Public catalog API | /api/v1/catalog | n/a (read)` is accurate. No 7th row needed.

---

## Item 5 — R-1 deletion safety (broader `grouped` grep)

**Commands run:**

```bash
grep -rn "grouped: true\|grouped=true\|grouped:true" apps/web/src | grep -v "node_modules\|\.test\.\|\.spec\."
grep -rn "grouped" apps/web/src --include="*.ts" --include="*.tsx" | grep -v "node_modules\|\.test\.\|\.spec\.\|ungrouped\|grouped[A-Za-z]"
grep -rn "handleGroupedQuery\|\\?grouped=\|&grouped=" apps/ packages/
```

**Raw output:**

Narrow grep `grouped: true|grouped=true|grouped:true` in `apps/web/src`:
```
(no matches)
```

Broader `\bgrouped\b` in `apps/web/src/**/*.{ts,tsx}` — 13 relevant hits:
```
apps/web/src/hooks/use-products.ts:54   — type field (grouped?: boolean)
apps/web/src/hooks/use-products.ts:83   — type field (ProductListFilters)
apps/web/src/hooks/use-products.ts:112  — destructure with default (grouped = false)
apps/web/src/hooks/use-products.ts:135  — queryKey entry
apps/web/src/hooks/use-products.ts:156  — URLSearchParams setter (if grouped) params.set("grouped","true")
apps/web/src/hooks/use-products.ts:349  — invalidateQueries(["grouped-counts"])  ← belongs to different endpoint
apps/web/src/hooks/use-grouped-counts.ts:58  — queryKey ["grouped-counts", …]
apps/web/src/hooks/use-grouped-counts.ts:61  — URL `/products/grouped-counts`  ← different endpoint
apps/web/src/app/inventory/drill-down.tsx:12  — imports from use-grouped-counts
apps/web/src/app/inventory/page.tsx:956  — title="Switch to grouped view" (cosmetic label)
apps/web/src/app/inventory/families/page.tsx:202  — "items grouped" (cosmetic label)
apps/web/src/app/inventory/vehicle-lookup/page.tsx:272  — local const grouped = useMemo(...)
apps/web/src/app/inventory/vehicle-lookup/page.tsx:630–633  — local grouped usage
apps/web/src/app/analytics/daily-sales/view.tsx:667  — subtitle label "grouped by ..."
apps/web/src/app/procurement/backorders/page.tsx:202,216,561  — local supplier-grouped logic
apps/web/src/app/procurement/purchase-orders/[poNo]/page.tsx:2741  — legacy receipts comment
```

Server-side `handleGroupedQuery|?grouped=|&grouped=`:
```
apps/api/src/modules/products/routes.ts:105  — return handleGroupedQuery(...)
apps/api/src/modules/products/routes.ts:2822 — async function handleGroupedQuery(...)
docs/plans/2026-03-15-brands-feature.md:163,218  — design doc references
docs/audits/item-list-audit-2026-04-16.md:...  — our audit
```

Call-site gate in `routes.ts:80–128` (full read):
```
101: const grouped = q.grouped === "true";
104: if (grouped) {
105:   return handleGroupedQuery(...);
```

**Classification of each non-trivial hit:**

| Hit | Is it a caller that sets `grouped` truthy? | Safe to delete alongside R-1? | Notes |
|---|---|---|---|
| `use-products.ts:54` | No — type def | YES | remove field from `ProductsResponse` |
| `use-products.ts:83` | No — type def | YES | remove field from `ProductListFilters` |
| `use-products.ts:112` | No — default `false` | YES | remove destructure |
| `use-products.ts:135` | No — queryKey slot | YES | remove from queryKey |
| `use-products.ts:156` | No — only fires when caller passes truthy (none do) | YES | remove conditional param-setter |
| `use-products.ts:349` | No — invalidates `grouped-counts` cache (different endpoint) | **NO** — keep | belongs to `useGroupedCounts`, not R-1 |
| `use-grouped-counts.ts:58, 61` | No — different endpoint `/products/grouped-counts` | **NO** — keep | separate server handler |
| `drill-down.tsx:12` | No — imports `useGroupedCounts` | **NO** — keep | needed for nested view |
| `inventory/page.tsx:956` | No — label text | **NO** — keep | cosmetic string on view-mode toggle |
| `families/page.tsx:202` | No — label text | **NO** — keep | cosmetic |
| `vehicle-lookup/page.tsx` | No — local variable | **NO** — keep | unrelated |
| `analytics/daily-sales/view.tsx:667` | No — label | **NO** — keep | unrelated |
| `procurement/backorders/page.tsx` | No — local logic | **NO** — keep | unrelated |
| `procurement/purchase-orders/...` | No — comment | **NO** — keep | unrelated |

**Classification: RESOLVED — R-1 deletion cleared.**

**R-1 deletion scope (authoritative, from this preflight):**
1. `apps/api/src/modules/products/routes.ts:2822–3154` — `handleGroupedQuery` body.
2. `apps/api/src/modules/products/routes.ts:101–125` — the `const grouped = q.grouped === "true"` read + `if (grouped) return handleGroupedQuery(...)` branch.
3. `apps/web/src/hooks/use-products.ts:54, 83, 112, 135, 156` — type field (×2), default, destructure, queryKey entry, URLSearchParams setter for `grouped`.

**Hands-off list (must NOT be touched in R-1):**
- `apps/web/src/hooks/use-grouped-counts.ts` — **separate endpoint** `/products/grouped-counts` with its own server handler (distinct from `handleGroupedQuery`). `drill-down.tsx` depends on it.
- `apps/web/src/hooks/use-products.ts:349` — invalidates `grouped-counts` cache. Belongs to `useGroupedCounts`, not R-1.
- All cosmetic label strings containing "grouped".

**Belt-and-braces check for the implementation PR:** open with `grep -n "grouped-counts\|handleGroupedQuery" apps/api/src/modules/products/routes.ts` to confirm they are independently-defined handlers before touching code.

---

## Appendix A — Action Items Falling Out of Preflight

1. **Bug 13** — `mnemonic_sku` absent from main list ILIKE chain. Promote to the main audit under Bugs (MEDIUM), bundle into Phase 1b alongside Bug 5 (both are one-line WHERE additions in the same file). User has approved promotion.
2. **Search-path asymmetries** — child barcodes, `category.name`, `brands.name` inconsistent across comma / multi-term / single-term paths. Per user decision: **document only, don't file as separate bugs.** Note in the main audit as a future refactor candidate (path consolidation). Not in Phase 1b.
3. **HBA-2 retention** — four `+` buttons confirmed un-gated; HBA-2 stays in Phase 1a as planned. Fix pattern documented in Item 3 above.
4. **R-1 deletion scope locked** — three precise edit locations (routes.ts body, routes.ts gate, use-products.ts flag surface). Hands-off list equally precise.
5. **Runtime-dependent NV items still open:**
   - **NV-4** — Measure parentName N+1 (requires psql against seeded DB).
   - **NV-5** — Measure pagination COUNT cost (same).
   - **NV-6** — Confirm filter-option endpoints send `Cache-Control` (requires running API).
   These are not preflight blockers for Phase 1a (which is schema hardening) but **should be run before Phase 2** starts.

---

## Appendix B — Out-of-Scope Tools Needed Later

- `psql` connected to `apex_dev` (port 5433) with a representative tenant's UUIDs for NV-4 / NV-5.
- Running API server (`pnpm dev`) with a valid JWT + `X-Location-ID` for NV-6.
- Chrome Performance profiler for P-3 (render budget measurement on 500-row pages).
