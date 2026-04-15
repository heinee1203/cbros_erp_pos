"use client";

import { useState, useCallback, useRef, useMemo } from "react";
import {
  Upload,
  Download,
  AlertTriangle,
  Loader2,
  Search,
  X,
  Check,
  DollarSign,
  TrendingDown,
  History,
  FileText,
  ChevronsDown,
  ChevronDown,
} from "lucide-react";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/app/auth-context";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";
import { DateRangePicker } from "@/components/ui/date-range-picker";

/* ═══════════════════════════════════════════════════════
 * TYPES
 * ═══════════════════════════════════════════════════════ */

interface BulkPreviewRow {
  sku: string;
  name: string;
  currentCost: number;
  newCost: number;
  currentSell: number;
  newSell: number;
  currentMargin: number;
  projectedMargin: number;
  marginAlert: boolean;
}

interface BulkPreviewResponse {
  rows: BulkPreviewRow[];
  errors: { row: number; message: string }[];
}

interface BulkApplyResponse {
  costsUpdated: number;
  pricesUpdated: number;
}

interface MarginAlertRow {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  brandName: string | null;
  categoryName: string | null;
  costPrice: number;
  sellPrice: number;
  marginPct: number;
  stock: number;
}

interface MarginAlertPage {
  data: MarginAlertRow[];
  nextCursor: string | null;
  hasMore: boolean;
}

interface DeadStockRow {
  id: string;
  productId: string;
  productName: string;
  productSku: string;
  brandName: string | null;
  categoryName: string | null;
  costPrice: string | number;
  avgSellingPrice: string | number;
  daysSinceLastSale: number | null;
  lastSaleDate: string | null;
  totalStock: number;
  velocityClass: string;
  sold12m: number;
}

interface DeadStockPage {
  data: DeadStockRow[];
  nextCursor: string | null;
  hasMore: boolean;
}

interface PriceHistoryRow {
  id: string;
  productId: string;
  productName: string;
  productSku: string;
  field: string;
  oldValue: string;
  newValue: string;
  changeReason: string | null;
  source: string;
  batchId: string | null;
  changedBy: string | null;
  changedByName: string | null;
  changedAt: string;
  pctChange: number | null;
}

interface PriceHistoryPage {
  data: PriceHistoryRow[];
  nextCursor: string | null;
  hasMore: boolean;
}

/* ═══════════════════════════════════════════════════════
 * HELPERS
 * ═══════════════════════════════════════════════════════ */

const TABS = [
  { id: "bulk", label: "Bulk Update", icon: Upload },
  { id: "margins", label: "Margin Alerts", icon: AlertTriangle },
  { id: "dead-stock", label: "Dead Stock Clearance", icon: TrendingDown },
  { id: "history", label: "Price History", icon: History },
] as const;

type TabId = (typeof TABS)[number]["id"];

