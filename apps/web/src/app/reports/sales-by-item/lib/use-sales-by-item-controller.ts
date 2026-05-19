"use client";

import { useMemo, useState } from "react";
import { useAuth } from "@/app/auth-context";
import {
  useSalesByItemQuery,
  useSalesSummaryQuery,
  type ReportFilters,
} from "@/hooks/use-sales-reports";
import type { SalesByItemController, SortField, SortDir } from "../types";
import { exportSalesByItemCsv } from "../utils";

export function useSalesByItemController(): SalesByItemController {
  const { token, locationId } = useAuth();
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [sortBy, setSortBy] = useState<SortField>("totalRevenue");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(50);

  const filters: ReportFilters = {
    from: dateFrom ? `${dateFrom}T00:00:00Z` : undefined,
    to: dateTo ? `${dateTo}T23:59:59Z` : undefined,
  };

  const reportQuery = useSalesByItemQuery(token, locationId, filters);
  const summaryQuery = useSalesSummaryQuery(token, locationId, filters);
  const rawItems = reportQuery.data?.data ?? [];

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const item of rawItems) {
      if (item.categoryName) set.add(item.categoryName);
    }
    return [...set].sort();
  }, [rawItems]);

  const filtered = useMemo(() => {
    let result = rawItems;

    if (search.length >= 2) {
      const query = search.toLowerCase();
      result = result.filter(
        (item) =>
          item.productName.toLowerCase().includes(query) ||
          item.sku.toLowerCase().includes(query) ||
          (item.mnemonicSku && item.mnemonicSku.toLowerCase().includes(query)),
      );
    }

    if (categoryFilter) {
      result = result.filter((item) => item.categoryName === categoryFilter);
    }

    result = [...result].sort((a, b) => {
      let first: number;
      let second: number;
      switch (sortBy) {
        case "unitsSold":
          first = a.unitsSold;
          second = b.unitsSold;
          break;
        case "totalRevenue":
          first = parseFloat(a.totalRevenue);
          second = parseFloat(b.totalRevenue);
          break;
        case "totalCost":
          first = parseFloat(a.totalCost);
          second = parseFloat(b.totalCost);
          break;
        case "grossProfit":
          first = parseFloat(a.grossProfit);
          second = parseFloat(b.grossProfit);
          break;
        case "marginPct":
          first = parseFloat(a.marginPct);
          second = parseFloat(b.marginPct);
          break;
        default:
          first = parseFloat(a.totalRevenue);
          second = parseFloat(b.totalRevenue);
      }
      return sortDir === "desc" ? second - first : first - second;
    });

    return result;
  }, [rawItems, search, categoryFilter, sortBy, sortDir]);

  const totalPages = Math.ceil(filtered.length / perPage);
  const paginated = filtered.slice((page - 1) * perPage, page * perPage);

  function setDateRange(start: string, end: string) {
    setDateFrom(start);
    setDateTo(end);
    setPage(1);
  }

  function setSearchFilter(value: string) {
    setSearch(value);
    setPage(1);
  }

  function setCategoryFilterValue(value: string) {
    setCategoryFilter(value);
    setPage(1);
  }

  function setPerPageValue(value: number) {
    setPerPage(value);
    setPage(1);
  }

  function handleSort(field: SortField) {
    if (field === sortBy) setSortDir(sortDir === "desc" ? "asc" : "desc");
    else {
      setSortBy(field);
      setSortDir("desc");
    }
    setPage(1);
  }

  function resetFilters() {
    setSearch("");
    setCategoryFilter("");
    setDateFrom("");
    setDateTo("");
    setSortBy("totalRevenue");
    setSortDir("desc");
    setPage(1);
  }

  return {
    dateFrom,
    dateTo,
    search,
    categoryFilter,
    sortBy,
    sortDir,
    page,
    perPage,
    categories,
    filtered,
    paginated,
    summary: summaryQuery.data,
    uniqueItemCount: filtered.length,
    totalPages,
    isLoading: reportQuery.isLoading,
    hasActiveFilters: !!(search || categoryFilter || dateFrom || dateTo),
    setDateRange,
    setSearchFilter,
    setCategoryFilterValue,
    setPage,
    setPerPageValue,
    resetFilters,
    handleSort,
    exportCsv: () => exportSalesByItemCsv(filtered),
  };
}
