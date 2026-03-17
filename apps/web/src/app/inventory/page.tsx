"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import {
  Search,
  Plus,
  Upload,
  Download,
  Trash2,
  ArrowUpDown,
  X,
  Loader2,
  Layers,
} from "lucide-react";
import { useProducts, useDeleteProduct, useProductFamilies, type ProductRow, type SortField, type SortDir } from "@/hooks/use-products";
import { useCategories } from "@/hooks/use-categories";
import { useSubcategories } from "@/hooks/use-subcategories";
import { useBrands } from "@/hooks/use-brands";
import { useAuth, ALL_LOCATIONS } from "@/app/auth-context";
import { useConfirm } from "@/components/confirm-dialog";
import { cn } from "@/lib/utils";
import { DrillDownView } from "./drill-down";
import { SortableHeader, StockPill, StockPopover, RowActions, ParentAwareCheckbox, FlatProductRow, VariantSubRows } from "./components/inventory-table";
import { DetailDrawer } from "./components/detail-drawer";
import { QuickAddDrawer } from "./components/quick-add-drawer";
import { AdjustModal } from "./components/adjust-modal";
import { TransferModal } from "./components/transfer-modal";
import { SearchableSelect } from "./components/searchable-select";
import { ModalShell } from "./components/modal-shell";
import { EmptyState } from "./components/empty-state";
import { PAGE_SIZES, DEFAULT_PAGE_SIZE, getStockStatus, getMarginPercent, formatPrice, getVariantDescriptor, type StockStatus } from "./lib/inventory-utils";

/* ─────────────────────────────────────────────
 * Page Root
 * ───────────────────────────────────────────── */
