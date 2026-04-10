"use client";

import { useState, useMemo, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
  Warehouse,
  Search,
  X,
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  Loader2,
  ChevronsDown,
  Package,
  AlertTriangle,
  PackageX,
  ShieldAlert,
  Archive,
  ShoppingCart,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { timeAgo } from "@/lib/format";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/app/auth-context";
import { ModalShell } from "@/app/inventory/components/modal-shell";
import Link from "next/link";
import {
  useStockLevels,
  useProductStockLevels,
  type StockLevelRow,
  type StockLevelsSummary,
  type ProductStockRow,
  type ProductStockSummary,
  type SortField,
  type SortDir,
} from "@/hooks/use-stock-levels";
import { useProductFamilies } from "@/hooks/use-products";
import { useCategories } from "@/hooks/use-categories";
import { useSubcategories } from "@/hooks/use-subcategories";

/* ═══════════════════════════════════════════════════════
 * REORDER TYPES (same as dashboard)
 * ═══════════════════════════════════════════════════════ */

interface PendingOrdersData {
  draftPOs: { poId: string; poNumber: string; supplierId: string; supplierName: string; quantity: number; status: string }[];
  submittedPOs: { poId: string; poNumber: string; supplierId: string; supplierName: string; quantityOrdered: number; quantityReceived: number; quantityRemaining: number; status: string }[];
  backorders: { backorderId: string; sourcePoNumber: string; supplierId: string; supplierName: string; quantityOutstanding: number; status: string; waitUntil: string | null }[];
  lastSupplier: { supplierId: string; supplierName: string; lastCost: string; lastPoNumber: string; lastPoDate: string } | null;
  suggestedQty: number;
}

/* ═══════════════════════════════════════════════════════
 * CONSTANTS
 * ═══════════════════════════════════════════════════════ */

// Category badge uses a single neutral style — category names come from the DB now

const STATUS_LABELS: Record<string, string> = {
  IN_STOCK: "In Stock",
  LOW_STOCK: "Low Stock",
  OUT_OF_STOCK: "Out of Stock",
};

const STATUS_STYLES: Record<string, string> = {
  IN_STOCK: "bg-success/10 text-success",
  LOW_STOCK: "bg-warning/10 text-warning",
  OUT_OF_STOCK: "bg-destructive/10 text-destructive",
};


/* ═══════════════════════════════════════════════════════
 * MAIN PAGE
 * ═══════════════════════════════════════════════════════ */

export default function StockLevelsPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-32 text-muted-foreground text-sm">Loading...</div>}>
      <StockLevelsInner />
    </Suspense>
  );
}

