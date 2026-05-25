# Stock Velocity — Fix Plan (Executable)

**Scope:** Prioritized fix plan derived from `stock-velocity-audit.md`. Ships against `/procurement/stock-velocity`.
**Reading order:** P0 (ship together) → P1 (strategic) → P2 (forward-looking).
**Target:** 9.5/10. P0+P1 get there; P2 is separable.

---

## P0 — Ship Together (Bugs & Core UX)

One PR. Everything here is small, isolated, and verifiable.

### P0.1 — Surface the 9,511 excluded products

**What the user sees today:** Classification cards sum to 37,309 but the app implicitly acknowledges ~47K active SKUs. The gap (9,511) is a silent SQL filter — not a classification fallback, as an earlier hypothesis suggested.

**Root cause:** `apps/api/src/modules/stock-monitor/service.ts:366`

```ts
WHERE p.is_active = true
  AND p.is_parent = false
  AND (COALESCE(st.total_stock, 0) > 0 OR COALESCE(v.avg_90d, 0) >= 0.01)
```

That final `OR` clause excludes any product with both zero stock AND zero 90-day velocity — 9,511 rows.

**Recommended fix — Option A (ship this):**

Add a **6th summary card** on the Classification tab labeled **"Untracked"** / **"Dormant"** with a tooltip *"Active SKUs with no stock and no sales in the last 90 days — click to include in grid."* Clicking the card toggles a new `includeUntracked` flag on the query.

**Backend changes:**

1. `apps/api/src/modules/stock-monitor/service.ts` around `:366` — accept `includeUntracked: boolean` in the query function; when true, drop the `(total_stock > 0 OR avg_90d >= 0.01)` clause.
2. Add a parallel count query exposed through the summary endpoint: number of active non-parent products with no `stock_metrics` row (or with `total_stock=0 AND avg_90d<0.01` if they do have a row).
3. Surface the count through `queryStockMonitorSummary` (around `service.ts:600–683`).

**Frontend changes:**

4. `apps/web/src/app/procurement/stock-velocity/page.tsx:207–235` — extend the `VELOCITY_CLASSES` loop to render a 6th card when `summary.untrackedCount > 0`.
5. Add `includeUntracked` boolean to page filter state; wire it to the query.

**Verification (read-only DB check):**

```sql
SELECT COUNT(*)
FROM products p
LEFT JOIN stock_metrics sm ON sm.product_id = p.id AND sm.org_id = p.org_id
WHERE p.is_active = true
  AND p.is_parent = false
  AND p.org_id = $1
  AND (sm.id IS NULL OR (COALESCE(sm.total_stock,0) = 0 AND COALESCE(sm.avg_daily_sales_90d,0) < 0.01));
-- Expected: 9,511 (±small drift from live inserts)
```

- After shipping: card count + sum of other cards = total active non-parent SKUs.
- No regression on performance (tests with EXPLAIN ANALYZE on the new query).

**Option B (only if product declines Option A):** add an info banner above the grid: *"9,511 dormant SKUs hidden"* with a link that toggles the same flag. Cheaper to build, less discoverable.

---

### P0.2 — Fix `0.0mo` in Velocity Analysis LEFT columns

**File:** `apps/web/src/app/procurement/stock-velocity/page.tsx:774–778`

**Today:** `monthsLeft = totalStock / demandPerMonth` is rendered as `"${monthsLeft.toFixed(1)}mo"` with no triage. Zero-stock rows and zero-demand rows both collapse to `0.0mo`, which looks like "stock for 0 months" and confuses users.

**Fix:** mirror the Classification tab's triage at `page.tsx:484–493`:

```ts
const renderDOS = (stock: number, demandPerMonth: number) => {
  if (stock === 0) return <Badge variant="destructive">OUT</Badge>;
  if (demandPerMonth === 0) return <Badge variant="secondary">NO DEMAND</Badge>;
  if (demandPerMonth == null) return <span className="text-muted">∞</span>;
  return `${(stock / demandPerMonth).toFixed(1)}mo`;
};
```

Apply to every LEFT column in the per-window display.

**Verification:**
- Seed / find a product with `total_stock=0, avg_30d=1` → Velocity LEFT(30d) shows `OUT`.
- Find a product with `total_stock=100, avg_30d=0` → Velocity LEFT(30d) shows `NO DEMAND` (or `∞`).
- Cross-tab: same product's Classification DOS column matches Velocity tab behavior.

---

### P0.3 — Add CSV export button

**Backend:** already exists — `GET /inventory/stock-monitor/export` at `stock-monitor/routes.ts:57`.

**Frontend util:** already exists — `apps/web/src/lib/csv-export.ts` → `downloadCSV(filename, headers, rows)`.

**Task:**

1. Add an `Export CSV` button in the filter / header band of `apps/web/src/app/procurement/stock-velocity/page.tsx`.
2. Build the export URL using **current** filter state: `velocityClass`, `brand`, `category`, `family`, date range, `hideDiscontinued`, `hideSpecialOrder`, and the new `includeUntracked` from P0.1.
3. Pattern reference: `apps/api/src/modules/reorder/service.ts` → `exportReorderCSV()`.

