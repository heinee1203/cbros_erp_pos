"use client";

import { useCallback, useMemo, useState } from "react";
import { useAuth } from "@/app/auth-context";
import { useBrands } from "@/hooks/use-brands";
import { useCategories } from "@/hooks/use-categories";
import { useProductFamilies } from "@/hooks/use-products";
import { useStockMonitor, useStockMonitorRefresh, type StockMonitorFilters } from "@/hooks/use-stock-monitor";
import { useSubcategories } from "@/hooks/use-subcategories";
import { API_BASE } from "../constants";
import type { SortDir, SortField } from "../types";

export type StockVelocityViewMode = "classification" | "velocity" | "reorder";

export function useStockVelocityController() {
  const { token, apiLocationId } = useAuth();

  const [velocityFilter, setVelocityFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortField>("daysOfStock");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [viewMode, setViewMode] = useState<StockVelocityViewMode>("classification");
  const [urgencyFilter, setUrgencyFilter] = useState("");
  const [urgencyWindow, setUrgencyWindow] = useState("");
  const [leftFilterAll, setLeftFilterAll] = useState("");
  const [leftFilter12m, setLeftFilter12m] = useState("");
  const [leftFilter6m, setLeftFilter6m] = useState("");
  const [leftFilter3m, setLeftFilter3m] = useState("");
  const [leftFilter1m, setLeftFilter1m] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [subcategoryFilter, setSubcategoryFilter] = useState("");
  const [brandFilter, setBrandFilter] = useState("");
  const [familyFilter, setFamilyFilter] = useState("");
  const [reorderPanelOpen, setReorderPanelOpen] = useState(false);
  const [lastSoldAfter, setLastSoldAfter] = useState("");
  const [lastSoldBefore, setLastSoldBefore] = useState("");
  const [hideNegativeStock, setHideNegativeStock] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("stockVelocity.hideNegativeStock") !== "false";
    }
    return true;
  });
  const [hideDC, setHideDC] = useState(() => {
    if (typeof window !== "undefined") return localStorage.getItem("stockVelocity.hideDC") !== "false";
    return true;
  });
  const [hideSO, setHideSO] = useState(() => {
    if (typeof window !== "undefined") return localStorage.getItem("stockVelocity.hideSO") !== "false";
    return true;
  });
  const [isExporting, setIsExporting] = useState(false);

  const debounceTimer = useMemo(() => ({ id: null as any }), []);
  const handleSearchChange = useCallback((value: string) => {
    setSearchQuery(value);
    clearTimeout(debounceTimer.id);
    debounceTimer.id = setTimeout(() => setDebouncedSearch(value), 300);
  }, [debounceTimer]);

  const { data: brandsData } = useBrands(token, apiLocationId);
  const { data: categoriesData } = useCategories(token, apiLocationId);
  const { data: subcategoriesData } = useSubcategories(token, apiLocationId);
  const { data: familiesData } = useProductFamilies(token, apiLocationId);
  const brands = brandsData?.data ?? [];
  const categories = categoriesData?.data ?? [];
  const allSubcategories = subcategoriesData?.data ?? [];
  const families = familiesData?.data ?? [];
  const filteredSubcategories = categoryFilter
    ? allSubcategories.filter((subcategory: any) => subcategory.categoryId === categoryFilter)
    : allSubcategories;

  const filters: StockMonitorFilters = {
    search: debouncedSearch || undefined,
    sortBy,
    sortDir,
    categoryId: categoryFilter || undefined,
    subcategoryId: subcategoryFilter || undefined,
    brandId: brandFilter || undefined,
    familyId: familyFilter || undefined,
    hideNegativeStock: hideNegativeStock || undefined,
    hideDiscontinued: hideDC || undefined,
    hideSpecialOrder: hideSO || undefined,
    urgency: urgencyFilter || undefined,
    urgencyWindow: urgencyWindow || undefined,
    velocityClass: velocityFilter && velocityFilter !== "all" ? velocityFilter : undefined,
    urgencyAll: leftFilterAll || undefined,
    urgency12m: leftFilter12m || undefined,
    urgency6m: leftFilter6m || undefined,
    urgency3m: leftFilter3m || undefined,
    urgency1m: leftFilter1m || undefined,
    lastSoldAfter: lastSoldAfter || undefined,
    lastSoldBefore: lastSoldBefore || undefined,
  };

  const {
    data: monitorPages,
    isLoading,
    fetchNextPage,
    hasNextPage,
  } = useStockMonitor(token, apiLocationId, filters, 100);
  const refreshMutation = useStockMonitorRefresh(token, apiLocationId);
  const allRows = useMemo(() => monitorPages?.pages?.flatMap((page) => page.data) ?? [], [monitorPages]);
  const summary = monitorPages?.pages?.[0]?.summary;

  function handleSort(field: SortField) {
    if (sortBy === field) {
      setSortDir((dir) => (dir === "asc" ? "desc" : "asc"));
      return;
    }

    setSortBy(field);
    setSortDir(field === "productName" ? "asc" : "desc");
  }

  const handleExport = useCallback(async () => {
    if (!token) return;
    setIsExporting(true);
    try {
      const params = new URLSearchParams();
      if (velocityFilter && velocityFilter !== "all") params.set("velocityClass", velocityFilter);
      if (brandFilter) params.set("brandId", brandFilter);
      if (categoryFilter) params.set("categoryId", categoryFilter);
      if (subcategoryFilter) params.set("subcategoryId", subcategoryFilter);
      if (familyFilter) params.set("familyId", familyFilter);
      if (lastSoldAfter) params.set("lastSoldAfter", lastSoldAfter);
      if (lastSoldBefore) params.set("lastSoldBefore", lastSoldBefore);
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (urgencyFilter) params.set("urgency", urgencyFilter);
      if (urgencyWindow) params.set("urgencyWindow", urgencyWindow);
      if (leftFilterAll) params.set("urgencyAll", leftFilterAll);
      if (leftFilter12m) params.set("urgency12m", leftFilter12m);
      if (leftFilter6m) params.set("urgency6m", leftFilter6m);
      if (leftFilter3m) params.set("urgency3m", leftFilter3m);
      if (leftFilter1m) params.set("urgency1m", leftFilter1m);
      if (hideNegativeStock) params.set("hideNegativeStock", "true");
      if (hideDC) params.set("hideDiscontinued", "true");
      if (hideSO) params.set("hideSpecialOrder", "true");
      params.set("sortBy", sortBy);
      params.set("sortDir", sortDir);

      const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
      if (apiLocationId && apiLocationId !== "ALL") headers["X-Location-ID"] = apiLocationId;

      const qs = params.toString();
      const res = await fetch(`${API_BASE}/inventory/stock-monitor/export${qs ? `?${qs}` : ""}`, { headers });
      if (!res.ok) throw new Error(`Export failed: ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const date = new Date().toISOString().slice(0, 10);
      link.download = `stock-velocity-${date}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Stock Velocity CSV export failed:", err);
    } finally {
      setIsExporting(false);
    }
  }, [token, apiLocationId, velocityFilter, brandFilter, categoryFilter, subcategoryFilter, familyFilter, lastSoldAfter, lastSoldBefore, debouncedSearch, urgencyFilter, urgencyWindow, leftFilterAll, leftFilter12m, leftFilter6m, leftFilter3m, leftFilter1m, hideNegativeStock, hideDC, hideSO, sortBy, sortDir]);

  function setHideNegativeStockPersisted(value: boolean) {
    setHideNegativeStock(value);
    localStorage.setItem("stockVelocity.hideNegativeStock", String(value));
  }

  function toggleHideDC() {
    const next = !hideDC;
    setHideDC(next);
    localStorage.setItem("stockVelocity.hideDC", String(next));
  }

  function toggleHideSO() {
    const next = !hideSO;
    setHideSO(next);
    localStorage.setItem("stockVelocity.hideSO", String(next));
  }

  function handleLeftFilterChange(window: string, value: string) {
    if (window === "all") setLeftFilterAll(value);
    else if (window === "12m") setLeftFilter12m(value);
    else if (window === "6m") setLeftFilter6m(value);
    else if (window === "3m") setLeftFilter3m(value);
    else if (window === "1m") setLeftFilter1m(value);
  }

  function clearLeftFilters() {
    setLeftFilterAll("");
    setLeftFilter12m("");
    setLeftFilter6m("");
    setLeftFilter3m("");
    setLeftFilter1m("");
  }

  function closeReorderPanel() {
    setReorderPanelOpen(false);
    if (viewMode === "reorder") setViewMode("classification");
  }

  function clearTaxonomyFilters() {
    setFamilyFilter("");
    setCategoryFilter("");
    setSubcategoryFilter("");
    setBrandFilter("");
  }

  function setCategoryFilterAndResetSubcategory(value: string) {
    setCategoryFilter(value);
    setSubcategoryFilter("");
  }

  function setFamilyFilterAndResetChildren(value: string) {
    setFamilyFilter(value);
    setCategoryFilter("");
    setSubcategoryFilter("");
  }

  function setUrgencyFilterAndMaybeResetWindow(value: string) {
    setUrgencyFilter(value);
    if (!value) setUrgencyWindow("");
  }

  const brandName = brandFilter ? (brandsData?.data?.find((brand: any) => brand.id === brandFilter)?.name ?? null) : null;
  const categoryName = categoryFilter ? (categoriesData?.data?.find((category: any) => category.id === categoryFilter)?.name ?? null) : null;

  return {
    allRows,
    brandFilter,
    brandName,
    brands,
    categoryFilter,
    categoryName,
    categories,
    clearLeftFilters,
    clearTaxonomyFilters,
    closeReorderPanel,
    familyFilter,
    families,
    fetchNextPage: () => {
      void fetchNextPage();
    },
    filteredSubcategories,
    handleExport,
    handleLeftFilterChange,
    handleSearchChange,
    handleSort,
    hasNextPage,
    hideDC,
    hideNegativeStock,
    hideSO,
    isExporting,
    isLoading,
    lastSoldAfter,
    lastSoldBefore,
    leftFilter1m,
    leftFilter3m,
    leftFilter6m,
    leftFilter12m,
    leftFilterAll,
    monitorPages,
    refreshMutation,
    reorderPanelOpen,
    searchQuery,
    setBrandFilter,
    setCategoryFilter: setCategoryFilterAndResetSubcategory,
    setFamilyFilter: setFamilyFilterAndResetChildren,
    setHideNegativeStockPersisted,
    setLastSoldAfter,
    setLastSoldBefore,
    setReorderPanelOpen,
    setSubcategoryFilter,
    setUrgencyFilter: setUrgencyFilterAndMaybeResetWindow,
    setUrgencyWindow,
    setVelocityFilter,
    setViewMode,
    sortBy,
    sortDir,
    subcategoryFilter,
    summary,
    toggleHideDC,
    toggleHideSO,
    urgencyFilter,
    urgencyWindow,
    velocityFilter,
    viewMode,
  };
}

export type StockVelocityController = ReturnType<typeof useStockVelocityController>;
