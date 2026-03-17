# Dashboard & Sales Analytics Redesign — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Redesign the web dashboard to prioritize actionable alerts and redesign sales analytics with proper currency formatting, ghost line chart, and ranked lists.

**Architecture:** Pure frontend restructure — no API changes. Both pages consume existing hooks (`useDashboard`, `useSalesKPIsQuery`, `useDailySalesSummaryQuery`, `useSalesByItemQuery`, `useSalesByEmployeeQuery`). Shared formatters and constants imported from `@/lib/format` and `@/lib/constants`.

**Tech Stack:** Next.js 13+ (app router, "use client"), TanStack React Query, Tailwind CSS, Recharts, lucide-react icons.

---

### Task 1: Rewrite Dashboard Page — Action Queue + Headline Strip

**Files:**
- Modify: `apps/web/src/app/dashboard/page.tsx` (full rewrite)

**Step 1: Rewrite the dashboard page**

Replace the entire file. The new page follows this hierarchy:
1. Page header (keep existing)
2. Action Queue — top priority section
3. Headline Strip — 3-4 KPI cards
4. Low Stock Table — max 5 rows, urgency column, reorder link
5. Activity Feed — max 8 rows, grouped
6. Quick Actions — at bottom

Key changes from current:
- Remove local `CATEGORY_LABELS`, `REF_TYPE_LABELS`, `REF_TYPE_COLORS` constants — import from `@/lib/constants`
- Remove local `isFinancialRole`, `isOperationalRole` — import from `@/lib/constants`
- Remove `KPICard` component (8-card strip) — replace with 3-4 card `HeadlineCard`
- Remove `AttentionPanel` wrapping job card status breakdown
- Remove procurement mini-stats inside job card panel
- Remove financial KPIs (Gross Profit, Avg Margin) — belong in Sales Analytics
- Add `ActionQueue` component with role-gated alert rows
- Add `HeadlineStrip` with contextual subtitles
- Modify `LowStockRow` to add urgency dot + reorder link, limit to 5
- Modify activity table to limit 8 rows and group consecutive same-product entries

Action Queue data mapping (from `useDashboard` response):
```
inventory.outOfStock  > 0 → red  → "items out of stock"         → /procurement/stock-levels?stockStatus=OUT_OF_STOCK
inventory.lowStock    > 0 → amber → "items below reorder point" → /procurement/stock-levels?stockStatus=LOW_STOCK
procurement.awaitingReceiving > 0 → amber → "POs awaiting receiving" → /procurement/purchase-orders
transfers.inTransit   > 0 → amber → "transfers in transit"      → /procurement/transfer-orders
jobCards.waitingForParts > 0 → amber → "job cards waiting for parts" → /service/job-cards
procurement.draftPOs  > 0 → amber → "draft purchase orders"     → /procurement/purchase-orders
```

Role gating for Action Queue:
- CASHIER: only show inventory alerts (outOfStock, lowStock)
- WAREHOUSE_STAFF: show inventory + transfers
- ADMIN/MANAGER: show all

Headline Strip cards:
- Total SKUs (`inventory.totalSkus`), subtitle: `{inventory.inStock} in stock` — all roles
- Low Stock (`inventory.lowStock`), subtitle: `{inventory.outOfStock} critical` — all roles
- Active Jobs (`jobCards.activeJobs`), subtitle: `{jobCards.workCompleted} completed` — operational roles only
- Open POs (`procurement.openPOs`), subtitle: `{procurement.awaitingReceiving} to receive` — operational roles only

Icons to use:
- Action Queue header: `AlertTriangle`
- Out of stock: `XCircle`
- Low stock: `AlertTriangle`
- Awaiting receiving: `FileText`
- In transit: `ArrowLeftRight`
- Waiting for parts: `Wrench`
- Draft POs: `FileText`
- All clear: `CheckCircle2` (new import)
- Headline cards: `Package` (SKUs), `AlertTriangle` (Low Stock), `Wrench` (Jobs), `FileText` (POs)

