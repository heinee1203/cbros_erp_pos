"use client";

import { useCallback, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/app/auth-context";
import { useProductReorder } from "@/components/procurement/reorder-workflow";
import { useStockLevels, useProductStockLevels, type ProductStockSummary, type SortDir, type SortField, type StockLevelsSummary } from "@/hooks/use-stock-levels";
import type { StockLevelsController, StockLevelsViewMode } from "../types";
import {
  buildLocationStockLevelsFilters,
  buildProductStockLevelsFilters,
  hasActiveStockLevelsFilters,
} from "./stock-levels-filters";
import { useDebouncedSearch } from "./use-debounced-search";
import { useStockLevelsTaxonomy } from "./use-stock-levels-taxonomy";

export function useStockLevelsController(): StockLevelsController {
  const { token, locationId, loading: authLoading } = useAuth();
  const searchParams = useSearchParams() ?? new URLSearchParams();
  const urlBelowReorder = searchParams.get("belowReorder") === "true";

  const [viewMode, setViewMode] = useState<StockLevelsViewMode>("product");
  const [allLocations, setAllLocations] = useState(false);
  const [familyFilter, setFamilyFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [subcategoryFilter, setSubcategoryFilter] = useState("all");
  const [stockStatusFilter, setStockStatusFilter] = useState("all");
  const {
    clearSearch,
    debouncedSearch,
    handleSearchChange,
    searchQuery,
  } = useDebouncedSearch();
  const [belowReorder, setBelowReorder] = useState(urlBelowReorder);
  const [sortBy, setSortBy] = useState<SortField>(urlBelowReorder ? "lastSoldAt" : "name");
  const [sortDir, setSortDir] = useState<SortDir>(urlBelowReorder ? "desc" : "asc");

  const {
    allCategories,
    allFamilies,
    filteredCategories,
    filteredSubcategories,
  } = useStockLevelsTaxonomy({
    categoryFilter,
    familyFilter,
    locationId,
    token,
  });

  const filterState = {
    allLocations,
    belowReorder,
    categoryFilter,
    debouncedSearch,
    familyFilter,
    sortBy,
    sortDir,
    stockStatusFilter,
    subcategoryFilter,
  };

  const locationQuery = useStockLevels(
    token,
    locationId,
    buildLocationStockLevelsFilters(filterState),
  );

  const productQuery = useProductStockLevels(
    token,
    locationId,
    buildProductStockLevelsFilters(filterState),
  );

  const activeQuery = viewMode === "product" ? productQuery : locationQuery;
  const rows = useMemo(
    () => viewMode === "location" ? (locationQuery.data?.pages.flatMap((page) => page.data) ?? []) : [],
    [locationQuery.data, viewMode],
  );
  const productRows = useMemo(
    () => viewMode === "product" ? (productQuery.data?.pages.flatMap((page) => page.data) ?? []) : [],
    [productQuery.data, viewMode],
  );

  const summary: StockLevelsSummary | null = viewMode === "location"
    ? (locationQuery.data?.pages[0]?.summary ?? null)
    : null;
  const productSummary: ProductStockSummary | null = viewMode === "product"
    ? (productQuery.data?.pages[0]?.summary ?? null)
    : null;

  const {
    modal: reorderModal,
    loadingProductId: reorderLoading,
    successMessage,
    reorder,
    snooze: handleSnooze,
    dismissModal,
    createDraftPO,
    viewExistingDraft,
  } = useProductReorder({
    token,
    locationId,
    invalidateKeys: [["stock-levels"], ["stock-levels-product"]],
  });

  const handleReorder = useCallback((productId: string, productName: string) => {
    void reorder({ productId, productName });
  }, [reorder]);

  function handleSort(field: SortField) {
    if (sortBy === field) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }

    setSortBy(field);
    setSortDir("asc");
  }

  const hasActiveFilters = hasActiveStockLevelsFilters({
    belowReorder,
    categoryFilter,
    familyFilter,
    searchQuery,
    stockStatusFilter,
    subcategoryFilter,
  });

  function clearFilters() {
    setFamilyFilter("all");
    setCategoryFilter("all");
    setSubcategoryFilter("all");
    setStockStatusFilter("all");
    clearSearch();
    setBelowReorder(false);
  }

  return {
    allCategories,
    allFamilies,
    allLocations,
    authLoading,
    belowReorder,
    categoryFilter,
    clearFilters,
    createDraftPO,
    dismissModal,
    error: activeQuery.error,
    familyFilter,
    fetchNextPage: () => {
      void activeQuery.fetchNextPage();
    },
    filteredCategories,
    filteredSubcategories,
    handleReorder,
    handleSearchChange,
    handleSnooze,
    handleSort,
    hasActiveFilters,
    hasNextPage: activeQuery.hasNextPage,
    isError: activeQuery.isError,
    isFetchingNextPage: activeQuery.isFetchingNextPage,
    isLoading: activeQuery.isLoading,
    productRows,
    productSummary,
    reorderLoading,
    reorderModal,
    rows,
    searchQuery,
    setAllLocations,
    setBelowReorder,
    setCategoryFilter,
    setFamilyFilter,
    setStockStatusFilter,
    setSubcategoryFilter,
    setViewMode,
    sortBy,
    sortDir,
    stockStatusFilter,
    subcategoryFilter,
    successMessage,
    summary,
    viewExistingDraft,
    viewMode,
  };
}
