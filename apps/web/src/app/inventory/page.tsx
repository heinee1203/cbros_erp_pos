"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import {
  Search,
  Plus,
  Upload,
  Download,
  AlertTriangle,
  Trash2,
  ArrowUpDown,
  X,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  ChevronRight,
  Loader2,
  Layers,
  Store,
  Minus,
  Check,
} from "lucide-react";
import {
  AdjustmentReasonCode,
  POSITIVE_ONLY_REASON_CODES,
  NEGATIVE_ONLY_REASON_CODES,
  RESTRICTED_REASON_CODES,
} from "@apex/types";
import { useAdjustmentMutation, type AdjustmentMutationStatus } from "@/hooks/use-adjustment-mutation";
import { useProducts, useCreateProduct, useProductFamilies, type ProductRow, type SortField, type SortDir } from "@/hooks/use-products";
import { useCategories } from "@/hooks/use-categories";
import { useSubcategories } from "@/hooks/use-subcategories";
import { useAuth } from "@/app/auth-context";
import { useProductLocations, useToggleAvailability } from "@/hooks/use-product-locations";
import { useConfirm } from "@/components/confirm-dialog";
import { cn } from "@/lib/utils";

/* ─────────────────────────────────────────────
 * Constants
 * ───────────────────────────────────────────── */

const CATEGORY_LABELS: Record<string, string> = {
  TIRES: "Tires",
  LUBRICANTS: "Lubricants",
  HARD_PARTS: "Hard Parts",
  ACCESSORIES: "Accessories",
  LABOR_SERVICES: "Services",
};

const CATEGORY_COLORS: Record<string, string> = {
  TIRES: "bg-blue-50/80 text-blue-600",
  LUBRICANTS: "bg-amber-50/80 text-amber-600",
  HARD_PARTS: "bg-slate-100/80 text-slate-600",
  ACCESSORIES: "bg-violet-50/80 text-violet-600",
  LABOR_SERVICES: "bg-emerald-50/80 text-emerald-600",
};

const PAGE_SIZES = [25, 50, 100] as const;
const DEFAULT_PAGE_SIZE = 50;

/* ─────────────────────────────────────────────
 * Helpers
 * ───────────────────────────────────────────── */
type StockStatus = "in-stock" | "low" | "out";

function getStockStatus(stockLevel: number, reorderPoint: number): StockStatus {
  if (stockLevel === 0) return "out";
  if (stockLevel <= reorderPoint) return "low";
  return "in-stock";
}

function getMarginPercent(sell: number, cost: number): { value: number; display: string } {
  if (sell === 0) return { value: 0, display: "\u2014" };
  const margin = ((sell - cost) / sell) * 100;
  return { value: margin, display: `${margin.toFixed(1)}%` };
}

function formatPrice(amount: number): string {
  return amount.toLocaleString("en-PH", { minimumFractionDigits: 2 });
}

/** Extract variant descriptor from product name by stripping the family prefix. */
function getVariantDescriptor(name: string, familyName: string | null): string {
  if (!familyName) return name;
  const descriptor = name.replace(familyName, "").trim();
  return descriptor || name;
}

/* ─────────────────────────────────────────────
 * Family Group Builder
 * ───────────────────────────────────────────── */

interface FamilyGroup {
  familyId: string;
  familyName: string;
  category: string;
  totalStock: number;
  worstStatus: StockStatus;
  children: ProductRow[];
}

type DisplayItem =
  | { type: "family"; group: FamilyGroup }
  | { type: "product"; product: ProductRow };

/**
 * Transform a flat product list into grouped display items.
 * Groups consecutive products with the same non-null familyId into FamilyGroups.
 * Products without a family are standalone display items.
 */
function buildDisplayItems(products: ProductRow[]): DisplayItem[] {
  const items: DisplayItem[] = [];
  let i = 0;

  while (i < products.length) {
    const p = products[i];

    if (p.familyId) {
      // Collect all consecutive products with same familyId
      const children: ProductRow[] = [p];
      let j = i + 1;
      while (j < products.length && products[j].familyId === p.familyId) {
        children.push(products[j]);
        j++;
      }

      const totalStock = children.reduce((sum, c) => sum + c.stockLevel, 0);
      const worstStatus = children.reduce<StockStatus>((worst, c) => {
        const s = getStockStatus(c.stockLevel, c.reorderPoint);
        if (s === "out") return "out";
        if (s === "low" && worst !== "out") return "low";
        return worst;
      }, "in-stock");

      items.push({
        type: "family",
        group: {
          familyId: p.familyId,
          familyName: p.familyName || p.name,
          category: p.category,
          totalStock,
          worstStatus,
          children,
        },
      });

      i = j;
    } else {
      items.push({ type: "product", product: p });
      i++;
    }
  }

  return items;
}

/* ─────────────────────────────────────────────
 * Sortable Column Header
 * ───────────────────────────────────────────── */
function SortableHeader({
  label,
  field,
  activeField,
  activeDir,
  onSort,
  align = "left",
}: {
  label: string;
  field: SortField;
  activeField: SortField;
  activeDir: SortDir;
  onSort: (field: SortField) => void;
  align?: "left" | "right";
}) {
  const isActive = field === activeField;

  return (
    <button
      onClick={() => onSort(field)}
      className={cn(
        "group inline-flex items-center gap-0.5 text-[10px] font-semibold uppercase tracking-wider transition-colors select-none",
        isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground",
        align === "right" && "flex-row-reverse",
      )}
    >
      {label}
      <span className="inline-flex w-3 justify-center">
        {isActive ? (
          activeDir === "asc" ? (
            <ChevronUp size={11} className="text-primary" strokeWidth={2.5} />
          ) : (
            <ChevronDown size={11} className="text-primary" strokeWidth={2.5} />
          )
        ) : (
          <ChevronsUpDown
            size={11}
            className="text-muted-foreground/30 group-hover:text-muted-foreground/60"
          />
        )}
      </span>
    </button>
  );
}

/* ─────────────────────────────────────────────
 * Page Root
 * ───────────────────────────────────────────── */
