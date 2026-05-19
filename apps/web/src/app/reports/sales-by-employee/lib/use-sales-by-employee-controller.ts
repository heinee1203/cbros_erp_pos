"use client";

import { useMemo, useState } from "react";
import { useAuth } from "@/app/auth-context";
import {
  useSalesByEmployeeQuery,
  useSalesSummaryQuery,
  type ReportFilters,
} from "@/hooks/use-sales-reports";
import type { SalesByEmployeeController, SortField, SortDir } from "../types";
import { exportSalesByEmployeeCsv } from "../utils";

export function useSalesByEmployeeController(): SalesByEmployeeController {
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

  const reportQuery = useSalesByEmployeeQuery(token, locationId, filters);
  const summaryQuery = useSalesSummaryQuery(token, locationId, filters);
  const rawEmployees = reportQuery.data?.data ?? [];

  const filtered = useMemo(() => {
    let result = [...rawEmployees];

    if (search.length >= 2) {
      const query = search.toLowerCase();
      result = result.filter((employee) => employee.employeeName.toLowerCase().includes(query));
    }

    result.sort((a, b) => {
      let first: number;
      let second: number;
      switch (sortBy) {
        case "totalSales":
          first = a.totalSales;
          second = b.totalSales;
          break;
        case "totalRevenue":
          first = parseFloat(a.totalRevenue);
          second = parseFloat(b.totalRevenue);
          break;
        case "avgSaleValue":
          first = parseFloat(a.avgSaleValue);
          second = parseFloat(b.avgSaleValue);
          break;
        case "totalDiscounts":
          first = parseFloat(a.totalDiscounts);
          second = parseFloat(b.totalDiscounts);
          break;
        case "refundCount":
          first = a.refundCount;
          second = b.refundCount;
          break;
        default:
          first = parseFloat(a.totalRevenue);
          second = parseFloat(b.totalRevenue);
      }
      return sortDir === "desc" ? second - first : first - second;
    });

    return result;
  }, [rawEmployees, search, sortBy, sortDir]);

  const totalRev = filtered.reduce((sum, employee) => sum + parseFloat(employee.totalRevenue), 0);
  const totalDisc = filtered.reduce((sum, employee) => sum + parseFloat(employee.totalDiscounts), 0);
  const avgPerEmployee = filtered.length > 0 ? totalRev / filtered.length : 0;
  const maxRevenue = Math.max(...filtered.map((employee) => parseFloat(employee.totalRevenue)), 1);

  function handleSort(field: SortField) {
    if (field === sortBy) setSortDir(sortDir === "desc" ? "asc" : "desc");
    else {
      setSortBy(field);
      setSortDir("desc");
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
    totalRev,
    totalDisc,
    avgPerEmployee,
    isLoading: reportQuery.isLoading,
    hasFilters: !!(search || dateFrom || dateTo),
    setDateRange,
    setSearch: setSearchState,
    resetFilters,
    handleSort,
    exportCsv: () => exportSalesByEmployeeCsv(filtered),
  };
}
