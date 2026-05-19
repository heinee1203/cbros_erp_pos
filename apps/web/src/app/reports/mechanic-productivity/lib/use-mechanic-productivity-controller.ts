"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/app/auth-context";
import { apiFetch } from "@/lib/api";
import { useLocations } from "@/hooks/use-locations";
import { useCommissions } from "@/hooks/use-technicians";
import type { MechanicData, MechanicProductivityController, SortDir, SortField } from "../types";
import { exportCommissionReport, mergeProductivityWithCommissions, sortMechanicRows } from "../utils";

export function useMechanicProductivityController(): MechanicProductivityController {
  const { token, locationId } = useAuth();
  const locationsQuery = useLocations(token);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortBy, setSortBy] = useState<SortField>("revenue");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [showFormula, setShowFormula] = useState<string | null>(null);

  const locationMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const location of locationsQuery.data?.data ?? []) {
      map.set(location.id, location.name);
    }
    return map;
  }, [locationsQuery.data]);

  const prodQuery = useQuery<MechanicData>({
    queryKey: ["mechanic-productivity", dateFrom, dateTo, locationId],
    queryFn: () => {
      const params = new URLSearchParams();
      params.set("allLocations", "true");
      if (dateFrom) params.set("from", `${dateFrom}T00:00:00Z`);
      if (dateTo) params.set("to", `${dateTo}T23:59:59Z`);
      return apiFetch<MechanicData>(`/reports/mechanic-productivity?${params.toString()}`, { token, locationId });
    },
    enabled: !!token && !!locationId,
    staleTime: 30_000,
  });

  const commFrom = dateFrom ? `${dateFrom}T00:00:00Z` : "2020-01-01T00:00:00Z";
  const commTo = dateTo ? `${dateTo}T23:59:59Z` : "2030-12-31T23:59:59Z";

  const commQuery = useCommissions(token, locationId, {
    from: commFrom,
    to: commTo,
    enabled: true,
  });

  const merged = useMemo(
    () => mergeProductivityWithCommissions(prodQuery.data?.data ?? [], commQuery.data?.data ?? []),
    [prodQuery.data, commQuery.data],
  );

  const sorted = useMemo(() => sortMechanicRows(merged, sortBy, sortDir), [merged, sortBy, sortDir]);
  const totalCommission = merged.reduce((sum, row) => sum + row.commission, 0);
  const maxRevenue = Math.max(...merged.map((row) => row.revenue), 1);

  function handleSort(field: SortField) {
    if (field === sortBy) {
      setSortDir(sortDir === "desc" ? "asc" : "desc");
      return;
    }

    setSortBy(field);
    setSortDir(field === "technicianName" ? "asc" : "desc");
  }

  function setDateRange(start: string, end: string) {
    setDateFrom(start);
    setDateTo(end);
  }

  function toggleFormula(technicianId: string | null) {
    setShowFormula(showFormula === technicianId ? null : technicianId);
  }

  return {
    dateFrom,
    dateTo,
    sortBy,
    sortDir,
    showFormula,
    sorted,
    merged,
    locationMap,
    summary: prodQuery.data?.summary,
    commSummary: commQuery.data?.summary,
    totalCommission,
    maxRevenue,
    isLoading: prodQuery.isLoading,
    setDateRange,
    handleSort,
    toggleFormula,
    exportCsv: () => exportCommissionReport(sorted),
  };
}