**Verification:**
- No filters → CSV row count == grid total (ignoring pagination).
- With filters applied → CSV row count == grid count under same filters.
- `>10k rows` case → endpoint streams or pages without timeout. If it currently OFFSETs, switch to keyset.

---

### P0.4 — Standardize `DEMAND` naming

**Files:**
- `apps/web/src/app/procurement/stock-velocity/page.tsx:366`
- `apps/web/src/app/procurement/stock-velocity/page.tsx:681`
- `apps/web/src/app/procurement/stock-velocity/reorder-panel.tsx:463`

Rename all three to `DEMAND` (uppercase, no slash). Add one shared tooltip component:

> *"Average units sold per month over the selected window (30 / 90 / 180 / 365 d). Computed from `stock_metrics.avg_daily_sales_Xd × 30`."*

**Verification:**
- `grep -r "AVG/MO\|Avg/Mo" apps/web/src/app/procurement/stock-velocity` → **0** hits.
- Tooltip renders on hover over the column header.

---

### P0.5 — Consolidate duplicate Brand + Category filters

**Today:** `page.tsx:239–352` and `reorder-panel.tsx:352–387` each own independent `brandId` / `categoryId` state. Changing one does not update the other. User loses trust in filter state.

**Fix:**

1. Lift `brandId` and `categoryId` to top-level state in `page.tsx`.
2. Pass them as **read-only** props to `ReorderSuggestionsPanel` along with the panel's existing local filters (Target months, Urgency, Destination — these stay local because they're panel-specific).
3. Remove the panel's own `brandId` / `categoryId` `useState`.
4. Add a visible separator in the panel's filter bar: **"Global filters"** (grey, read-only — from page) vs **"Panel filters"** (editable — Target months / Urgency / Destination).

**Verification:**
- Change Brand at page level → reorder panel's data updates live, without page reload.
- Change Target months in panel → does not affect the main grid.

---

### P0.6 — Promote "Generate PO" button

**Today:** `reorder-panel.tsx:543–565` contains the Generate PO button, but it sits in a footer row with the same visual weight as the "Selected: N items" label. User reported they couldn't find it.

**Fix:**
- Move to a **fixed bottom action bar** styled as a primary CTA.
- Show it only when `selectedIds.length > 0`.
- Enlarge to match the height of the pagination bar (consistent hit target).
- No backend changes — pure CSS + layout.

**Verification:** open Reorder tab, select any row, button visibly appears in the bottom-right as the most prominent element.

---

## P1 — Strategic Enhancements (Second PR)

### P1.1 — ABC class column

**Source:** `reorder_suggestions.abcClass` (already populated by reorder service).

**Backend:** extend the stock-monitor grid query to `LEFT JOIN reorder_suggestions ON (product_id, org_id)` and select `abcClass`. If the reorder row is missing, return `null`.

**Frontend:** add a compact **A / B / C** badge column in Classification and Velocity tabs. Make it sortable. Color: A=green, B=amber, C=slate.

**Verification:** grid's ABC value matches `reorder_suggestions.abcClass` for the same `(org_id, product_id)` — spot-check 5 products.

---

### P1.2 — Dead-stock liquidation CSV

**New endpoint:** `GET /inventory/stock-monitor/dead-stock/export` (or extend existing export with `?scope=dead_stock&withTiers=true`).

**Query:** `velocity_class = 'DEAD_STOCK' AND total_stock > 0`.

**Columns:** `sku`, `product_name`, `current_stock`, `stock_age_months`, `cost_price`, `tier`, `liquidation_price`, `est_recovery_value`.

**Tier math (already in code — `stock-monitor/service.ts:1280–1284`):**

| Age | Target margin |
|-----|---------------|
| 90 – 180 d | 12% |
| 181 – 365 d | 3% |
| 366 d + | −15% |

**Pattern:** copy `exportReorderCSV()` shape from `apps/api/src/modules/reorder/service.ts`.

**Frontend:** a new "Export Liquidation CSV" button on the Dead Stock summary card (contextual).

**Verification:** DB count with `velocity_class='DEAD_STOCK' AND total_stock > 0` == CSV row count. Spot-check 3 products across the three age tiers.

---

### P1.3 — Cross-branch transfer hints

**Trigger:** for any row with `velocity_class='DEAD_STOCK' AND total_stock > 0`, check if the **same `product_id`** has `FAST_MOVER` or `WATCH_LIST` class at another location with low stock (e.g., `days_of_stock < 14`).

**Data:** `inventory` (per-location) ⋈ `stock_metrics` (per-location if multi-location metrics exist; else per-org). Confirm schema supports per-location velocity before building.

**UI:** inline pill under the row:

> "🔄 Transfer candidate — 12 units needed at Branch B"

