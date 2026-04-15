"use client";

import { useState, useEffect } from "react";
import { Search, X } from "lucide-react";
import { DateRangePicker } from "@/components/ui/date-range-picker";

interface Supplier {
  id: string;
  name: string;
  isActive: boolean;
}

interface InvoiceFiltersProps {
  suppliers: Supplier[];
  supplierFilter: string;
  onSupplierFilterChange: (v: string) => void;
  statusFilter: string;
  onStatusFilterChange: (v: string) => void;
  overdueOnly: boolean;
  onOverdueOnlyChange: (v: boolean) => void;
  dateFrom: string;
  dateTo: string;
  onDateRangeChange: (start: string, end: string) => void;
  onSearchChange: (v: string) => void;
}

export function InvoiceFilters({
  suppliers,
  supplierFilter,
  onSupplierFilterChange,
  statusFilter,
  onStatusFilterChange,
  overdueOnly,
  onOverdueOnlyChange,
  dateFrom,
  dateTo,
  onDateRangeChange,
  onSearchChange,
}: InvoiceFiltersProps) {
  const [searchText, setSearchText] = useState("");

  // Debounce search — send to parent after 300ms
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
          placeholder="Search invoice #, supplier, notes..."
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
        onChange={(e) => onSupplierFilterChange(e.target.value)}
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
        onChange={(e) => onStatusFilterChange(e.target.value)}
        className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-primary"
      >
        <option value="">All Statuses</option>
        <option value="OPEN">Open</option>
        <option value="PARTIALLY_PAID">Partially Paid</option>
        <option value="PAID">Paid</option>
        <option value="VOIDED">Void</option>
      </select>

      <label className="flex items-center gap-1.5 text-sm">
        <input
          type="checkbox"
          checked={overdueOnly}
          onChange={(e) => onOverdueOnlyChange(e.target.checked)}
          className="rounded border-border"
        />
        Overdue only
      </label>

      <DateRangePicker
        startDate={dateFrom}
        endDate={dateTo}
        onChange={(start, end) => onDateRangeChange(start, end)}
      />
    </div>
  );
}
