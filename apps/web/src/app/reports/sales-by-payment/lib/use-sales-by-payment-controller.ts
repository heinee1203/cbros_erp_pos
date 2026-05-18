"use client";

import { useState } from "react";
import { useAuth } from "@/app/auth-context";
import { useSalesByPaymentQuery, type ReportFilters } from "@/hooks/use-sales-reports";
import type { SalesByPaymentController } from "../types";
import { exportSalesByPaymentCsv, getDatePreset } from "../utils";

export function useSalesByPaymentController(): SalesByPaymentController {
  const { token, locationId } = useAuth();
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [activePreset, setActivePreset] = useState<string | null>(null);

  const filters: ReportFilters = {
    from: dateFrom ? `${dateFrom}T00:00:00Z` : undefined,
    to: dateTo ? `${dateTo}T23:59:59Z` : undefined,
  };

  const query = useSalesByPaymentQuery(token, locationId, filters);
  const rows = query.data?.data ?? [];

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

  return {
    dateFrom,
    dateTo,
    activePreset,
    rows,
    grandTotal: query.data?.grandTotal ?? 0,
    isLoading: query.isLoading,
    applyPreset,
    clearDates,
    setDateRange,
    exportCsv: () => exportSalesByPaymentCsv(rows),
  };
}
