"use client";

import { useMemo, useState } from "react";
import { useAuth } from "@/app/auth-context";
import {
  useSalesByCategoryQuery,
  useSalesSummaryQuery,
  type ReportFilters,
} from "@/hooks/use-sales-reports";
import type { CategorySalesRow, SalesByCategoryController, SortField, SortDir } from "../types";
import { EXCLUDED_CATEGORIES, categoryDisplayName, exportSalesByCategoryCsv } from "../utils";

export function useSalesByCategoryController(): SalesByCategoryController {
  const { token, locationId } = useAuth();
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [search, setSearchState] = useState("");
  const [sortBy, setSortBy] = useState<SortField>("totalRevenue");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const filters: ReportFilters = {
    from: dateFrom ? `${dateFrom}T00:00:00Z` : undefined,
    to: dateTo ? `${dateTo}T23:59:59Z` : undefined,
  };

  const reportQuery = useSalesByCategoryQuery(token, locationId, filters);
  const summaryQuery = useSalesSummaryQuery(token, locationId, filters);
  const rawCategories = (reportQuery.data?.data ?? []) as CategorySalesRow[];

  const filtered = useMemo(() => {
    let result = rawCategories.filter((category) => {
      const name = categoryDisplayName(category).toLowerCase();
      return !EXCLUDED_CATEGORIES.has(name);
    });

    if (search.length >= 2) {
      const query = search.toLowerCase();
      result = result.filter((category) => categoryDisplayName(category).toLowerCase().includes(query));
    }

    result = [...result].sort((a, b) => {
      let first: number | string;
      let second: number | string;
      switch (sortBy) {
        case "categoryName":
          first = categoryDisplayName(a).toLowerCase();
          second = categoryDisplayName(b).toLowerCase();
          return sortDir === "asc"
            ? first < second ? -1 : 1
            : second < first ? -1 : 1;
        case "unitsSold":
          first = a.unitsSold;
          second = b.unitsSold;
          break;
        case "totalRevenue":
          first = parseFloat(a.totalRevenue);
          second = parseFloat(b.totalRevenue);
          break;
        case "grossProfit":
          first = parseFloat(a.grossProfit);
          second = parseFloat(b.grossProfit);
          break;
        case "marginPct":
          first = parseFloat(a.marginPct);
          second = parseFloat(b.marginPct);
          break;
        case "uniqueProducts":
          first = a.uniqueProducts;
          second = b.uniqueProducts;
          break;
        default:
          first = parseFloat(a.totalRevenue);
          second = parseFloat(b.totalRevenue);
      }
      return sortDir === "desc" ? (second as number) - (first as number) : (first as number) - (second as number);
    });

    return result;
  }, [rawCategories, search, sortBy, sortDir]);

  const maxRevenue = Math.max(...filtered.map((category) => parseFloat(category.totalRevenue)), 1);
  const totalProfit = filtered.reduce((sum, category) => sum + parseFloat(category.grossProfit), 0);
  const totalRevenue = filtered.reduce((sum, category) => sum + parseFloat(category.totalRevenue), 0);
  const avgMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

  function handleSort(field: SortField) {
    if (field === sortBy) setSortDir(sortDir === "desc" ? "asc" : "desc");
    else {
      setSortBy(field);
      setSortDir(field === "categoryName" ? "asc" : "desc");
    }
  }

  function setDateRange(start: string, end: string) {
    setDateFrom(start);
    setDateTo(end);
  }

  function resetFilters() {
    setSearchState("");
    setDateFrom("");
    setDateTo("");
    setSortBy("totalRevenue");
    setSortDir("desc");
  }

  return {
    dateFrom,
    dateTo,
    search,
    sortBy,
    sortDir,
    filtered,
    summary: summaryQuery.data,
    maxRevenue,
    totalProfit,
    totalRevenue,
    avgMargin,
    isLoading: reportQuery.isLoading,
    hasFilters: !!(search || dateFrom || dateTo),
    setDateRange,
    setSearch: setSearchState,
    resetFilters,
    handleSort,
    exportCsv: () => exportSalesByCategoryCsv(filtered),
  };
}