function StockLevelsInner() {
  const { token, locationId, apiLocationId, loading: authLoading } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const urlBelowReorder = searchParams.get("belowReorder") === "true";

  // ── View mode ──
  const [viewMode, setViewMode] = useState<"product" | "location">("product");

  // ── Filter state ──
  const [allLocations, setAllLocations] = useState(false);
  const [familyFilter, setFamilyFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [subcategoryFilter, setSubcategoryFilter] = useState("all");
  const [stockStatusFilter, setStockStatusFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [belowReorder, setBelowReorder] = useState(urlBelowReorder);

  // ── Taxonomy data ──
  const familiesQuery = useProductFamilies(token ?? "", locationId ?? "");
  const categoriesQuery = useCategories(token ?? "", locationId ?? "", {});
  const subcategoriesQuery = useSubcategories(token ?? "", locationId ?? "");
  const allFamilies = familiesQuery.data?.data ?? [];
  const allCategories = categoriesQuery.data?.data ?? [];
  const allSubcategories = subcategoriesQuery.data?.data ?? [];

  // Cascading filters
  const filteredCategories = familyFilter !== "all"
    ? allCategories.filter((c: any) => c.familyId === familyFilter)
    : allCategories;
  const filteredSubcategories = categoryFilter !== "all"
    ? allSubcategories.filter((s: any) => s.categoryId === categoryFilter)
    : allSubcategories;

  // ── Sort state — default to last sold (most recent first) when below-reorder filter is active ──
  const [sortBy, setSortBy] = useState<SortField>(urlBelowReorder ? "lastSoldAt" : "name");
  const [sortDir, setSortDir] = useState<SortDir>(urlBelowReorder ? "desc" : "asc");

  const handleSort = (field: SortField) => {
    if (sortBy === field) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(field);
      setSortDir("asc");
    }
  };

  // ── Debounce search ──
  const searchTimeoutRef = useState<ReturnType<typeof setTimeout> | null>(null);
  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    if (searchTimeoutRef[0]) clearTimeout(searchTimeoutRef[0]);
    searchTimeoutRef[1](
      setTimeout(() => setDebouncedSearch(value), 300),
    );
  };

  // ── Queries ──
  const locationQuery = useStockLevels(token, locationId, {
    allLocations,
    search: debouncedSearch || undefined,
    category: categoryFilter !== "all" ? categoryFilter : undefined,
    stockStatus: stockStatusFilter !== "all" ? (stockStatusFilter as any) : undefined,
    belowReorder: belowReorder || undefined,
    sortBy,
    sortDir,
  });

  const productQuery = useProductStockLevels(token, locationId, {
    search: debouncedSearch || undefined,
    familyId: familyFilter !== "all" ? familyFilter : undefined,
    categoryId: categoryFilter !== "all" ? categoryFilter : undefined,
    subcategoryId: subcategoryFilter !== "all" ? subcategoryFilter : undefined,
    stockStatus: stockStatusFilter !== "all" ? (stockStatusFilter as any) : undefined,
    belowReorder: belowReorder || undefined,
    sortBy,
    sortDir,
  });

  // Active query based on view mode
  const activeQuery = viewMode === "product" ? productQuery : locationQuery;
  const { fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, isError, error } = activeQuery;
  const data = activeQuery.data;

  // Flatten pages — location view rows
  const rows = useMemo(
    () => viewMode === "location" ? (locationQuery.data?.pages.flatMap((page) => page.data) ?? []) : [],
    [locationQuery.data, viewMode],
  );

  // Flatten pages — product view rows
  const productRows = useMemo(
    () => viewMode === "product" ? (productQuery.data?.pages.flatMap((page) => page.data) ?? []) : [],
    [productQuery.data, viewMode],
  );

  // Summary
  const summary: StockLevelsSummary | null = viewMode === "location" ? (locationQuery.data?.pages[0]?.summary ?? null) : null;
  const productSummary: ProductStockSummary | null = viewMode === "product" ? (productQuery.data?.pages[0]?.summary ?? null) : null;

  // ── Reorder state ──
  const [reorderModal, setReorderModal] = useState<{ item: { productId: string; productName: string }; data: PendingOrdersData } | null>(null);
  const [reorderLoading, setReorderLoading] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handleReorder = useCallback(async (productId: string, productName: string) => {
    if (!token || !locationId) return;
    setReorderLoading(productId);
    try {
      const pendingData = await apiFetch<PendingOrdersData>(`/products/${productId}/pending-orders`, { token, locationId });
      const hasExisting = pendingData.draftPOs.length > 0 || pendingData.submittedPOs.length > 0 || pendingData.backorders.length > 0;
      if (hasExisting) {
        setReorderModal({ item: { productId, productName }, data: pendingData });
      } else {
        await addToDraftPO(productId, productName, pendingData.lastSupplier, pendingData.suggestedQty);
      }
    } catch {
      // user can retry
    } finally {
      setReorderLoading(null);
    }
  }, [token, locationId]);

  const addToDraftPO = useCallback(async (
    productId: string,
    productName: string,
    lastSupplier: PendingOrdersData["lastSupplier"],
    suggestedQty: number,
  ) => {
    if (!token || !locationId) return;
    if (!lastSupplier) {
      router.push(`/procurement/purchase-orders/new?productId=${productId}&qty=${suggestedQty}`);
      return;
    }
    const drafts = await apiFetch<{ data: { id: string; poNo: string }[] }>(
      `/procurement/purchase-orders?status=DRAFT&supplierId=${lastSupplier.supplierId}&limit=1`,
      { token, locationId },
    );
    if (drafts.data && drafts.data.length > 0) {
      const draft = drafts.data[0];
      await apiFetch(`/procurement/purchase-orders/${draft.id}/lines`, {
        token, locationId,
        method: "POST",
        body: JSON.stringify({ productId, orderedQty: suggestedQty, unitCost: lastSupplier.lastCost }),
      });
      setReorderModal(null);
      setSuccessMsg(`Added ${suggestedQty} units to ${draft.poNo}`);
      setTimeout(() => setSuccessMsg(null), 4000);
      router.push(`/procurement/purchase-orders/${draft.poNo}`);
    } else {
      setReorderModal(null);
      const params = new URLSearchParams({ productId, qty: String(suggestedQty), supplierId: lastSupplier.supplierId, unitCost: lastSupplier.lastCost });
      router.push(`/procurement/purchase-orders/new?${params.toString()}`);
    }
  }, [token, locationId, router]);

  const handleSnooze = useCallback(async (productId: string, days: number) => {
    if (!token || !locationId) return;
    await apiFetch(`/products/${productId}/snooze-reorder`, {
      token, locationId,
      method: "POST",
      body: JSON.stringify({ days }),
    });
    setReorderModal(null);
    setSuccessMsg(`Snoozed for ${days} days`);
    setTimeout(() => setSuccessMsg(null), 4000);
    queryClient.invalidateQueries({ queryKey: ["stock-levels"] });
    queryClient.invalidateQueries({ queryKey: ["stock-levels-product"] });
  }, [token, locationId, queryClient]);

  // Build dynamic category list from loaded data
  const uniqueCategories = useMemo(() => {
    const allRows = viewMode === "product" ? productRows : rows;
    const cats = new Set(allRows.map((r) => r.category).filter(Boolean));
    return Array.from(cats).sort();
  }, [rows, productRows, viewMode]);

  const hasActiveFilters =
    familyFilter !== "all" ||
    categoryFilter !== "all" ||
    subcategoryFilter !== "all" ||
    stockStatusFilter !== "all" ||
    searchQuery !== "" ||
    belowReorder;

  const clearFilters = () => {
    setFamilyFilter("all");
    setCategoryFilter("all");
    setSubcategoryFilter("all");
    setStockStatusFilter("all");
    setSearchQuery("");
    setDebouncedSearch("");
    setBelowReorder(false);
  };

  // ── Auth loading ──
  if (authLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 size={24} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (<>
    <div className="flex h-full flex-col">
      {/* ── Page Header ── */}
      <div className="border-b border-border bg-background px-6 py-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
              <Warehouse size={18} className="text-muted-foreground" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-foreground">Stock Levels</h1>
              <p className="text-xs text-muted-foreground">
                Monitor on-hand, reserved, and available stock — identify items below reorder point
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Summary Strip ── */}
      {viewMode === "product" && productSummary && (
        <>
          <div className="grid grid-cols-5 border-b border-border bg-muted/30">
            {([
              { label: "Products", value: productSummary.totalProducts.toLocaleString() },
              { label: "In Stock", value: productSummary.inStock.toLocaleString(), color: "text-success" },
              { label: "Low Stock", value: productSummary.lowStock.toLocaleString(), color: "text-warning" },
              { label: "Out of Stock", value: productSummary.outOfStock.toLocaleString(), color: "text-destructive" },
              { label: "Below Reorder", value: productSummary.belowReorder.toLocaleString(), color: "text-orange-500" },
            ]).map((card) => (
              <div key={card.label} className="border-r border-border last:border-r-0 px-4 py-3">
                <div className={`text-lg font-bold tabular-nums ${card.color || "text-foreground"}`}>
                  {card.value}
                </div>
                <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{card.label}</div>
              </div>
            ))}
          </div>
          {productSummary.totalCostValue > 0 && (
            <div className="grid grid-cols-3 border-b border-border bg-muted/20">
              {([
                { label: "Total Cost Value", value: `₱${productSummary.totalCostValue.toLocaleString("en-PH", { maximumFractionDigits: 0 })}` },
                { label: "Total Sell Value", value: `₱${productSummary.totalSellValue.toLocaleString("en-PH", { maximumFractionDigits: 0 })}`, color: "text-primary" },
                { label: "Potential Margin", value: `₱${(productSummary.totalSellValue - productSummary.totalCostValue).toLocaleString("en-PH", { maximumFractionDigits: 0 })}`, color: "text-success" },
              ]).map((card) => (
                <div key={card.label} className="border-r border-border last:border-r-0 px-4 py-2.5">
                  <div className={`text-base font-bold tabular-nums ${card.color || "text-foreground"}`}>
                    {card.value}
                  </div>
                  <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{card.label}</div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
      {viewMode === "location" && summary && <SummaryStrip summary={summary} />}

      {/* ── Filter Bar ── */}
      <div className="border-b border-border bg-background/50 px-6 py-3">
        <div className="flex flex-wrap items-center gap-2">
          {/* View Toggle */}
          <div className="flex rounded-md border border-border">
            <button
              onClick={() => setViewMode("product")}
              className={`h-8 px-3 text-xs font-medium transition-colors ${viewMode === "product" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"}`}
            >
              By Product
            </button>
            <button
              onClick={() => setViewMode("location")}
              className={`h-8 px-3 text-xs font-medium border-l border-border transition-colors ${viewMode === "location" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"}`}
            >
              By Location
            </button>
          </div>

          {/* Scope Toggle (location view only) */}
          {viewMode === "location" && (
          <button
            onClick={() => setAllLocations(!allLocations)}
            className={`flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors ${
              allLocations
                ? "border-primary/30 bg-primary/5 text-primary"
                : "border-border text-muted-foreground hover:bg-accent"
            }`}
          >
            {allLocations ? "All Locations" : "Current Location"}
          </button>
          )}

          {/* Family */}
          <FilterSelect
            value={familyFilter}
            onChange={(v) => { setFamilyFilter(v); setCategoryFilter("all"); setSubcategoryFilter("all"); }}
            options={[
              { value: "all", label: "All Families" },
              ...allFamilies.map((f: any) => ({ value: f.id, label: f.name })),
            ]}
          />

          {/* Category */}
          <FilterSelect
            value={categoryFilter}
            onChange={(v) => { setCategoryFilter(v); setSubcategoryFilter("all"); }}
            options={[
              { value: "all", label: "All Categories" },
              ...filteredCategories.map((c: any) => ({ value: c.id, label: c.name })),
            ]}
          />

          {/* Sub-category */}
          <FilterSelect
            value={subcategoryFilter}
            onChange={setSubcategoryFilter}
            options={[
              { value: "all", label: "All Sub-categories" },
              ...filteredSubcategories.map((s: any) => ({ value: s.id, label: s.name })),
            ]}
          />

          {/* Stock Status */}
          <FilterSelect
            value={stockStatusFilter}
            onChange={setStockStatusFilter}
            options={[
              { value: "all", label: "All Statuses" },
              { value: "IN_STOCK", label: "In Stock" },
              { value: "LOW_STOCK", label: "Low Stock" },
              { value: "OUT_OF_STOCK", label: "Out of Stock" },
            ]}
          />

          {/* Below Reorder Toggle */}
          <button
            onClick={() => setBelowReorder(!belowReorder)}
            className={`flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors ${
              belowReorder
                ? "border-warning/30 bg-warning/5 text-warning"
                : "border-border text-muted-foreground hover:bg-accent"
            }`}
          >
            <AlertTriangle size={12} />
            Below Reorder
          </button>

          {/* Search */}
          <div className="relative ml-auto">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Search item, SKU..."
              className="h-8 w-56 rounded-md border border-border bg-background pl-8 pr-3 text-xs text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-primary focus:ring-1 focus:ring-primary/20"
            />
          </div>

          {/* Clear */}
          {hasActiveFilters && (
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

      {/* ── Main Table ── */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex h-64 items-center justify-center">
            <Loader2 size={24} className="animate-spin text-muted-foreground" />
          </div>
        ) : isError ? (
          <div className="flex h-64 flex-col items-center justify-center gap-2 text-center">
            <p className="text-sm font-medium text-destructive">Failed to load stock levels</p>
            <p className="text-xs text-muted-foreground">
              {(error as any)?.message ?? "Check API connection"}
            </p>
          </div>
        ) : viewMode === "product" ? (
          productRows.length === 0 ? (
            <EmptyState hasFilters={hasActiveFilters} />
          ) : (
            <div className={`transition-opacity ${isFetchingNextPage ? "opacity-60" : ""}`}>
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 z-10 border-b border-border bg-muted/50 text-xs font-medium text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider">Item</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider">SKU</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider">Category</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium uppercase tracking-wider">Stock</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium uppercase tracking-wider">Reorder Pt</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium uppercase tracking-wider">Sell Rate</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium uppercase tracking-wider">Days Left</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium uppercase tracking-wider">Last Sold</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider">Status</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium uppercase tracking-wider"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {productRows.map((row, i) => {
                  const isOut = row.status === "OUT_OF_STOCK";
                  const isLow = row.status === "LOW_STOCK";
                  const statusStyle = STATUS_STYLES[row.status] ?? "bg-muted text-muted-foreground";
                  const daysLeft = row.daysOfStock != null ? Math.round(row.daysOfStock) : null;
                  return (
                    <tr key={`${row.productId}-${row.productSku}-${i}`} className="group transition-colors hover:bg-muted/30">
                      <td className="min-w-[200px] px-4 py-2.5">
                        <div className="flex items-center gap-1.5">
                          <Link href={`/inventory?search=${encodeURIComponent(row.productSku)}`} className="whitespace-normal break-words text-sm font-medium text-foreground hover:underline">
                            {row.productName}
                          </Link>
                          {row.pendingOrderCount > 0 && (
                            <span className="shrink-0 rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">PO</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{row.productSku}</td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground">{row.category}</td>
                      <td className={`whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-sm ${isOut ? "font-semibold text-destructive" : isLow ? "font-medium text-warning" : "text-foreground"}`}>
                        {row.totalStock.toLocaleString()}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-sm text-muted-foreground">
                        {row.reorderPoint.toLocaleString()}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-sm text-muted-foreground">
                        {row.sold1m > 0 ? `${row.sold1m} /mo` : "\u2014"}
                      </td>
                      <td className={cn(
                        "whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-sm font-medium",
                        daysLeft === null ? "text-muted-foreground/50" :
                        daysLeft <= 7 ? "text-destructive" :
                        daysLeft <= 14 ? "text-orange-500" :
                        daysLeft <= 30 ? "text-amber-500" :
                        "text-emerald-600",
                      )}>
                        {daysLeft === null ? "\u221E" : `${daysLeft}d`}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-right text-xs text-muted-foreground">
                        {row.lastSoldAt ? timeAgo(row.lastSoldAt) : "\u2014"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${statusStyle}`}>
                          {isOut && <PackageX size={11} />}
                          {isLow && <AlertTriangle size={11} />}
                          {STATUS_LABELS[row.status] ?? row.status}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-right">
                        {(isLow || isOut) && (
                          <button
                            onClick={() => handleReorder(row.productId, row.productName)}
                            disabled={reorderLoading === row.productId}
                            className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
                          >
                            {reorderLoading === row.productId ? <Loader2 size={11} className="animate-spin" /> : <ShoppingCart size={11} />}
                            Reorder
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          )
        ) : rows.length === 0 ? (
          <EmptyState hasFilters={hasActiveFilters} />
        ) : (
          <div className={`transition-opacity ${isFetchingNextPage ? "opacity-60" : ""}`}>
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 z-10 border-b border-border bg-muted/50 text-xs font-medium text-muted-foreground">
              <tr>
                <SortHeader label="Item" field="name" currentSort={sortBy} currentDir={sortDir} onSort={handleSort} />
                <SortHeader label="SKU" field="sku" currentSort={sortBy} currentDir={sortDir} onSort={handleSort} />
                <SortHeader label="Category" field="category" currentSort={sortBy} currentDir={sortDir} onSort={handleSort} />
                <SortHeader label="Location" field="location" currentSort={sortBy} currentDir={sortDir} onSort={handleSort} />
                <SortHeader label="On Hand" field="stockLevel" currentSort={sortBy} currentDir={sortDir} onSort={handleSort} align="right" />
                <SortHeader label="Reserved" field="reservedLevel" currentSort={sortBy} currentDir={sortDir} onSort={handleSort} align="right" />
                <SortHeader label="Available" field="available" currentSort={sortBy} currentDir={sortDir} onSort={handleSort} align="right" />
                <SortHeader label="Reorder Pt" field="reorderPoint" currentSort={sortBy} currentDir={sortDir} onSort={handleSort} align="right" />
                <th className="px-4 py-2.5 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">Sell Rate</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">Days Left</th>
                <SortHeader label="Last Sold" field="lastSoldAt" currentSort={sortBy} currentDir={sortDir} onSort={handleSort} align="right" />
                <SortHeader label="Status" field="status" currentSort={sortBy} currentDir={sortDir} onSort={handleSort} />
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((row) => (
                <StockRow key={row.id} row={row} onReorder={handleReorder} reorderLoading={reorderLoading} />
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>

      {/* ── Footer ── */}
      <div className="border-t border-border bg-background px-6 py-2.5">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {viewMode === "product"
              ? `${productRows.length}${productSummary ? ` of ${productSummary.totalProducts.toLocaleString()}` : ""} product${productRows.length !== 1 ? "s" : ""} loaded`
              : `${rows.length}${summary ? ` of ${summary.totalSkus.toLocaleString()}` : ""} item${rows.length !== 1 ? "s" : ""} loaded`
            }
            {hasActiveFilters ? " (filtered)" : ""}
            {hasNextPage ? " — more available" : ""}
          </span>
          <div className="flex items-center gap-3">
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
            <span className="flex items-center gap-1 rounded bg-success/10 px-2 py-0.5 text-[10px] font-medium text-success">
              Live data — GET /inventory/stock-levels
            </span>
          </div>
        </div>
      </div>
    </div>

    {/* Success toast */}
    {successMsg && (
      <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-[13px] font-medium text-emerald-800 shadow-lg animate-in slide-in-from-bottom-2">
        {successMsg}
      </div>
    )}

    {/* Reorder modal */}
    {reorderModal && (
      <StockLevelReorderModal
        item={reorderModal.item}
        data={reorderModal.data}
        onDismiss={() => setReorderModal(null)}
        onAddToExisting={(po) => { setReorderModal(null); router.push(`/procurement/purchase-orders/${po.poNumber}`); }}
        onCreateNew={() => addToDraftPO(reorderModal.item.productId, reorderModal.item.productName, reorderModal.data.lastSupplier, reorderModal.data.suggestedQty)}
        onSnooze={(days) => handleSnooze(reorderModal.item.productId, days)}
      />
    )}
  </>);
}

/* ═══════════════════════════════════════════════════════
 * REORDER MODAL
 * ═══════════════════════════════════════════════════════ */

function StockLevelReorderModal({
  item,
  data,
  onDismiss,
  onAddToExisting,
  onCreateNew,
  onSnooze,
}: {
  item: { productId: string; productName: string };
  data: PendingOrdersData;
  onDismiss: () => void;
  onAddToExisting: (po: PendingOrdersData["draftPOs"][0]) => void;
  onCreateNew: () => void;
  onSnooze: (days: number) => void;
}) {
  const [showSnooze, setShowSnooze] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const handleAction = async (fn: () => Promise<void> | void) => {
    setActionLoading(true);
    try { await fn(); } catch { /* parent handles */ }
    setActionLoading(false);
  };

  return (
    <ModalShell title={`Reorder: ${item.productName}`} onClose={onDismiss} wide>
      <div className="space-y-2 mb-4">
        <p className="text-[12px] font-medium text-amber-600 flex items-center gap-1.5">
          <AlertTriangle size={13} />
          This item has pending orders:
        </p>
        {data.draftPOs.map((po) => (
          <div key={po.poId} className="flex justify-between text-[12px] bg-muted/50 p-2 rounded">
            <span>{po.poNumber} <span className="text-muted-foreground">(Draft)</span> — {po.quantity} units</span>
            <span className="text-muted-foreground">{po.supplierName}</span>
          </div>
        ))}
        {data.submittedPOs.map((po) => (
          <div key={po.poId} className="flex justify-between text-[12px] bg-blue-50 dark:bg-blue-950/20 p-2 rounded">
            <span>{po.poNumber} <span className="text-muted-foreground">({po.status})</span> — {po.quantityRemaining} remaining</span>
            <span className="text-muted-foreground">{po.supplierName}</span>
          </div>
        ))}
        {data.backorders.map((bo) => (
          <div key={bo.backorderId} className="flex justify-between text-[12px] bg-orange-50 dark:bg-orange-950/20 p-2 rounded">
            <span>Backorder{bo.sourcePoNumber ? ` from ${bo.sourcePoNumber}` : ""} — {bo.quantityOutstanding} pending</span>
            <span className="text-muted-foreground">{bo.supplierName}</span>
          </div>
        ))}
      </div>
      <div className="text-[12px] text-muted-foreground mb-5">
        Suggested reorder qty: <strong className="text-foreground">{data.suggestedQty}</strong>
      </div>
      <div className="flex items-center gap-2 justify-end flex-wrap">
        <button onClick={onDismiss} className="px-3 py-1.5 border border-border rounded-md text-[12px] font-medium hover:bg-muted transition-colors">
          Dismiss
        </button>
        <div className="relative">
          <button onClick={() => setShowSnooze(!showSnooze)} className="flex items-center gap-1 px-3 py-1.5 border border-border rounded-md text-[12px] font-medium hover:bg-muted transition-colors">
            Snooze <ChevronDown size={12} />
          </button>
          {showSnooze && (
            <div className="absolute bottom-full mb-1 right-0 bg-background border border-border rounded-md shadow-lg z-10 min-w-[100px]">
              {[7, 14, 30, 90].map((days) => (
                <button key={days} onClick={() => { setShowSnooze(false); onSnooze(days); }} className="block w-full px-3 py-1.5 text-[12px] text-left hover:bg-muted transition-colors first:rounded-t-md last:rounded-b-md">
                  {days} days
                </button>
              ))}
            </div>
          )}
        </div>
        {data.draftPOs.length > 0 && (
          <button onClick={() => onAddToExisting(data.draftPOs[0])} className="px-3 py-1.5 bg-blue-600 text-white rounded-md text-[12px] font-medium hover:bg-blue-700 transition-colors">
            View {data.draftPOs[0].poNumber}
          </button>
        )}
        <button onClick={() => handleAction(onCreateNew)} disabled={actionLoading} className="px-3 py-1.5 bg-emerald-600 text-white rounded-md text-[12px] font-medium hover:bg-emerald-700 transition-colors disabled:opacity-50">
          Create New PO
        </button>
      </div>
    </ModalShell>
  );
}

/* ═══════════════════════════════════════════════════════
 * SUMMARY STRIP
 * ═══════════════════════════════════════════════════════ */

function SummaryStrip({ summary }: { summary: StockLevelsSummary }) {
  return (
    <div className="border-b border-border bg-background px-6 py-3">
      <div className="flex items-center gap-5">
        <SummaryChip
          icon={<Package size={13} />}
          label="Total Items"
          value={summary.totalSkus.toLocaleString()}
          color="text-foreground"
        />
        <div className="h-5 w-px bg-border" />
        <SummaryChip
          icon={<Archive size={13} />}
          label="In Stock"
          value={summary.inStock.toLocaleString()}
          color="text-success"
        />
        <SummaryChip
          icon={<AlertTriangle size={13} />}
          label="Low Stock"
          value={summary.lowStock.toLocaleString()}
          color="text-warning"
          highlight={summary.lowStock > 0}
        />
        <SummaryChip
          icon={<PackageX size={13} />}
          label="Out of Stock"
          value={summary.outOfStock.toLocaleString()}
          color="text-destructive"
          highlight={summary.outOfStock > 0}
        />
        <div className="h-5 w-px bg-border" />
        <SummaryChip
          icon={<ShieldAlert size={13} />}
          label="Below Reorder"
          value={summary.belowReorder.toLocaleString()}
          color="text-warning"
          highlight={summary.belowReorder > 0}
        />
        <SummaryChip
          icon={<Package size={13} />}
          label="Reserved"
          value={summary.totalReserved.toLocaleString()}
          color="text-muted-foreground"
        />
        {summary.totalCostValue > 0 && (
          <>
            <div className="h-5 w-px bg-border" />
            <SummaryChip
              icon={<ShoppingCart size={13} />}
              label="Cost Value"
              value={`₱${summary.totalCostValue.toLocaleString("en-PH", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
              color="text-foreground"
            />
            <SummaryChip
              icon={<ShoppingCart size={13} />}
              label="Sell Value"
              value={`₱${summary.totalSellValue.toLocaleString("en-PH", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
              color="text-primary"
            />
            <SummaryChip
              icon={<ShoppingCart size={13} />}
              label="Potential Margin"
              value={`₱${(summary.totalSellValue - summary.totalCostValue).toLocaleString("en-PH", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
              color="text-success"
            />
          </>
        )}
      </div>
    </div>
  );
}

function SummaryChip({
  icon,
  label,
  value,
  color,
  highlight,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className={color}>{icon}</span>
      <div className="flex items-baseline gap-1.5">
        <span
          className={`text-sm font-semibold tabular-nums ${color} ${
            highlight ? "animate-pulse" : ""
          }`}
        >
          {value}
        </span>
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
 * TABLE ROW
 * ═══════════════════════════════════════════════════════ */

function StockRow({ row, onReorder, reorderLoading }: { row: StockLevelRow; onReorder: (productId: string, productName: string) => void; reorderLoading: string | null }) {
  const catLabel = row.category || "Uncategorized";
  const catStyle = "bg-muted text-muted-foreground";
  const statusLabel = STATUS_LABELS[row.status] ?? row.status;
  const statusStyle = STATUS_STYLES[row.status] ?? "bg-muted text-muted-foreground";

  const isLow = row.status === "LOW_STOCK";
  const isOut = row.status === "OUT_OF_STOCK";
  const unitSuffix = row.sellingUnit && row.sellingUnit !== "piece" ? ` ${row.sellingUnit}` : "";
  const daysLeft = row.daysOfStock != null ? Math.round(row.daysOfStock) : null;

  return (
    <tr className="group transition-colors hover:bg-muted/30">
      {/* Product */}
      <td className="min-w-[200px] px-4 py-2.5">
        <div className="flex items-center gap-1.5">
          <Link href={`/inventory?search=${encodeURIComponent(row.productSku)}`} className="whitespace-normal break-words text-sm font-medium text-foreground hover:underline">
            {row.productName}
          </Link>
          {row.pendingOrderCount > 0 && (
            <span className="shrink-0 rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">PO</span>
          )}
        </div>
        {row.familyName && (
          <div className="text-[10px] text-muted-foreground">{row.familyName}</div>
        )}
      </td>

      {/* SKU */}
      <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs text-muted-foreground">
        {row.productSku}
      </td>

      {/* Category Badge */}
      <td className="whitespace-nowrap px-4 py-2.5">
        <span className={`inline-flex rounded-md px-2 py-0.5 text-[11px] font-medium ${catStyle}`}>
          {catLabel}
        </span>
      </td>

      {/* Location */}
      <td className="whitespace-nowrap px-4 py-2.5 text-sm text-foreground">
        {row.locationName}
      </td>

      {/* On Hand */}
      <td className={`whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-sm ${isOut ? "font-semibold text-destructive" : isLow ? "font-medium text-warning" : "text-foreground"}`}>
        {row.stockLevel.toLocaleString()}{unitSuffix}
      </td>

      {/* Reserved */}
      <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-sm text-muted-foreground">
        {row.reservedLevel > 0 ? `${row.reservedLevel.toLocaleString()}${unitSuffix}` : "\u2014"}
      </td>

      {/* Available */}
      <td className={`whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-sm font-medium ${isOut ? "text-destructive" : isLow ? "text-warning" : "text-foreground"}`}>
        {row.available.toLocaleString()}{unitSuffix}
      </td>

      {/* Reorder Point */}
      <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-sm text-muted-foreground">
        {row.reorderPoint.toLocaleString()}{unitSuffix}
      </td>

      {/* Sell Rate */}
      <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-sm text-muted-foreground">
        {row.sold1m > 0 ? `${row.sold1m} /mo` : "\u2014"}
      </td>

      {/* Days Left */}
      <td className={cn(
        "whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-sm font-medium",
        daysLeft === null ? "text-muted-foreground/50" :
        daysLeft <= 7 ? "text-destructive" :
        daysLeft <= 14 ? "text-orange-500" :
        daysLeft <= 30 ? "text-amber-500" :
        "text-emerald-600",
      )}>
        {daysLeft === null ? "\u221E" : `${daysLeft}d`}
      </td>

      {/* Last Sold */}
      <td className="whitespace-nowrap px-4 py-2.5 text-right text-xs text-muted-foreground">
        {row.lastSoldAt ? timeAgo(row.lastSoldAt) : "\u2014"}
      </td>

      {/* Status Badge */}
      <td className="whitespace-nowrap px-4 py-2.5">
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${statusStyle}`}>
          {isOut && <PackageX size={11} />}
          {isLow && <AlertTriangle size={11} />}
          {statusLabel}
        </span>
      </td>

      {/* Reorder */}
      <td className="whitespace-nowrap px-4 py-2.5 text-right">
        {(isLow || isOut) && (
          <button
            onClick={() => onReorder(row.productId, row.productName)}
            disabled={reorderLoading === row.productId}
            className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
          >
            {reorderLoading === row.productId ? <Loader2 size={11} className="animate-spin" /> : <ShoppingCart size={11} />}
            Reorder
          </button>
        )}
      </td>
    </tr>
  );
}

/* ═══════════════════════════════════════════════════════
 * FILTER SELECT
 * ═══════════════════════════════════════════════════════ */

function FilterSelect({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 appearance-none rounded-md border border-border bg-background pl-2.5 pr-7 text-xs text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <ChevronDown
        size={12}
        className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
      />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
 * SORTABLE HEADER
 * ═══════════════════════════════════════════════════════ */

function SortHeader({
  label,
  field,
  currentSort,
  currentDir,
  onSort,
  align = "left",
}: {
  label: string;
  field: SortField;
  currentSort: SortField;
  currentDir: SortDir;
  onSort: (field: SortField) => void;
  align?: "left" | "right";
}) {
  const isActive = currentSort === field;
  return (
    <th
      scope="col"
      className={cn(
        "cursor-pointer select-none whitespace-nowrap px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground",
        align === "right" && "text-right",
        isActive && "text-foreground",
      )}
      onClick={() => onSort(field)}
    >
      <span className={cn("inline-flex items-center gap-1", align === "right" && "justify-end")}>
        {label}
        {isActive ? (
          currentDir === "asc" ? <ChevronUp size={12} /> : <ChevronDown size={12} />
        ) : (
          <ChevronsUpDown size={12} className="opacity-30" />
        )}
      </span>
    </th>
  );
}

/* ═══════════════════════════════════════════════════════
 * EMPTY STATE
 * ═══════════════════════════════════════════════════════ */

function EmptyState({ hasFilters }: { hasFilters: boolean }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 py-20 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted">
        <Warehouse size={24} className="text-muted-foreground" />
      </div>
      <div>
        <p className="text-sm font-medium text-foreground">
          {hasFilters ? "No items match your filters" : "No inventory tracked"}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {hasFilters
            ? "Try broadening your search criteria or clearing filters."
            : "Inventory records will appear here once stock is received."}
        </p>
      </div>
    </div>
  );
}
