"use client";

import { useMemo, useState } from "react";
import { useAuth } from "@/app/auth-context";
import { useBrands } from "@/hooks/use-brands";
import { useCategories } from "@/hooks/use-categories";
import { useInventoryValuation, type GroupByOption } from "@/hooks/use-inventory-valuation";
import { useLocations } from "@/hooks/use-locations";
import type { InventoryValuationController, SortField, SortDir } from "../types";
import { CHART_COLORS, UNASSIGNED_GROUPS, exportInventoryValuationCsv } from "../utils";

export function useInventoryValuationController(): InventoryValuationController {
  const { token, locationId } = useAuth();
  const [groupBy, setGroupBy] = useState<GroupByOption>("category");
  const [filterLocationId, setFilterLocationId] = useState("");
  const [filterCategoryId, setFilterCategoryId] = useState("");
  const [filterBrandId, setFilterBrandId] = useState("");
  const [excludeZeroCost, setExcludeZeroCost] = useState(false);
  const [excludeZeroSell, setExcludeZeroSell] = useState(false);
  const [excludeUnassigned, setExcludeUnassigned] = useState(false);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortField>("costValue");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [dismissWarning, setDismissWarning] = useState(false);

  const locationsQuery = useLocations(token);
  const categoriesQuery = useCategories(token, locationId);
  const brandsQuery = useBrands(token, locationId);
  const valuationQuery = useInventoryValuation(token, locationId, {
    groupBy,
    filterLocationId: filterLocationId || undefined,
    categoryId: filterCategoryId || undefined,
    brandId: filterBrandId || undefined,
    excludeZeroCost,
    excludeZeroSell,
  });

  const locations = locationsQuery.data?.data?.filter((location) => location.isActive && !location.isSystem) ?? [];
  const categories = (categoriesQuery.data?.data ?? []).filter((category) => category.isActive !== false);
  const brands = (brandsQuery.data?.data ?? []).filter((brand) => brand.isActive !== false);
  const totals = valuationQuery.data?.totals;
  const rawGroups = valuationQuery.data?.groups ?? [];

  const filtered = useMemo(() => {
    let result = [...rawGroups];
    if (excludeUnassigned) {
      result = result.filter((group) => !UNASSIGNED_GROUPS.has(group.groupName));
    }
    if (search.length >= 2) {
      const query = search.toLowerCase();
      result = result.filter((group) => group.groupName.toLowerCase().includes(query));
    }
    result.sort((a, b) => {
      const first = a[sortBy] as number;
      const second = b[sortBy] as number;
      return sortDir === "desc" ? second - first : first - second;
    });
    return result;
  }, [rawGroups, search, sortBy, sortDir, excludeUnassigned]);

  const maxCostValue = Math.max(...filtered.map((group) => group.costValue), 1);

  const chartData = useMemo(() => {
    const sorted = [...filtered].sort((a, b) => b.costValue - a.costValue);
    const top5 = sorted.slice(0, 5);
    const otherSum = sorted.slice(5).reduce((sum, group) => sum + group.costValue, 0);
    const filteredTotal = sorted.reduce((sum, group) => sum + group.costValue, 0) || 1;
    const slices = top5.map((group, index) => ({
      name: group.groupName,
      value: group.costValue,
      pctOfTotal: group.pctOfTotal,
      fill: CHART_COLORS[index],
    }));
    if (otherSum > 0) {
      slices.push({
        name: "Other",
        value: otherSum,
        pctOfTotal: Math.round((otherSum / filteredTotal) * 1000) / 10,
        fill: CHART_COLORS[5],
      });
    }
    return slices;
  }, [filtered]);

  function handleSort(field: SortField) {
    if (field === sortBy) setSortDir(sortDir === "desc" ? "asc" : "desc");
    else {
      setSortBy(field);
      setSortDir("desc");
    }
  }

  function resetFilters() {
    setSearch("");
    setFilterLocationId("");
    setFilterCategoryId("");
    setFilterBrandId("");
    setExcludeZeroCost(false);
    setExcludeZeroSell(false);
    setExcludeUnassigned(false);
    setSortBy("costValue");
    setSortDir("desc");
  }

  function setGroupByOption(option: GroupByOption) {
    setGroupBy(option);
    setExpandedGroup(null);
  }

  return {
    groupBy,
    filterLocationId,
    filterCategoryId,
    filterBrandId,
    excludeZeroCost,
    excludeZeroSell,
    excludeUnassigned,
    search,
    sortBy,
    sortDir,
    expandedGroup,
    dismissWarning,
    locations,
    categories,
    brands,
    totals,
    filtered,
    chartData,
    maxCostValue,
    isLoading: valuationQuery.isLoading,
    hasFilters: !!(
      search ||
      filterLocationId ||
      filterCategoryId ||
      filterBrandId ||
      excludeZeroCost ||
      excludeZeroSell ||
      excludeUnassigned
    ),
    setFilterLocationId,
    setFilterCategoryId,
    setFilterBrandId,
    setExcludeZeroCost,
    setExcludeZeroSell,
    setExcludeUnassigned,
    setSearch,
    setExpandedGroup,
    setDismissWarning,
    setGroupByOption,
    resetFilters,
    handleSort,
    exportCsv: () => exportInventoryValuationCsv(groupBy, filtered),
  };
}