export default function InventoryPage() {
  const { token, locationId, user } = useAuth();

  const showFinancials = true;

  /* State */
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [familyFilter, setFamilyFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [subCategoryFilter, setSubCategoryFilter] = useState("");
  const [stockStatusFilter, setStockStatusFilter] = useState("");
  const [sortBy, setSortBy] = useState<SortField>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [showQuickAdd, setShowQuickAdd] = useState(false);

  /* Grouped mode — active when sort is "name" */
  const [groupedEnabled, setGroupedEnabled] = useState(true);
  const isGroupedMode = groupedEnabled && sortBy === "name";

  /* Expand/collapse state for family groups */
  const [expandedFamilies, setExpandedFamilies] = useState<Set<string>>(new Set());

  const toggleFamily = useCallback((familyId: string) => {
    setExpandedFamilies((prev) => {
      const next = new Set(prev);
      if (next.has(familyId)) next.delete(familyId);
      else next.add(familyId);
      return next;
    });
  }, []);

  /* Auto-expand families when search is active */
  const [autoExpandedForSearch, setAutoExpandedForSearch] = useState(false);
  useEffect(() => {
    if (debouncedSearch.length >= 2 && isGroupedMode) {
      // Auto-expand all families when searching
      setAutoExpandedForSearch(true);
    } else {
      setAutoExpandedForSearch(false);
    }
  }, [debouncedSearch, isGroupedMode]);

  /* Debounce search input */
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  /* Fetch product families for Group filter */
  const familiesQuery = useProductFamilies(token, locationId);
  const families = useMemo(() => {
    const fams = familiesQuery.data?.data ?? [];
    return [...fams].sort((a, b) => a.name.localeCompare(b.name));
  }, [familiesQuery.data]);

  /* Fetch categories for Category filter — cascaded by selected family */
  const categoriesQuery = useCategories(token, locationId);
  const filteredCategories = useMemo(() => {
    const cats = categoriesQuery.data?.data ?? [];
    const sorted = [...cats].sort((a, b) => a.name.localeCompare(b.name));
    if (!familyFilter) return sorted;
    return sorted.filter((c) => c.familyId === familyFilter);
  }, [categoriesQuery.data, familyFilter]);

  /* Fetch sub-categories for Sub-cat filter — cascaded by selected category */
  const subcategoriesQuery = useSubcategories(token, locationId, categoryFilter || undefined);
  const filteredSubcategories = useMemo(() => {
    const subs = subcategoriesQuery.data?.data ?? [];
    return [...subs].sort((a, b) => a.name.localeCompare(b.name));
  }, [subcategoriesQuery.data]);

  /* Reset page when filters / sort / location / pageSize change */
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, familyFilter, categoryFilter, subCategoryFilter, stockStatusFilter, sortBy, sortDir, locationId, pageSize, isGroupedMode]);

  /* Reset expanded families when leaving grouped mode or changing page */
  useEffect(() => {
    if (!isGroupedMode) setExpandedFamilies(new Set());
  }, [isGroupedMode]);

  /* Fetch real data */
  const { data, isLoading, isFetching } = useProducts(token, locationId, {
    search: debouncedSearch,
    familyId: familyFilter || undefined,
    subCategoryId: categoryFilter || undefined,
    subcategoryId: subCategoryFilter || undefined,
    stockStatus: stockStatusFilter,
    sortBy,
    sortDir,
    page,
    limit: pageSize,
    grouped: isGroupedMode,
  });

  const products = data?.data ?? [];
  const totalItems = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;
  const hasMore = data?.hasMore ?? false;

  /* Build display items for grouped mode */
  const displayItems = useMemo(() => {
    if (!isGroupedMode) return null;
    return buildDisplayItems(products);
  }, [products, isGroupedMode]);

  /* Sort toggle: asc -> desc -> reset to name asc */
  const handleSort = useCallback(
    (field: SortField) => {
      if (field === sortBy) {
        if (sortDir === "asc") {
          setSortDir("desc");
        } else {
          setSortBy("name");
          setSortDir("asc");
        }
      } else {
        setSortBy(field);
        setSortDir("asc");
      }
    },
    [sortBy, sortDir],
  );

  const hasActiveFilters =
    familyFilter !== "" || categoryFilter !== "" || subCategoryFilter !== "" || stockStatusFilter !== "" || searchQuery.trim() !== "";

  const clearAllFilters = useCallback(() => {
    setFamilyFilter("");
    setCategoryFilter("");
    setSubCategoryFilter("");
    setStockStatusFilter("");
    setSearchQuery("");
    setDebouncedSearch("");
  }, []);

  /* Bulk selection — only selects individual products (children), not parents */
  const selectableIds = useMemo(() => products.map((p) => p.id), [products]);
  const allOnPageSelected =
    selectableIds.length > 0 && selectableIds.every((id) => selectedIds.has(id));

  const toggleOne = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    setSelectedIds((prev) => {
      if (allOnPageSelected) {
        const next = new Set(prev);
        selectableIds.forEach((id) => next.delete(id));
        return next;
      } else {
        const next = new Set(prev);
        selectableIds.forEach((id) => next.add(id));
        return next;
      }
    });
  }, [allOnPageSelected, selectableIds]);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  /* Escape key cascade */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (showTransferModal) setShowTransferModal(false);
        else if (showAdjustModal) setShowAdjustModal(false);
        else if (selectedProductId) setSelectedProductId(null);
        else if (selectedIds.size > 0) clearSelection();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedProductId, showTransferModal, showAdjustModal, selectedIds.size, clearSelection]);

  /* Selected product for drawer */
  const selectedProduct = selectedProductId
    ? products.find((p) => p.id === selectedProductId) ?? null
    : null;

  /* Column count for colSpan calculations */
  const colCount = showFinancials ? 11 : 9;

  return (
    <div className="flex h-full flex-col">
      {/* -- Page Header -- */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div>
            <h2 className="text-lg font-semibold leading-tight">Item List</h2>
            <p className="text-[12px] text-muted-foreground">
              {totalItems > 0
                ? `${totalItems.toLocaleString()} items at current location`
                : isLoading
                  ? "Loading inventory\u2026"
                  : "No items found"}
            </p>
          </div>
          {isFetching && !isLoading && (
            <Loader2 size={14} className="animate-spin text-muted-foreground" />
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setGroupedEnabled((v) => !v)}
            title={groupedEnabled ? "Disable variant grouping" : "Enable variant grouping"}
            className={cn(
              "flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12px] font-medium shadow-[0_1px_2px_0_rgba(0,0,0,0.04)] transition-colors",
              groupedEnabled
                ? "border-primary/30 bg-primary/[0.06] text-primary hover:bg-primary/[0.1]"
                : "border-border bg-background text-muted-foreground hover:bg-muted",
            )}
          >
            <Layers size={13} />
            Group
          </button>
          <button className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-[12px] font-medium text-foreground shadow-[0_1px_2px_0_rgba(0,0,0,0.04)] transition-colors hover:bg-muted">
            <Upload size={13} />
            Import
          </button>
          <button className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-[12px] font-medium text-foreground shadow-[0_1px_2px_0_rgba(0,0,0,0.04)] transition-colors hover:bg-muted">
            <Download size={13} />
            Export
          </button>
          <button
            onClick={() => setShowQuickAdd(true)}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-[12px] font-medium text-primary-foreground shadow-sm transition-all hover:bg-primary/90 active:scale-[0.98]"
          >
            <Plus size={13} strokeWidth={2.5} />
            Add Item
          </button>
        </div>
      </div>

      {/* -- Filter Bar -- */}
      <div className="mb-2 flex items-center gap-2">
        <select
          value={familyFilter}
          onChange={(e) => {
            setFamilyFilter(e.target.value);
            setCategoryFilter("");
            setSubCategoryFilter("");
          }}
          className="h-8 rounded-lg border border-border bg-background px-2.5 pr-7 text-[12px] text-foreground shadow-[0_1px_2px_0_rgba(0,0,0,0.04)] outline-none transition-colors focus:border-primary/40 focus:ring-2 focus:ring-primary/[0.08]"
        >
          <option value="">All Groups</option>
          {families.map((f) => (
            <option key={f.id} value={f.id}>{f.name}</option>
          ))}
        </select>

        <select
          value={categoryFilter}
          onChange={(e) => {
            setCategoryFilter(e.target.value);
            setSubCategoryFilter("");
          }}
          className="h-8 rounded-lg border border-border bg-background px-2.5 pr-7 text-[12px] text-foreground shadow-[0_1px_2px_0_rgba(0,0,0,0.04)] outline-none transition-colors focus:border-primary/40 focus:ring-2 focus:ring-primary/[0.08]"
        >
          <option value="">All Categories</option>
          {filteredCategories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>

        <SearchableSelect
          value={subCategoryFilter}
          onChange={setSubCategoryFilter}
          options={filteredSubcategories.map((sc) => ({ value: sc.id, label: sc.name }))}
          placeholder="All Sub-categories"
        />

        <select
          value={stockStatusFilter}
          onChange={(e) => setStockStatusFilter(e.target.value)}
          className="h-8 rounded-lg border border-border bg-background px-2.5 pr-7 text-[12px] text-foreground shadow-[0_1px_2px_0_rgba(0,0,0,0.04)] outline-none transition-colors focus:border-primary/40 focus:ring-2 focus:ring-primary/[0.08]"
        >
          <option value="">All Stock</option>
          <option value="low">Low Stock</option>
          <option value="out">Out of Stock</option>
        </select>

        <div className="relative flex-1">
          <Search
            size={13}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search items..."
            className="h-8 w-full rounded-lg border border-border bg-background pl-8 pr-8 text-[12px] text-foreground shadow-[0_1px_2px_0_rgba(0,0,0,0.04)] outline-none placeholder:text-muted-foreground/50 transition-colors focus:border-primary/40 focus:ring-2 focus:ring-primary/[0.08]"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
            >
              <X size={11} />
            </button>
          )}
        </div>
      </div>

      {/* -- Active Filter Indicator -- */}
      {hasActiveFilters && (
        <div className="mb-1.5 flex items-center gap-2 text-[11px] text-muted-foreground">
          <span className="tabular-nums">
            {totalItems.toLocaleString()} result{totalItems !== 1 ? "s" : ""}
          </span>
          <span className="text-border">&middot;</span>
          <button
            onClick={clearAllFilters}
            className="font-medium text-primary hover:underline"
          >
            Clear filters
          </button>
        </div>
      )}

      {/* -- Bulk Action Bar -- */}
      {selectedIds.size > 0 && (
        <div className="mb-1.5 flex items-center gap-3 rounded-lg border border-primary/20 bg-primary/[0.04] px-3 py-1.5 animate-in fade-in slide-in-from-top-1 duration-150">
          <span className="text-[12px] font-medium text-foreground">
            {selectedIds.size} selected
          </span>
          <div className="h-3.5 w-px bg-border" />
          <button className="flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium text-destructive hover:bg-destructive/10 transition-colors">
            <Trash2 size={12} />
            Delete
          </button>
          <button className="flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium text-foreground hover:bg-muted transition-colors">
            <Download size={12} />
            Export
          </button>
          <button className="flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium text-foreground hover:bg-muted transition-colors">
            <ArrowUpDown size={12} />
            Adjust
          </button>
          <div className="flex-1" />
          <button
            onClick={clearSelection}
            className="text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            Clear
          </button>
        </div>
      )}

      {/* -- Data Table -- */}
      {isLoading ? (
        <div className="flex flex-1 items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <Loader2 size={24} className="animate-spin text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Loading inventory&hellip;</span>
          </div>
        </div>
      ) : products.length === 0 ? (
        <EmptyState query={searchQuery} hasFilters={hasActiveFilters} onClearFilters={clearAllFilters} />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border">
          <div className="flex-1 overflow-auto">
            <table className="w-full text-[12px]">
              <thead className="sticky top-0 z-10 border-b border-border bg-muted/90 backdrop-blur-sm">
                <tr>
                  <th scope="col" className="w-9 px-2 py-[7px] text-center">
                    <input
                      type="checkbox"
                      checked={allOnPageSelected}
                      onChange={toggleAll}
                      className="h-3.5 w-3.5 rounded border-border accent-primary cursor-pointer"
                    />
                  </th>
                  <th scope="col" className="min-w-[240px] px-3 py-[7px] text-left">
                    <SortableHeader label="Item Name" field="name" activeField={sortBy} activeDir={sortDir} onSort={handleSort} />
                  </th>
                  <th scope="col" className="w-[110px] px-3 py-[7px] text-left">
                    <SortableHeader label="SKU" field="sku" activeField={sortBy} activeDir={sortDir} onSort={handleSort} />
                  </th>
                  <th scope="col" className="w-[120px] px-3 py-[7px] text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Group
                  </th>
                  <th scope="col" className="w-[130px] px-3 py-[7px] text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Category
                  </th>
                  <th scope="col" className="w-[120px] px-3 py-[7px] text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Sub-cat
                  </th>
                  <th scope="col" className="w-[95px] px-3 py-[7px] text-right">
                    <SortableHeader label="Sell" field="unitPrice" activeField={sortBy} activeDir={sortDir} onSort={handleSort} align="right" />
                  </th>
                  {showFinancials && (
                    <>
                      <th scope="col" className="w-[90px] px-3 py-[7px] text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Cost
                      </th>
                      <th scope="col" className="w-[60px] px-3 py-[7px] text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Margin
                      </th>
                    </>
                  )}
                  <th scope="col" className="w-[90px] px-3 py-[7px] text-right">
                    <SortableHeader label="In Stock" field="stockLevel" activeField={sortBy} activeDir={sortDir} onSort={handleSort} align="right" />
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {isGroupedMode && displayItems
                  ? displayItems.map((item) => {
                      if (item.type === "family") {
                        return (
                          <FamilyRows
                            key={item.group.familyId}
                            group={item.group}
                            isExpanded={autoExpandedForSearch || expandedFamilies.has(item.group.familyId)}
                            onToggle={() => toggleFamily(item.group.familyId)}
                            showFinancials={showFinancials}
                            selectedIds={selectedIds}
                            onToggleSelect={toggleOne}
                            onSelectProduct={setSelectedProductId}
                            searchQuery={debouncedSearch}
                          />
                        );
                      }
                      return (
                        <FlatProductRow
                          key={item.product.id}
                          product={item.product}
                          showFinancials={showFinancials}
                          isSelected={selectedIds.has(item.product.id)}
                          onToggleSelect={() => toggleOne(item.product.id)}
                          onSelectProduct={() => setSelectedProductId(item.product.id)}
                        />
                      );
                    })
                  : products.map((p) => (
                      <FlatProductRow
                        key={p.id}
                        product={p}
                        showFinancials={showFinancials}
                        isSelected={selectedIds.has(p.id)}
                        onToggleSelect={() => toggleOne(p.id)}
                        onSelectProduct={() => setSelectedProductId(p.id)}
                      />
                    ))
                }
              </tbody>
            </table>
          </div>

          {/* -- Pagination Footer -- */}
          <div className="flex shrink-0 items-center justify-between border-t border-border bg-muted/40 px-3 py-1.5">
            <span className="text-[11px] text-muted-foreground tabular-nums">
              Showing{" "}
              {((page - 1) * pageSize + 1).toLocaleString()}&ndash;{Math.min(page * pageSize, totalItems).toLocaleString()}{" "}
              of {totalItems.toLocaleString()}
              {isGroupedMode && <span className="ml-1 text-muted-foreground/60">(grouped)</span>}
            </span>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-muted-foreground">Rows</span>
                <select
                  value={pageSize}
                  onChange={(e) => setPageSize(Number(e.target.value))}
                  className="h-6 rounded border border-border bg-background px-1.5 text-[11px] tabular-nums text-foreground outline-none"
                >
                  {PAGE_SIZES.map((size) => (
                    <option key={size} value={size}>{size}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-1">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="rounded border border-border bg-background px-2 py-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Prev
                </button>
                <span className="min-w-[4.5rem] text-center text-[11px] tabular-nums text-muted-foreground">
                  {page.toLocaleString()} / {totalPages.toLocaleString()}
                </span>
                <button
                  disabled={!hasMore}
                  onClick={() => setPage((p) => p + 1)}
                  className="rounded border border-border bg-background px-2 py-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* -- Detail Drawer -- */}
      {selectedProduct && (
        <DetailDrawer
          product={selectedProduct}
          showFinancials={showFinancials}
          onClose={() => setSelectedProductId(null)}
          onTransfer={() => setShowTransferModal(true)}
          onAdjust={() => setShowAdjustModal(true)}
        />
      )}

      {showTransferModal && <TransferModal onClose={() => setShowTransferModal(false)} />}
      {showAdjustModal && selectedProductId && (
        <AdjustModal productId={selectedProductId} locationId={locationId} token={token} onClose={() => setShowAdjustModal(false)} />
      )}

      {showQuickAdd && (
        <QuickAddDrawer
          token={token}
          locationId={locationId}
          userRole={user?.role ?? ""}
          onClose={() => setShowQuickAdd(false)}
        />
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────
 * Family Parent + Child Rows
 * ───────────────────────────────────────────── */
function FamilyRows({
  group,
  isExpanded,
  onToggle,
  showFinancials,
  selectedIds,
  onToggleSelect,
  onSelectProduct,
  searchQuery,
}: {
  group: FamilyGroup;
  isExpanded: boolean;
  onToggle: () => void;
  showFinancials: boolean;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onSelectProduct: (id: string) => void;
  searchQuery: string;
}) {
  const colCount = showFinancials ? 11 : 9;
  const allChildrenSelected = group.children.every((c) => selectedIds.has(c.id));
  const someChildrenSelected = group.children.some((c) => selectedIds.has(c.id));

  const toggleAllChildren = useCallback(() => {
    if (allChildrenSelected) {
      group.children.forEach((c) => onToggleSelect(c.id));
    } else {
      group.children.forEach((c) => {
        if (!selectedIds.has(c.id)) onToggleSelect(c.id);
      });
    }
  }, [allChildrenSelected, group.children, selectedIds, onToggleSelect]);

  return (
    <>
      {/* ── Parent Row ── */}
      <tr
        onClick={onToggle}
        className="cursor-pointer bg-muted/30 hover:bg-muted/50 transition-colors duration-75"
      >
        <td className="w-9 px-2 py-[6px] text-center" onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={allChildrenSelected}
            ref={(el) => { if (el) el.indeterminate = someChildrenSelected && !allChildrenSelected; }}
            onChange={toggleAllChildren}
            className="h-3.5 w-3.5 rounded border-border accent-primary cursor-pointer"
          />
        </td>
        <td className="px-3 py-[6px]">
          <div className="flex items-center gap-2">
            <ChevronRight
              size={14}
              className={cn(
                "shrink-0 text-muted-foreground transition-transform duration-150",
                isExpanded && "rotate-90",
              )}
            />
            <span className="font-semibold text-[12px] text-foreground">
              {group.familyName}
            </span>
            <span className="rounded-full bg-muted px-1.5 py-px text-[10px] font-medium text-muted-foreground tabular-nums">
              {group.children.length} variant{group.children.length !== 1 ? "s" : ""}
            </span>
          </div>
        </td>
        <td className="px-3 py-[6px] text-[11px] text-muted-foreground/50">
          {/* No SKU for parent — it's a group header */}
        </td>
        <td className="px-3 py-[6px]">
          <span className="text-[11px] text-muted-foreground truncate block max-w-[110px]" title={group.familyName}>
            {group.familyName}
          </span>
        </td>
        <td className="px-3 py-[6px] text-[11px] text-muted-foreground/50">
          {/* Category varies across children */}
        </td>
        <td className="px-3 py-[6px] text-[11px] text-muted-foreground/50">
          {/* Sub-cat varies across children */}
        </td>
        <td className="px-3 py-[6px] text-right text-[11px] text-muted-foreground/50">
          {/* Price varies across children — don't show on parent */}
        </td>
        {showFinancials && (
          <>
            <td className="px-3 py-[6px]" />
            <td className="px-3 py-[6px]" />
          </>
        )}
        <td className="px-3 py-[6px] text-right">
          <span className={cn(
            "tabular-nums font-medium text-[11px]",
            group.worstStatus === "out"
              ? "text-destructive"
              : group.worstStatus === "low"
                ? "text-warning"
                : "text-muted-foreground",
          )}>
            {group.totalStock.toLocaleString()}
          </span>
          <span className="ml-1 text-[10px] text-muted-foreground/50">total</span>
        </td>
      </tr>

      {/* ── Child Rows ── */}
      {isExpanded &&
        group.children.map((child) => {
          const sell = parseFloat(child.unitPrice) || 0;
          const cost = parseFloat(child.costPrice) || 0;
          const margin = getMarginPercent(sell, cost);
          const status = getStockStatus(child.stockLevel, child.reorderPoint);
          const isSelected = selectedIds.has(child.id);
          const descriptor = getVariantDescriptor(child.name, child.familyName);
          const isSearchMatch =
            searchQuery.length >= 2 &&
            (child.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
              child.sku.toLowerCase().includes(searchQuery.toLowerCase()));

          return (
            <tr
              key={child.id}
              onClick={() => onSelectProduct(child.id)}
              className={cn(
                "cursor-pointer transition-colors duration-75 border-l-2",
                isSelected
                  ? "bg-primary/[0.05] border-l-primary/40"
                  : isSearchMatch
                    ? "bg-primary/[0.03] border-l-primary/30 hover:bg-primary/[0.06]"
                    : "bg-background border-l-border/40 hover:bg-accent/50",
              )}
            >
              <td className="w-9 px-2 py-[4px] text-center" onClick={(e) => e.stopPropagation()}>
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => onToggleSelect(child.id)}
                  className="h-3.5 w-3.5 rounded border-border accent-primary cursor-pointer"
                />
              </td>
              <td className="py-[4px] pl-10 pr-3">
                <span className="block truncate text-[12px] font-medium leading-snug text-foreground">
                  {descriptor}
                </span>
              </td>
              <td className="px-3 py-[4px] font-mono text-[11px] tracking-tight text-muted-foreground">
                {child.sku}
              </td>
              <td className="px-3 py-[4px]">
                {/* Group shown on parent — skip on child for cleanliness */}
              </td>
              <td className="px-3 py-[4px]">
                {child.subCategoryName ? (
                  <span className="text-[11px] text-muted-foreground truncate block max-w-[120px]" title={child.subCategoryName}>{child.subCategoryName}</span>
                ) : (
                  <span className={cn(
                    "inline-block rounded px-1.5 py-px text-[10px] font-medium leading-normal",
                    CATEGORY_COLORS[child.category] ?? "bg-muted text-muted-foreground",
                  )}>
                    {CATEGORY_LABELS[child.category] ?? child.category.replace(/_/g, " ")}
                  </span>
                )}
              </td>
              <td className="px-3 py-[4px]">
                {child.subcategoryName ? (
                  <span className="text-[11px] text-muted-foreground truncate block max-w-[110px]" title={child.subcategoryName}>{child.subcategoryName}</span>
                ) : (
                  <span className="text-[11px] text-muted-foreground/40">{"\u2014"}</span>
                )}
              </td>
              <td className="px-3 py-[4px] text-right font-medium tabular-nums text-foreground">
                {child.isVariablePrice ? (
                  <span className="inline-block rounded px-1.5 py-px text-[10px] font-medium leading-normal bg-amber-50/80 text-amber-600">Variable</span>
                ) : (
                  formatPrice(sell)
                )}
              </td>
              {showFinancials && (
                <>
                  <td className="px-3 py-[4px] text-right tabular-nums text-muted-foreground">
                    {cost > 0 ? formatPrice(cost) : "\u2014"}
                  </td>
                  <td className={cn(
                    "px-3 py-[4px] text-right font-medium tabular-nums",
                    margin.value > 0 && margin.value < 20
                      ? "text-destructive"
                      : "text-muted-foreground",
                  )}>
                    {margin.display}
                  </td>
                </>
              )}
              <td className="px-3 py-[4px] text-right">
                <span className={cn(
                  "tabular-nums font-medium",
                  status === "out"
                    ? "text-destructive"
                    : status === "low"
                      ? "text-warning"
                      : "text-foreground",
                )}>
                  {child.stockLevel.toLocaleString()}
                </span>
                {status !== "in-stock" && (
                  <AlertTriangle
                    size={11}
                    className={cn(
                      "ml-1 inline-block -translate-y-px",
                      status === "out" ? "text-destructive" : "text-warning/70",
                    )}
                  />
                )}
              </td>
            </tr>
          );
        })}
    </>
  );
}

/* ─────────────────────────────────────────────
 * Flat Product Row (standalone or ungrouped mode)
 * ───────────────────────────────────────────── */
function FlatProductRow({
  product: p,
  showFinancials,
  isSelected,
  onToggleSelect,
  onSelectProduct,
}: {
  product: ProductRow;
  showFinancials: boolean;
  isSelected: boolean;
  onToggleSelect: () => void;
  onSelectProduct: () => void;
}) {
  const sell = parseFloat(p.unitPrice) || 0;
  const cost = parseFloat(p.costPrice) || 0;
  const margin = getMarginPercent(sell, cost);
  const status = getStockStatus(p.stockLevel, p.reorderPoint);

  return (
    <tr
      onClick={onSelectProduct}
      className={cn(
        "cursor-pointer transition-colors duration-75",
        isSelected
          ? "bg-primary/[0.05]"
          : "hover:bg-accent/70",
      )}
    >
      <td className="w-9 px-2 py-[5px] text-center" onClick={(e) => e.stopPropagation()}>
        <input type="checkbox" checked={isSelected} onChange={onToggleSelect} className="h-3.5 w-3.5 rounded border-border accent-primary cursor-pointer" />
      </td>
      <td className="px-3 py-[5px]">
        <span className="block truncate text-[12px] font-medium leading-snug text-foreground">{p.name}</span>
      </td>
      <td className="px-3 py-[5px] font-mono text-[11px] tracking-tight text-muted-foreground">
        {p.sku}
      </td>
      <td className="px-3 py-[5px]">
        {p.familyName ? (
          <span className="text-[11px] text-muted-foreground truncate block max-w-[110px]" title={p.familyName}>{p.familyName}</span>
        ) : (
          <span className="text-[11px] text-muted-foreground/40">{"\u2014"}</span>
        )}
      </td>
      <td className="px-3 py-[5px]">
        {p.subCategoryName ? (
          <span className="text-[11px] text-muted-foreground truncate block max-w-[120px]" title={p.subCategoryName}>{p.subCategoryName}</span>
        ) : (
          <span className={cn(
            "inline-block rounded px-1.5 py-px text-[10px] font-medium leading-normal",
            CATEGORY_COLORS[p.category] ?? "bg-muted text-muted-foreground",
          )}>
            {CATEGORY_LABELS[p.category] ?? p.category.replace(/_/g, " ")}
          </span>
        )}
      </td>
      <td className="px-3 py-[5px]">
        {p.subcategoryName ? (
          <span className="text-[11px] text-muted-foreground truncate block max-w-[110px]" title={p.subcategoryName}>{p.subcategoryName}</span>
        ) : (
          <span className="text-[11px] text-muted-foreground/40">{"\u2014"}</span>
        )}
      </td>
      <td className="px-3 py-[5px] text-right font-medium tabular-nums text-foreground">
        {p.isVariablePrice ? (
          <span className="inline-block rounded px-1.5 py-px text-[10px] font-medium leading-normal bg-amber-50/80 text-amber-600">Variable</span>
        ) : (
          formatPrice(sell)
        )}
      </td>
      {showFinancials && (
        <>
          <td className="px-3 py-[5px] text-right tabular-nums text-muted-foreground">
            {cost > 0 ? formatPrice(cost) : "\u2014"}
          </td>
          <td className={cn(
            "px-3 py-[5px] text-right font-medium tabular-nums",
            margin.value > 0 && margin.value < 20
              ? "text-destructive"
              : "text-muted-foreground",
          )}>
            {margin.display}
          </td>
        </>
      )}
      <td className="px-3 py-[5px] text-right">
        <span className={cn(
          "tabular-nums font-medium",
          status === "out"
            ? "text-destructive"
            : status === "low"
              ? "text-warning"
              : "text-foreground",
        )}>
          {p.stockLevel.toLocaleString()}
        </span>
        {status !== "in-stock" && (
          <AlertTriangle
            size={11}
            className={cn(
              "ml-1 inline-block -translate-y-px",
              status === "out" ? "text-destructive" : "text-warning/70",
            )}
          />
        )}
      </td>
    </tr>
  );
}

/* ─────────────────────────────────────────────
 * Empty State
 * ───────────────────────────────────────────── */
function EmptyState({ query, hasFilters, onClearFilters }: { query: string; hasFilters: boolean; onClearFilters: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center rounded-lg border border-dashed border-border py-16 text-center">
      <svg className="mb-3 h-10 w-10 text-muted-foreground/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
      <p className="text-sm font-medium text-muted-foreground">No items found</p>
      {query.trim() && <p className="mt-1 text-xs text-muted-foreground/70">No items match &ldquo;{query.trim()}&rdquo;</p>}
      {hasFilters && <button onClick={onClearFilters} className="mt-3 text-xs font-medium text-primary hover:underline">Clear all filters</button>}
    </div>
  );
}

/* ─────────────────────────────────────────────
 * Detail Drawer
 * ───────────────────────────────────────────── */
function DetailDrawer({
  product,
  showFinancials,
  onClose,
  onTransfer,
  onAdjust,
}: {
  product: ProductRow;
  showFinancials: boolean;
  onClose: () => void;
  onTransfer: () => void;
  onAdjust: () => void;
}) {
  const sell = parseFloat(product.unitPrice) || 0;
  const cost = parseFloat(product.costPrice) || 0;
  const { token, locationId } = useAuth();
  const confirm = useConfirm();

  // ── Stores / availability ──
  const { data: locData, isLoading: locLoading } = useProductLocations(token, locationId, product.id);
  const toggleMutation = useToggleAvailability(token, locationId);
  const locationRows = locData?.data ?? [];

  // ── Batch save: local state tracking ──
  const [originalAvailability, setOriginalAvailability] = useState<Record<string, boolean>>({});
  const [localAvailability, setLocalAvailability] = useState<Record<string, boolean>>({});
  const [isSaving, setIsSaving] = useState(false);

  // Build a stable fingerprint from location data to detect real changes
  const locFingerprint = useMemo(
    () => locationRows.map((r) => `${r.locationId}:${r.availableForSale}`).join(","),
    [locationRows],
  );

  // Sync local state when server data loads (keyed on stable fingerprint)
  useEffect(() => {
    if (locationRows.length === 0) return;
    const map: Record<string, boolean> = {};
    for (const row of locationRows) {
      map[row.locationId] = row.availableForSale;
    }
    setOriginalAvailability(map);
    setLocalAvailability(map);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locFingerprint]);

  // Dirty check
  const isDirty = useMemo(() => {
    return Object.keys(localAvailability).some(
      (locId) => localAvailability[locId] !== originalAvailability[locId],
    );
  }, [localAvailability, originalAvailability]);

  // Derived checkbox states from local state
  const allChecked = locationRows.length > 0 && locationRows.every((r) => localAvailability[r.locationId]);
  const noneChecked = locationRows.length > 0 && locationRows.every((r) => !localAvailability[r.locationId]);
  const isMasterIndeterminate = !allChecked && !noneChecked;

  // Toggle updates local state only
  const handleToggle = useCallback((locId: string) => {
    setLocalAvailability((prev) => ({ ...prev, [locId]: !prev[locId] }));
  }, []);

  const handleMasterToggle = useCallback(() => {
    const newValue = !allChecked;
    setLocalAvailability((prev) => {
      const next = { ...prev };
      for (const key of Object.keys(next)) next[key] = newValue;
      return next;
    });
  }, [allChecked]);

  // Save — single batch PATCH with only the diff
  const handleSave = useCallback(async () => {
    const updates = Object.entries(localAvailability)
      .filter(([locId, val]) => val !== originalAvailability[locId])
      .map(([lid, availableForSale]) => ({ locationId: lid, availableForSale }));
    if (updates.length === 0) return;

    setIsSaving(true);
    try {
      await toggleMutation.mutateAsync({ productId: product.id, updates });
      setOriginalAvailability({ ...localAvailability });
    } finally {
      setIsSaving(false);
    }
  }, [localAvailability, originalAvailability, toggleMutation, product.id]);

  // Discard — revert to original
  const handleDiscard = useCallback(() => {
    setLocalAvailability({ ...originalAvailability });
  }, [originalAvailability]);

  // Close with unsaved changes warning
  const handleClose = useCallback(async () => {
    if (isDirty) {
      const confirmed = await confirm({
        title: "Unsaved Changes",
        message: "You have unsaved availability changes. Discard them?",
        confirmLabel: "Discard",
        cancelLabel: "Keep Editing",
        variant: "warning",
      });
      if (!confirmed) return;
      handleDiscard();
    }
    onClose();
  }, [isDirty, confirm, handleDiscard, onClose]);

  return (
    <>
      <div className="fixed inset-0 z-40 bg-foreground/20 backdrop-blur-[2px] transition-opacity" onClick={handleClose} />
      <div className="fixed inset-y-0 right-0 z-50 w-[400px] max-w-full border-l border-border bg-background shadow-2xl animate-in slide-in-from-right duration-200">
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between border-b border-border px-5 py-3">
            <h3 className="text-sm font-semibold">Item Details</h3>
            <button onClick={handleClose} className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="Close drawer"><X size={16} /></button>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-4">
            {/* Identifiers */}
            <div className="mb-4 flex items-center gap-2">
              <span className="rounded-md bg-primary/10 px-2.5 py-1 font-mono text-sm font-black tracking-[0.15em] text-primary">
                {product.mnemonicSku}
              </span>
              <span className={cn(
                "rounded px-1.5 py-px text-[10px] font-medium",
                CATEGORY_COLORS[product.category] ?? "bg-muted text-muted-foreground",
              )}>
                {CATEGORY_LABELS[product.category] ?? product.category.replace(/_/g, " ")}
              </span>
            </div>

            {/* Group badge */}
            {product.familyName && (
              <div className="mb-3 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Layers size={12} />
                <span>Group: <span className="font-medium text-foreground">{product.familyName}</span></span>
              </div>
            )}

            {/* Category badge */}
            {product.subCategoryName && (
              <div className="mb-3 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <span className="inline-block h-3 w-3 rounded bg-muted" />
                <span>Category: <span className="font-medium text-foreground">{product.subCategoryName}</span></span>
              </div>
            )}

            {/* Sub-category badge */}
            {product.subcategoryName && (
              <div className="mb-3 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <span className="inline-block h-3 w-3 rounded bg-muted/60" />
                <span>Sub-category: <span className="font-medium text-foreground">{product.subcategoryName}</span></span>
              </div>
            )}

            {/* Information */}
            <section className="mb-5">
              <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Information</h4>
              <div className="space-y-1.5 text-sm">
                <InfoRow label="Name" value={product.name} />
                <InfoRow label="SKU" value={product.sku} mono />
                {product.barcode && <InfoRow label="Barcode" value={product.barcode} mono />}
                <InfoRow label="Sell Price" value={product.isVariablePrice ? "Variable" : `\u20B1 ${formatPrice(sell)}`} />
                {showFinancials && (
                  <>
                    <InfoRow label="Cost" value={cost > 0 ? `\u20B1 ${formatPrice(cost)}` : "\u2014"} />
                    <InfoRow label="Margin" value={getMarginPercent(sell, cost).display} />
                  </>
                )}
              </div>
            </section>

            {/* Stock */}
            <section className="mb-5">
              <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Stock</h4>
              <div className="space-y-1.5 text-sm">
                <InfoRow label="In Stock" value={product.stockLevel.toLocaleString()} />
                <InfoRow label="Reorder Point" value={product.reorderPoint.toLocaleString()} />
                <InfoRow
                  label="Status"
                  value={
                    product.stockLevel === 0
                      ? "Out of Stock"
                      : product.stockLevel <= product.reorderPoint
                        ? "Low Stock"
                        : "In Stock"
                  }
                  statusColor={
                    product.stockLevel === 0
                      ? "text-destructive"
                      : product.stockLevel <= product.reorderPoint
                        ? "text-warning"
                        : "text-success"
                  }
                />
              </div>
            </section>

            {/* Stores — per-location availability */}
            <section className="mb-5">
              <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                <Store size={10} className="mb-px mr-1 inline" />
                Stores
              </h4>

              {locLoading ? (
                <div className="flex items-center gap-2 py-3 text-xs text-muted-foreground">
                  <Loader2 size={14} className="animate-spin" /> Loading locations…
                </div>
              ) : locationRows.length === 0 ? (
                <p className="py-2 text-xs text-muted-foreground">No locations found.</p>
              ) : (
                <div className="space-y-0">
                  {/* Master toggle */}
                  <label className="flex cursor-pointer items-center gap-2.5 rounded-md px-1 py-1.5 hover:bg-accent/50">
                    <span
                      role="checkbox"
                      aria-checked={allChecked ? "true" : isMasterIndeterminate ? "mixed" : "false"}
                      onClick={handleMasterToggle}
                      className={cn(
                        "flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
                        allChecked
                          ? "border-primary bg-primary text-primary-foreground"
                          : isMasterIndeterminate
                            ? "border-primary bg-primary/20 text-primary"
                            : "border-muted-foreground/40",
                      )}
                    >
                      {allChecked && <Check size={12} strokeWidth={3} />}
                      {isMasterIndeterminate && <Minus size={12} strokeWidth={3} />}
                    </span>
                    <span className="text-xs font-medium">Available for sale in all stores</span>
                  </label>

                  {/* Header row */}
                  <div className="mt-1 grid grid-cols-[20px_1fr_60px_60px] items-center gap-x-2 px-1 pb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
                    <span />
                    <span>Store</span>
                    <span className="text-right">Stock</span>
                    <span className="text-right">Reorder</span>
                  </div>

                  {/* Per-location rows */}
                  {locationRows.map((row) => {
                    const isChecked = localAvailability[row.locationId] ?? row.availableForSale;
                    const isChanged = localAvailability[row.locationId] !== originalAvailability[row.locationId];
                    return (
                      <label
                        key={row.locationId}
                        className={cn(
                          "grid cursor-pointer grid-cols-[20px_1fr_60px_60px] items-center gap-x-2 rounded-md px-1 py-1 hover:bg-accent/50",
                          isChanged && "bg-amber-50 ring-1 ring-amber-200 dark:bg-amber-950/30 dark:ring-amber-800",
                        )}
                      >
                        <span
                          role="checkbox"
                          aria-checked={isChecked}
                          onClick={() => handleToggle(row.locationId)}
                          className={cn(
                            "flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
                            isChecked
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-muted-foreground/40",
                          )}
                        >
                          {isChecked && <Check size={12} strokeWidth={3} />}
                        </span>
                        <span className="truncate text-xs">{row.locationName}</span>
                        <span className="text-right font-mono text-xs tabular-nums">{row.stockLevel}</span>
                        <span className="text-right font-mono text-xs tabular-nums text-muted-foreground">{row.reorderPoint}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </section>
          </div>

          {/* Sticky save bar — shown when availability has unsaved changes */}
          {isDirty && (
            <div className="flex items-center justify-between gap-3 border-t border-border bg-background px-4 py-3 shadow-[0_-2px_8px_rgba(0,0,0,0.06)]">
              <span className="text-xs text-muted-foreground">Unsaved changes</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleDiscard}
                  className="rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted"
                >
                  Discard
                </button>
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="rounded-lg bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  {isSaving ? "Saving\u2026" : "Save Changes"}
                </button>
              </div>
            </div>
          )}

          <div className="flex gap-2 border-t border-border p-4">
            <button onClick={onTransfer} className="flex-1 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">Transfer Stock</button>
            <button onClick={onAdjust} className="flex-1 rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-accent">Adjust Stock</button>
          </div>
        </div>
      </div>
    </>
  );
}

/* ─────────────────────────────────────────────
 * Transfer Modal
 * ───────────────────────────────────────────── */
function TransferModal({ onClose }: { onClose: () => void }) {
  const { locations, locationId } = useAuth();
  const currentLoc = locations.find((l) => l.id === locationId);
  const otherLocations = locations.filter((l) => l.id !== locationId);
  const [destination, setDestination] = useState("");
  const [quantity, setQuantity] = useState("");
  const [notes, setNotes] = useState("");
  const isValid = destination.trim() !== "" && Number(quantity) >= 1;
  const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); if (!isValid) return; onClose(); };

  return (
    <ModalShell title="Transfer Stock" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Source Location</label>
          <div className="rounded-md border border-border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">{currentLoc?.name ?? "Current Location"}</div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-foreground">Destination Location <span className="text-destructive">*</span></label>
          <select value={destination} onChange={(e) => setDestination(e.target.value)} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/20" required>
            <option value="">Select destination...</option>
            {otherLocations.map((loc) => <option key={loc.id} value={loc.id}>{loc.name}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-foreground">Quantity <span className="text-destructive">*</span></label>
          <input type="number" min="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="Enter quantity to transfer" className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/20" required />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Notes</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional transfer notes..." rows={2} className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/20" />
        </div>
        <div className="flex gap-2 pt-2">
          <button type="submit" disabled={!isValid} className="flex-1 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40">Confirm Transfer</button>
          <button type="button" onClick={onClose} className="flex-1 rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-accent">Cancel</button>
        </div>
      </form>
    </ModalShell>
  );
}

/* ─────────────────────────────────────────────
 * Adjust Modal
 * ───────────────────────────────────────────── */
function AdjustModal({ productId, locationId, token, onClose }: { productId: string; locationId: string; token: string; onClose: () => void }) {
  const { locations } = useAuth();
  const currentLoc = locations.find((l) => l.id === locationId);
  const [direction, setDirection] = useState<"IN" | "OUT" | "">("");
  const [quantity, setQuantity] = useState("");
  const [reasonCode, setReasonCode] = useState("");
  const [notes, setNotes] = useState("");
  const { submit, status, statusMessage, isSubmitting, result, reset } = useAdjustmentMutation(token, locationId);

  const availableReasonCodes = useMemo(() => {
    if (direction === "IN") return [...POSITIVE_ONLY_REASON_CODES, AdjustmentReasonCode.DATA_CORRECTION];
    if (direction === "OUT") return [...NEGATIVE_ONLY_REASON_CODES, AdjustmentReasonCode.DATA_CORRECTION];
    return [];
  }, [direction]);

  useEffect(() => { setReasonCode(""); }, [direction]);

  const notesRequired = direction === "OUT" || RESTRICTED_REASON_CODES.includes(reasonCode as AdjustmentReasonCode);
  const isValid = direction !== "" && Number(quantity) >= 1 && reasonCode !== "" && (!notesRequired || notes.trim().length > 0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid || isSubmitting) return;
    submit({ productId, locationId, quantity: Number(quantity), direction: direction as "IN" | "OUT", reasonCode: reasonCode as any, notes: notes.trim() || undefined });
  };

  useEffect(() => {
    if (status === "success" || status === "already_processed") {
      const timer = setTimeout(() => { reset(); onClose(); }, 1_500);
      return () => clearTimeout(timer);
    }
  }, [status, reset, onClose]);

  const REASON_CODE_LABELS: Record<string, string> = {
    COUNT_GAIN: "Count Gain (Physical Count)", FOUND_STOCK: "Found Stock", OPENING_BALANCE: "Opening Balance",
    COUNT_LOSS: "Count Loss (Physical Count)", DAMAGE_IN_TRANSIT: "Damage \u2014 In Transit", DAMAGE_WAREHOUSE: "Damage \u2014 Warehouse",
    DAMAGE_SHOWROOM: "Damage \u2014 Showroom", WARRANTY_WRITE_OFF: "Warranty Write-Off", SHRINKAGE_MISSING: "Shrinkage / Missing",
    OBSOLETE_WRITE_OFF: "Obsolete Write-Off", TRANSFER_SHORTAGE_CONFIRMED: "Transfer Shortage (Confirmed)", DATA_CORRECTION: "Data Correction (Admin Only)",
  };

  return (
    <ModalShell title="Adjust Stock" onClose={isSubmitting ? undefined : onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Location</label>
          <div className="rounded-md border border-border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">{currentLoc?.name ?? "Current Location"}</div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-foreground">Adjustment Type <span className="text-destructive">*</span></label>
          <div className="flex gap-2">
            <button type="button" onClick={() => setDirection("IN")} disabled={isSubmitting} className={`flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors ${direction === "IN" ? "border-success bg-success/10 text-success" : "border-border hover:bg-accent"}`}>+ Add Stock</button>
            <button type="button" onClick={() => setDirection("OUT")} disabled={isSubmitting} className={`flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors ${direction === "OUT" ? "border-destructive bg-destructive/10 text-destructive" : "border-border hover:bg-accent"}`}>&minus; Remove Stock</button>
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-foreground">Quantity <span className="text-destructive">*</span></label>
          <input type="number" min="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="Enter adjustment quantity" disabled={isSubmitting} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 disabled:opacity-50" required />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-foreground">Reason <span className="text-destructive">*</span></label>
          <select value={reasonCode} onChange={(e) => setReasonCode(e.target.value)} disabled={isSubmitting || direction === ""} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 disabled:opacity-50" required>
            <option value="">{direction === "" ? "Select direction first..." : "Select reason..."}</option>
            {availableReasonCodes.map((code) => <option key={code} value={code}>{REASON_CODE_LABELS[code] ?? code}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-foreground">Notes {notesRequired ? <span className="text-destructive">* required</span> : <span className="text-muted-foreground">(optional)</span>}</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={notesRequired ? "Notes are required for this adjustment type..." : "Optional adjustment notes..."} rows={2} disabled={isSubmitting} className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 disabled:opacity-50" />
        </div>
        {statusMessage && <MutationStatusBanner status={status} message={statusMessage} />}
        <div className="flex gap-2 pt-2">
          <button type="submit" disabled={!isValid || isSubmitting} className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-opacity disabled:cursor-not-allowed disabled:opacity-40 ${direction === "OUT" ? "bg-destructive text-white hover:bg-destructive/90" : "bg-primary text-primary-foreground hover:bg-primary/90"}`}>
            {isSubmitting ? <span className="flex items-center justify-center gap-2"><Spinner />Processing...</span> : direction === "OUT" ? "Confirm Removal" : "Confirm Adjustment"}
          </button>
          <button type="button" onClick={onClose} disabled={isSubmitting} className="flex-1 rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40">Cancel</button>
        </div>
      </form>
    </ModalShell>
  );
}

/* ─────────────────────────────────────────────
 * Shared UI Components
 * ───────────────────────────────────────────── */
function MutationStatusBanner({ status, message }: { status: AdjustmentMutationStatus; message: string }) {
  const styles: Record<string, string> = { submitting: "bg-primary/5 border-primary/20 text-primary", success: "bg-success/10 border-success/20 text-success", already_processed: "bg-warning/10 border-warning/20 text-warning", contention_retry: "bg-warning/10 border-warning/20 text-warning", needs_reconcile: "bg-destructive/10 border-destructive/20 text-destructive", error: "bg-destructive/10 border-destructive/20 text-destructive" };
  const icons: Record<string, string> = { submitting: "\u23F3", success: "\u2713", already_processed: "\u21BB", contention_retry: "\u27F3", needs_reconcile: "\u26A0", error: "\u2715" };
  return (
    <div className={`flex items-start gap-2 rounded-md border px-3 py-2 text-xs font-medium ${styles[status] ?? ""}`}>
      <span className="shrink-0 text-sm">{icons[status] ?? ""}</span>
      <span>{message}</span>
    </div>
  );
}

function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
    </svg>
  );
}

/* ─────────────────────────────────────────────
 * Searchable Select Dropdown
 * ───────────────────────────────────────────── */
function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = "Select…",
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [highlightIdx, setHighlightIdx] = useState(0);

  const selectedLabel = options.find((o) => o.value === value)?.label ?? "";

  const filtered = useMemo(() => {
    if (!query.trim()) return options;
    const q = query.toLowerCase();
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  // Reset highlight when filtered list changes
  useEffect(() => { setHighlightIdx(0); }, [filtered.length]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Scroll highlighted item into view
  useEffect(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current.children[highlightIdx] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [highlightIdx, open]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "Enter") { setOpen(true); e.preventDefault(); }
      return;
    }
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setHighlightIdx((i) => Math.min(i + 1, filtered.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlightIdx((i) => Math.max(i - 1, 0));
        break;
      case "Enter":
        e.preventDefault();
        if (filtered[highlightIdx]) {
          onChange(filtered[highlightIdx].value);
          setOpen(false);
          setQuery("");
        }
        break;
      case "Escape":
        e.preventDefault();
        setOpen(false);
        setQuery("");
        break;
    }
  };

  const handleSelect = (val: string) => {
    onChange(val);
    setOpen(false);
    setQuery("");
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          if (!open) setTimeout(() => inputRef.current?.focus(), 0);
        }}
        className={cn(
          "flex h-8 items-center gap-1 rounded-lg border bg-background px-2.5 text-[12px] shadow-[0_1px_2px_0_rgba(0,0,0,0.04)] outline-none transition-colors",
          open
            ? "border-primary/40 ring-2 ring-primary/[0.08]"
            : "border-border hover:border-border/80",
          value ? "text-foreground" : "text-muted-foreground",
        )}
      >
        <span className="max-w-[150px] truncate">
          {value ? selectedLabel : placeholder}
        </span>
        {value ? (
          <span
            role="button"
            onClick={(e) => { e.stopPropagation(); onChange(""); }}
            className="ml-0.5 rounded p-0.5 text-muted-foreground hover:text-foreground"
          >
            <X size={10} />
          </span>
        ) : (
          <ChevronsUpDown size={11} className="shrink-0 text-muted-foreground/50" />
        )}
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-[260px] rounded-lg border border-border bg-background shadow-lg animate-in fade-in slide-in-from-top-1 duration-100">
          <div className="border-b border-border px-2 py-1.5">
            <div className="relative">
              <Search size={12} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Search sub-categories…"
                className="h-7 w-full rounded-md bg-muted/50 pl-7 pr-2 text-[12px] text-foreground outline-none placeholder:text-muted-foreground/50"
                autoComplete="off"
              />
            </div>
          </div>
          <div ref={listRef} className="max-h-[240px] overflow-y-auto py-1" role="listbox">
            {/* "All" option */}
            <div
              role="option"
              aria-selected={value === ""}
              onClick={() => handleSelect("")}
              className={cn(
                "flex cursor-pointer items-center px-3 py-1.5 text-[12px] transition-colors",
                !value ? "bg-primary/[0.06] font-medium text-foreground" : "text-muted-foreground hover:bg-accent/60",
                highlightIdx === 0 && !query.trim() && "bg-accent/60",
              )}
            >
              {placeholder}
            </div>

            {filtered.length === 0 ? (
              <div className="px-3 py-4 text-center text-[11px] text-muted-foreground">
                No sub-categories match &ldquo;{query}&rdquo;
              </div>
            ) : (
              filtered.map((opt, idx) => (
                <div
                  key={opt.value}
                  role="option"
                  aria-selected={opt.value === value}
                  onClick={() => handleSelect(opt.value)}
                  className={cn(
                    "flex cursor-pointer items-center px-3 py-1.5 text-[12px] transition-colors",
                    opt.value === value
                      ? "bg-primary/[0.06] font-medium text-foreground"
                      : "text-foreground hover:bg-accent/60",
                    idx === highlightIdx && "bg-accent/60",
                  )}
                >
                  <span className="truncate">{opt.label}</span>
                </div>
              ))
            )}
          </div>
          <div className="border-t border-border px-3 py-1 text-[10px] text-muted-foreground/60 tabular-nums">
            {filtered.length} of {options.length} sub-categories
          </div>
        </div>
      )}
    </div>
  );
}

function ModalShell({ title, onClose, children }: { title: string; onClose?: () => void; children: React.ReactNode }) {
  return (
    <>
      <div className="fixed inset-0 z-[60] bg-foreground/30 backdrop-blur-[3px]" onClick={onClose} />
      <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
        <div className="w-full max-w-md rounded-xl border border-border bg-background p-6 shadow-2xl animate-in zoom-in-95 duration-150" onClick={(e) => e.stopPropagation()}>
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-base font-semibold">{title}</h3>
            {onClose && <button onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="Close modal"><X size={16} /></button>}
          </div>
          {children}
        </div>
      </div>
    </>
  );
}

/* ─────────────────────────────────────────────
 * Quick Add Item — Right-side Drawer
 * ───────────────────────────────────────────── */
function QuickAddDrawer({
  token,
  locationId,
  userRole,
  onClose,
}: {
  token: string;
  locationId: string;
  userRole: string;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [category, setCategory] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [costPrice, setCostPrice] = useState("");
  const [barcode, setBarcode] = useState("");
  const [trackInventory, setTrackInventory] = useState(true);
  const [initialStock, setInitialStock] = useState("0");
  const [error, setError] = useState<string | null>(null);

  const showCost = ["ADMIN", "MANAGER"].includes(userRole);
  const createMutation = useCreateProduct(token, locationId);

  // Auto-generate mnemonic SKU (10 uppercase letters from name)
  const generateMnemonic = (n: string): string => {
    const clean = n.toUpperCase().replace(/[^A-Z]/g, "");
    const base = clean.slice(0, 10);
    if (base.length >= 10) return base;
    // Pad with random uppercase letters
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    let result = base;
    while (result.length < 10) {
      result += chars[Math.floor(Math.random() * 26)];
    }
    return result;
  };

  const isValid = name.trim() !== "" && sku.trim() !== "" && category !== "";

  const handleSave = async (openFull = false) => {
    if (!isValid) return;
    setError(null);
    try {
      const result = await createMutation.mutateAsync({
        name: name.trim(),
        sku: sku.trim(),
        mnemonicSku: generateMnemonic(name),
        category,
        unitPrice: unitPrice || "0.00",
        costPrice: showCost ? (costPrice || "0.00") : "0.00",
        barcode: barcode.trim() || undefined,
        trackInventory,
        initialStock: trackInventory ? parseInt(initialStock, 10) || 0 : 0,
        reorderPoint: 10,
        leadTimeDays: 7,
      });
      if (openFull) {
        // Navigate to full setup page with new product ID
        window.location.href = `/inventory/new?from=${(result as any).id}`;
      } else {
        onClose();
      }
    } catch (err: any) {
      setError(err?.message || "Failed to create item");
    }
  };

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-foreground/20 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div className="fixed inset-y-0 right-0 z-50 w-[420px] max-w-full border-l border-border bg-background shadow-2xl animate-in slide-in-from-right duration-200">
        <div className="flex h-full flex-col">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border px-5 py-3">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Quick Add Item</h3>
              <p className="text-[11px] text-muted-foreground">Create a new catalog item</p>
            </div>
            <button
              onClick={onClose}
              className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label="Close drawer"
            >
              <X size={16} />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
            {error && (
              <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
                {error}
              </div>
            )}

            {/* Name */}
            <div>
              <label className="mb-1 block text-[12px] font-medium text-muted-foreground">
                Item Name <span className="text-destructive">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Castrol Edge 5W-30 4L"
                autoFocus
                className="h-9 w-full rounded-lg border border-border bg-background px-3 text-[13px] text-foreground outline-none placeholder:text-muted-foreground/50 focus:border-primary/40 focus:ring-2 focus:ring-primary/[0.08]"
              />
            </div>

            {/* SKU */}
            <div>
              <label className="mb-1 block text-[12px] font-medium text-muted-foreground">
                SKU <span className="text-destructive">*</span>
              </label>
              <input
                type="text"
                value={sku}
                onChange={(e) => setSku(e.target.value.toUpperCase())}
                placeholder="e.g. LUB-005001"
                className="h-9 w-full rounded-lg border border-border bg-background px-3 font-mono text-[13px] text-foreground outline-none placeholder:text-muted-foreground/50 focus:border-primary/40 focus:ring-2 focus:ring-primary/[0.08]"
              />
            </div>

            {/* Category */}
            <div>
              <label className="mb-1 block text-[12px] font-medium text-muted-foreground">
                Category <span className="text-destructive">*</span>
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="h-9 w-full rounded-lg border border-border bg-background px-3 text-[13px] text-foreground outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/[0.08]"
              >
                <option value="">Select category…</option>
                <option value="TIRES">Tires</option>
                <option value="LUBRICANTS">Lubricants</option>
                <option value="HARD_PARTS">Hard Parts</option>
                <option value="ACCESSORIES">Accessories</option>
                <option value="LABOR_SERVICES">Labor / Services</option>
              </select>
            </div>

            {/* Pricing Row */}
            <div className={cn("grid gap-3", showCost ? "grid-cols-2" : "grid-cols-1")}>
              <div>
                <label className="mb-1 block text-[12px] font-medium text-muted-foreground">
                  Sell Price
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[12px] text-muted-foreground">₱</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={unitPrice}
                    onChange={(e) => setUnitPrice(e.target.value)}
                    placeholder="0.00"
                    className="h-9 w-full rounded-lg border border-border bg-background pl-7 pr-3 text-[13px] text-foreground outline-none placeholder:text-muted-foreground/50 focus:border-primary/40 focus:ring-2 focus:ring-primary/[0.08]"
                  />
                </div>
              </div>
              {showCost && (
                <div>
                  <label className="mb-1 block text-[12px] font-medium text-muted-foreground">
                    Cost Price
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[12px] text-muted-foreground">₱</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={costPrice}
                      onChange={(e) => setCostPrice(e.target.value)}
                      placeholder="0.00"
                      className="h-9 w-full rounded-lg border border-border bg-background pl-7 pr-3 text-[13px] text-foreground outline-none placeholder:text-muted-foreground/50 focus:border-primary/40 focus:ring-2 focus:ring-primary/[0.08]"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Barcode */}
            <div>
              <label className="mb-1 block text-[12px] font-medium text-muted-foreground">
                Barcode (EAN-13)
              </label>
              <input
                type="text"
                value={barcode}
                onChange={(e) => setBarcode(e.target.value.replace(/\D/g, "").slice(0, 13))}
                placeholder="Auto-generated if empty"
                maxLength={13}
                className="h-9 w-full rounded-lg border border-border bg-background px-3 font-mono text-[13px] text-foreground outline-none placeholder:text-muted-foreground/50 focus:border-primary/40 focus:ring-2 focus:ring-primary/[0.08]"
              />
              <p className="mt-0.5 text-[10px] text-muted-foreground">Leave blank to auto-generate a unique barcode</p>
            </div>

            {/* Track Inventory */}
            <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-3 py-2.5">
              <div>
                <p className="text-[13px] font-medium text-foreground">Track Inventory</p>
                <p className="text-[11px] text-muted-foreground">Monitor stock levels for this item</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={trackInventory}
                onClick={() => setTrackInventory(!trackInventory)}
                className={cn(
                  "inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors",
                  trackInventory ? "bg-primary" : "bg-border",
                )}
              >
                <span
                  className={cn(
                    "pointer-events-none block h-5 w-5 rounded-full bg-white shadow-sm transition-transform",
                    trackInventory ? "translate-x-5" : "translate-x-0.5",
                  )}
                />
              </button>
            </div>

            {/* Initial Stock */}
            {trackInventory && (
              <div>
                <label className="mb-1 block text-[12px] font-medium text-muted-foreground">
                  Initial Stock at Current Location
                </label>
                <input
                  type="number"
                  min="0"
                  value={initialStock}
                  onChange={(e) => setInitialStock(e.target.value)}
                  className="h-9 w-full rounded-lg border border-border bg-background px-3 text-[13px] text-foreground outline-none placeholder:text-muted-foreground/50 focus:border-primary/40 focus:ring-2 focus:ring-primary/[0.08]"
                />
              </div>
            )}
          </div>

          {/* Footer Actions */}
          <div className="space-y-2 border-t border-border p-4">
            <button
              onClick={() => handleSave(false)}
              disabled={!isValid || createMutation.isPending}
              className="flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-primary text-[13px] font-medium text-primary-foreground shadow-sm transition-all hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {createMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              {createMutation.isPending ? "Creating…" : "Save Item"}
            </button>
            <button
              onClick={() => handleSave(true)}
              disabled={!isValid || createMutation.isPending}
              className="flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-border bg-background text-[13px] font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
            >
              Save & Open Full Setup
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function InfoRow({ label, value, mono, statusColor }: { label: string; value: string; mono?: boolean; statusColor?: string }) {
  return (
    <div className="flex justify-between py-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={cn(
        "max-w-[60%] truncate text-right text-sm font-medium",
        mono && "font-mono text-[13px]",
        statusColor ?? "text-foreground",
      )}>
        {value}
      </span>
    </div>
  );
}
