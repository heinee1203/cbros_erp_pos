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
  productName: string;
  sku: string;
  brandName: string | null;
  costPrice: number;
  sellPrice: number;
  marginPct: number;
  lastCostChange: string | null;
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
  costPrice: number;
  sellPrice: number;
  daysSinceSale: number;
  totalStock: number;
  stockValue: number;
}

interface DeadStockPage {
  data: DeadStockRow[];
  nextCursor: string | null;
  hasMore: boolean;
}

interface PriceHistoryRow {
  id: string;
  date: string;
  productName: string;
  sku: string;
  field: "COST" | "SELL";
  oldPrice: number;
  newPrice: number;
  pctChange: number;
  reason: string | null;
  changedBy: string | null;
  batchId: string | null;
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

function fmtCurrency(v: number): string {
  return v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtPct(v: number): string {
  return v.toFixed(1) + "%";
}

function getDeadStockTier(daysSinceSale: number): { label: string; color: string; marginPct: number } {
  if (daysSinceSale >= 366) return { label: "Deep Clearance", color: "bg-red-500/20 text-red-400", marginPct: -15 };
  if (daysSinceSale >= 181) return { label: "Clearance", color: "bg-orange-500/20 text-orange-400", marginPct: 3 };
  return { label: "Slow Mover", color: "bg-amber-500/20 text-amber-400", marginPct: 12 };
}

function calcSuggestedPrice(costPrice: number, tierMarginPct: number): number {
  return costPrice * (1 + tierMarginPct / 100);
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
              "px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors",
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
                      <td className="max-w-[180px] truncate px-4 py-2 text-foreground">{r.name}</td>
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
  const [threshold, setThreshold] = useState(15);

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
  } = useInfiniteQuery<MarginAlertPage>({
    queryKey: ["margin-alerts", threshold],
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams();
      params.set("threshold", String(threshold));
      params.set("limit", "50");
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

  const rows = useMemo(() => data?.pages.flatMap((p) => p.data) ?? [], [data]);

  return (
    <div className="flex h-full flex-col">
      {/* Filter bar */}
      <div className="border-b border-border bg-background/50 px-6 py-3">
        <div className="flex items-center gap-3">
          <label className="text-xs text-muted-foreground">Margin threshold:</label>
          <div className="relative">
            <input
              type="number"
              min={0}
              max={100}
              value={threshold}
              onChange={(e) => setThreshold(parseInt(e.target.value) || 0)}
              className="h-8 w-20 rounded-md border border-border bg-background px-2.5 text-xs tabular-nums text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
            />
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
          </div>
          <span className="text-xs text-muted-foreground">
            Showing items with margin below {threshold}%
          </span>
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
            Failed to load margin alerts
          </div>
        ) : rows.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center gap-2 text-center">
            <Check size={32} className="text-emerald-500" />
            <p className="text-sm font-medium text-foreground">All margins look healthy</p>
            <p className="text-xs text-muted-foreground">
              No items found with margins below {threshold}%
            </p>
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 z-10 border-b border-border bg-muted/50 text-xs font-medium text-muted-foreground">
              <tr>
                <th className="whitespace-nowrap px-4 py-2.5 font-medium">Product</th>
                <th className="whitespace-nowrap px-4 py-2.5 font-medium">SKU</th>
                <th className="whitespace-nowrap px-4 py-2.5 font-medium">Brand</th>
                <th className="whitespace-nowrap px-4 py-2.5 font-medium text-right">Cost</th>
                <th className="whitespace-nowrap px-4 py-2.5 font-medium text-right">Sell Price</th>
                <th className="whitespace-nowrap px-4 py-2.5 font-medium text-right">Margin %</th>
                <th className="whitespace-nowrap px-4 py-2.5 font-medium">Last Cost Change</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-muted/30">
                  <td className="max-w-[220px] truncate px-4 py-2.5 text-sm font-medium text-foreground">
                    {r.productName}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs text-muted-foreground">
                    {r.sku}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-sm text-foreground">
                    {r.brandName ?? "—"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-sm text-foreground">
                    {fmtCurrency(r.costPrice)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-sm text-foreground">
                    {fmtCurrency(r.sellPrice)}
                  </td>
                  <td
                    className={cn(
                      "whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-sm font-semibold",
                      r.marginPct < 0 ? "text-red-500" : r.marginPct < 10 ? "text-red-400" : "text-amber-500",
                    )}
                  >
                    {fmtPct(r.marginPct)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-sm text-muted-foreground">
                    {r.lastCostChange
                      ? new Date(r.lastCostChange).toLocaleDateString("en-PH", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-border bg-background px-6 py-2.5">
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

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
  } = useInfiniteQuery<DeadStockPage>({
    queryKey: ["dead-stock-clearance"],
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams();
      params.set("status", "DEAD_STOCK");
      params.set("limit", "50");
      if (pageParam) params.set("cursor", pageParam as string);
      return apiFetch<DeadStockPage>(
        `/inventory/stock-monitor?${params.toString()}`,
        { token: token!, locationId },
      );
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.nextCursor : undefined),
    enabled: !!token,
  });

  const rows = useMemo(() => data?.pages.flatMap((p) => p.data) ?? [], [data]);

  const enrichedRows = useMemo(
    () =>
      rows.map((r) => {
        const tier = getDeadStockTier(r.daysSinceSale);
        const suggestedPrice = calcSuggestedPrice(r.costPrice, tier.marginPct);
        const currentMargin = r.sellPrice > 0 ? ((r.sellPrice - r.costPrice) / r.sellPrice) * 100 : 0;
        const newMargin = suggestedPrice > 0 ? ((suggestedPrice - r.costPrice) / suggestedPrice) * 100 : 0;
        return { ...r, tier, suggestedPrice, currentMargin, newMargin };
      }),
    [rows],
  );

  /* Summary */
  const summary = useMemo(() => {
    const totalItems = enrichedRows.length;
    const totalValue = enrichedRows.reduce((sum, r) => sum + r.stockValue, 0);
    const potentialRecovery = enrichedRows.reduce((sum, r) => sum + r.suggestedPrice * r.totalStock, 0);
    return { totalItems, totalValue, potentialRecovery };
  }, [enrichedRows]);

  /* Apply single */
  const applyMutation = useMutation({
    mutationFn: async ({ productId, newPrice }: { productId: string; newPrice: number }) =>
      apiFetch(`/inventory/pricing/${productId}`, {
        method: "PATCH",
        token: token!,
        locationId,
        body: JSON.stringify({ sellPrice: newPrice }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dead-stock-clearance"] });
    },
  });

  /* Apply all selected */
  const handleApplySelected = useCallback(async () => {
    const toApply = enrichedRows.filter((r) => selected.has(r.productId));
    for (const r of toApply) {
      await applyMutation.mutateAsync({ productId: r.productId, newPrice: r.suggestedPrice });
    }
    setSelected(new Set());
  }, [enrichedRows, selected, applyMutation]);

  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    if (selected.size === enrichedRows.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(enrichedRows.map((r) => r.productId)));
    }
  }, [enrichedRows, selected.size]);

  return (
    <div className="flex h-full flex-col">
      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4 border-b border-border bg-background/50 px-6 py-4">
        {[
          { label: "Total Dead Items", value: summary.totalItems.toLocaleString() },
          { label: "Total Dead Stock Value", value: fmtCurrency(summary.totalValue) },
          { label: "Potential Recovery", value: fmtCurrency(summary.potentialRecovery) },
        ].map((card) => (
          <div key={card.label} className="rounded-lg border border-border bg-background p-4">
            <div className="text-xs text-muted-foreground">{card.label}</div>
            <div className="mt-1 text-xl font-semibold tabular-nums text-foreground">{card.value}</div>
          </div>
        ))}
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 border-b border-border bg-primary/5 px-6 py-2.5">
          <span className="text-xs font-medium text-foreground">
            {selected.size} item{selected.size !== 1 ? "s" : ""} selected
          </span>
          <button
            onClick={handleApplySelected}
            disabled={applyMutation.isPending}
            className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
          >
            {applyMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
            Apply All Selected
          </button>
          <button
            onClick={() => setSelected(new Set())}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Clear selection
          </button>
        </div>
      )}

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex h-64 items-center justify-center">
            <Loader2 size={24} className="animate-spin text-muted-foreground" />
          </div>
        ) : isError ? (
          <div className="flex h-64 items-center justify-center text-sm text-destructive">
            Failed to load dead stock data
          </div>
        ) : enrichedRows.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center gap-2 text-center">
            <Check size={32} className="text-emerald-500" />
            <p className="text-sm font-medium text-foreground">No dead stock found</p>
            <p className="text-xs text-muted-foreground">All items have recent sales activity</p>
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 z-10 border-b border-border bg-muted/50 text-xs font-medium text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">
                  <input
                    type="checkbox"
                    checked={selected.size === enrichedRows.length && enrichedRows.length > 0}
                    onChange={toggleAll}
                    className="accent-primary"
                  />
                </th>
                <th className="whitespace-nowrap px-4 py-2.5 font-medium">Product</th>
                <th className="whitespace-nowrap px-4 py-2.5 font-medium">SKU</th>
                <th className="whitespace-nowrap px-4 py-2.5 font-medium">Brand</th>
                <th className="whitespace-nowrap px-4 py-2.5 font-medium text-right">Current Price</th>
                <th className="whitespace-nowrap px-4 py-2.5 font-medium text-right">Cost</th>
                <th className="whitespace-nowrap px-4 py-2.5 font-medium text-right">Days Since Sale</th>
                <th className="whitespace-nowrap px-4 py-2.5 font-medium">Tier</th>
                <th className="whitespace-nowrap px-4 py-2.5 font-medium text-right">Suggested Price</th>
                <th className="whitespace-nowrap px-4 py-2.5 font-medium text-right">Current Margin</th>
                <th className="whitespace-nowrap px-4 py-2.5 font-medium text-right">New Margin</th>
                <th className="whitespace-nowrap px-4 py-2.5 font-medium text-right">Stock Qty</th>
                <th className="whitespace-nowrap px-4 py-2.5 font-medium text-right">Stock Value</th>
                <th className="whitespace-nowrap px-4 py-2.5 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {enrichedRows.map((r) => (
                <tr key={r.id} className="hover:bg-muted/30">
                  <td className="px-4 py-2.5">
                    <input
                      type="checkbox"
                      checked={selected.has(r.productId)}
                      onChange={() => toggleSelect(r.productId)}
                      className="accent-primary"
                    />
                  </td>
                  <td className="max-w-[180px] truncate px-4 py-2.5 text-sm font-medium text-foreground">
                    {r.productName}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs text-muted-foreground">
                    {r.productSku}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-sm text-foreground">
                    {r.brandName ?? "—"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-sm text-foreground">
                    {fmtCurrency(r.sellPrice)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-sm text-muted-foreground">
                    {fmtCurrency(r.costPrice)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-sm text-foreground">
                    {r.daysSinceSale}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5">
                    <span
                      className={cn(
                        "inline-block rounded px-2 py-0.5 text-[10px] font-semibold",
                        r.tier.color,
                      )}
                    >
                      {r.tier.label}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-sm font-medium text-foreground">
                    {fmtCurrency(r.suggestedPrice)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-sm text-muted-foreground">
                    {fmtPct(r.currentMargin)}
                  </td>
                  <td
                    className={cn(
                      "whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-sm font-medium",
                      r.newMargin < 0 ? "text-red-500" : "text-foreground",
                    )}
                  >
                    {fmtPct(r.newMargin)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-sm text-foreground">
                    {r.totalStock}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-sm text-muted-foreground">
                    {fmtCurrency(r.stockValue)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5">
                    <button
                      onClick={() =>
                        applyMutation.mutate({ productId: r.productId, newPrice: r.suggestedPrice })
                      }
                      disabled={applyMutation.isPending}
                      className="rounded-md bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary transition hover:bg-primary/20 disabled:opacity-50"
                    >
                      Apply
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-border bg-background px-6 py-2.5">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{enrichedRows.length} dead stock items</span>
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
 * TAB 4: PRICE HISTORY
 * ═══════════════════════════════════════════════════════ */

function PriceHistoryTab() {
  const { token, apiLocationId: locationId } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [fieldFilter, setFieldFilter] = useState<"" | "COST" | "SELL">("");
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
              onChange={(e) => setFieldFilter(e.target.value as "" | "COST" | "SELL")}
              className="h-8 appearance-none rounded-md border border-border bg-background pl-2.5 pr-7 text-xs text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
            >
              <option value="">Cost & Sell</option>
              <option value="COST">Cost Only</option>
              <option value="SELL">Sell Only</option>
            </select>
            <ChevronDown
              size={12}
              className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
          </div>

          {/* Date range */}
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="h-8 rounded-md border border-border bg-background px-2.5 text-xs text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 [&::-webkit-calendar-picker-indicator]:opacity-50"
            title="From date"
          />
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="h-8 rounded-md border border-border bg-background px-2.5 text-xs text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 [&::-webkit-calendar-picker-indicator]:opacity-50"
            title="To date"
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
                <th className="whitespace-nowrap px-4 py-2.5 font-medium">Date</th>
                <th className="whitespace-nowrap px-4 py-2.5 font-medium">Product</th>
                <th className="whitespace-nowrap px-4 py-2.5 font-medium">SKU</th>
                <th className="whitespace-nowrap px-4 py-2.5 font-medium">Field</th>
                <th className="whitespace-nowrap px-4 py-2.5 font-medium text-right">Old Price</th>
                <th className="whitespace-nowrap px-4 py-2.5 font-medium text-right">New Price</th>
                <th className="whitespace-nowrap px-4 py-2.5 font-medium text-right">% Change</th>
                <th className="whitespace-nowrap px-4 py-2.5 font-medium">Reason</th>
                <th className="whitespace-nowrap px-4 py-2.5 font-medium">Changed By</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => {
                const d = new Date(r.date);
                const dateStr = d.toLocaleDateString("en-PH", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                });
                const timeStr = d.toLocaleTimeString("en-PH", {
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: false,
                });
                return (
                  <tr key={r.id} className="hover:bg-muted/30">
                    <td className="whitespace-nowrap px-4 py-2.5">
                      <div className="text-sm text-foreground">{dateStr}</div>
                      <div className="text-[10px] text-muted-foreground">{timeStr}</div>
                    </td>
                    <td className="max-w-[180px] truncate px-4 py-2.5 text-sm font-medium text-foreground">
                      {r.productName}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs text-muted-foreground">
                      {r.sku}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5">
                      <span
                        className={cn(
                          "inline-block rounded px-2 py-0.5 text-[10px] font-semibold",
                          r.field === "COST"
                            ? "bg-blue-500/20 text-blue-400"
                            : "bg-emerald-500/20 text-emerald-400",
                        )}
                      >
                        {r.field}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-sm text-muted-foreground">
                      {fmtCurrency(r.oldPrice)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-sm font-medium text-foreground">
                      {fmtCurrency(r.newPrice)}
                    </td>
                    <td
                      className={cn(
                        "whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-sm font-medium",
                        r.pctChange > 0
                          ? "text-red-500"
                          : r.pctChange < 0
                            ? "text-emerald-500"
                            : "text-muted-foreground",
                      )}
                    >
                      {r.pctChange > 0 ? "+" : ""}
                      {fmtPct(r.pctChange)}
                    </td>
                    <td className="max-w-[140px] truncate whitespace-nowrap px-4 py-2.5 text-sm text-muted-foreground">
                      {r.reason ?? "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-sm text-muted-foreground">
                      {r.changedBy ?? "System"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-border bg-background px-6 py-2.5">
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
