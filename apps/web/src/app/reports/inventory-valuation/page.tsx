"use client";

import { useState, useMemo } from "react";
import {
  DollarSign,
  Package,
  Layers,
  TrendingUp,
  Hash,
  AlertTriangle,
  Download,
  Search,
  X,
  ChevronUp,
  ChevronDown,
  ChevronRight,
  Loader2,
  Filter,
} from "lucide-react";
import {
  PieChart,
  Pie,
  Cell,
  BarChart as RechartsBarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { cn } from "@/lib/utils";
import { useAuth } from "@/app/auth-context";
import { useLocations } from "@/hooks/use-locations";
import { useCategories } from "@/hooks/use-categories";
import { useBrands } from "@/hooks/use-brands";
import {
  useInventoryValuation,
  useInventoryValuationDetail,
  type GroupByOption,
  type ValuationGroup,
} from "@/hooks/use-inventory-valuation";
import { downloadCSV } from "@/lib/csv-export";

/* ── Formatters ── */
function fmtCurrency(v: number) {
  return "\u20B1" + v.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtCompact(v: number) {
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (abs >= 1_000_000_000) return `${sign}\u20B1${(abs / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `${sign}\u20B1${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}\u20B1${(abs / 1_000).toFixed(1)}K`;
  return `${sign}\u20B1${abs.toFixed(0)}`;
}
function fmtNumber(v: number) {
  return v.toLocaleString("en-PH");
}

/* ── Colour palette ── */
const CHART_COLORS = ["#10B981", "#3B82F6", "#F59E0B", "#8B5CF6", "#F43F5E", "#94A3B8"];

const UNASSIGNED_GROUPS = new Set(["No Family", "No Brand", "Uncategorized"]);

function marginColor(pct: number) {
  if (pct >= 30) return "text-emerald-600";
  if (pct >= 15) return "text-amber-600";
  return "text-red-500";
}

type SortField = "skuCount" | "totalUnits" | "costValue" | "retailValue" | "marginPct" | "pctOfTotal";
type SortDir = "asc" | "desc";

/* ═════════════════════════════════════════════════════════
 * Drill-Down Accordion Row
 * ═════════════════════════════════════════════════════════ */
function DrillDown({ groupBy, groupName, locationId, categoryId, brandId, excludeZeroCost, excludeZeroSell }: {
  groupBy: GroupByOption; groupName: string; locationId?: string;
  categoryId?: string; brandId?: string; excludeZeroCost?: boolean; excludeZeroSell?: boolean;
}) {
  const { token, locationId: authLocId } = useAuth();
  const { data, isLoading } = useInventoryValuationDetail(token, authLocId, {
    groupBy, groupName, filterLocationId: locationId,
    categoryId, brandId, excludeZeroCost, excludeZeroSell,
    enabled: true,
  });

  if (isLoading) return <div className="flex items-center gap-2 px-6 py-4 text-[12px] text-muted-foreground"><Loader2 size={14} className="animate-spin" /> Loading products...</div>;

  const products = data?.products ?? [];
  if (products.length === 0) return <div className="px-6 py-4 text-[12px] text-muted-foreground">No products found in this group.</div>;

  return (
    <div className="bg-muted/20 border-t border-border">
      <div className="grid grid-cols-[1fr_80px_100px_100px_120px_120px_60px] gap-1 px-6 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground border-b border-border/50">
        <span>Product</span>
        <span className="text-right">Stock</span>
        <span className="text-right">Cost</span>
        <span className="text-right">Sell</span>
        <span className="text-right">Cost Value</span>
        <span className="text-right">Retail Value</span>
        <span className="text-right">Margin</span>
      </div>
      {products.map((p) => (
        <div key={p.productId} className="grid grid-cols-[1fr_80px_100px_100px_120px_120px_60px] gap-1 px-6 py-2 text-[12px] border-b border-border/30 hover:bg-accent/30 transition-colors">
          <div className="min-w-0 truncate">
            <span className="font-medium text-foreground">{p.productName}</span>
            {p.sku && <span className="ml-2 text-muted-foreground text-[10px]">{p.sku}</span>}
          </div>
          <span className="text-right tabular-nums text-foreground">{fmtNumber(p.stock)}</span>
          <span className="text-right tabular-nums text-muted-foreground">{fmtCurrency(p.costPrice)}</span>
          <span className="text-right tabular-nums text-muted-foreground">{fmtCurrency(p.sellPrice)}</span>
          <span className="text-right tabular-nums font-medium text-foreground">{fmtCurrency(p.costValue)}</span>
          <span className="text-right tabular-nums text-foreground">{fmtCurrency(p.retailValue)}</span>
          <span className={cn("text-right tabular-nums font-semibold", marginColor(p.marginPct))}>{p.marginPct}%</span>
        </div>
      ))}
      {data?.hasMore && (
        <div className="px-6 py-2 text-[11px] text-muted-foreground italic">Showing first 50 products. More available.</div>
      )}
    </div>
  );
}

/* ═════════════════════════════════════════════════════════
 * Custom Tooltip for Charts
 * ═════════════════════════════════════════════════════════ */
function ChartTooltip({ active, payload }: any) {
  if (!active || !payload?.[0]) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border border-border bg-background px-3 py-2 shadow-lg text-[12px]">
      <p className="font-semibold text-foreground mb-1">{d.groupName || d.name}</p>
      <p className="text-muted-foreground">Cost: <span className="font-medium text-foreground">{fmtCurrency(d.costValue || d.value)}</span></p>
      {d.pctOfTotal != null && <p className="text-muted-foreground">{d.pctOfTotal}% of total</p>}
    </div>
  );
}

/* ═════════════════════════════════════════════════════════
 * Main Page
 * ═════════════════════════════════════════════════════════ */
export default function InventoryValuationPage() {
  const { token, locationId } = useAuth();
  const [groupBy, setGroupBy] = useState<GroupByOption>("category");
  const [filterLocationId, setFilterLocationId] = useState<string>("");
  const [filterCategoryId, setFilterCategoryId] = useState<string>("");
  const [filterBrandId, setFilterBrandId] = useState<string>("");
  const [excludeZeroCost, setExcludeZeroCost] = useState(false);
  const [excludeZeroSell, setExcludeZeroSell] = useState(false);
  const [excludeUnassigned, setExcludeUnassigned] = useState(false);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortField>("costValue");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [dismissWarning, setDismissWarning] = useState(false);

  const locationsQuery = useLocations(token);
  const locations = locationsQuery.data?.data?.filter((l) => l.isActive && !l.isSystem) ?? [];

  const categoriesQuery = useCategories(token, locationId);
  const categories = (categoriesQuery.data?.data ?? []).filter((c: any) => c.isActive !== false);

  const brandsQuery = useBrands(token, locationId);
  const brands = (brandsQuery.data?.data ?? []).filter((b: any) => b.isActive !== false);

  const valuationQuery = useInventoryValuation(token, locationId, {
    groupBy,
    filterLocationId: filterLocationId || undefined,
    categoryId: filterCategoryId || undefined,
    brandId: filterBrandId || undefined,
    excludeZeroCost,
    excludeZeroSell,
  });

  const totals = valuationQuery.data?.totals;
  const rawGroups = valuationQuery.data?.groups ?? [];

  /* ── Filter + Sort ── */
  const filtered = useMemo(() => {
    let result = [...rawGroups];
    if (excludeUnassigned) {
      result = result.filter((g) => !UNASSIGNED_GROUPS.has(g.groupName));
    }
    if (search.length >= 2) {
      const q = search.toLowerCase();
      result = result.filter((g) => g.groupName.toLowerCase().includes(q));
    }
    result.sort((a, b) => {
      const va = a[sortBy] as number;
      const vb = b[sortBy] as number;
      return sortDir === "desc" ? vb - va : va - vb;
    });
    return result;
  }, [rawGroups, search, sortBy, sortDir, excludeUnassigned]);

  const maxCostValue = Math.max(...filtered.map((g) => g.costValue), 1);

  /* ── Chart data ── */
  const chartData = useMemo(() => {
    const sorted = [...filtered].sort((a, b) => b.costValue - a.costValue);
    const top5 = sorted.slice(0, 5);
    const otherSum = sorted.slice(5).reduce((s, g) => s + g.costValue, 0);
    const filteredTotal = sorted.reduce((s, g) => s + g.costValue, 0) || 1;
    const slices = top5.map((g, i) => ({ name: g.groupName, value: g.costValue, pctOfTotal: g.pctOfTotal, fill: CHART_COLORS[i] }));
    if (otherSum > 0) slices.push({ name: "Other", value: otherSum, pctOfTotal: Math.round((otherSum / filteredTotal) * 1000) / 10, fill: CHART_COLORS[5] });
    return slices;
  }, [filtered]);

  const handleSort = (field: SortField) => {
    if (field === sortBy) setSortDir(sortDir === "desc" ? "asc" : "desc");
    else { setSortBy(field); setSortDir("desc"); }
  };

  const hasFilters = search || filterLocationId || filterCategoryId || filterBrandId || excludeZeroCost || excludeZeroSell || excludeUnassigned;
  const resetFilters = () => {
    setSearch(""); setFilterLocationId(""); setFilterCategoryId(""); setFilterBrandId("");
    setExcludeZeroCost(false); setExcludeZeroSell(false); setExcludeUnassigned(false);
    setSortBy("costValue"); setSortDir("desc");
  };

  function SortHeader({ label, field, width }: { label: string; field: SortField; width: string }) {
    const active = sortBy === field;
    return (
      <button
        onClick={() => handleSort(field)}
        className={cn("flex items-center gap-0.5 justify-end text-[11px] font-semibold uppercase tracking-[0.06em] transition-colors", width,
          active ? "text-foreground" : "text-muted-foreground hover:text-foreground")}
      >
        {label}
        {active && (sortDir === "desc" ? <ChevronDown size={10} /> : <ChevronUp size={10} />)}
      </button>
    );
  }

  return (
    <div className="mx-auto flex h-full max-w-6xl flex-col">
      {/* Header */}
      <div className="mb-5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/[0.06]"><DollarSign size={16} className="text-primary" /></div>
          <h1 className="text-[18px] font-semibold tracking-tight text-foreground">Inventory Valuation</h1>
        </div>
        <p className="mt-1.5 text-[13px] leading-5 text-muted-foreground">
          Total inventory value at cost and retail across all locations. Track capital allocation by category, brand, family, or branch.
        </p>

        {/* KPI cards */}
        {totals && (
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <KPICard icon={<Hash size={12} />} label="Total SKUs" value={fmtNumber(totals.skuCount)} />
            <KPICard icon={<Package size={12} />} label="Total Units" value={fmtNumber(totals.totalUnits)} />
            <KPICard icon={<DollarSign size={12} />} label="Cost Value" value={fmtCompact(totals.costValue)} accent />
            <KPICard icon={<DollarSign size={12} />} label="Retail Value" value={fmtCompact(totals.retailValue)} />
            <KPICard icon={<TrendingUp size={12} />} label="Potential Profit" value={fmtCompact(totals.potentialProfit)}
              className={totals.potentialProfit >= 0 ? "text-emerald-600" : "text-red-500"} />
            <KPICard icon={<Layers size={12} />} label="Avg Margin" value={`${totals.adjustedMarginPct}%`}
              className={marginColor(totals.adjustedMarginPct)}
              subtitle={totals.zeroSellCount > 0 ? `Excl. ${fmtNumber(totals.zeroSellCount)} items w/ \u20B10 sell` : undefined} />
          </div>
        )}
      </div>

      {/* Warning banner */}
      {totals && !dismissWarning && (totals.zeroCostCount > 0 || totals.zeroSellCount > 0) && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 px-4 py-2.5 text-[12px]">
          <AlertTriangle size={14} className="text-amber-600 flex-shrink-0" />
          <span className="text-amber-800 dark:text-amber-200">
            {totals.zeroCostCount > 0 && <>{fmtNumber(totals.zeroCostCount)} items have {"\u20B1"}0 cost</>}
            {totals.zeroCostCount > 0 && totals.zeroSellCount > 0 && " and "}
            {totals.zeroSellCount > 0 && <>{fmtNumber(totals.zeroSellCount)} items have {"\u20B1"}0 sell price</>}
            {" "}&mdash; valuation may be incomplete. Use the exclude toggles below to filter them out.
          </span>
          <button onClick={() => setDismissWarning(true)} className="ml-auto text-amber-600 hover:text-amber-800"><X size={14} /></button>
        </div>
      )}

      {/* Controls bar */}
      <div className="mb-3 rounded-xl border border-border bg-background p-3 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
        {/* Row 1: Dropdowns */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Location dropdown */}
          <select value={filterLocationId} onChange={(e) => setFilterLocationId(e.target.value)}
            className="h-8 rounded-lg border border-border bg-background px-2 text-[12px] text-foreground outline-none focus:border-primary/40 focus:ring-1 focus:ring-primary/20">
            <option value="">All Locations</option>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>

          {/* Category dropdown */}
          <select value={filterCategoryId} onChange={(e) => setFilterCategoryId(e.target.value)}
            className="h-8 rounded-lg border border-border bg-background px-2 text-[12px] text-foreground outline-none focus:border-primary/40 focus:ring-1 focus:ring-primary/20">
            <option value="">All Categories</option>
            {categories.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>

          {/* Brand dropdown */}
          <select value={filterBrandId} onChange={(e) => setFilterBrandId(e.target.value)}
            className="h-8 rounded-lg border border-border bg-background px-2 text-[12px] text-foreground outline-none focus:border-primary/40 focus:ring-1 focus:ring-primary/20">
            <option value="">All Brands</option>
            {brands.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>

          {hasFilters && <button onClick={resetFilters} className="h-8 rounded-lg border border-border px-2.5 text-[11px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">Reset</button>}
        </div>

        {/* Row 2: Toggles + Group by + Search + Export */}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {/* Exclude toggles */}
          <label className="flex items-center gap-1 text-[11px] text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
            <input type="checkbox" checked={excludeZeroCost} onChange={(e) => setExcludeZeroCost(e.target.checked)} className="h-3 w-3 accent-primary rounded" />
            Excl. {"\u20B1"}0 cost
          </label>
          <label className="flex items-center gap-1 text-[11px] text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
            <input type="checkbox" checked={excludeZeroSell} onChange={(e) => setExcludeZeroSell(e.target.checked)} className="h-3 w-3 accent-primary rounded" />
            Excl. {"\u20B1"}0 sell
          </label>
          <label className="flex items-center gap-1 text-[11px] text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
            <input type="checkbox" checked={excludeUnassigned} onChange={(e) => setExcludeUnassigned(e.target.checked)} className="h-3 w-3 accent-primary rounded" />
            Excl. unassigned
          </label>

          <div className="w-px h-5 bg-border mx-0.5" />

          {/* Group by segmented control */}
          <div className="flex rounded-lg border border-border bg-muted/30 p-0.5">
            {(["category", "brand", "family", "location"] as GroupByOption[]).map((opt) => (
              <button key={opt}
                onClick={() => { setGroupBy(opt); setExpandedGroup(null); }}
                className={cn("rounded-md px-3 py-1 text-[11px] font-semibold capitalize transition-colors",
                  groupBy === opt ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
                {opt}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="relative flex-1 min-w-[140px] max-w-xs">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder={`Search ${groupBy}...`}
              className="h-8 w-full rounded-lg border border-border bg-background pl-9 pr-8 text-[12px] text-foreground placeholder:text-muted-foreground/60 outline-none focus:border-primary/40 focus:ring-1 focus:ring-primary/20" />
            {search && <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X size={12} /></button>}
          </div>

          {/* Export CSV */}
          {filtered.length > 0 && (
            <button
              onClick={() =>
                downloadCSV(
                  `inventory-valuation-by-${groupBy}`,
                  ["#", "Group", "SKUs", "Units", "Cost Value", "Retail Value", "Margin %", "% of Total"],
                  filtered.map((g, i) => [
                    String(i + 1), g.groupName, String(g.skuCount), String(g.totalUnits),
                    g.costValue.toFixed(2), g.retailValue.toFixed(2), `${g.marginPct}%`, `${g.pctOfTotal}%`,
                  ]),
                )
              }
              className="ml-auto flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <Download size={12} /> Export CSV
            </button>
          )}
        </div>
      </div>

      {/* Chart */}
      {!valuationQuery.isLoading && chartData.length > 0 && (
        <div className="mb-4 rounded-xl border border-border bg-background p-4 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
          {groupBy === "location" ? (
            <ResponsiveContainer width="100%" height={Math.max(200, chartData.length * 48)}>
              <RechartsBarChart data={chartData} layout="vertical" margin={{ left: 10, right: 30, top: 5, bottom: 5 }}>
                <XAxis type="number" tickFormatter={(v) => fmtCompact(v)} tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 11 }} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={28}>
                  {chartData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Bar>
              </RechartsBarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center gap-6">
              <div className="relative flex-shrink-0">
                <ResponsiveContainer width={220} height={220}>
                  <PieChart>
                    <Pie data={chartData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={2} dataKey="value" stroke="none">
                      {chartData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                    </Pie>
                    <Tooltip content={<ChartTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-[10px] text-muted-foreground">Cost Value</span>
                  <span className="text-[16px] font-bold text-foreground">{fmtCompact(totals?.costValue ?? 0)}</span>
                </div>
              </div>
              <div className="flex-1 space-y-2">
                {chartData.map((slice, i) => (
                  <div key={i} className="flex items-center gap-2 text-[12px]">
                    <span className="h-3 w-3 rounded-sm flex-shrink-0" style={{ background: slice.fill }} />
                    <span className="flex-1 truncate text-foreground font-medium">{slice.name}</span>
                    <span className="tabular-nums text-muted-foreground">{fmtCompact(slice.value)}</span>
                    <span className="tabular-nums text-muted-foreground w-12 text-right">{slice.pctOfTotal}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-border bg-background shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
        <div className="flex items-center border-b border-border bg-muted/40 px-4 py-2">
          <div className="w-10 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">#</div>
          <div className="w-44 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground capitalize">{groupBy}</div>
          <div className="flex-1" />
          <SortHeader label="SKUs" field="skuCount" width="w-16" />
          <SortHeader label="Units" field="totalUnits" width="w-20" />
          <SortHeader label="Cost Value" field="costValue" width="w-32" />
          <SortHeader label="Retail Value" field="retailValue" width="w-32" />
          <SortHeader label="Margin" field="marginPct" width="w-16" />
          <SortHeader label="% Total" field="pctOfTotal" width="w-16" />
        </div>

        {valuationQuery.isLoading ? (
          <div>{Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-14 animate-pulse border-b border-border bg-muted/20" />)}</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted"><DollarSign size={16} className="text-muted-foreground" /></div>
            <p className="mt-3 text-[13px] font-medium text-foreground">{search ? "No matching groups" : "No inventory data"}</p>
            <p className="mt-1 text-[12px] text-muted-foreground">{search ? "Try adjusting your search" : "No products with stock found"}</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filtered.map((g, idx) => {
              const rank = idx + 1;
              const pct = (g.costValue / maxCostValue) * 100;
              const isExpanded = expandedGroup === g.groupName;
              return (
                <div key={g.groupName}>
                  <div
                    className={cn("flex items-center px-4 py-3 transition-colors cursor-pointer hover:bg-accent/40", isExpanded && "bg-accent/20")}
                    onClick={() => setExpandedGroup(isExpanded ? null : g.groupName)}
                  >
                    <div className="w-10 text-[13px] tabular-nums text-muted-foreground">{rank}</div>
                    <div className="w-44 min-w-0 flex flex-col gap-0">
                      <div className="flex items-center gap-1.5">
                        <ChevronRight size={12} className={cn("text-muted-foreground transition-transform flex-shrink-0", isExpanded && "rotate-90")} />
                        <span className="text-[13px] font-medium text-foreground truncate">{g.groupName}</span>
                      </div>
                      {g.topCategories && (
                        <span className="text-[10px] text-muted-foreground ml-5 truncate" title={g.topCategories}>
                          Top: {g.topCategories}
                        </span>
                      )}
                    </div>
                    <div className="flex-1 pr-4">
                      <div className="h-4 w-full rounded-r-md bg-muted/40 overflow-hidden">
                        <div className="h-4 rounded-r-md transition-all" style={{ width: `${Math.max(pct, 1)}%`, background: "linear-gradient(90deg, #10B981, #059669)", minWidth: "4px" }} />
                      </div>
                    </div>
                    <div className="w-16 text-right text-[12px] tabular-nums text-muted-foreground">{fmtNumber(g.skuCount)}</div>
                    <div className="w-20 text-right text-[12px] tabular-nums text-foreground">{fmtNumber(g.totalUnits)}</div>
                    <div className="w-32 text-right text-[12px] tabular-nums font-medium text-foreground">{fmtCurrency(g.costValue)}</div>
                    <div className="w-32 text-right text-[12px] tabular-nums text-foreground">{fmtCurrency(g.retailValue)}</div>
                    <div className={cn("w-16 text-right text-[12px] tabular-nums font-semibold", marginColor(g.marginPct))}>{g.marginPct}%</div>
                    <div className="w-16 text-right text-[12px] tabular-nums text-muted-foreground">{g.pctOfTotal}%</div>
                  </div>
                  {isExpanded && (
                    <DrillDown
                      groupBy={groupBy} groupName={g.groupName}
                      locationId={filterLocationId || undefined}
                      categoryId={filterCategoryId || undefined}
                      brandId={filterBrandId || undefined}
                      excludeZeroCost={excludeZeroCost}
                      excludeZeroSell={excludeZeroSell}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="flex items-center justify-between border-t border-border bg-muted/30 px-4 py-2">
          <span className="text-[11px] text-muted-foreground">{filtered.length} groups</span>
          {totals && <span className="text-[11px] text-muted-foreground">Total cost: {fmtCurrency(totals.costValue)}</span>}
        </div>
      </div>
    </div>
  );
}

/* ── KPI Card ── */
function KPICard({ icon, label, value, accent, className, subtitle }: {
  icon: React.ReactNode; label: string; value: string; accent?: boolean; className?: string; subtitle?: string;
}) {
  return (
    <div className={cn("rounded-xl border border-border bg-background p-3.5 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]", accent && "border-primary/20 bg-primary/[0.02]")}>
      <div className="flex items-center gap-1.5 text-muted-foreground mb-1">{icon}<span className="text-[11px] font-medium">{label}</span></div>
      <div className={cn("text-[18px] font-bold tabular-nums text-foreground", className)}>{value}</div>
      {subtitle && <div className="text-[9px] text-muted-foreground mt-0.5 leading-tight">{subtitle}</div>}
    </div>
  );
}
