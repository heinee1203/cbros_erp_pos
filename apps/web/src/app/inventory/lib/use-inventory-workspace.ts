"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ALL_LOCATIONS } from "@/app/auth-context";
import { useBrands } from "@/hooks/use-brands";
import { useCategories } from "@/hooks/use-categories";
import { useLocations, type LocationRow } from "@/hooks/use-locations";
import { useProductFamilies, useProducts, type SortDir, type SortField } from "@/hooks/use-products";
import { useSubcategories } from "@/hooks/use-subcategories";
import { DEFAULT_PAGE_SIZE } from "./inventory-utils";

interface UseInventoryWorkspaceOptions {
  token: string | null;
  apiLocationId: string | null;
  locationId: string | null;
}

export function useInventoryWorkspace({
  token,
  apiLocationId,
  locationId,
}: UseInventoryWorkspaceOptions) {
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
  const [viewMode, setViewMode] = useState<"flat" | "nested">("flat");
  const [hideSO, setHideSO] = useState(() => typeof window !== "undefined" ? localStorage.getItem("item-list-hide-so") === "true" : false);
  const [hideDC, setHideDC] = useState(() => typeof window !== "undefined" ? localStorage.getItem("item-list-hide-dc") === "true" : false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const isAllLocations = locationId === ALL_LOCATIONS;
  const effectiveViewMode = debouncedSearch.length >= 2 ? "flat" : viewMode;

  const locationsQuery = useLocations(token!);
  const orgLocations = useMemo(() => {
    return (locationsQuery.data?.data ?? []).filter((location: LocationRow) => location.isActive);
  }, [locationsQuery.data]);

  const familiesQuery = useProductFamilies(token!, apiLocationId!);
  const families = useMemo(() => {
    const rows = familiesQuery.data?.data ?? [];
    return [...rows].sort((a, b) => a.name.localeCompare(b.name));
  }, [familiesQuery.data]);

  const categoriesQuery = useCategories(token!, apiLocationId!);
  const filteredCategories = useMemo(() => {
    const categories = categoriesQuery.data?.data ?? [];
    const sorted = [...categories].sort((a, b) => a.name.localeCompare(b.name));
    if (!familyFilter) return sorted;
    return sorted.filter((category) => category.familyId === familyFilter);
  }, [categoriesQuery.data, familyFilter]);

  const subcategoriesQuery = useSubcategories(token!, apiLocationId!, (categoryFilter && categoryFilter !== "__none__") ? categoryFilter : undefined);
  const allSubcategoriesQuery = useSubcategories(token!, apiLocationId!);
  const filteredSubcategories = useMemo(() => {
    const rows = subcategoriesQuery.data?.data ?? [];
    return [...rows].sort((a, b) => a.name.localeCompare(b.name));
  }, [subcategoriesQuery.data]);
  const allSubcategories = useMemo(() => {
    const rows = allSubcategoriesQuery.data?.data ?? [];
    return [...rows].sort((a, b) => a.name.localeCompare(b.name));
  }, [allSubcategoriesQuery.data]);

  const brandsQuery = useBrands(token!, apiLocationId!);
  const brandsList = useMemo(() => {
    const rows = brandsQuery.data?.data ?? [];
    return [...rows].sort((a, b) => a.name.localeCompare(b.name));
  }, [brandsQuery.data]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, familyFilter, categoryFilter, subCategoryFilter, stockStatusFilter, brandFilter, sortBy, sortDir, locationId, pageSize, viewMode]);

  const { data, isLoading, isFetching } = useProducts(token!, apiLocationId!, {
    search: debouncedSearch,
    familyId: familyFilter || undefined,
    categoryId: categoryFilter || undefined,
    subcategoryId: subCategoryFilter || undefined,
    stockStatus: stockStatusFilter,
    brandId: brandFilter || undefined,
    sortBy,
    sortDir,
    page,
    limit: pageSize,
    parentOnly: true,
    allLocations: isAllLocations,
    excludeSO: hideSO || undefined,
    excludeDC: hideDC || undefined,
  });

  const products = data?.data ?? [];
  const totalItems = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;
  const hasMore = data?.hasMore ?? false;

  const submitSearch = useCallback(() => {
    const value = searchInputRef.current?.value?.trim() ?? searchQuery.trim();
    setSearchQuery(value);
    setDebouncedSearch(value);
    setPage(1);
  }, [searchQuery]);

  const clearSearch = useCallback(() => {
    setSearchQuery("");
    setDebouncedSearch("");
    setPage(1);
    if (searchInputRef.current) searchInputRef.current.value = "";
  }, []);

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
    familyFilter !== "" || categoryFilter !== "" || subCategoryFilter !== "" || stockStatusFilter !== "" || brandFilter !== "" || searchQuery.trim() !== "" || hideSO || hideDC;

  const clearAllFilters = useCallback(() => {
    setFamilyFilter("");
    setCategoryFilter("");
    setSubCategoryFilter("");
    setStockStatusFilter("");
    setBrandFilter("");
    setSearchQuery("");
    setDebouncedSearch("");
    setHideSO(false);
    setHideDC(false);
    if (typeof window !== "undefined") {
      localStorage.setItem("item-list-hide-so", "false");
      localStorage.setItem("item-list-hide-dc", "false");
    }
  }, []);

  const toggleHideSO = useCallback(() => {
    const next = !hideSO;
    setHideSO(next);
    localStorage.setItem("item-list-hide-so", String(next));
    setPage(1);
  }, [hideSO]);

  const toggleHideDC = useCallback(() => {
    const next = !hideDC;
    setHideDC(next);
    localStorage.setItem("item-list-hide-dc", String(next));
    setPage(1);
  }, [hideDC]);

  return {
    allSubcategories,
    brandFilter,
    brandsList,
    categoryFilter,
    clearAllFilters,
    clearSearch,
    debouncedSearch,
    effectiveViewMode,
    families,
    familyFilter,
    filteredCategories,
    filteredSubcategories,
    handleSort,
    hasActiveFilters,
    hasMore,
    hideDC,
    hideSO,
    isAllLocations,
    isFetching,
    isLoading,
    orgLocations,
    page,
    pageSize,
    products,
    searchInputRef,
    searchQuery,
    setBrandFilter,
    setCategoryFilter,
    setFamilyFilter,
    setPage,
    setPageSize,
    setSearchQuery,
    setSubCategoryFilter,
    setStockStatusFilter,
    setViewMode,
    sortBy,
    sortDir,
    stockStatusFilter,
    subCategoryFilter,
    submitSearch,
    toggleHideDC,
    toggleHideSO,
    totalItems,
    totalPages,
    viewMode,
  };
}

export type InventoryWorkspaceController = ReturnType<typeof useInventoryWorkspace>;