function fmtCurrency(v: unknown): string {
  const n = Number(v) || 0;
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtPct(v: unknown): string {
  const n = Number(v) || 0;
  return n.toFixed(1) + "%";
}

function getDeadStockTier(daysSinceSale: number): { label: string; color: string; marginPct: number } {
  if (daysSinceSale >= 366) return { label: "Deep Clearance", color: "bg-red-500/20 text-red-400", marginPct: -15 };
  if (daysSinceSale >= 181) return { label: "Clearance", color: "bg-orange-500/20 text-orange-400", marginPct: 3 };
  return { label: "Slow Mover", color: "bg-amber-500/20 text-amber-400", marginPct: 12 };
}

function calcSuggestedPrice(costPrice: number | unknown, tierMarginPct: number): number {
  const c = Number(costPrice) || 0;
  return c * (1 + tierMarginPct / 100);
}

/* ═══════════════════════════════════════════════════════
 * PAGE
 * ═══════════════════════════════════════════════════════ */

export default function PriceManagementPage() {
  const [activeTab, setActiveTab] = useState<TabId>(() => {
    if (typeof window === "undefined") return "bulk";
    const params = new URLSearchParams(window.location.search);
    const tab = params.get("tab");
    if (tab && TABS.some((t) => t.id === tab)) return tab as TabId;
    return "bulk";
  });

  const handleTabChange = useCallback((tab: TabId) => {
    setActiveTab(tab);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", tab);
    window.history.replaceState({}, "", url.toString());
  }, []);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border bg-background px-6 py-5">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
            <DollarSign size={18} className="text-muted-foreground" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-foreground">Price Management</h1>
            <p className="text-xs text-muted-foreground">
              Bulk pricing, margin monitoring, and clearance management
            </p>
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-border px-6">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => handleTabChange(tab.id)}
            className={cn(
              "px-4 py-1.5 text-sm font-medium border-b-2 -mb-px transition-colors",
              activeTab === tab.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-auto">
        {activeTab === "bulk" && <BulkUpdateTab />}
        {activeTab === "margins" && <MarginAlertsTab />}
        {activeTab === "dead-stock" && <DeadStockTab />}
        {activeTab === "history" && <PriceHistoryTab />}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
 * TAB 1: BULK UPDATE
 * ═══════════════════════════════════════════════════════ */

function BulkUpdateTab() {
  const { token, apiLocationId: locationId } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<BulkPreviewResponse | null>(null);
  const [editedSellPrices, setEditedSellPrices] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BulkApplyResponse | null>(null);

  /* -- Download CSV template -- */
  const handleDownloadTemplate = useCallback(() => {
    const csv = "SKU,New Cost,New Sell Price\nSAMPLE-001,100.00,150.00\nSAMPLE-002,200.00,299.99\n";
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "pricing-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  /* -- Parse CSV client-side -- */
  const parseCSV = useCallback((text: string): { sku: string; newCost: number; newSell: number }[] => {
    const lines = text.trim().split("\n");
    if (lines.length < 2) return [];
    return lines.slice(1).map((line) => {
      const parts = line.split(",").map((s) => s.trim().replace(/^"|"$/g, ""));
      return {
        sku: parts[0] ?? "",
        newCost: parseFloat(parts[1] ?? "0") || 0,
        newSell: parseFloat(parts[2] ?? "0") || 0,
      };
    }).filter((r) => r.sku);
  }, []);

  /* -- Upload & preview -- */
  const handleFileSelect = useCallback(
    async (file: File) => {
      setError(null);
      setResult(null);
      setLoading(true);
      try {
        const text = await file.text();
        const rows = parseCSV(text);
        if (rows.length === 0) {
          setError("CSV is empty or has no data rows");
          setLoading(false);
          return;
        }
        const resp = await apiFetch<BulkPreviewResponse>("/inventory/pricing/bulk-preview", {
          method: "POST",
          token: token!,
          locationId,
          body: JSON.stringify({ rows }),
        });
        setPreview(resp);
        setEditedSellPrices({});
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to preview pricing changes");
      } finally {
        setLoading(false);
      }
    },
    [token, locationId, parseCSV],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const file = e.dataTransfer.files[0];
      if (file && (file.name.endsWith(".csv") || file.type === "text/csv")) {
        handleFileSelect(file);
      } else {
        setError("Please upload a CSV file");
      }
    },
    [handleFileSelect],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  /* -- Apply changes -- */
  const handleApply = useCallback(async () => {
    if (!preview) return;
    setLoading(true);
    setError(null);
    try {
      const rows = preview.rows.map((r) => ({
        sku: r.sku,
        newCost: r.newCost,
        newSell: editedSellPrices[r.sku] ?? r.newSell,
      }));
      const resp = await apiFetch<BulkApplyResponse>("/inventory/pricing/bulk-apply", {
        method: "POST",
        token: token!,
        locationId,
        body: JSON.stringify({ rows }),
      });
      setResult(resp);
      setPreview(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to apply pricing changes");
    } finally {
      setLoading(false);
    }
  }, [preview, editedSellPrices, token, locationId]);

  /* -- Reset -- */
  const handleReset = useCallback(() => {
    setPreview(null);
    setEditedSellPrices({});
    setError(null);
    setResult(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const previewRows = useMemo(() => {
    if (!preview) return [];
    return preview.rows.map((r) => {
      const overrideSell = editedSellPrices[r.sku];
      if (overrideSell !== undefined) {
        const projectedMargin = overrideSell > 0 ? ((overrideSell - r.newCost) / overrideSell) * 100 : 0;
        return { ...r, newSell: overrideSell, projectedMargin, marginAlert: projectedMargin < 15 };
      }
      return r;
    });
  }, [preview, editedSellPrices]);

  return (
    <div className="space-y-6 p-6">
      {/* Upload area */}
      {!preview && !result && (
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Upload a CSV with SKU, New Cost, and New Sell Price columns to preview pricing changes.
            </p>
            <button
              onClick={handleDownloadTemplate}
              className="flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
            >
              <Download size={14} />
              Download Template
            </button>
          </div>

          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-12 transition",
              loading
                ? "pointer-events-none border-primary/40 bg-primary/5"
                : "border-border bg-muted/30 hover:border-muted-foreground/40 hover:bg-muted/50",
            )}
          >
            {loading ? (
              <>
                <Loader2 size={32} className="animate-spin text-primary" />
                <p className="text-sm text-primary">Processing CSV...</p>
              </>
            ) : (
              <>
                <Upload size={32} className="text-muted-foreground" />
                <div className="text-center">
                  <p className="text-sm font-medium text-foreground">
                    Drop your pricing CSV here, or click to browse
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">Supports .csv files</p>
                </div>
              </>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFileSelect(f);
              }}
              className="hidden"
            />
          </div>
        </>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-destructive" />
          <div className="flex-1 text-sm text-destructive">{error}</div>
          <button onClick={() => setError(null)} className="text-destructive hover:text-destructive/80">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Preview table */}
      {preview && previewRows.length > 0 && (
        <div className="space-y-4">
          {preview.errors.length > 0 && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3">
              <p className="text-sm font-medium text-destructive">
                {preview.errors.length} row{preview.errors.length !== 1 ? "s" : ""} had errors and were skipped
              </p>
              <div className="mt-2 max-h-32 overflow-y-auto space-y-1">
                {preview.errors.map((e, i) => (
                  <p key={i} className="text-xs text-destructive/70">
                    Row {e.row}: {e.message}
                  </p>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-lg border border-border">
            <div className="border-b border-border px-4 py-3 flex items-center justify-between">
              <h3 className="text-sm font-medium text-foreground">
                Preview ({previewRows.length} items)
              </h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleReset}
                  className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:bg-accent hover:text-foreground"
                >
                  Cancel
                </button>
                <button
                  onClick={handleApply}
                  disabled={loading}
                  className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
                >
                  {loading ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                  Apply Changes
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="px-4 py-2 font-medium">SKU</th>
                    <th className="px-4 py-2 font-medium">Name</th>
                    <th className="px-4 py-2 font-medium text-right">Current Cost</th>
                    <th className="px-4 py-2 font-medium text-right">New Cost</th>
                    <th className="px-4 py-2 font-medium text-right">Current Sell</th>
                    <th className="px-4 py-2 font-medium text-right">New Sell</th>
                    <th className="px-4 py-2 font-medium text-right">Current Margin</th>
                    <th className="px-4 py-2 font-medium text-right">Projected Margin</th>
                    <th className="px-4 py-2 font-medium text-center">Alert</th>
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((r) => (
                    <tr key={r.sku} className="border-b border-border/50 hover:bg-muted/30">
                      <td className="px-4 py-2 font-mono text-xs text-muted-foreground">{r.sku}</td>
                      <td className="px-4 py-2 text-foreground">{r.name}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">
                        {fmtCurrency(r.currentCost)}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-foreground font-medium">
                        {fmtCurrency(r.newCost)}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">
                        {fmtCurrency(r.currentSell)}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={editedSellPrices[r.sku] ?? r.newSell}
                          onChange={(e) =>
                            setEditedSellPrices((prev) => ({
                              ...prev,
                              [r.sku]: parseFloat(e.target.value) || 0,
                            }))
                          }
                          className="w-24 rounded-md border border-border bg-background px-2 py-1 text-right text-xs tabular-nums text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
                        />
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">
                        {fmtPct(r.currentMargin)}
                      </td>
                      <td
                        className={cn(
                          "px-4 py-2 text-right tabular-nums font-medium",
                          r.projectedMargin < 15 ? "text-red-500" : "text-foreground",
                        )}
                      >
                        {fmtPct(r.projectedMargin)}
                      </td>
                      <td className="px-4 py-2 text-center">
                        {r.marginAlert && (
                          <AlertTriangle size={14} className="inline-block text-red-500" />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Results summary */}
      {result && (
        <div className="rounded-lg border border-border bg-muted/30 p-8">
          <div className="mx-auto max-w-md space-y-6 text-center">
            <div className="flex justify-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/20">
                <Check size={32} className="text-emerald-500" />
              </div>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">Changes Applied</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {result.costsUpdated} cost{result.costsUpdated !== 1 ? "s" : ""} updated,{" "}
                {result.pricesUpdated} price{result.pricesUpdated !== 1 ? "s" : ""} updated
              </p>
            </div>
            <button
              onClick={handleReset}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
            >
              Upload Another File
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
 * TAB 2: MARGIN ALERTS
 * ═══════════════════════════════════════════════════════ */

function MarginAlertsTab() {
  const { token, apiLocationId: locationId } = useAuth();
  const qc = useQueryClient();
  const [threshold, setThreshold] = useState(15);
  const [inStockOnly, setInStockOnly] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState("");
  const [brandFilter, setBrandFilter] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPrice, setEditPrice] = useState("");
  const [sortBy, setSortBy] = useState<"marginPct" | "costPrice" | "sellPrice" | "stock">("marginPct");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
  } = useInfiniteQuery<MarginAlertPage>({
    queryKey: ["margin-alerts", threshold, inStockOnly],
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams();
      params.set("threshold", String(threshold));
      params.set("limit", "100");
      params.set("inStockOnly", String(inStockOnly));
      if (pageParam) params.set("cursor", pageParam as string);
      return apiFetch<MarginAlertPage>(
        `/inventory/pricing/margin-alerts?${params.toString()}`,
        { token: token!, locationId },
      );
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.nextCursor : undefined),
    enabled: !!token,
  });

  const rawRows = useMemo(() => data?.pages.flatMap((p) => p.data) ?? [], [data]);

  // Unique categories and brands for filter dropdowns
  const uniqueCategories = useMemo(() => [...new Set(rawRows.map(r => r.categoryName).filter(Boolean))].sort() as string[], [rawRows]);
  const uniqueBrands = useMemo(() => [...new Set(rawRows.map(r => r.brandName).filter(Boolean))].sort() as string[], [rawRows]);

  const rows = useMemo(() => {
    let filtered = rawRows;
    if (categoryFilter) filtered = filtered.filter(r => r.categoryName === categoryFilter);
    if (brandFilter) filtered = filtered.filter(r => r.brandName === brandFilter);
    return [...filtered].sort((a, b) => {
      const va = Number((a as any)[sortBy]) || 0;
      const vb = Number((b as any)[sortBy]) || 0;
      return sortDir === "asc" ? va - vb : vb - va;
    });
  }, [rawRows, categoryFilter, brandFilter, sortBy, sortDir]);

  const losingMoney = rows.filter(r => Number(r.marginPct) < 0).length;
  const totalGap = rows.reduce((sum, r) => {
    const cost = Number(r.costPrice) || 0;
    const stock = Number(r.stock) || 0;
    const suggested = cost > 0 ? cost / (1 - threshold / 100) : 0;
    const current = Number(r.sellPrice) || 0;
    return sum + Math.max(0, (suggested - current) * stock);
  }, 0);

  const saveMut = useMutation({
    mutationFn: async ({ id, price }: { id: string; price: string }) => {
      await apiFetch(`/products/${id}`, { token: token!, locationId, method: "PATCH", body: JSON.stringify({ unitPrice: price }) });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["margin-alerts"] }); setEditingId(null); },
  });

  const handleSort = (field: typeof sortBy) => {
    if (field === sortBy) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortBy(field); setSortDir(field === "marginPct" ? "asc" : "desc"); }
  };

  function SortTh({ label, field, align = "right" }: { label: string; field: typeof sortBy; align?: string }) {
    const active = sortBy === field;
    return (
      <th onClick={() => handleSort(field)}
        className={cn("whitespace-nowrap px-4 py-1.5 font-medium cursor-pointer select-none transition-colors hover:text-foreground", align === "right" ? "text-right" : "text-left", active && "text-foreground")}>
        {label} {active && (sortDir === "asc" ? "\u25B2" : "\u25BC")}
      </th>
    );
  }

  function marginCellClass(pct: number): string {
    if (pct < -25) return "bg-red-600 text-white font-bold";
    if (pct < 0) return "bg-red-100 text-red-700 font-semibold";
    if (pct < 5) return "bg-amber-100 text-amber-700 font-semibold";
    return "bg-yellow-50 text-yellow-700 font-semibold";
  }

  return (
    <div className="flex h-full flex-col">
      {/* Filter bar + summary */}
      <div className="border-b border-border bg-background/50 px-6 py-3 space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-xs text-muted-foreground">Threshold:</label>
          <div className="relative">
            <input type="number" min={0} max={100} value={threshold}
              onChange={(e) => setThreshold(parseInt(e.target.value) || 0)}
              className="h-8 w-20 rounded-md border border-border bg-background px-2.5 text-xs tabular-nums text-foreground outline-none focus:border-primary" />
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
          </div>
          <label className="flex items-center gap-1.5 cursor-pointer text-xs text-muted-foreground">
            <input type="checkbox" checked={inStockOnly} onChange={e => setInStockOnly(e.target.checked)} className="h-3.5 w-3.5 rounded accent-primary" />
            In-stock only
          </label>
          <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}
            className="h-8 rounded-md border border-border bg-background px-2 text-[11px] font-medium outline-none">
            <option value="">All Categories</option>
            {uniqueCategories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={brandFilter} onChange={e => setBrandFilter(e.target.value)}
            className="h-8 rounded-md border border-border bg-background px-2 text-[11px] font-medium outline-none">
            <option value="">All Brands</option>
            {uniqueBrands.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>
        {rows.length > 0 && (
          <div className="flex items-center gap-4 text-xs">
            <span className="text-amber-600 font-medium">{"\u26A0\uFE0F"} {rows.length} items below {threshold}%</span>
            <span className="text-red-500 font-medium">{"\uD83D\uDD34"} {losingMoney} losing money</span>
            <span className="text-muted-foreground">{"\uD83D\uDCB0"} Revenue gap: {"\u20B1"}{Math.round(totalGap).toLocaleString()}</span>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex h-64 items-center justify-center">
            <Loader2 size={24} className="animate-spin text-muted-foreground" />
          </div>
        ) : isError ? (
          <div className="flex h-64 items-center justify-center text-sm text-destructive">Failed to load margin alerts</div>
        ) : rows.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center gap-2 text-center">
            <Check size={32} className="text-emerald-500" />
            <p className="text-sm font-medium text-foreground">All margins look healthy</p>
            <p className="text-xs text-muted-foreground">No items with margins below {threshold}%</p>
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 z-10 border-b border-border bg-muted/50 text-xs font-medium text-muted-foreground">
              <tr>
                <th className="px-4 py-1.5 font-medium">Product</th>
                <th className="whitespace-nowrap px-4 py-1.5 font-medium">Brand</th>
                <th className="whitespace-nowrap px-4 py-1.5 font-medium">Category</th>
                <SortTh label="Stock" field="stock" />
                <SortTh label="Cost" field="costPrice" />
                <SortTh label="Sell Price" field="sellPrice" />
                <SortTh label="Margin" field="marginPct" />
                <th className="whitespace-nowrap px-4 py-1.5 font-medium text-right">Suggested</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r, idx) => {
                const cost = Number(r.costPrice) || 0;
                const sell = Number(r.sellPrice) || 0;
                const margin = Number(r.marginPct) || 0;
                const suggested = cost > 0 ? Math.ceil(cost / (1 - threshold / 100)) : 0;
                const isEditing = editingId === (r.id ?? idx);
                return (
                  <tr key={r.id ?? idx} className="hover:bg-muted/30">
                    <td className="px-4 py-1.5">
                      <div className="text-sm font-medium text-foreground">{r.productName}</div>
                      <div className="text-[10px] font-mono text-muted-foreground">SKU: {r.sku}</div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-1.5 text-xs text-foreground">{r.brandName ?? "\u2014"}</td>
                    <td className="whitespace-nowrap px-4 py-1.5 text-xs text-muted-foreground">{r.categoryName ?? "\u2014"}</td>
                    <td className="whitespace-nowrap px-4 py-1.5 text-right tabular-nums text-xs text-foreground">{(Number(r.stock) || 0).toLocaleString()}</td>
                    <td className="whitespace-nowrap px-4 py-1.5 text-right tabular-nums text-sm">{"\u20B1"}{fmtCurrency(cost)}</td>
                    <td className="whitespace-nowrap px-4 py-1.5 text-right tabular-nums text-sm">
                      {isEditing ? (
                        <input type="number" value={editPrice} autoFocus
                          onChange={e => setEditPrice(e.target.value)}
                          onKeyDown={e => { if (e.key === "Enter" && editPrice) saveMut.mutate({ id: r.id ?? r.productId, price: editPrice }); if (e.key === "Escape") setEditingId(null); }}
                          onBlur={() => { if (editPrice && editPrice !== String(sell)) saveMut.mutate({ id: r.id ?? r.productId, price: editPrice }); else setEditingId(null); }}
                          className="w-28 rounded border border-primary bg-background px-2 py-1 text-right text-xs tabular-nums outline-none" />
                      ) : (
                        <button onClick={() => { setEditingId(r.id ?? String(idx)); setEditPrice(String(sell)); }}
                          className="tabular-nums text-foreground hover:text-emerald-600 hover:underline cursor-pointer transition-colors">
                          {"\u20B1"}{fmtCurrency(sell)}
                        </button>
                      )}
                    </td>
                    <td className={cn("whitespace-nowrap px-4 py-2 text-right tabular-nums text-xs rounded-md", marginCellClass(margin))}>
                      {fmtPct(margin)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-1.5 text-right tabular-nums text-xs text-muted-foreground">
                      {suggested > 0 ? (
                        <button onClick={() => { setEditingId(r.id ?? String(idx)); setEditPrice(String(suggested)); }}
                          className="hover:text-emerald-600 hover:underline cursor-pointer transition-colors">
                          {"\u20B1"}{suggested.toLocaleString()}
                        </button>
                      ) : "\u2014"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-border bg-background px-6 py-1.5">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {rows.length} item{rows.length !== 1 ? "s" : ""} below {threshold}% margin
          </span>
          {hasNextPage && (
            <button
              onClick={() => fetchNextPage()}
              disabled={isFetchingNextPage}
              className="flex items-center gap-1.5 rounded-md bg-muted px-3 py-1 text-xs font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-50"
            >
              {isFetchingNextPage ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <ChevronsDown size={12} />
              )}
              Load More
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
 * TAB 3: DEAD STOCK CLEARANCE
 * ═══════════════════════════════════════════════════════ */

function DeadStockTab() {
  const { token, apiLocationId: locationId } = useAuth();
  const qc = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [brandFilter, setBrandFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPrice, setEditPrice] = useState("");

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, isError } = useInfiniteQuery<DeadStockPage>({
    queryKey: ["dead-stock-clearance"],
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams();
      params.set("status", "DEAD_STOCK");
      params.set("limit", "100");
      if (pageParam) params.set("cursor", pageParam as string);
      return apiFetch<DeadStockPage>(`/inventory/stock-monitor?${params.toString()}`, { token: token!, locationId });
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.nextCursor : undefined),
    enabled: !!token,
  });

  const rawRows = useMemo(() => data?.pages.flatMap((p) => p.data) ?? [], [data]);

  // Unique brands/categories for filters
  const uniqueBrands = useMemo(() => [...new Set(rawRows.map(r => r.brandName).filter(Boolean))].sort() as string[], [rawRows]);
  const uniqueCategories = useMemo(() => [...new Set(rawRows.map(r => r.categoryName).filter(Boolean))].sort() as string[], [rawRows]);

  // Enrich + filter + sort
  const enrichedRows = useMemo(() => {
    let filtered = rawRows;
    if (search.length >= 2) {
      const q = search.toLowerCase();
      filtered = filtered.filter(r => r.productName.toLowerCase().includes(q) || r.productSku.toLowerCase().includes(q));
    }
    if (brandFilter) filtered = filtered.filter(r => r.brandName === brandFilter);
    if (categoryFilter) filtered = filtered.filter(r => r.categoryName === categoryFilter);

    return filtered.map(r => {
      const cost = Number(r.costPrice) || 0;
      const days = Number(r.daysSinceLastSale) || 9999;
      // Clearance pricing based on age
      let clearancePrice: number;
      if (days > 365) clearancePrice = Math.round(cost * 0.5); // fire sale: 50% of cost
      else if (days > 180) clearancePrice = Math.round(cost); // at cost
      else if (days > 90) clearancePrice = Math.round(cost * 1.1); // 10% above cost
      else clearancePrice = Math.round(cost * 1.2); // 20% margin
      const stock = Number(r.totalStock) || 0;
      const recovery = clearancePrice * stock;
      const capitalTied = cost * stock;
      return { ...r, cost, days, clearancePrice, stock, recovery, capitalTied };
    }).sort((a, b) => b.days - a.days); // worst first
  }, [rawRows, search, brandFilter, categoryFilter]);

  // Summary
  const capitalTied = enrichedRows.reduce((s, r) => s + r.capitalTied, 0);
  const potentialRecovery = enrichedRows.reduce((s, r) => s + r.recovery, 0);
  const oldestDays = enrichedRows.length > 0 ? enrichedRows[0].days : 0;

  // Mutations
  const applyMut = useMutation({
    mutationFn: async ({ productId, price }: { productId: string; price: number }) =>
      apiFetch(`/products/${productId}`, { token: token!, locationId, method: "PATCH", body: JSON.stringify({ unitPrice: String(price) }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["dead-stock-clearance"] }); setEditingId(null); },
  });

  const handleApplySelected = useCallback(async () => {
    for (const r of enrichedRows.filter(r => selected.has(r.productId))) {
      await applyMut.mutateAsync({ productId: r.productId, price: r.clearancePrice });
    }
    setSelected(new Set());
  }, [enrichedRows, selected, applyMut]);

  const toggleSelect = (id: string) => setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = () => setSelected(prev => prev.size === enrichedRows.length ? new Set() : new Set(enrichedRows.map(r => r.productId)));

  function fmtLastSold(days: number | null): { text: string; color: string } {
    if (!days || days >= 9999) return { text: "Never", color: "text-red-500" };
    if (days > 365) return { text: `${Math.round(days / 30)}mo ago`, color: "text-red-500" };
    if (days > 180) return { text: `${Math.round(days / 30)}mo ago`, color: "text-red-400" };
    if (days > 90) return { text: `${days}d ago`, color: "text-amber-500" };
    return { text: `${days}d ago`, color: "text-muted-foreground" };
  }

  return (
    <div className="flex h-full flex-col">
      {/* Summary KPIs */}
      <div className="grid grid-cols-4 gap-3 border-b border-border bg-background/50 px-6 py-4">
        {[
          { label: "Dead Items", value: enrichedRows.length.toLocaleString() },
          { label: "Capital Tied Up", value: "\u20B1" + fmtCurrency(capitalTied) },
          { label: "Potential Recovery", value: "\u20B1" + fmtCurrency(potentialRecovery) },
          { label: "Oldest Item", value: oldestDays > 0 ? `${oldestDays} days` : "\u2014" },
        ].map(c => (
          <div key={c.label} className="rounded-lg border border-border bg-background p-3">
            <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{c.label}</div>
            <div className="mt-1 text-lg font-bold tabular-nums text-foreground">{c.value}</div>
          </div>
        ))}
      </div>

      {/* Filters + bulk bar */}
      <div className="border-b border-border bg-background/50 px-6 py-1.5 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[150px]">
            <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search..."
              className="h-7 w-full rounded border border-border bg-background pl-8 pr-6 text-[11px] outline-none focus:border-primary/40" />
            {search && <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"><X size={10} /></button>}
          </div>
          <select value={brandFilter} onChange={e => setBrandFilter(e.target.value)} className="h-7 rounded border border-border bg-background px-2 text-[11px] outline-none">
            <option value="">All Brands</option>
            {uniqueBrands.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
          <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} className="h-7 rounded border border-border bg-background px-2 text-[11px] outline-none">
            <option value="">All Categories</option>
            {uniqueCategories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        {selected.size > 0 && (
          <div className="flex items-center gap-3">
            <span className="text-xs font-medium">{selected.size} selected</span>
            <button onClick={handleApplySelected} disabled={applyMut.isPending}
              className="flex items-center gap-1 rounded bg-primary px-2.5 py-1 text-[11px] font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
              {applyMut.isPending ? <Loader2 size={10} className="animate-spin" /> : <Check size={10} />} Apply Clearance Prices
            </button>
            <button onClick={() => setSelected(new Set())} className="text-[11px] text-muted-foreground hover:text-foreground">Clear</button>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex h-64 items-center justify-center"><Loader2 size={24} className="animate-spin text-muted-foreground" /></div>
        ) : isError ? (
          <div className="flex h-64 items-center justify-center text-sm text-destructive">Failed to load dead stock</div>
        ) : enrichedRows.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center gap-2 text-center">
            <Check size={32} className="text-emerald-500" />
            <p className="text-sm font-medium">No dead stock found</p>
            <p className="text-xs text-muted-foreground">All items have recent sales activity</p>
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 z-10 border-b border-border bg-muted/50 text-xs font-medium text-muted-foreground">
              <tr>
                <th className="px-3 py-1.5"><input type="checkbox" checked={selected.size === enrichedRows.length && enrichedRows.length > 0} onChange={toggleAll} className="accent-primary" /></th>
                <th className="px-3 py-1.5 font-medium">Product</th>
                <th className="px-3 py-1.5 font-medium">Brand</th>
                <th className="px-3 py-1.5 font-medium">Category</th>
                <th className="px-3 py-1.5 font-medium text-right">Stock</th>
                <th className="px-3 py-1.5 font-medium text-right">Cost</th>
                <th className="px-3 py-1.5 font-medium text-right">Sell Price</th>
                <th className="px-3 py-1.5 font-medium text-right">Last Sold</th>
                <th className="px-3 py-1.5 font-medium text-right">Clearance</th>
                <th className="px-3 py-1.5 font-medium text-right">Recovery</th>
                <th className="px-3 py-1.5 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {enrichedRows.map((r, idx) => {
                const sold = fmtLastSold(r.days);
                const isEd = editingId === r.productId;
                return (
                  <tr key={r.id ?? idx} className="hover:bg-muted/30">
                    <td className="px-3 py-2"><input type="checkbox" checked={selected.has(r.productId)} onChange={() => toggleSelect(r.productId)} className="accent-primary" /></td>
                    <td className="px-3 py-2">
                      <div className="text-sm font-medium text-foreground">{r.productName}</div>
                      <div className="text-[10px] font-mono text-muted-foreground">SKU: {r.productSku}</div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-xs">{r.brandName ?? "\u2014"}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">{r.categoryName ?? "\u2014"}</td>
                    <td className={cn("whitespace-nowrap px-3 py-2 text-right tabular-nums text-xs", r.stock > 10 ? "text-red-500 font-semibold" : "")}>{r.stock.toLocaleString()}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-xs">{"\u20B1"}{fmtCurrency(r.cost)}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-xs">
                      {isEd ? (
                        <input type="number" value={editPrice} autoFocus onChange={e => setEditPrice(e.target.value)}
                          onKeyDown={e => { if (e.key === "Enter" && editPrice) applyMut.mutate({ productId: r.productId, price: Number(editPrice) }); if (e.key === "Escape") setEditingId(null); }}
                          onBlur={() => setEditingId(null)}
                          className="w-24 rounded border border-primary bg-background px-1.5 py-0.5 text-right text-xs outline-none" />
                      ) : (
                        <button onClick={() => { setEditingId(r.productId); setEditPrice(String(Number(r.avgSellingPrice) || 0)); }}
                          className="tabular-nums hover:text-emerald-600 hover:underline">{"\u20B1"}{fmtCurrency(r.avgSellingPrice)}</button>
                      )}
                    </td>
                    <td className={cn("whitespace-nowrap px-3 py-2 text-right text-xs font-medium", sold.color)}>{sold.text}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-xs">
                      <button onClick={() => { setEditingId(r.productId); setEditPrice(String(r.clearancePrice)); }}
                        className="text-amber-600 hover:underline">{"\u20B1"}{r.clearancePrice.toLocaleString()}</button>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-xs font-medium text-emerald-600">{"\u20B1"}{r.recovery.toLocaleString()}</td>
                    <td className="px-3 py-2">
                      <button onClick={() => applyMut.mutate({ productId: r.productId, price: r.clearancePrice })} disabled={applyMut.isPending}
                        className="rounded bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary hover:bg-primary/20 disabled:opacity-50">Apply</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="border-t border-border bg-background px-6 py-1.5">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{enrichedRows.length} dead stock items</span>
          {hasNextPage && (
            <button onClick={() => fetchNextPage()} disabled={isFetchingNextPage}
              className="flex items-center gap-1 rounded bg-muted px-3 py-1 text-xs font-medium hover:bg-accent disabled:opacity-50">
              {isFetchingNextPage ? <Loader2 size={12} className="animate-spin" /> : <ChevronsDown size={12} />} Load More
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
 * TAB 4: PRICE HISTORY
 * ═══════════════════════════════════════════════════════ */

function PriceHistoryTab() {
  const { token, apiLocationId: locationId } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [fieldFilter, setFieldFilter] = useState<"" | "COST_PRICE" | "SELL_PRICE">("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [batchId, setBatchId] = useState("");

  const handleSearch = (v: string) => {
    setSearchQuery(v);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setDebouncedSearch(v), 300);
  };

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
  } = useInfiniteQuery<PriceHistoryPage>({
    queryKey: ["price-history", debouncedSearch, fieldFilter, dateFrom, dateTo, batchId],
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams();
      params.set("limit", "50");
      if (pageParam) params.set("cursor", pageParam as string);
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (fieldFilter) params.set("field", fieldFilter);
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
      if (batchId) params.set("batchId", batchId);
      return apiFetch<PriceHistoryPage>(
        `/inventory/pricing/history?${params.toString()}`,
        { token: token!, locationId },
      );
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.nextCursor : undefined),
    enabled: !!token,
  });

  const rows = useMemo(() => data?.pages.flatMap((p) => p.data) ?? [], [data]);

  const hasFilters = searchQuery || fieldFilter || dateFrom || dateTo || batchId;

  const clearFilters = () => {
    setSearchQuery("");
    setDebouncedSearch("");
    setFieldFilter("");
    setDateFrom("");
    setDateTo("");
    setBatchId("");
  };

  return (
    <div className="flex h-full flex-col">
      {/* Filter bar */}
      <div className="border-b border-border bg-background/50 px-6 py-3">
        <div className="flex flex-wrap items-center gap-2">
          {/* Product search */}
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Search products..."
              className="h-8 w-52 rounded-md border border-border bg-background pl-8 pr-3 text-xs text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-primary focus:ring-1 focus:ring-primary/20"
            />
          </div>

          {/* Field filter */}
          <div className="relative">
            <select
              value={fieldFilter}
              onChange={(e) => setFieldFilter(e.target.value as "" | "COST_PRICE" | "SELL_PRICE")}
              className="h-8 appearance-none rounded-md border border-border bg-background pl-2.5 pr-7 text-xs text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
            >
              <option value="">All Types</option>
              <option value="COST_PRICE">Cost Only</option>
              <option value="SELL_PRICE">Sell Only</option>
            </select>
            <ChevronDown
              size={12}
              className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
          </div>

          {/* Date range */}
          <DateRangePicker
            startDate={dateFrom}
            endDate={dateTo}
            onChange={(start, end) => { setDateFrom(start); setDateTo(end); }}
          />

          {/* Batch ID */}
          <input
            type="text"
            value={batchId}
            onChange={(e) => setBatchId(e.target.value)}
            placeholder="Batch ID..."
            className="h-8 w-36 rounded-md border border-border bg-background px-2.5 text-xs text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-primary focus:ring-1 focus:ring-primary/20"
          />

          {/* Clear */}
          {hasFilters && (
            <button
              onClick={clearFilters}
              className="flex h-8 items-center gap-1 rounded-md border border-border px-2.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <X size={12} />
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex h-64 items-center justify-center">
            <Loader2 size={24} className="animate-spin text-muted-foreground" />
          </div>
        ) : isError ? (
          <div className="flex h-64 items-center justify-center text-sm text-destructive">
            Failed to load price history
          </div>
        ) : rows.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center gap-2 text-center">
            <History size={32} className="text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">
              {hasFilters ? "No history matches your filters" : "No price changes recorded yet"}
            </p>
            <p className="text-xs text-muted-foreground">
              {hasFilters
                ? "Try broadening your search criteria."
                : "Price changes will appear here as they are made."}
            </p>
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 z-10 border-b border-border bg-muted/50 text-xs font-medium text-muted-foreground">
              <tr>
                <th className="whitespace-nowrap px-4 py-1.5 font-medium">Date</th>
                <th className="px-4 py-1.5 font-medium">Product</th>
                <th className="whitespace-nowrap px-4 py-1.5 font-medium">Type</th>
                <th className="whitespace-nowrap px-4 py-1.5 font-medium text-right">Old</th>
                <th className="whitespace-nowrap px-4 py-1.5 font-medium text-right">New</th>
                <th className="whitespace-nowrap px-4 py-1.5 font-medium text-right">Change</th>
                <th className="whitespace-nowrap px-4 py-1.5 font-medium">Source</th>
                <th className="whitespace-nowrap px-4 py-1.5 font-medium">By</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r, idx) => {
                const d = r.changedAt ? new Date(r.changedAt) : new Date();
                const dateStr = d.toLocaleDateString("en-PH", { day: "2-digit", month: "short" });
                const timeStr = d.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit", hour12: false });
                const pct = Number(r.pctChange) || 0;
                const isSell = r.field === "SELL_PRICE";
                const SOURCE_STYLES: Record<string, string> = {
                  manual: "bg-muted text-muted-foreground",
                  margin_alert: "bg-amber-500/10 text-amber-600",
                  bulk_update: "bg-blue-500/10 text-blue-600",
                  po_received: "bg-emerald-500/10 text-emerald-600",
                  dead_stock_clearance: "bg-red-500/10 text-red-600",
                  import: "bg-violet-500/10 text-violet-600",
                };
                return (
                  <tr key={r.id ?? idx} className="hover:bg-muted/30">
                    <td className="whitespace-nowrap px-4 py-1.5">
                      <div className="text-xs text-foreground">{dateStr}</div>
                      <div className="text-[10px] text-muted-foreground">{timeStr}</div>
                    </td>
                    <td className="px-4 py-2">
                      <div className="text-sm font-medium text-foreground">{r.productName}</div>
                      <div className="text-[10px] font-mono text-muted-foreground">SKU: {r.productSku}</div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-1.5">
                      <span className={cn("inline-block rounded px-2 py-0.5 text-[10px] font-semibold", isSell ? "bg-emerald-500/10 text-emerald-600" : "bg-blue-500/10 text-blue-600")}>
                        {isSell ? "Sell" : "Cost"}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-1.5 text-right tabular-nums text-xs text-muted-foreground">{"\u20B1"}{fmtCurrency(r.oldValue)}</td>
                    <td className="whitespace-nowrap px-4 py-1.5 text-right tabular-nums text-xs font-medium">{"\u20B1"}{fmtCurrency(r.newValue)}</td>
                    <td className={cn("whitespace-nowrap px-4 py-1.5 text-right tabular-nums text-xs font-semibold", pct > 0 ? "text-emerald-600" : pct < 0 ? "text-red-500" : "text-muted-foreground")}>
                      {pct > 0 ? "\u2191+" : pct < 0 ? "\u2193" : ""}{fmtPct(pct)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-1.5">
                      <span className={cn("inline-block rounded-full px-2 py-0.5 text-[9px] font-semibold", SOURCE_STYLES[r.source] ?? "bg-muted text-muted-foreground")}>
                        {r.source?.replace(/_/g, " ") ?? "manual"}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-1.5 text-xs text-muted-foreground">{r.changedByName ?? "System"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-border bg-background px-6 py-1.5">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {rows.length} entr{rows.length !== 1 ? "ies" : "y"}
            {hasFilters ? " (filtered)" : ""}
          </span>
          {hasNextPage && (
            <button
              onClick={() => fetchNextPage()}
              disabled={isFetchingNextPage}
              className="flex items-center gap-1.5 rounded-md bg-muted px-3 py-1 text-xs font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-50"
            >
              {isFetchingNextPage ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <ChevronsDown size={12} />
              )}
              Load More
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