Activity feed grouping logic:
```typescript
// Group consecutive entries with same productName
function groupActivity(entries: RecentActivityEntry[]): GroupedActivity[] {
  const groups: GroupedActivity[] = [];
  for (const entry of entries) {
    const last = groups[groups.length - 1];
    if (last && last.productName === entry.productName && last.referenceType === entry.referenceType) {
      last.count++;
      last.totalChange += entry.changeQuantity;
    } else {
      groups.push({
        ...entry,
        count: 1,
        totalChange: entry.changeQuantity,
      });
    }
  }
  return groups.slice(0, 8);
}
```

**Step 2: Verify dashboard builds and renders**

Run: `pnpm --filter web build`
Expected: Build succeeds with no errors.

**Step 3: Commit**

```
feat(web): redesign dashboard — action queue, headline strip, tighter tables
```

---

### Task 2: Rewrite Sales Analytics — Currency, Empty State, KPI Subtitle

**Files:**
- Modify: `apps/web/src/app/reports/page.tsx`

**Step 1: Fix currency formatting and empty state**

Changes:
- Remove local `fmtPHP()` and local `fmtNum()` functions
- Import `fmtPeso`, `fmtNum`, `fmtPercent` from `@/lib/format`
- Import `MARGIN_THRESHOLDS` from `@/lib/constants`
- Replace all `fmtPHP(value)` calls with `fmtPeso(value)` — this changes "PHP 12,450.00" to "₱12,450.00"
- In `kpiCard()` function: replace `fmtPHP(current)` with `fmtPeso(current)`, same for diff display
- In Tooltip formatter: replace `fmtPHP(Number(value))` with `fmtPeso(Number(value))`

Better zero-data state — replace the simple "No sales data" message in chart and table with:
```tsx
<div className="flex flex-col items-center justify-center py-12 text-center">
  <BarChart3 className="mb-3 h-10 w-10 text-muted-foreground/40" />
  <p className="text-[14px] font-medium text-foreground">
    No sales recorded for {fmtRangeLabel(range.from, range.to)}
  </p>
  <p className="mt-2 max-w-sm text-[12px] text-muted-foreground leading-relaxed">
    This could mean no completed transactions in the POS app,
    sales were made at a different location, or the date range
    doesn't include any business days.
  </p>
  <div className="mt-4 flex gap-3">
    <Link href="/sales/shifts" className="...">View Shift History</Link>
    <button onClick={() => setSelectedLocation("__all__")} className="...">
      Try All Locations
    </button>
  </div>
</div>
```

KPI subtitle fix — in `kpiCard()`, when `pctChange === null` (prior is 0):
```tsx
// Instead of "No prior data", show transaction count
<span className="text-[11px] text-muted-foreground">
  {kpis?.current.totalTransactions ?? 0} transactions
</span>
```

**Step 2: Verify build**

Run: `pnpm --filter web build`
Expected: Build succeeds.

**Step 3: Commit**

```
fix(web): sales analytics — ₱ currency, better empty state, KPI subtitle
```

---

### Task 3: Sales Analytics — Ghost Line (Prior Period Comparison)

**Files:**
- Modify: `apps/web/src/app/reports/page.tsx`

**Step 1: Add prior period daily query and ghost line**

Add a second call to `useDailySalesSummaryQuery` with dates shifted back:
```typescript
// Compute prior period dates
const durationDays = daysBetween(range.from, range.to) + 1;
const priorFrom = addDays(range.from, -durationDays);
const priorTo = addDays(range.to, -durationDays);

const priorFilters: DashboardFilters = useMemo(
  () => ({
    from: toISO(priorFrom),
    to: toISO(priorTo),
    allLocations: isAllLocations || undefined,
    employeeId: selectedEmployee || undefined,
  }),
  [priorFrom, priorTo, isAllLocations, selectedEmployee],
);

const priorDailyQuery = useDailySalesSummaryQuery(
  token,
  isAllLocations ? locationId : effectiveLocationId,
  priorFilters,
);
```

