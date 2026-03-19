"use client";

import { useState, useMemo, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ClipboardCheck,
  Search,
  X,
  Plus,
  ChevronDown,
  Loader2,
  ChevronsDown,
} from "lucide-react";
import { useAuth } from "@/app/auth-context";
import {
  useCountSessions,
  type CountSessionRow,
  type CountListFilters,
} from "@/hooks/use-inventory-counts";

/* ═══════════════════════════════════════════════════════
 * CONSTANTS
 * ═══════════════════════════════════════════════════════ */

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  IN_PROGRESS: "In Progress",
  COMPLETED: "Completed",
  REVIEWED: "Reviewed",
  POSTED: "Posted",
  CANCELLED: "Cancelled",
};

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
  IN_PROGRESS: "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  COMPLETED: "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  REVIEWED: "bg-violet-50 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400",
  POSTED: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  CANCELLED: "bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400",
};

const SCOPE_LABELS: Record<string, string> = {
  FULL_LOCATION: "Full",
  CATEGORY: "Cycle",
  FAMILY: "Cycle",
  SELECTED_SKUS: "Cycle",
};

const ALL_STATUSES = Object.keys(STATUS_LABELS);

/* ═══════════════════════════════════════════════════════
 * PAGE
 * ═══════════════════════════════════════════════════════ */

