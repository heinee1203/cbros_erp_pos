"use client";

import { useState } from "react";
import { useAuth } from "@/app/auth-context";
import { useDiscountAnalysisQuery, type ReportFilters } from "@/hooks/use-sales-reports";
import type { DiscountAnalysisController, DiscountAnalysisTab, DiscountPreset } from "../types";
import { getDatePreset } from "../utils";

export function useDiscountAnalysisController(): DiscountAnalysisController {
  const { token, locationId } = useAuth();
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [activePreset, setActivePreset] = useState<DiscountPreset | null>(null);
  const [tab, setTab] = useState<DiscountAnalysisTab>("employee");

  const filters: ReportFilters = {
    from: dateFrom ? `${dateFrom}T00:00:00Z` : undefined,
    to: dateTo ? `${dateTo}T23:59:59Z` : undefined,
  };

  const query = useDiscountAnalysisQuery(token, locationId, filters);

  function applyPreset(preset: DiscountPreset) {
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

  return {
    dateFrom,
    dateTo,
    activePreset,
    tab,
    data: query.data,
    summary: query.data?.summary,
    isLoading: query.isLoading,
    applyPreset,
    clearDates,
    setDateRange,
    setTab,
  };
}