Merge into chartData by day index:
```typescript
const priorDays: DailySalesRow[] = priorDailyQuery.data?.data ?? [];
const chartData = days.map((d, i) => ({
  date: new Date(d.date).toLocaleDateString("en-PH", { month: "short", day: "numeric" }),
  grossSales: parseFloat(d.grossSales),
  priorGrossSales: priorDays[i] ? parseFloat(priorDays[i].grossSales) : undefined,
}));
```

Add ghost Area to the chart:
```tsx
<Area
  type="monotone"
  dataKey="priorGrossSales"
  stroke="hsl(var(--muted-foreground))"
  strokeWidth={1}
  strokeDasharray="4 4"
  fill="none"
  dot={false}
  name="Prior Period"
/>
```

Update Tooltip formatter to handle both series.
Update `isDataLoading` to include `priorDailyQuery.isLoading`.

**Step 2: Verify build**

Run: `pnpm --filter web build`
Expected: Build succeeds.

**Step 3: Commit**

```
feat(web): sales analytics — prior period ghost line on chart
```

---

### Task 4: Sales Analytics — Top Selling Items + Top Employees

**Files:**
- Modify: `apps/web/src/app/reports/page.tsx`

**Step 1: Add ranked list queries and components**

Add imports:
```typescript
import {
  useSalesByItemQuery,
  useSalesByEmployeeQuery,
  type SalesByItemRow,
  type SalesByEmployeeRow,
} from "@/hooks/use-sales-reports";
import { fmtPeso, fmtPercent } from "@/lib/format";
import { MARGIN_THRESHOLDS } from "@/lib/constants";
```

Add query hooks (unconditional, before any early returns):
```typescript
const reportFilters = { from: toISO(range.from), to: toISO(range.to), allLocations: isAllLocations || undefined };
const itemsQuery = useSalesByItemQuery(token, isAllLocations ? locationId : effectiveLocationId, reportFilters);
const employeesReportQuery = useSalesByEmployeeQuery(token, isAllLocations ? locationId : effectiveLocationId, reportFilters);
```

Derive top 5:
```typescript
const topItems = (itemsQuery.data?.data ?? [])
  .sort((a, b) => b.unitsSold - a.unitsSold)
  .slice(0, 5);

const topEmployees = (employeesReportQuery.data?.data ?? [])
  .sort((a, b) => b.totalSales - a.totalSales)
  .slice(0, 5);
```

Add `TopItemsTable` component:
- Columns: #, Item (name + SKU), Units, Revenue (fmtPeso), Margin % (color-coded)
- Margin color: >= MARGIN_THRESHOLDS.GOOD (30) → emerald, >= WARNING (15) → amber, else red
- "View all →" links to `/reports/sales-by-item`

Add `TopEmployeesTable` component:
- Columns: #, Employee, Sales, Revenue (fmtPeso), Avg Ticket (fmtPeso)
- "View all →" links to `/reports/sales-by-employee`

Layout — place side-by-side between chart and daily breakdown:
```tsx
<div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
  <TopItemsTable items={topItems} isLoading={itemsQuery.isLoading} />
  <TopEmployeesTable employees={topEmployees} isLoading={employeesReportQuery.isLoading} />
</div>
```

**Step 2: Verify build**

Run: `pnpm --filter web build`
Expected: Build succeeds.

**Step 3: Commit**

```
feat(web): sales analytics — top items and top employees ranked lists
```

---

### Task 5: Visual Verification

**Step 1: Start dev servers and verify both pages**

Run web dev server and check:
- Dashboard: action queue renders with correct alert colors and links
- Dashboard: headline strip shows 3-4 cards with subtitles
- Dashboard: low stock table limited to 5 rows with urgency dots
- Dashboard: activity feed limited to 8 rows
- Dashboard: quick actions at bottom
- Dashboard: all-clear state when no alerts
- Sales Analytics: KPI cards show ₱ (not PHP)
- Sales Analytics: ghost line visible on chart
- Sales Analytics: top items and employees tables render
- Sales Analytics: empty state shows helpful message with action links
- Both pages: responsive at 768px and 1440px

**Step 2: Final commit if any fixes needed**

```
fix(web): dashboard and sales analytics visual polish
```