export default function InventoryPage() {
  const { token, locationId, apiLocationId, user } = useAuth();

  const isAllLocations = locationId === ALL_LOCATIONS;

  const showFinancials = true;

  /* State */
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [familyFilter, setFamilyFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [subCategoryFilter, setSubCategoryFilter] = useState("");
  const [stockStatusFilter, setStockStatusFilter] = useState("");
  const [brandFilter, setBrandFilter] = useState("");
  const [sortBy, setSortBy] = useState<SortField>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [showQuickAdd, setShowQuickAdd] = useState(false);

  /* View mode — independent of sort */
  const [viewMode, setViewMode] = useState<"flat" | "nested">("flat");
  const effectiveViewMode = debouncedSearch.length >= 2 ? "flat" : viewMode;

  /* Expand/collapse state for parent products (variants) */
  const [expandedParents, setExpandedParents] = useState<Set<string>>(new Set());

  /* Debounce search input */
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  /* Fetch product families for Group filter */
  const familiesQuery = useProductFamilies(token, apiLocationId);
  const families = useMemo(() => {
    const fams = familiesQuery.data?.data ?? [];
    return [...fams].sort((a, b) => a.name.localeCompare(b.name));
  }, [familiesQuery.data]);

  /* Fetch categories for Category filter — cascaded by selected family */
  const categoriesQuery = useCategories(token, apiLocationId);
  const filteredCategories = useMemo(() => {
    const cats = categoriesQuery.data?.data ?? [];
    const sorted = [...cats].sort((a, b) => a.name.localeCompare(b.name));
    if (!familyFilter) return sorted;
    return sorted.filter((c) => c.familyId === familyFilter);
  }, [categoriesQuery.data, familyFilter]);

  /* Fetch sub-categories for Sub-cat filter — cascaded by selected category */
  const subcategoriesQuery = useSubcategories(token, apiLocationId, categoryFilter || undefined);
  const filteredSubcategories = useMemo(() => {
    const subs = subcategoriesQuery.data?.data ?? [];
    return [...subs].sort((a, b) => a.name.localeCompare(b.name));
  }, [subcategoriesQuery.data]);

  /* Fetch brands for Brand filter */
  const brandsQuery = useBrands(token, apiLocationId);
  const brandsList = useMemo(() => {
    const brands = brandsQuery.data?.data ?? [];
    return [...brands].sort((a, b) => a.name.localeCompare(b.name));
  }, [brandsQuery.data]);

  /* Reset page when filters / sort / location / pageSize change */
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, familyFilter, categoryFilter, subCategoryFilter, stockStatusFilter, brandFilter, sortBy, sortDir, locationId, pageSize, viewMode]);

  /* Fetch real data */
  const { data, isLoading, isFetching } = useProducts(token, apiLocationId, {
    search: debouncedSearch,
    familyId: familyFilter || undefined,
    subCategoryId: categoryFilter || undefined,
    subcategoryId: subCategoryFilter || undefined,
    stockStatus: stockStatusFilter,
    brandId: brandFilter || undefined,
    sortBy,
    sortDir,
    page,
    limit: pageSize,
    parentOnly: true,
    allLocations: isAllLocations,
  });

  const products = data?.data ?? [];
  const totalItems = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;
  const hasMore = data?.hasMore ?? false;

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
    familyFilter !== "" || categoryFilter !== "" || subCategoryFilter !== "" || stockStatusFilter !== "" || brandFilter !== "" || searchQuery.trim() !== "";

  const clearAllFilters = useCallback(() => {
    setFamilyFilter("");
    setCategoryFilter("");
    setSubCategoryFilter("");
    setStockStatusFilter("");
    setBrandFilter("");
    setSearchQuery("");
    setDebouncedSearch("");
  }, []);

  /* Bulk selection — parent checkbox selects all variants */
  const selectableIds = useMemo(() => products.map((p) => p.id), [products]);
  const allOnPageSelected =
    selectableIds.length > 0 && selectableIds.every((id) => selectedIds.has(id));

  /** Toggle a standalone (non-parent) item */
  const toggleOne = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  /** Toggle a parent item — selects/deselects parent + ALL its variant IDs */
  const toggleParentSelection = useCallback((parentId: string, variantIds: string[]) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(parentId)) {
        next.delete(parentId);
        variantIds.forEach((vid) => next.delete(vid));
      } else {
        next.add(parentId);
        variantIds.forEach((vid) => next.add(vid));
      }
      return next;
    });
  }, []);

  /** Toggle an individual variant — updates parent state automatically */
  const toggleVariantSelection = useCallback((variantId: string, parentId: string, allVariantIds: string[]) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(variantId)) {
        next.delete(variantId);
        const anyStillSelected = allVariantIds.some((vid) => vid !== variantId && next.has(vid));
        if (!anyStillSelected) next.delete(parentId);
      } else {
        next.add(variantId);
        const allNowSelected = allVariantIds.every((vid) => vid === variantId || next.has(vid));
        if (allNowSelected) next.add(parentId);
      }
      return next;
    });
  }, []);

  /** Get check state for a parent row: true | false | "indeterminate" */
  const getParentCheckState = useCallback((parentId: string, variantIds: string[]): boolean | "indeterminate" => {
    const parentSelected = selectedIds.has(parentId);
    const allVariantsSelected = variantIds.length > 0 && variantIds.every((id) => selectedIds.has(id));
    const someVariantsSelected = variantIds.some((id) => selectedIds.has(id));
    if (parentSelected && allVariantsSelected) return true;
    if (someVariantsSelected || parentSelected) return "indeterminate";
    return false;
  }, [selectedIds]);

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

  /* Confirm + delete mutation */
  const confirm = useConfirm();
  const deleteMut = useDeleteProduct(token, apiLocationId);

  const handleBulkDelete = useCallback(async () => {
    const count = selectedIds.size;
    if (count === 0) return;

    // Separate parents from standalone/variants
    const parentIds = Array.from(selectedIds).filter((id) => {
      const product = products.find((p) => p.id === id);
      return product?.isParent;
    });

    // Skip variants whose parent is already being deleted (cascade handles them)
    const nonParentIds = Array.from(selectedIds).filter((id) => {
      const product = products.find((p) => p.id === id);
      if (product?.isParent) return false;
      // Check if this is a variant whose parent is also selected
      if (product?.parentProductId && parentIds.includes(product.parentProductId)) return false;
      return true;
    });

    const message = parentIds.length > 0
      ? `Delete ${count} selected item${count > 1 ? "s" : ""}? This includes ${parentIds.length} parent item${parentIds.length > 1 ? "s" : ""} with all their variants. This cannot be undone.`
      : `Delete ${count} item${count > 1 ? "s" : ""}? Items with sales history will be deactivated instead.`;

    const ok = await confirm({
      title: "Delete Items",
      message,
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!ok) return;

    // Delete parents first (cascade deletes their variants)
    for (const id of parentIds) {
      await deleteMut.mutateAsync(id).catch(() => {});
    }
    // Delete remaining non-parent items
    for (const id of nonParentIds) {
      await deleteMut.mutateAsync(id).catch(() => {});
    }
    setSelectedIds(new Set());
  }, [selectedIds, products, confirm, deleteMut]);

  /* Single item delete (from row actions menu) */
  const handleDeleteSingle = useCallback(async (productId: string, productName: string, isParent?: boolean) => {
    const message = isParent
      ? `Delete "${productName}" and ALL its variants? This cannot be undone.`
      : `Delete "${productName}"? This cannot be undone.`;
    const ok = await confirm({
      title: isParent ? "Delete Parent + Variants" : "Delete Item",
      message,
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!ok) return;
    await deleteMut.mutateAsync(productId).catch(() => {});
  }, [confirm, deleteMut]);

  /* Selected product for drawer */
  const selectedProduct = selectedProductId
    ? products.find((p) => p.id === selectedProductId) ?? null
    : null;

  /* Column count for colSpan calculations (arrow + checkbox + name + stock + cat + brand + sell [+ cost + margin] + actions) */
  const colCount = showFinancials ? 10 : 8;

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
            onClick={() => setViewMode((v) => v === "flat" ? "nested" : "flat")}
            title={viewMode === "nested" ? "Switch to flat list" : "Switch to grouped view"}
            className={cn(
              "flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12px] font-medium shadow-[0_1px_2px_0_rgba(0,0,0,0.04)] transition-colors",
              viewMode === "nested"
                ? "border-primary/30 bg-primary/[0.06] text-primary hover:bg-primary/[0.1]"
                : "border-border bg-background text-muted-foreground hover:bg-muted",
            )}
          >
            <Layers size={13} />
            {viewMode === "nested" ? "List" : "Group"}
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
          <option value="">All Families</option>
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

        <select
          value={brandFilter}
          onChange={(e) => { setBrandFilter(e.target.value); setPage(1); }}
          className="h-8 rounded-lg border border-border bg-background px-2.5 pr-7 text-[12px] text-foreground shadow-[0_1px_2px_0_rgba(0,0,0,0.04)] outline-none transition-colors focus:border-primary/40 focus:ring-2 focus:ring-primary/[0.08]"
        >
          <option value="">All Brands</option>
          {brandsList.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
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
          <button
            onClick={handleBulkDelete}
            disabled={deleteMut.isPending}
            className="flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
          >
            <Trash2 size={12} />
            {deleteMut.isPending ? "Deleting\u2026" : "Delete"}
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
          <div className="flex-1 overflow-x-auto overflow-y-auto">
            <table className="w-full min-w-[700px] text-[12px]">
              <thead className="sticky top-0 z-10 border-b border-border bg-muted/90 backdrop-blur-sm">
                <tr>
                  <th scope="col" className="w-8" />{/* arrow column */}
                  <th scope="col" className="w-9 px-2 py-[7px] text-center">
                    <input
                      type="checkbox"
                      checked={allOnPageSelected}
                      onChange={toggleAll}
                      className="h-3.5 w-3.5 rounded border-border accent-primary cursor-pointer"
                    />
                  </th>
                  <th scope="col" className="min-w-[200px] px-3 py-[7px] text-left">
                    <SortableHeader label="Item Name" field="name" activeField={sortBy} activeDir={sortDir} onSort={handleSort} />
                  </th>
                  <th scope="col" className="w-[70px] px-2 py-[7px] text-right">
                    <SortableHeader label="Stock" field="stockLevel" activeField={sortBy} activeDir={sortDir} onSort={handleSort} align="right" />
                  </th>
                  <th scope="col" className="w-[130px] px-3 py-[7px] text-left">
                    <SortableHeader label="Category" field="categoryName" activeField={sortBy} activeDir={sortDir} onSort={handleSort} />
                  </th>
                  <th scope="col" className="w-[110px] px-3 py-[7px] text-left">
                    <SortableHeader label="Brand" field="brandName" activeField={sortBy} activeDir={sortDir} onSort={handleSort} />
                  </th>
                  <th scope="col" className="w-[85px] px-3 py-[7px] text-right">
                    <SortableHeader label="Sell" field="unitPrice" activeField={sortBy} activeDir={sortDir} onSort={handleSort} align="right" />
                  </th>
                  {showFinancials && (
                    <>
                      <th scope="col" className="w-[75px] px-3 py-[7px] text-right">
                        <SortableHeader label="Cost" field="costPrice" activeField={sortBy} activeDir={sortDir} onSort={handleSort} align="right" />
                      </th>
                      <th scope="col" className="w-[65px] px-3 py-[7px] text-right">
                        <SortableHeader label="Margin" field="margin" activeField={sortBy} activeDir={sortDir} onSort={handleSort} align="right" />
                      </th>
                    </>
                  )}
                  <th scope="col" className="w-[40px] px-1 py-[7px]" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {effectiveViewMode === "nested" ? (
                  <DrillDownView
                    token={token}
                    locationId={apiLocationId}
                    stockStatus={stockStatusFilter || undefined}
                    showFinancials={showFinancials}
                    onSelectProduct={setSelectedProductId}
                    familyFilter={familyFilter || undefined}
                    categoryFilter={categoryFilter || undefined}
                    brandFilter={brandFilter || undefined}
                    colCount={colCount}
                    allLocations={isAllLocations}
                  />
                ) : (
                  products.map((p) => (
                    <FlatProductRow
                      key={p.id}
                      product={p}
                      showFinancials={showFinancials}
                      isSelected={selectedIds.has(p.id)}
                      selectedIds={selectedIds}
                      onToggleSelect={() => toggleOne(p.id)}
                      onToggleParentSelect={toggleParentSelection}
                      onToggleVariantSelect={toggleVariantSelection}
                      getParentCheckState={getParentCheckState}
                      onSelectProduct={() => setSelectedProductId(p.id)}
                      isParentExpanded={expandedParents.has(p.id)}
                      onToggleParent={() => setExpandedParents((prev) => { const next = new Set(prev); if (next.has(p.id)) next.delete(p.id); else next.add(p.id); return next; })}
                      colCount={colCount}
                      onDeleteSingle={handleDeleteSingle}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* -- Pagination Footer (flat mode only; drill-down has its own per-make pagination) -- */}
          {effectiveViewMode !== "nested" && (
            <div className="flex shrink-0 items-center justify-between border-t border-border bg-muted/40 px-3 py-1.5">
              <span className="text-[11px] text-muted-foreground tabular-nums">
                Showing{" "}
                {((page - 1) * pageSize + 1).toLocaleString()}&ndash;{Math.min(page * pageSize, totalItems).toLocaleString()}{" "}
                of {totalItems.toLocaleString()}
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
          )}
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
      {showAdjustModal && selectedProductId && !isAllLocations && (
        <AdjustModal productId={selectedProductId} locationId={apiLocationId} token={token} onClose={() => setShowAdjustModal(false)} />
      )}

      {showQuickAdd && (
        <QuickAddDrawer
          token={token}
          locationId={apiLocationId}
          userRole={user?.role ?? ""}
          isAllLocations={isAllLocations}
          onClose={() => setShowQuickAdd(false)}
        />
      )}
    </div>
  );
}
