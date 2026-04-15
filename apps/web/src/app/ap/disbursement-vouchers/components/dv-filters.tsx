"use client";

import { useState, useEffect } from "react";
import { Search, X } from "lucide-react";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import type { Supplier } from "./dv-types";

interface DVFiltersProps {
  suppliers: Supplier[];
  supplierFilter: string;
  onSupplierChange: (v: string) => void;
  statusFilter: string;
  onStatusChange: (v: string) => void;
  methodFilter: string;
  onMethodChange: (v: string) => void;
  dateFrom: string;
  dateTo: string;
  onDateRangeChange: (start: string, end: string) => void;
  onSearchChange: (v: string) => void;
}

export function DVFilters({
  suppliers,
  supplierFilter,
  onSupplierChange,
  statusFilter,
  onStatusChange,
  methodFilter,
  onMethodChange,
  dateFrom,
  dateTo,
  onDateRangeChange,
  onSearchChange,
}: DVFiltersProps) {
  const [searchText, setSearchText] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => onSearchChange(searchText), 300);
    return () => clearTimeout(timer);
  }, [searchText, onSearchChange]);

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <div className="relative flex-1 min-w-[200px] max-w-sm">
        <Search
          size={14}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
        />
        <input
          type="text"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          placeholder="Search DV #, supplier..."
          className="h-8 w-full rounded-lg border border-border bg-background pl-9 pr-8 text-[12px] outline-none focus:border-primary/40 focus:ring-1 focus:ring-primary/20"
        />
        {searchText && (
          <button
            onClick={() => setSearchText("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X size={12} />
          </button>
        )}
      </div>

      <select
        value={supplierFilter}
        onChange={(e) => onSupplierChange(e.target.value)}
        className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-primary"
      >
        <option value="">All Suppliers</option>
        {suppliers.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}{!s.isActive ? " (inactive)" : ""}
          </option>
        ))}
      </select>

      <select
        value={statusFilter}
        onChange={(e) => onStatusChange(e.target.value)}
        className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-primary"
      >
        <option value="">All Statuses</option>
        <option value="DRAFT">Draft</option>
        <option value="PRINTED">Printed</option>
        <option value="CONFIRMED">Confirmed</option>
        <option value="VOIDED">Voided</option>
      </select>

      <select
        value={methodFilter}
        onChange={(e) => onMethodChange(e.target.value)}
        className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-primary"
      >
        <option value="">All Methods</option>
        <option value="CHECK">Check</option>
        <option value="CASH">Cash</option>
        <option value="BANK_TRANSFER">Bank Transfer</option>
        <option value="ONLINE">Online</option>
      </select>

      <DateRangePicker
        startDate={dateFrom}
        endDate={dateTo}
        onChange={(start, end) => onDateRangeChange(start, end)}
      />
    </div>
  );
}
