"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/app/auth-context";
import { apiFetch } from "@/lib/api";
import type { DemandByTagController, DemandRow, SortDir, SortKey, TagTypeFilter } from "../types";
import { exportDemandByTagCsv, getDatePreset } from "../utils";

export function useDemandByTagController(): DemandByTagController {
  const { token, locationId } = useAuth();
  const [tagTypeFilter, setTagTypeFilter] = useState<TagTypeFilter>("ALL");
  const [rimSizeFilter, setRimSizeFilter] = useState("All");
  const [dateFrom, setDateFrom] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() - 90);
    return date.toISOString().slice(0, 10);
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [activePreset, setActivePreset] = useState<string | null>("90d");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("unitsSold");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [expandedTagId, setExpandedTagId] = useState<string | null>(null);

  const reportQuery = useQuery({
    queryKey: ["demand-by-tag", tagTypeFilter, dateFrom, dateTo],
    queryFn: () => {
      const params = new URLSearchParams();
      if (tagTypeFilter !== "ALL") params.set("tagType", tagTypeFilter);
      if (dateFrom) params.set("from", `${dateFrom}T00:00:00Z`);
      if (dateTo) params.set("to", `${dateTo}T23:59:59Z`);
      params.set("limit", "200");
      const qs = params.toString();
      return apiFetch<{ data: DemandRow[] }>(`/tags/demand${qs ? `?${qs}` : ""}`, {
        token: token!,
        locationId,
      });
    },
    enabled: !!token,
  });

  const rawRows: DemandRow[] = (reportQuery.data?.data ?? []).map((row) => {
    const apiRow = row as DemandRow & { totalStock?: number | string };
    return {
      ...apiRow,
      unitsSold: Number(apiRow.unitsSold ?? apiRow.totalQtySold ?? 0),
      totalQtySold: Number(apiRow.totalQtySold ?? apiRow.unitsSold ?? 0),
      revenue: Number(apiRow.revenue ?? apiRow.totalRevenue ?? 0),
      totalRevenue: Number(apiRow.totalRevenue ?? apiRow.revenue ?? 0),
      productCount: Number(apiRow.productCount ?? 0),
      stockLeft: Number(apiRow.stockLeft ?? apiRow.totalStock ?? 0),
      daysOfStock: apiRow.daysOfStock != null ? Number(apiRow.daysOfStock) : null,
    };
  });

  const rows = useMemo(() => {
    let result = rawRows;
    if (search.trim()) {
      const query = search.toLowerCase();
      result = result.filter((row) => row.tagName.toLowerCase().includes(query));
    }
    if (rimSizeFilter !== "All" && tagTypeFilter === "TIRE_SIZE") {
      result = result.filter((row) => row.tagName.includes(rimSizeFilter));
    }
    const numericKeys = new Set(["unitsSold", "totalQtySold", "revenue", "totalRevenue", "productCount", "stockLeft", "daysOfStock"]);
    result = [...result].sort((a, b) => {
      const first = a[sortKey];
      const second = b[sortKey];
      if (numericKeys.has(sortKey)) {
        const firstNumber = Number(first ?? 0);
        const secondNumber = Number(second ?? 0);
        return sortDir === "asc" ? firstNumber - secondNumber : secondNumber - firstNumber;
      }
      const firstString = String(first ?? "");
      const secondString = String(second ?? "");
      return sortDir === "asc" ? firstString.localeCompare(secondString) : secondString.localeCompare(firstString);
    });
    return result;
  }, [rawRows, search, sortKey, sortDir, rimSizeFilter, tagTypeFilter]);

  const rimSizes = useMemo(() => {
    const sizes = new Set<string>();
    rawRows
      .filter((row) => row.tagType === "TIRE_SIZE")
      .forEach((row) => {
        const match = row.tagName.match(/R(\d+)/);
        if (match) sizes.add(`R${match[1]}`);
      });
    return ["All", ...Array.from(sizes).sort((a, b) => parseInt(a.slice(1)) - parseInt(b.slice(1)))];
  }, [rawRows]);

  function applyPreset(preset: string) {
    setActivePreset(preset);
    const { from, to } = getDatePreset(preset);
    setDateFrom(from.slice(0, 10));
    setDateTo(to.slice(0, 10));
  }

  function clearDates() {
    setDateFrom("");
    setDateTo("");
    setActivePreset(null);
  }

  function setDateRange(start: string, end: string) {
    setDateFrom(start);
    setDateTo(end);
    setActivePreset(null);
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((direction) => (direction === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  function setTagTypeFilterOption(filter: TagTypeFilter) {
    setTagTypeFilter(filter);
    if (filter !== "TIRE_SIZE") setRimSizeFilter("All");
  }

  const totalUnits = rows.reduce((sum, row) => sum + (row.unitsSold ?? row.totalQtySold ?? 0), 0);
  const mostInDemand =
    rows.length > 0
      ? [...rows].sort((a, b) => (b.unitsSold ?? b.totalQtySold ?? 0) - (a.unitsSold ?? a.totalQtySold ?? 0))[0]?.tagName
      : "-";

  return {
    token,
    locationId,
    tagTypeFilter,
    rimSizeFilter,
    dateFrom,
    dateTo,
    activePreset,
    search,
    sortKey,
    sortDir,
    expandedTagId,
    rows,
    rimSizes,
    isLoading: reportQuery.isLoading,
    totalApplications: rows.length,
    totalUnits,
    mostInDemand,
    setRimSizeFilter,
    setSearch,
    setExpandedTagId,
    setTagTypeFilterOption,
    setDateRange,
    applyPreset,
    clearDates,
    toggleSort,
    exportCsv: () => exportDemandByTagCsv(rows),
  };
}