Click → deep-link to `apps/web/src/app/procurement/transfer-orders/new/page.tsx?productId=X&fromLocation=A&toLocation=B`.

**Verification:** seed a test scenario (same SKU: DEAD_STOCK at Location 1, FAST_MOVER low-stock at Location 2) → hint appears with correct deep link.

---

### P1.4 — Consolidate reorder math

**Today:** Stock Velocity's reorder panel uses a simpler `suggestedQty` from `/inventory/stock-monitor/reorder-suggestions`. Meanwhile `reorder_suggestions` table stores sophisticated ABC + σ + safety stock + ROP + SOQ values.

**Fix — preferred:** make the stock-monitor endpoint delegate to the reorder service. One source of truth. Read from `reorder_suggestions`, not the ad-hoc formula.

**Fallback:** label both values — "Simple qty (X)" vs "Full qty (Y)" — but this expands the panel and is a second-best option.

**Verification:**
- Panel `suggestedQty` == `reorder_suggestions.suggestedQty` for the same product.
- ROP and safety stock visible in a hover tooltip or secondary column.

---

### P1.5 — Enriched selection summary

**File:** `reorder-panel.tsx:535` (footer currently shows `Selected: N items`).

**Replace with:**

- Selected count
- Sum of `qty × unit_cost` (total value)
- Per-supplier subtotal (collapsible)
- Destination-mixed warning (e.g., "⚠ Mixed destinations: Warehouse-1, Store-2")
- Estimated PO count after grouping by supplier

All pure client-side compute from the selection state. No backend changes.

**Verification:** select 3 items across 2 suppliers and 2 branches → footer shows value, per-supplier breakdown, destination-mixed warning.

---

## P2 — Forward-Looking (Separate Tracks)

Do not block P0/P1 on these.

### P2.1 — Carrying cost column

`est_carrying_cost = stock_value × carrying_rate × (age_months / 12)`.
Needs `pricing_config.carrying_rate_annual` — likely a schema addition (verify before scoping). Column goes on Dead Stock filter view.

### P2.2 — Seasonal trending overlay

Velocity Analysis tab shows same-month-prior-year demand beside current. Requires ≥12 months of history (confirm data availability).

### P2.3 — Stockout risk projection

Using demand σ from the reorder layer, surface "Days until stockout: 14 d (±3 d, 90% CI)" on Watch List rows.

---

## Critical Files

| File | Role |
|------|------|
| `apps/web/src/app/procurement/stock-velocity/page.tsx` | Main UI — P0.1/P0.2/P0.3/P0.4/P0.5 |
| `apps/web/src/app/procurement/stock-velocity/reorder-panel.tsx` | Reorder panel — P0.4/P0.5/P0.6/P1.5 |
| `apps/api/src/modules/stock-monitor/service.ts` | Classification + summary + filter — P0.1/P1.2 |
| `apps/api/src/modules/stock-monitor/routes.ts` | Export endpoint (line 57) — P0.3 |
| `apps/api/src/modules/reorder/service.ts` | ABC + σ + ROP + SOQ; `exportReorderCSV()` ref — P1.1/P1.2/P1.4 |
| `apps/api/src/modules/reorder/routes.ts` | `POST /inventory/reorder/create-pos` bulk — already wired |
| `apps/web/src/lib/csv-export.ts` | `downloadCSV()` util — P0.3/P1.2 |
| `apps/web/src/app/procurement/transfer-orders/new/page.tsx` | Deep-link target for P1.3 |
| `packages/database/src/schema/stock-metrics.ts` | `velocity_class`, `computed_at`, `avg_daily_sales_Xd` |
| `packages/database/src/schema/reorder.ts` | `abcClass`, `safetyStock`, `reorderPoint`, `suggestedQty` |

---

## Reusable Code (do not duplicate)

- `downloadCSV(filename, headers, rows)` — `apps/web/src/lib/csv-export.ts`
- `exportReorderCSV()` — `apps/api/src/modules/reorder/service.ts` (shape + query pattern)
- `POST /inventory/reorder/create-pos` — already wired to `reorder-panel.tsx:543–565`
- ABC + safety-stock + ROP + SOQ math — `apps/api/src/modules/reorder/service.ts`
- Transfer order UI — `apps/web/src/app/procurement/transfer-orders/new/page.tsx` (deep-link target)

---

## Execution Notes

- **P0 ships as ONE PR.** All six items are small and related; no reason to split.
- **P1 ships as a second PR** after P0 lands. P1.1–P1.5 include backend touches; regroup under a "Stock Velocity Phase 2" branch.
- **P2 is scoped separately.** Do not build any P2 item until product confirms.
- **Do not touch `refreshStockMetrics()` mechanics** — none of P0/P1 requires changes to the metrics computation pipeline.
- **Read-only verification already done:** `UNCATEGORIZED` has 0 rows in production. The "missing 9K" is the filter at `stock-monitor/service.ts:366`. P0.1 is grounded in that data, not the original hypothesis.
