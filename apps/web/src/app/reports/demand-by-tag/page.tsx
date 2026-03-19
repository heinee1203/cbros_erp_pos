"use client";

import { useState, useMemo, useCallback } from "react";
import {
  Tag,
  Hash,
  Car,
  FileCode,
  Layers,
  Download,
  TrendingUp,
  Package,
  DollarSign,
  ChevronDown,
  ChevronRight,
  X,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/app/auth-context";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { downloadCSV } from "@/lib/csv-export";

/* ─── Types ─── */
interface DemandRow {
  tagId: string;
  tagName: string;
  tagType: string;
  unitsSold: number;
  revenue: number;
  productCount: number;
  topBrand: string | null;
  stockLeft: number;
  daysOfStock: number | null;
}

interface DetailProduct {
  productId: string;
  name: string;
  brand: string | null;
  sku: string;
  unitPrice: string;
  qtySold: number;
  revenue: number;
  stock: number;
  daysLeft: number | null;
}

interface DetailBrand {
  brand: string;
  qty: number;
  revenue: number;
}

type TagTypeFilter = "ALL" | "TIRE_SIZE" | "VEHICLE" | "APPLICATION_CODE";

const TAG_TYPE_TABS: { key: TagTypeFilter; label: string; icon: any }[] = [
  { key: "ALL", label: "All", icon: Layers },
  { key: "TIRE_SIZE", label: "Tire Sizes", icon: Hash },
  { key: "VEHICLE", label: "Vehicle Fitment", icon: Car },
  { key: "APPLICATION_CODE", label: "Application Codes", icon: FileCode },
];

const TAG_TYPE_BADGE: Record<string, string> = {
  TIRE_SIZE: "bg-blue-50 text-blue-700",
  VEHICLE: "bg-green-50 text-green-700",
  APPLICATION_CODE: "bg-purple-50 text-purple-700",
  CUSTOM: "bg-gray-100 text-gray-700",
};

function fmt(v: number) {
  return v.toLocaleString("en-PH", { minimumFractionDigits: 2 });
}

function getDatePreset(preset: string): { from: string; to: string } {
  const now = new Date();
  const to = now.toISOString();
  let from: Date;
  switch (preset) {
    case "30d": from = new Date(now); from.setDate(from.getDate() - 30); break;
    case "90d": from = new Date(now); from.setDate(from.getDate() - 90); break;
    case "180d": from = new Date(now); from.setDate(from.getDate() - 180); break;
    case "365d": from = new Date(now); from.setDate(from.getDate() - 365); break;
    default: from = new Date(now); from.setDate(from.getDate() - 90);
  }
  return { from: from.toISOString(), to };
}

type SortKey = "tagName" | "unitsSold" | "revenue" | "productCount" | "stockLeft" | "daysOfStock";
type SortDir = "asc" | "desc";

/* ─── Page ─── */
export default function DemandByTagPage() {
  const { token, locationId } = useAuth();

  const [tagTypeFilter, setTagTypeFilter] = useState<TagTypeFilter>("ALL");
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 90);
    return d.toISOString().slice(0, 10);
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [activePreset, setActivePreset] = useState<string | null>("90d");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("unitsSold");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [expandedTagId, setExpandedTagId] = useState<string | null>(null);

  function applyPreset(preset: string) {
    setActivePreset(preset);
    const { from, to } = getDatePreset(preset);
    setDateFrom(from.slice(0, 10));
    setDateTo(to.slice(0, 10));
  }

  function clearDates() {
    setDateFrom("");
    setDateTo("");
    setActivePreset(null);
  }

  // Main report query
  const reportQuery = useQuery({
    queryKey: ["demand-by-tag", tagTypeFilter, dateFrom, dateTo],
    queryFn: () => {
      const params = new URLSearchParams();
      if (tagTypeFilter !== "ALL") params.set("tagType", tagTypeFilter);
      if (dateFrom) params.set("from", `${dateFrom}T00:00:00Z`);
      if (dateTo) params.set("to", `${dateTo}T23:59:59Z`);
      const qs = params.toString();
      return apiFetch<{ data: DemandRow[] }>(`/reports/demand-by-tag${qs ? `?${qs}` : ""}`, {
        token: token!,
        locationId,
      });
    },
    enabled: !!token,
  });

  const rawRows = reportQuery.data?.data ?? [];

  // Filter + sort
  const rows = useMemo(() => {
    let result = rawRows;
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((r) => r.tagName.toLowerCase().includes(q));
    }
    result = [...result].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === "string" && typeof bv === "string")
        return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      const an = (av as number) ?? 0;
      const bn = (bv as number) ?? 0;
      return sortDir === "asc" ? an - bn : bn - an;
    });
    return result;
  }, [rawRows, search, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("desc"); }
  }

  // Summary
  const totalApplications = rows.length;
  const totalUnits = rows.reduce((s, r) => s + r.unitsSold, 0);
  const mostInDemand = rows.length > 0 ? [...rows].sort((a, b) => b.unitsSold - a.unitsSold)[0]?.tagName : "-";

  const isLoading = reportQuery.isLoading;

  const handleExportCSV = () => {
    downloadCSV(
      "demand-by-application",
      ["Application", "Type", "Units Sold", "Revenue", "Products", "Top Brand", "Stock Left", "Days of Stock"],
      rows.map((r) => [
        r.tagName,
        r.tagType.replace(/_/g, " "),
        String(r.unitsSold),
        String(r.revenue),
        String(r.productCount),
        r.topBrand ?? "-",
        String(r.stockLeft),
        r.daysOfStock != null ? String(r.daysOfStock) : "-",
      ]),
    );
  };

  return (
    <div className="mx-auto flex h-full max-w-6xl flex-col">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/[0.06]">
            <TrendingUp size={16} className="text-primary" />
          </div>
          <h1 className="text-[18px] font-semibold tracking-tight text-foreground">Demand by Application</h1>
        </div>
        <p className="mt-1.5 text-[13px] leading-5 text-muted-foreground">
          Analyze sales demand by tire size, vehicle fitment, and application codes.
        </p>

        {/* Summary cards */}
        <div className="mt-4 flex gap-5">
          <div className="flex items-center gap-2 text-[13px]">
            <div className="flex h-5 w-5 items-center justify-center rounded bg-muted">
              <Tag size={11} className="text-muted-foreground" />
            </div>
            <span className="text-muted-foreground">Applications</span>
            <span className="font-semibold tabular-nums text-foreground">{totalApplications}</span>
          </div>
          <div className="h-4 w-px bg-border" />
          <div className="flex items-center gap-2 text-[13px]">
            <div className="flex h-5 w-5 items-center justify-center rounded bg-muted">
              <Hash size={11} className="text-muted-foreground" />
            </div>
            <span className="text-muted-foreground">Units Sold</span>
            <span className="font-semibold tabular-nums text-foreground">{totalUnits.toLocaleString()}</span>
          </div>
          <div className="h-4 w-px bg-border" />
          <div className="flex items-center gap-2 text-[13px]">
            <div className="flex h-5 w-5 items-center justify-center rounded bg-muted">
              <TrendingUp size={11} className="text-muted-foreground" />
            </div>
            <span className="text-muted-foreground">Most In-Demand</span>
            <span className="font-semibold text-foreground truncate max-w-[200px]">{mostInDemand}</span>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {TAG_TYPE_TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              onClick={() => setTagTypeFilter(t.key)}
              className={cn(
                "flex items-center gap-1.5 h-8 rounded-lg border px-3 text-[11px] font-medium transition-colors",
                tagTypeFilter === t.key
                  ? "border-primary/20 bg-primary/[0.04] text-foreground"
                  : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon size={12} />
              {t.label}
            </button>
          );
        })}
        <div className="h-4 w-px bg-border" />
        {["30d", "90d", "180d", "365d"].map((p) => (
          <button
            key={p}
            onClick={() => applyPreset(p)}
            className={cn(
              "h-8 rounded-lg border px-3 text-[11px] font-medium transition-colors",
              activePreset === p
                ? "border-primary/20 bg-primary/[0.04] text-foreground"
                : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {p === "30d" ? "30 Days" : p === "90d" ? "90 Days" : p === "180d" ? "6 Months" : "1 Year"}
          </button>
        ))}
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => { setDateFrom(e.target.value); setActivePreset(null); }}
          className="h-8 rounded-lg border border-border bg-background px-2 text-[11px] text-foreground outline-none"
        />
        <input
          type="date"
          value={dateTo}
          onChange={(e) => { setDateTo(e.target.value); setActivePreset(null); }}
          className="h-8 rounded-lg border border-border bg-background px-2 text-[11px] text-foreground outline-none"
        />
        {(dateFrom || dateTo) && (
          <button onClick={clearDates} className="h-8 rounded-lg border border-border px-3 text-[11px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground">
            Clear
          </button>
        )}
        {rows.length > 0 && (
          <button
            onClick={handleExportCSV}
            className="ml-auto flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Download size={12} />
            Export CSV
          </button>
        )}
      </div>

      {/* Search */}
      <div className="relative mb-3">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search applications..."
          className="h-9 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-[13px] text-foreground outline-none placeholder:text-muted-foreground/50 focus:border-primary/40 focus:ring-2 focus:ring-primary/[0.08]"
        />
        {search && (
          <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
            <X size={14} />
          </button>
        )}
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-border bg-background shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
        <div className="flex items-center border-b border-border bg-muted/40 px-4 py-2">
          <div className="w-8" />
          <SortHeader label="Application" sortKey="tagName" current={sortKey} dir={sortDir} onSort={toggleSort} className="flex-1" />
          <div className="w-28 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Type</div>
          <SortHeader label="Units Sold" sortKey="unitsSold" current={sortKey} dir={sortDir} onSort={toggleSort} className="w-24 text-right" />
          <SortHeader label="Revenue" sortKey="revenue" current={sortKey} dir={sortDir} onSort={toggleSort} className="w-32 text-right" />
          <SortHeader label="Products" sortKey="productCount" current={sortKey} dir={sortDir} onSort={toggleSort} className="w-20 text-right" />
          <div className="w-24 text-right text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Top Brand</div>
          <SortHeader label="Stock" sortKey="stockLeft" current={sortKey} dir={sortDir} onSort={toggleSort} className="w-20 text-right" />
          <SortHeader label="Days" sortKey="daysOfStock" current={sortKey} dir={sortDir} onSort={toggleSort} className="w-16 text-right" />
          <div className="w-16" />
        </div>

        {isLoading ? (
          <div className="space-y-0">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-11 animate-pulse border-b border-border bg-muted/20" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
              <Tag size={16} className="text-muted-foreground" />
            </div>
            <p className="mt-3 text-[13px] font-medium text-foreground">No demand data</p>
            <p className="mt-1 text-[12px] text-muted-foreground">
              No sales found for tagged products in the selected period
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {rows.map((row) => (
              <div key={row.tagId}>
                <div className="flex items-center px-4 py-2.5 transition-colors hover:bg-accent/40">
                  <div className="w-8">
                    <button
                      onClick={() => setExpandedTagId(expandedTagId === row.tagId ? null : row.tagId)}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      {expandedTagId === row.tagId ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </button>
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-[13px] font-medium text-foreground">{row.tagName}</span>
                  </div>
                  <div className="w-28">
                    <span className={cn(
                      "inline-flex rounded-md px-1.5 py-0.5 text-[9px] font-semibold uppercase",
                      TAG_TYPE_BADGE[row.tagType] ?? "bg-gray-100 text-gray-700",
                    )}>
                      {row.tagType.replace(/_/g, " ")}
                    </span>
                  </div>
                  <div className="w-24 text-right text-[12px] tabular-nums font-medium text-foreground">{row.unitsSold.toLocaleString()}</div>
                  <div className="w-32 text-right text-[12px] tabular-nums font-medium text-foreground">PHP {fmt(row.revenue)}</div>
                  <div className="w-20 text-right text-[12px] tabular-nums text-foreground">{row.productCount}</div>
                  <div className="w-24 text-right text-[12px] text-muted-foreground truncate">{row.topBrand ?? "-"}</div>
                  <div className="w-20 text-right text-[12px] tabular-nums text-foreground">{row.stockLeft.toLocaleString()}</div>
                  <div className={cn(
                    "w-16 text-right text-[12px] tabular-nums font-medium",
                    row.daysOfStock != null && row.daysOfStock <= 14 ? "text-red-600" :
                    row.daysOfStock != null && row.daysOfStock <= 30 ? "text-amber-600" : "text-foreground",
                  )}>
                    {row.daysOfStock != null ? row.daysOfStock : "-"}
                  </div>
                  <div className="w-16 flex justify-end">
                    <button
                      onClick={() => setExpandedTagId(expandedTagId === row.tagId ? null : row.tagId)}
                      className="rounded px-2 py-1 text-[11px] font-medium text-primary hover:bg-primary/[0.06]"
                    >
                      Detail
                    </button>
                  </div>
                </div>

                {/* Detail drill-down */}
                {expandedTagId === row.tagId && (
                  <TagDemandDetail
                    tagId={row.tagId}
                    token={token!}
                    locationId={locationId!}
                    dateFrom={dateFrom}
                    dateTo={dateTo}
                  />
                )}
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between border-t border-border bg-muted/30 px-4 py-2">
          <span className="text-[11px] text-muted-foreground">{rows.length} applications</span>
          <span className="text-[11px] text-muted-foreground">
            Total revenue: PHP {fmt(rows.reduce((s, r) => s + r.revenue, 0))}
          </span>
        </div>
      </div>
    </div>
  );
}

/* ─── Sort Header ─── */
function SortHeader({
  label,
  sortKey,
  current,
  dir,
  onSort,
  className,
}: {
  label: string;
  sortKey: SortKey;
  current: SortKey;
  dir: SortDir;
  onSort: (key: SortKey) => void;
  className?: string;
}) {
  const active = current === sortKey;
  return (
    <button
      onClick={() => onSort(sortKey)}
      className={cn(
        "text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground hover:text-foreground transition-colors",
        active && "text-foreground",
        className,
      )}
    >
      {label}
      {active && <span className="ml-0.5">{dir === "asc" ? "\u2191" : "\u2193"}</span>}
    </button>
  );
}

/* ─── Detail Drill-down ─── */
function TagDemandDetail({
  tagId,
  token,
  locationId,
  dateFrom,
  dateTo,
}: {
  tagId: string;
  token: string;
  locationId: string;
  dateFrom: string;
  dateTo: string;
}) {
  const params = new URLSearchParams();
  if (dateFrom) params.set("from", `${dateFrom}T00:00:00Z`);
  if (dateTo) params.set("to", `${dateTo}T23:59:59Z`);
  const qs = params.toString();

  const { data, isLoading } = useQuery({
    queryKey: ["demand-by-tag-detail", tagId, dateFrom, dateTo],
    queryFn: () =>
      apiFetch<{ data: { brands: DetailBrand[]; products: DetailProduct[] } }>(
        `/reports/demand-by-tag/${tagId}${qs ? `?${qs}` : ""}`,
        { token, locationId },
      ),
  });

  const brands = data?.data?.brands ?? [];
  const products = data?.data?.products ?? [];
  const maxBrandQty = Math.max(...brands.map((b) => b.qty), 1);

  if (isLoading) {
    return (
      <div className="border-t border-border bg-muted/10 px-8 py-4">
        <div className="h-6 w-48 animate-pulse rounded bg-muted/40" />
      </div>
    );
  }

  return (
    <div className="border-t border-border bg-muted/10 px-8 py-4 space-y-4">
      {/* Brand breakdown bar chart */}
      {brands.length > 0 && (
        <div>
          <h4 className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">Brand Breakdown</h4>
          <div className="space-y-1.5">
            {brands.map((b) => (
              <div key={b.brand} className="flex items-center gap-3">
                <span className="w-28 text-[12px] text-foreground truncate">{b.brand || "Unknown"}</span>
                <div className="flex-1 h-5 bg-muted/40 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary/60 rounded-full transition-all"
                    style={{ width: `${(b.qty / maxBrandQty) * 100}%` }}
                  />
                </div>
                <span className="w-16 text-right text-[11px] tabular-nums text-foreground">{b.qty} pcs</span>
                <span className="w-24 text-right text-[11px] tabular-nums text-muted-foreground">PHP {fmt(b.revenue)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Per-product table */}
      {products.length > 0 && (
        <div>
          <h4 className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">Product Detail</h4>
          <div className="rounded-lg border border-border overflow-hidden">
            <div className="flex items-center bg-muted/40 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              <div className="flex-1">Product</div>
              <div className="w-24">Brand</div>
              <div className="w-24 font-mono">SKU</div>
              <div className="w-20 text-right">Price</div>
              <div className="w-16 text-right">Qty</div>
              <div className="w-24 text-right">Revenue</div>
              <div className="w-16 text-right">Stock</div>
              <div className="w-16 text-right">Days</div>
            </div>
            <div className="divide-y divide-border/50">
              {products.map((p) => (
                <div key={p.productId} className="flex items-center px-3 py-1.5">
                  <div className="flex-1 text-[12px] text-foreground truncate">{p.name}</div>
                  <div className="w-24 text-[11px] text-muted-foreground truncate">{p.brand ?? "-"}</div>
                  <div className="w-24 font-mono text-[10px] text-muted-foreground">{p.sku}</div>
                  <div className="w-20 text-right text-[11px] tabular-nums text-foreground">PHP {parseFloat(p.unitPrice).toLocaleString("en-PH", { minimumFractionDigits: 2 })}</div>
                  <div className="w-16 text-right text-[11px] tabular-nums text-foreground">{p.qtySold}</div>
                  <div className="w-24 text-right text-[11px] tabular-nums text-foreground">PHP {fmt(p.revenue)}</div>
                  <div className="w-16 text-right text-[11px] tabular-nums text-foreground">{p.stock}</div>
                  <div className={cn(
                    "w-16 text-right text-[11px] tabular-nums font-medium",
                    p.daysLeft != null && p.daysLeft <= 14 ? "text-red-600" :
                    p.daysLeft != null && p.daysLeft <= 30 ? "text-amber-600" : "text-foreground",
                  )}>
                    {p.daysLeft != null ? p.daysLeft : "-"}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {brands.length === 0 && products.length === 0 && (
        <p className="text-[12px] text-muted-foreground">No detail data available for this period.</p>
      )}
    </div>
  );
}