export default function InventoryCountsListPage() {
  const { token, locationId, locations, loading: authLoading } = useAuth();
  const router = useRouter();

  const [statusFilter, setStatusFilter] = useState("all");
  const [locationFilter, setLocationFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearch = (v: string) => {
    setSearchQuery(v);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setDebouncedSearch(v), 300);
  };

  const filters: CountListFilters = {
    allLocations: locationFilter === "all" || locationFilter !== locationId,
    status: statusFilter !== "all" ? statusFilter : undefined,
    search: debouncedSearch || undefined,
  };

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
    error,
  } = useCountSessions(token, locationId, filters);

  const sessions = useMemo(
    () => {
      let items = data?.pages.flatMap((p) => p.data) ?? [];
      // Client-side filters for type and date range
      if (typeFilter === "Full") {
        items = items.filter((s) => s.scope === "FULL_LOCATION");
      } else if (typeFilter === "Cycle") {
        items = items.filter((s) => s.scope !== "FULL_LOCATION");
      }
      if (dateFrom) {
        const from = new Date(dateFrom);
        items = items.filter((s) => new Date(s.createdAt) >= from);
      }
      if (dateTo) {
        const to = new Date(dateTo + "T23:59:59");
        items = items.filter((s) => new Date(s.createdAt) <= to);
      }
      if (locationFilter !== "all" && locationFilter !== locationId) {
        items = items.filter((s) => s.locationId === locationFilter);
      }
      return items;
    },
    [data, typeFilter, dateFrom, dateTo, locationFilter, locationId],
  );

  const hasFilters =
    statusFilter !== "all" ||
    locationFilter !== "all" ||
    typeFilter !== "all" ||
    dateFrom !== "" ||
    dateTo !== "" ||
    searchQuery !== "";

  const clearFilters = () => {
    setStatusFilter("all");
    setLocationFilter("all");
    setTypeFilter("all");
    setDateFrom("");
    setDateTo("");
    setSearchQuery("");
    setDebouncedSearch("");
  };

  if (authLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 size={20} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border bg-background px-6 py-5">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
            <ClipboardCheck size={18} className="text-muted-foreground" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-foreground">Inventory Counts</h1>
            <p className="text-xs text-muted-foreground">
              Physical inventory counts and cycle counting
            </p>
          </div>
        </div>
        <Link
          href="/inventory/counts/new"
          className="flex items-center gap-2 rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background transition-colors hover:bg-foreground/90"
        >
          <Plus size={16} />
          New Count
        </Link>
      </div>

      {/* Filter Bar */}
      <div className="border-b border-border bg-background/50 px-6 py-3">
        <div className="flex flex-wrap items-center gap-2">
          {/* Status */}
          <FilterSelect
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { value: "all", label: "All Statuses" },
              ...ALL_STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s]! })),
            ]}
          />

          {/* Location */}
          <FilterSelect
            value={locationFilter}
            onChange={setLocationFilter}
            options={[
              { value: "all", label: "All Locations" },
              ...locations.map((l) => ({ value: l.id, label: l.name })),
            ]}
          />

          {/* Type */}
          <FilterSelect
            value={typeFilter}
            onChange={setTypeFilter}
            options={[
              { value: "all", label: "All Types" },
              { value: "Full", label: "Full" },
              { value: "Cycle", label: "Cycle" },
            ]}
          />

          {/* Date From */}
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="h-8 rounded-md border border-border bg-background px-2.5 text-xs text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 [&::-webkit-calendar-picker-indicator]:opacity-50"
            title="From date"
          />

          {/* Date To */}
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="h-8 rounded-md border border-border bg-background px-2.5 text-xs text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 [&::-webkit-calendar-picker-indicator]:opacity-50"
            title="To date"
          />

          {/* Search */}
          <div className="relative ml-auto">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Search counts..."
              className="h-8 w-52 rounded-md border border-border bg-background pl-8 pr-3 text-xs text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-primary focus:ring-1 focus:ring-primary/20"
            />
          </div>

          {/* Clear */}
          {hasFilters && (
            <button
              onClick={clearFilters}
              className="flex h-8 items-center gap-1 rounded-md border border-border px-2.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <X size={12} />
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex h-64 items-center justify-center">
            <Loader2 size={24} className="animate-spin text-muted-foreground" />
          </div>
        ) : isError ? (
          <div className="flex h-64 flex-col items-center justify-center gap-2 text-center">
            <p className="text-sm font-medium text-destructive">Failed to load counts</p>
            <p className="text-xs text-muted-foreground">
              {(error as any)?.message ?? "Check API connection"}
            </p>
          </div>
        ) : sessions.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 py-20 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted">
              <ClipboardCheck size={24} className="text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">
                {hasFilters ? "No counts match your filters" : "No count sessions yet"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {hasFilters
                  ? "Try broadening your search criteria or clearing filters."
                  : "Create a new count session to begin."}
              </p>
            </div>
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 z-10 border-b border-border bg-muted/50 text-xs font-medium text-muted-foreground">
              <tr>
                <th scope="col" className="whitespace-nowrap px-4 py-2.5 font-medium">Count #</th>
                <th scope="col" className="whitespace-nowrap px-4 py-2.5 font-medium">Title</th>
                <th scope="col" className="whitespace-nowrap px-4 py-2.5 font-medium">Location</th>
                <th scope="col" className="whitespace-nowrap px-4 py-2.5 font-medium">Type</th>
                <th scope="col" className="whitespace-nowrap px-4 py-2.5 font-medium text-right">Items</th>
                <th scope="col" className="whitespace-nowrap px-4 py-2.5 font-medium text-right">Progress</th>
                <th scope="col" className="whitespace-nowrap px-4 py-2.5 font-medium text-right">Variance</th>
                <th scope="col" className="whitespace-nowrap px-4 py-2.5 font-medium">Status</th>
                <th scope="col" className="whitespace-nowrap px-4 py-2.5 font-medium">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sessions.map((s) => (
                <CountRow
                  key={s.id}
                  session={s}
                  onClick={() => router.push(`/inventory/counts/${s.id}`)}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-border bg-background px-6 py-2.5">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {sessions.length} count{sessions.length !== 1 ? "s" : ""}
            {hasFilters ? " (filtered)" : ""}
            {hasNextPage ? " — more available" : ""}
          </span>
          <div className="flex items-center gap-3">
            {hasNextPage && (
              <button
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
                className="flex items-center gap-1.5 rounded-md bg-muted px-3 py-1 text-xs font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-50"
              >
                {isFetchingNextPage ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <ChevronsDown size={12} />
                )}
                Load More
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
 * COUNT ROW
 * ═══════════════════════════════════════════════════════ */

function CountRow({
  session: s,
  onClick,
}: {
  session: CountSessionRow;
  onClick: () => void;
}) {
  const d = new Date(s.createdAt);
  const date = d.toLocaleDateString("en-PH", { day: "2-digit", month: "short", year: "numeric" });
  const time = d.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit", hour12: false });
  const progress =
    s.totalLines > 0
      ? Math.round((s.countedLines / s.totalLines) * 100)
      : 0;
  const type = s.scope === "FULL_LOCATION" ? "Full" : "Cycle";

  return (
    <tr
      className="cursor-pointer transition-colors hover:bg-muted/30"
      onClick={onClick}
    >
      <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs text-muted-foreground">
        {s.id.slice(0, 8)}
      </td>
      <td className="max-w-[240px] truncate px-4 py-2.5 text-sm font-medium text-foreground" title={s.label}>
        {s.label}
      </td>
      <td className="whitespace-nowrap px-4 py-2.5 text-sm text-foreground">
        {s.locationName}
      </td>
      <td className="whitespace-nowrap px-4 py-2.5">
        <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold ${
          type === "Full"
            ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400"
            : "bg-cyan-50 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400"
        }`}>
          {type}
        </span>
      </td>
      <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-sm text-foreground">
        {s.totalLines.toLocaleString()}
      </td>
      <td className="whitespace-nowrap px-4 py-2.5 text-right">
        <span className="text-sm tabular-nums text-foreground">
          {s.countedLines}/{s.totalLines}
        </span>
        <span className="ml-1 text-[10px] text-muted-foreground">({progress}%)</span>
      </td>
      <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-sm">
        <span className={s.varianceLines > 0 ? "font-semibold text-amber-600" : "text-muted-foreground"}>
          {s.varianceLines}
        </span>
      </td>
      <td className="whitespace-nowrap px-4 py-2.5">
        <span
          className={`inline-block rounded px-2 py-0.5 text-[10px] font-semibold ${STATUS_COLORS[s.status] ?? ""}`}
        >
          {STATUS_LABELS[s.status] ?? s.status}
        </span>
      </td>
      <td className="whitespace-nowrap px-4 py-2.5">
        <div className="text-sm text-foreground">{date}</div>
        <div className="text-[10px] text-muted-foreground">{time}</div>
      </td>
    </tr>
  );
}

/* ═══════════════════════════════════════════════════════
 * FILTER SELECT
 * ═══════════════════════════════════════════════════════ */

function FilterSelect({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 appearance-none rounded-md border border-border bg-background pl-2.5 pr-7 text-xs text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <ChevronDown
        size={12}
        className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
      />
    </div>
  );
}
