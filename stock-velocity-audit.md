# Stock Velocity — Audit Report

**Scope:** `/procurement/stock-velocity` — full critique & refactor analysis
**Target:** Lift self-rated 7/10 → 9.5/10
**Date:** 2026-04-16
**Method:** Read-only source inspection + read-only DB `SELECT`s against the dev database

---

## Executive Summary

Stock Velocity is the central inventory-decision surface. Its math is sound but its UX is leaking trust:

- **One real data-loss bug**: 9,511 active products never enter the classification grid at all — silently filtered out at the SQL layer. This is the actual source of the user-observed "37,309 classified vs 46K+ total" discrepancy, **not** an `UNCATEGORIZED` fallback as initially hypothesised.
- **One real formatting bug**: `0.0mo` displayed in Velocity Analysis LEFT columns when stock=0 or demand=0.
- **Three UX bugs**: duplicated Brand+Category filters across page and reorder panel (don't sync), `AVG/MO` vs `DEMAND` column-name drift across 3 locations, and a reorder panel whose most valuable action (Generate PO) is buried in a footer row.
- **Missing but trivial-to-ship**: CSV export button (endpoint already exists), ABC class column (data already written by reorder service), dead-stock liquidation export (tier math already in code).
- **Sophisticated math is orphaned**: the reorder service computes safety stock, ROP, SOQ, and demand σ, but Stock Velocity uses a simpler `suggestedQty`. Two sources of truth for the same decision.

All findings in this document are grounded in source-file line anchors and DB counts. The companion file `stock-velocity-fix-prompt.md` converts these into a P0/P1/P2 execution plan.

---

## A — Data Model & Classification Logic

### A1. Exact classification rules

`apps/api/src/modules/stock-monitor/service.ts:220–242` — single `CASE` expression run server-side against the `stock_metrics` read-model:

| Class | Condition |
|-------|-----------|
| `NEW_ITEM` | `total_stock = 0 AND total_qty_sold = 0 AND last_sale_date IS NULL` |
| `FAST_MOVER` | `avg_daily_sales_90d * 30 >= fast_threshold` (default 30/mo) |
| `STRATEGIC_STOCK` | `saleDaysCount >= 120 AND avg_90d < fast_threshold AND avg_90d >= slow_threshold` |
| `WATCH_LIST` | moderate demand / partial history — fallback above dead-stock |
| `DEAD_STOCK` | `avg_daily_sales_90d = 0 OR days_since_last_sale > 180` |
| **`UNCATEGORIZED`** | fallback at line 242 — **confirmed 0 rows in production (see A3)** |

### A2. Window configurability

Classification is **always computed on the 90-day window** server-side (`stock_metrics.avg_daily_sales_90d`). The page's 30/90/180/365d selector only swaps which pre-computed column is read for display (`stock_metrics.avg_daily_sales_{30,60,90,180,365}d`). The *class label* itself does not change with the window.

- Column source: `packages/database/src/schema/stock-metrics.ts`
- Computation: `refreshStockMetrics()` in `stock-monitor/service.ts`

### A3. Why summary cards sum to 37,309 while "total items" shows ~46K+

This was the most important finding of the audit. The plan-phase hypothesis (that `UNCATEGORIZED` rows were uncounted) was **wrong**.

**Ground-truth counts** (read-only SELECT, org-scoped):

```
SELECT velocity_class, COUNT(*) FROM stock_metrics GROUP BY 1;
  DEAD_STOCK       31,114
  WATCH_LIST        5,424
  FAST_MOVER          483
  STRATEGIC_STOCK     476
  NEW_ITEM              0
  UNCATEGORIZED         0      ← fallback never fires in prod
  ───────────────
  TOTAL            37,497

SELECT COUNT(*) FROM products WHERE is_active = true AND is_parent = false;
  47,008

DIFFERENCE: 47,008 − 37,497 = 9,511 products never reach stock_metrics
```

**Actual root cause** lives at `apps/api/src/modules/stock-monitor/service.ts:366`:

```ts
WHERE p.is_active = true
  AND p.is_parent = false
  AND (COALESCE(st.total_stock, 0) > 0 OR COALESCE(v.avg_90d, 0) >= 0.01)
```

That final clause silently drops any product with **zero stock AND zero 90-day velocity**. Those 9,511 products:
- Are real, active, non-parent SKUs in the catalog
- Have no inventory anywhere
- Have not sold in 90+ days
- Never get a row in `stock_metrics` — classification never even attempts them

They are the "missing 9K." The user sees the absence via the mismatch between card sums and their mental model of "total active SKUs."

### A4. What "Last computed" really means

`page.tsx:229` — the header's "Last computed" timestamp is `MAX(stock_metrics.computed_at)` across all rows in the current org. It is **page-wide freshness**, not per-tab. If `refreshStockMetrics()` is called on one window, all rows' `computed_at` advances together.

### A5. Recompute cadence

- **On demand**: `POST /inventory/stock-monitor/refresh`
- **Auto-refresh**: reorder service triggers a refresh if `MAX(computed_at) > 1 hour old` when its endpoint is called
- **No background scheduler**: there is no cron, no queue — staleness is only healed on next user interaction

### A6. `stock_metrics.velocity_class` vs `reorder_suggestions.abcClass`

Two independent layers. Stock Velocity currently reads the former and completely ignores the latter:

| Layer | Table | Purpose | Inputs | Used where |
|-------|-------|---------|--------|------------|
| Velocity class | `stock_metrics.velocity_class` | Demand-tier label | 90d velocity + stockouts + last-sale age | Stock Velocity page |
| ABC class | `reorder_suggestions.abcClass` | Pareto revenue tier | 12-month $revenue rank per product | Reorder module only |

Surfacing ABC on Stock Velocity is cheap (data exists, JOIN on `product_id`) and gives the user a 2-D decision matrix (demand × revenue importance) instead of a 1-D one.

---

## B — UI/UX Issues

| ID | Issue | Severity | File:Line | Evidence |
|----|-------|----------|-----------|----------|
| B1 | Brand + Category filters duplicated across page and reorder panel; do not sync | **High** | `page.tsx:239–352` vs `reorder-panel.tsx:352–387` | Independent `useState` hooks; no prop bridge |
| B2 | Column label drift: `AVG/MO` vs `DEMAND` vs `Avg/Mo` for the same metric | Medium | `page.tsx:366`, `page.tsx:681`, `reorder-panel.tsx:463` | Same `avgDailySales30d * 30` field, three labels |
| B3 | `0.0mo` in Velocity Analysis LEFT columns when stock=0 or demand=0 | **High** | `page.tsx:774–778` | Missing null/zero triage; Classification tab *does* handle this correctly at `page.tsx:484–493` |
| B4 | Selection summary only shows count; no value, supplier breakdown, or destination warning | Medium | `reorder-panel.tsx:535` | Current footer: just `Selected: N items` |
| B5 | Per-row supplier vs bulk-set supplier UX is ambiguous — no inheritance hint | Low | `reorder-panel.tsx:424–439`, `:511–522` | User can't tell whether bulk-set overrides per-row choices |
| B6 | ABC class data exists but is never surfaced in the grid | Medium | all tabs in `page.tsx` | `reorder_suggestions.abcClass` unused |
| B7 | Discontinued / Special Order badges look static but are toggleable filters | Low | `page.tsx:307–314` | Badge-shaped affordance misleads; should be pill-button or checkbox |
| B8 | "Generate PO" button is present but visually demoted at panel footer | Medium | `reorder-panel.tsx:543–565` | User reported they couldn't find it — affordance problem, not missing-feature |
| B9 | Urgency filter exists at page-level and inside reorder panel per-window → easy to double-filter accidentally | Medium | `page.tsx:647–660` + panel filters | No visual link between the two |
| B10 | 9,511 products filtered out of grid entirely with no UI indication | **High** | effect of `service.ts:366` filter | User has no signal that data is being withheld |

---

## C — Tabs Analysis

### C1. Classification tab

**Purpose:** Assign every SKU to one of five demand tiers at a glance. Primary entry point.

**Columns → source fields**:
| Column | Source |
|--------|--------|
| SKU / Name | `products.sku`, `products.name` |
| CLASS badge | `stock_metrics.velocity_class` |
| STOCK | `stock_metrics.total_stock` |
| ACTIVE (days) | `stock_metrics.sale_days_count` — has 4 consistency bands, undocumented in UI |
| DEMAND | `stock_metrics.avg_daily_sales_30d * 30` |
| DOS (days of stock) | `page.tsx:484–493` — correctly handles stock=0 → `OUT` |
| LAST SALE | `stock_metrics.last_sale_date` |

**Bugs / confusions:**
- `DEMAND` header label is consistent on this tab, but diverges on Velocity and Reorder tabs (B2)
- ACTIVE's four consistency bands (new/partial/established/mature) exist in the data but are not legended

**Missing columns:**
- ABC class (B6) — data exists
- Suggested action (Reorder now / Watch / Liquidate) — currently only the Reorder tab exposes this

### C2. Velocity Analysis tab

**Purpose:** Compare demand and cover across 30/90/180/365d windows side-by-side to catch trend shifts.

**Columns → source fields:**
- For each window: `avg_daily_sales_Xd * 30` and `total_stock / (avg_daily_sales_Xd * 30)` = months-left

**Bugs:**
- **B3 `0.0mo`**: `page.tsx:774–778` computes `monthsLeft = stock / demandPerMonth` without triage. When `demandPerMonth === 0` it emits `0.0mo` (should be `∞` or `NO DEMAND`), and when `stock === 0` it emits `0.0mo` (should be `OUT`). The Classification tab does the right thing at `:484–493` — Velocity tab should mirror that.
- URGENCY dropdowns in the per-window header (`page.tsx:647–660`) are server-side filters, but there is no visual link to the page-level Urgency filter (B9).

**Missing columns:**
- Same-period-prior-year comparison (seasonal trending) — P2 item
- σ (demand variability) — P2 item; data can be derived from reorder layer

### C3. Reorder tab

**Purpose:** Act — generate POs for items that need restocking. Inline rendering of `ReorderSuggestionsPanel` when `viewMode === "reorder"` (`page.tsx:426`).

**Note:** The same `ReorderSuggestionsPanel` component is used as a slide-over in other tabs and inline here. Same component, two presentation modes. This is fine architecturally.

**Columns:**
- Suggested qty (simple formula, not the sophisticated ABC+σ math — see D3)
- Unit cost, supplier, destination, urgency

**Bugs:**
- Filters are fully independent from page-level filters (B1)
- Generate PO button exists (`:543–565`) but is visually demoted in a footer row (B8)

**Missing:**
- No display of ROP / safety stock / suggestedQty from `reorder_suggestions` table (D3)
- Selection summary is minimal (B4)

---

## D — Missing Features

| ID | Feature | Priority | Notes |
|----|---------|----------|-------|
| D1 | CSV export button on page | **P0** | Backend endpoint exists: `GET /inventory/stock-monitor/export` at `stock-monitor/routes.ts:57`; util exists: `apps/web/src/lib/csv-export.ts` |
| D2 | Surface the 9,511 excluded products (Untracked card or filter-relax toggle) | **P0** | See A3 — real source of "missing 9K" |
| D3 | Consolidate reorder math — use ABC+σ+ROP+SOQ from `reorder_suggestions`, not simpler `suggestedQty` | P1 | Algorithm already in `reorder/service.ts`; two sources of truth today |
| D4 | Dead-stock liquidation CSV with tier pricing | P1 | Tier math at `stock-monitor/service.ts:1280–1284` (90–180d: 12%, 181–365d: 3%, 366+d: −15%) |
| D5 | Cross-branch transfer hints (DEAD here + FAST elsewhere) | P1 | Requires join of `inventory` × `stock_metrics` per location; deep-link to `/procurement/transfer-orders/new` |
| D6 | ABC class column on Classification + Velocity tabs | P1 | JOIN `reorder_suggestions` on product_id |
| D7 | Enriched selection summary — value, per-supplier, destination-mix warning | P1 | Pure client-side compute |
| D8 | Carrying cost analysis | P2 | Needs `pricing_config.carrying_rate_annual` (may need schema addition) |
| D9 | Seasonal demand overlay | P2 | Requires ≥12mo sales history |
| D10 | Stockout risk projection with CI | P2 | Uses demand σ from reorder layer |

---

## E — Redundancies & Bugs

| ID | Type | Description | Fix direction |
|----|------|-------------|---------------|
| E1 | **Bug (data loss)** | 9,511 zero-stock/zero-sale products filtered out at `service.ts:366` with no UI signal | Surface count in UI; add "Untracked" card; optionally relax filter |
| E2 | **Bug (display)** | `0.0mo` in Velocity LEFT columns for stock=0 or demand=0 rows | Mirror Classification DOS triage at `page.tsx:484–493` |
| E3 | Redundancy | Brand + Category filters duplicated across page and reorder panel; independent state | Lift to page, pass as props; remove panel's local `brandId`/`categoryId` |
| E4 | Redundancy | `AVG/MO` vs `DEMAND` vs `Avg/Mo` label drift — same metric, 3 labels | Standardize on `DEMAND` with tooltip |
| E5 | Redundancy | Simple `suggestedQty` on stock-monitor endpoint vs sophisticated ABC+σ on reorder endpoint | Delegate stock-monitor to reorder service; single source of truth |
| E6 | Observation | "Generate PO" button exists but is visually demoted — user reported they couldn't find it | Promote to primary action position; increase prominence |
| E7 | Observation | `UNCATEGORIZED` fallback branch at `service.ts:242` never fires in prod | Leave code path (defensive); don't base UI on it |

---

## Appendix — Read-only verification evidence

All counts above are reproducible with:

```sql
-- A3 velocity class distribution
SELECT velocity_class, COUNT(*)
FROM stock_metrics
WHERE org_id = $1
GROUP BY velocity_class
ORDER BY 2 DESC;

-- A3 products excluded from stock_metrics
SELECT COUNT(*) AS total_active
FROM products p
WHERE p.is_active = true AND p.is_parent = false AND p.org_id = $1;

SELECT COUNT(*) AS indexed
FROM stock_metrics sm
WHERE sm.org_id = $1;

-- difference = excluded-by-WHERE-clause count
```

No `UNCATEGORIZED` rows exist. The fallback branch is dead code in production data — the filter at `:366` is the real story.
