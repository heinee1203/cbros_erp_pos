"use client";

import { useState, useMemo } from "react";
import {
  Search,
  X,
  ChevronDown,
  ClipboardList,
  Loader2,
  ChevronsDown,
  Download,
} from "lucide-react";
import { useAuth } from "@/app/auth-context";
import { useStockJournal, type JournalEntry } from "@/hooks/use-stock-journal";
import { downloadCSV } from "@/lib/csv-export";

/* ═══════════════════════════════════════════════════════
 * CONSTANTS
 * ═══════════════════════════════════════════════════════ */

const TYPE_LABELS: Record<string, string> = {
  SALE: "Sale",
  RECEIVING: "PO Receipt",
  TRANSFER_IN: "Transfer In",
  TRANSFER_OUT: "Transfer Out",
  ADJUSTMENT: "Adjustment",
  RETURN: "Return",
  STOCKTAKE: "Stocktake",
  VOID: "Void",
  JOB_CARD_ISSUE: "Job Issue",
  JOB_CARD_RETURN: "Job Return",
  OPENING_BALANCE: "Opening Bal.",
};

const REASON_LABELS: Record<string, string> = {
  COUNT_GAIN: "Count Gain",
  FOUND_STOCK: "Found Stock",
  OPENING_BALANCE: "Opening Balance",
  COUNT_LOSS: "Count Loss",
  DAMAGE_IN_TRANSIT: "Damage — Transit",
  DAMAGE_WAREHOUSE: "Damage — Warehouse",
  DAMAGE_SHOWROOM: "Damage — Showroom",
  WARRANTY_WRITE_OFF: "Warranty Write-Off",
  SHRINKAGE_MISSING: "Shrinkage / Missing",
  OBSOLETE_WRITE_OFF: "Obsolete Write-Off",
  TRANSFER_SHORTAGE_CONFIRMED: "Transfer Shortage",
  DATA_CORRECTION: "Data Correction",
};

const ALL_TYPES = Object.keys(TYPE_LABELS);
const ALL_REASONS = Object.keys(REASON_LABELS);

/* ═══════════════════════════════════════════════════════
 * PAGE
 * ═══════════════════════════════════════════════════════ */

export default function InventoryHistoryPage() {
  const { token, locationId, loading: authLoading } = useAuth();

  // ── Filters ──
  const [allLocations, setAllLocations] = useState(false);
  const [typeFilter, setTypeFilter] = useState("all");
  const [dirFilter, setDirFilter] = useState<"all" | "IN" | "OUT">("all");
  const [reasonFilter, setReasonFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Debounce
  const searchTimeoutRef = useState<ReturnType<typeof setTimeout> | null>(null);
  const handleSearch = (v: string) => {
    setSearchQuery(v);
    if (searchTimeoutRef[0]) clearTimeout(searchTimeoutRef[0]);
    searchTimeoutRef[1](setTimeout(() => setDebouncedSearch(v), 300));
  };

  // ── Query ──
  const {
    data, fetchNextPage, hasNextPage, isFetchingNextPage,
    isLoading, isError, error,
  } = useStockJournal(token, locationId, {
    allLocations,
    search: debouncedSearch || undefined,
    referenceType: typeFilter !== "all" ? typeFilter : undefined,
    direction: dirFilter !== "all" ? dirFilter : undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    reasonCode: reasonFilter !== "all" ? reasonFilter : undefined,
  });

  const entries = useMemo(
    () => data?.pages.flatMap((p) => p.data) ?? [],
    [data],
  );
  const count = entries.length;

  const hasFilters =
    typeFilter !== "all" || dirFilter !== "all" || reasonFilter !== "all" ||
    searchQuery !== "" || dateFrom !== "" || dateTo !== "";

  const clearAll = () => {
    setTypeFilter("all"); setDirFilter("all"); setReasonFilter("all");
    setSearchQuery(""); setDebouncedSearch(""); setDateFrom(""); setDateTo("");
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
      {/* ── Compact Header ── */}
      <div className="flex items-center justify-between border-b border-border bg-background px-5 py-2.5">
        <div className="flex items-center gap-2.5">
          <h1 className="text-sm font-semibold text-foreground">Inventory History</h1>
          <span className="text-xs text-muted-foreground">Stock Movement Ledger</span>
        </div>
        <button
          onClick={() =>
            entries.length > 0 &&
            downloadCSV(
              "inventory-history",
              ["Date", "Item", "SKU", "Location", "Type", "Reason", "Actor", "Reference", "Change", "Balance After"],
              entries.map((e) => [
                new Date(e.effectiveAt).toISOString(),
                e.productName,
                e.productSku,
                e.locationName,
                TYPE_LABELS[e.referenceType] ?? e.referenceType,
                e.reasonCode ? (REASON_LABELS[e.reasonCode] ?? e.reasonCode) : "",
                e.actorName ?? e.actorType,
                e.referenceId,
                String(e.changeQuantity),
                String(e.balanceAfter),
              ]),
            )
          }
          disabled={entries.length === 0}
          className="flex h-7 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
        >
          <Download size={12} />
          Export
        </button>
      </div>

      {/* ── Toolbar ── */}
      <div className="border-b border-border bg-muted/30 px-5 py-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {/* Date range */}
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground/70 mr-0.5">
            Period
          </span>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="h-7 rounded border border-border bg-background px-2 text-xs text-foreground outline-none focus:border-primary [&::-webkit-calendar-picker-indicator]:opacity-40"
          />
          <span className="text-xs text-muted-foreground">to</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="h-7 rounded border border-border bg-background px-2 text-xs text-foreground outline-none focus:border-primary [&::-webkit-calendar-picker-indicator]:opacity-40"
          />

          <div className="mx-1.5 h-4 w-px bg-border" />

          {/* Location scope */}
          <button
            onClick={() => setAllLocations(!allLocations)}
            className={`h-7 rounded border px-2 text-xs font-medium transition-colors ${
              allLocations
                ? "border-primary/30 bg-primary/5 text-primary"
                : "border-border text-muted-foreground hover:bg-accent"
            }`}
          >
            {allLocations ? "All Locations" : "Current Loc."}
          </button>

          {/* Type */}
          <MiniSelect
            value={typeFilter}
            onChange={setTypeFilter}
            options={[
              { value: "all", label: "All Types" },
              ...ALL_TYPES.map((t) => ({ value: t, label: TYPE_LABELS[t]! })),
            ]}
          />

          {/* Direction */}
          <MiniSelect
            value={dirFilter}
            onChange={(v) => setDirFilter(v as any)}
            options={[
              { value: "all", label: "In / Out" },
              { value: "IN", label: "In only" },
              { value: "OUT", label: "Out only" },
            ]}
          />

          {/* Reason */}
          <MiniSelect
            value={reasonFilter}
            onChange={setReasonFilter}
            options={[
              { value: "all", label: "All Reasons" },
              ...ALL_REASONS.map((r) => ({ value: r, label: REASON_LABELS[r]! })),
            ]}
          />

          {/* Search — pushed right */}
          <div className="relative ml-auto">
            <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground/60" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Item / SKU..."
              className="h-7 w-44 rounded border border-border bg-background pl-7 pr-2 text-xs text-foreground outline-none placeholder:text-muted-foreground/50 focus:border-primary"
            />
          </div>

          {/* Clear */}
          {hasFilters && (
            <button
              onClick={clearAll}
              className="flex h-7 items-center gap-1 rounded border border-border px-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <X size={10} />
              Reset
            </button>
          )}
        </div>
      </div>

      {/* ── Ledger Table ── */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex h-48 items-center justify-center">
            <Loader2 size={18} className="animate-spin text-muted-foreground" />
          </div>
        ) : isError ? (
          <div className="flex h-48 flex-col items-center justify-center gap-1 text-center">
            <p className="text-xs font-medium text-destructive">Failed to load journal</p>
            <p className="text-xs text-muted-foreground">
              {(error as any)?.message ?? "Check API connection"}
            </p>
          </div>
        ) : entries.length === 0 ? (
          <EmptyState hasFilters={hasFilters} />
        ) : (
          <div className={`transition-opacity ${isFetchingNextPage ? "opacity-60" : ""}`}>
          <table className="w-full border-collapse text-left">
            <thead className="sticky top-0 z-10 border-b border-border bg-muted/60">
              <tr className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <th scope="col" className="whitespace-nowrap px-3 py-2">Date</th>
                <th scope="col" className="whitespace-nowrap px-3 py-2">Item</th>
                <th scope="col" className="whitespace-nowrap px-3 py-2">Location</th>
                <th scope="col" className="whitespace-nowrap px-3 py-2">Type / Reason</th>
                <th scope="col" className="whitespace-nowrap px-3 py-2">Actor</th>
                <th scope="col" className="whitespace-nowrap px-3 py-2">Ref</th>
                <th scope="col" className="whitespace-nowrap px-3 py-2 text-right">Adjustment</th>
                <th scope="col" className="whitespace-nowrap px-3 py-2 text-right">Stock After</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry, i) => (
                <LedgerRow key={entry.id} entry={entry} odd={i % 2 === 1} />
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>

      {/* ── Report Footer ── */}
      <div className="flex items-center justify-between border-t border-border bg-muted/30 px-5 py-1.5">
        <span className="text-xs tabular-nums text-muted-foreground">
          {count} row{count !== 1 ? "s" : ""}
          {hasFilters ? " (filtered)" : ""}
          {hasNextPage ? " · more available" : ""}
        </span>
        <div className="flex items-center gap-2">
          {hasNextPage && (
            <button
              onClick={() => fetchNextPage()}
              disabled={isFetchingNextPage}
              className="flex h-6 items-center gap-1 rounded border border-border px-2 text-xs font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-50"
            >
              {isFetchingNextPage ? (
                <Loader2 size={10} className="animate-spin" />
              ) : (
                <ChevronsDown size={10} />
              )}
              Load more
            </button>
          )}
          <span className="text-xs tabular-nums text-muted-foreground/60">
            GET /inventory/journal
          </span>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
 * LEDGER ROW — dense, audit-optimized
 * ═══════════════════════════════════════════════════════ */

function LedgerRow({ entry, odd }: { entry: JournalEntry; odd: boolean }) {
  const d = new Date(entry.effectiveAt);
  const date = d.toLocaleDateString("en-PH", { day: "2-digit", month: "short" });
  const time = d.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit", hour12: false });

  const isOut = entry.changeQuantity < 0;
  const typeLabel = TYPE_LABELS[entry.referenceType] ?? entry.referenceType;
  const reasonLabel = entry.reasonCode
    ? (REASON_LABELS[entry.reasonCode] ?? entry.reasonCode)
    : null;

  return (
    <tr className={`border-b border-border/50 transition-colors hover:bg-primary/[0.03] ${odd ? "bg-muted/20" : ""}`}>
      {/* Date */}
      <td className="whitespace-nowrap px-3 py-1.5 align-top">
        <span className="text-xs text-foreground">{date}</span>
        <span className="ml-1.5 text-xs tabular-nums text-muted-foreground">{time}</span>
      </td>

      {/* Item — name + SKU stacked */}
      <td className="px-3 py-1.5 align-top">
        <div className="max-w-[220px] truncate text-xs font-medium text-foreground" title={entry.productName}>
          {entry.productName}
        </div>
        <div className="font-mono text-xs text-muted-foreground/70">{entry.productSku}</div>
      </td>

      {/* Location */}
      <td className="whitespace-nowrap px-3 py-1.5 align-top text-xs text-muted-foreground">
        {entry.locationName}
      </td>

      {/* Type / Reason — combined */}
      <td className="whitespace-nowrap px-3 py-1.5 align-top">
        <span className="text-xs text-foreground">{typeLabel}</span>
        {reasonLabel && (
          <div className="text-xs text-muted-foreground/70">{reasonLabel}</div>
        )}
      </td>

      {/* Actor */}
      <td className="whitespace-nowrap px-3 py-1.5 align-top text-xs text-muted-foreground">
        {entry.actorName ?? entry.actorType}
      </td>

      {/* Reference — monospace, compact */}
      <td className="whitespace-nowrap px-3 py-1.5 align-top">
        <span
          className="cursor-default font-mono text-xs text-muted-foreground/60"
          title={entry.referenceId}
        >
          {entry.referenceId.slice(0, 8)}
        </span>
        {entry.notes && (
          <div
            className="max-w-[120px] truncate text-xs text-muted-foreground/50"
            title={entry.notes}
          >
            {entry.notes}
          </div>
        )}
      </td>

      {/* Adjustment — signed, color-coded, monospace */}
      <td className="whitespace-nowrap px-3 py-1.5 text-right align-top font-mono text-xs tabular-nums">
        <span className={isOut ? "text-red-600" : "text-emerald-600"}>
          {isOut ? "−" : "+"}
          {Math.abs(entry.changeQuantity)}
        </span>
      </td>

      {/* Stock After — monospace for vertical scanning */}
      <td className="whitespace-nowrap px-3 py-1.5 text-right align-top font-mono text-xs tabular-nums text-foreground">
        {entry.balanceAfter}
      </td>
    </tr>
  );
}

/* ═══════════════════════════════════════════════════════
 * MINI SELECT — smaller than FilterSelect
 * ═══════════════════════════════════════════════════════ */

function MiniSelect({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-7 appearance-none rounded border border-border bg-background pl-2 pr-6 text-xs text-foreground outline-none focus:border-primary"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <ChevronDown
        size={10}
        className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground/60"
      />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
 * EMPTY STATE
 * ═══════════════════════════════════════════════════════ */

function EmptyState({ hasFilters }: { hasFilters: boolean }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 py-16 text-center">
      <ClipboardList size={20} className="text-muted-foreground/40" />
      <p className="text-xs font-medium text-muted-foreground">
        {hasFilters ? "No movements match filters" : "No stock movements recorded"}
      </p>
      <p className="text-xs text-muted-foreground/60">
        {hasFilters
          ? "Broaden criteria or clear filters."
          : "Movements appear here as transactions are recorded."}
      </p>
    </div>
  );
}
