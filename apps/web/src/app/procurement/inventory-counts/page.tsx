"use client";

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import {
  ClipboardCheck,
  Search,
  X,
  Plus,
  ChevronDown,
  ChevronLeft,
  Loader2,
  ChevronsDown,
  AlertTriangle,
  Check,
  FileText,
  Send,
  Ban,
  Eye,
  Pencil,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/app/auth-context";
import {
  useCountSessions,
  useCountDetail,
  useCreateCount,
  useRecordCountLine,
  useCountTransition,
  type CountSessionRow,
  type CountLineRow,
  type CountListFilters,
  type CountDetailFilters,
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
  FULL_LOCATION: "Full Location",
  CATEGORY: "Category",
  FAMILY: "Group",
  SELECTED_SKUS: "Selected SKUs",
};

const ALL_STATUSES = Object.keys(STATUS_LABELS);

/* ═══════════════════════════════════════════════════════
 * PAGE — Entry point (switches between list and detail)
 * ═══════════════════════════════════════════════════════ */

export default function InventoryCountsPage() {
  const { token, locationId, user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [activeCountId, setActiveCountId] = useState<string | null>(null);

  if (authLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 size={20} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (activeCountId) {
    return (
      <CountDetailView
        token={token}
        locationId={locationId}
        countId={activeCountId}
        onBack={() => setActiveCountId(null)}
      />
    );
  }

  return (
    <>
      <CountListView
        token={token}
        locationId={locationId}
        onSelectCount={setActiveCountId}
        onCreateNew={() => router.push("/inventory/counts/new")}
      />
    </>
  );
}

/* ═══════════════════════════════════════════════════════
 * LIST VIEW — Count Sessions
 * ═══════════════════════════════════════════════════════ */

function CountListView({
  token,
  locationId,
  onSelectCount,
  onCreateNew,
}: {
  token: string;
  locationId: string;
  onSelectCount: (id: string) => void;
  onCreateNew: () => void;
}) {
  const [allLocations, setAllLocations] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearch = (v: string) => {
    setSearchQuery(v);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setDebouncedSearch(v), 300);
  };

  const filters: CountListFilters = {
    allLocations,
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
    () => data?.pages.flatMap((p) => p.data) ?? [],
    [data],
  );

  const hasFilters = statusFilter !== "all" || searchQuery !== "";

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border bg-background px-5 py-2.5">
        <div className="flex items-center gap-2.5">
          <h1 className="text-sm font-semibold text-foreground">Inventory Counts</h1>
          <span className="text-[10px] text-muted-foreground">
            Cycle counts &amp; physical inventory verification
          </span>
        </div>
        <button
          onClick={onCreateNew}
          className="flex h-7 items-center gap-1.5 rounded-md bg-primary px-3 text-[11px] font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <Plus size={12} />
          New Count
        </button>
      </div>

      {/* Toolbar */}
      <div className="border-b border-border bg-muted/30 px-5 py-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => setAllLocations(!allLocations)}
            className={`h-7 rounded border px-2 text-[11px] font-medium transition-colors ${
              allLocations
                ? "border-primary/30 bg-primary/5 text-primary"
                : "border-border text-muted-foreground hover:bg-accent"
            }`}
          >
            {allLocations ? "All Locations" : "Current Loc."}
          </button>

          <MiniSelect
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { value: "all", label: "All Statuses" },
              ...ALL_STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s]! })),
            ]}
          />

          <div className="relative ml-auto">
            <Search
              size={12}
              className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground/60"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Search counts..."
              className="h-7 w-44 rounded border border-border bg-background pl-7 pr-2 text-[11px] text-foreground outline-none placeholder:text-muted-foreground/50 focus:border-primary"
            />
          </div>

          {hasFilters && (
            <button
              onClick={() => {
                setStatusFilter("all");
                setSearchQuery("");
                setDebouncedSearch("");
              }}
              className="flex h-7 items-center gap-1 rounded border border-border px-2 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <X size={10} />
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex h-48 items-center justify-center">
            <Loader2 size={18} className="animate-spin text-muted-foreground" />
          </div>
        ) : isError ? (
          <div className="flex h-48 flex-col items-center justify-center gap-1 text-center">
            <p className="text-xs font-medium text-destructive">Failed to load counts</p>
            <p className="text-[11px] text-muted-foreground">
              {(error as any)?.message ?? "Check API connection"}
            </p>
          </div>
        ) : sessions.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 py-16 text-center">
            <ClipboardCheck size={20} className="text-muted-foreground/40" />
            <p className="text-xs font-medium text-muted-foreground">
              {hasFilters ? "No counts match filters" : "No count sessions yet"}
            </p>
            <p className="text-[11px] text-muted-foreground/60">
              {hasFilters
                ? "Broaden criteria or clear filters."
                : "Create a new count session to begin."}
            </p>
          </div>
        ) : (
          <table className="w-full border-collapse text-left">
            <thead className="sticky top-0 z-10 border-b border-border bg-muted/60">
              <tr className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                <th scope="col" className="whitespace-nowrap px-3 py-2">Count</th>
                <th scope="col" className="whitespace-nowrap px-3 py-2">Location</th>
                <th scope="col" className="whitespace-nowrap px-3 py-2">Scope</th>
                <th scope="col" className="whitespace-nowrap px-3 py-2">Status</th>
                <th scope="col" className="whitespace-nowrap px-3 py-2 text-right">Items</th>
                <th scope="col" className="whitespace-nowrap px-3 py-2 text-right">Counted</th>
                <th scope="col" className="whitespace-nowrap px-3 py-2 text-right">Variances</th>
                <th scope="col" className="whitespace-nowrap px-3 py-2">Created By</th>
                <th scope="col" className="whitespace-nowrap px-3 py-2">Created</th>
                <th scope="col" className="whitespace-nowrap px-3 py-2 text-center">Action</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s, i) => (
                <CountSessionListRow
                  key={s.id}
                  session={s}
                  odd={i % 2 === 1}
                  onOpen={() => onSelectCount(s.id)}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-border bg-muted/30 px-5 py-1.5">
        <span className="text-[11px] tabular-nums text-muted-foreground">
          {sessions.length} session{sessions.length !== 1 ? "s" : ""}
          {hasFilters ? " (filtered)" : ""}
          {hasNextPage ? " · more available" : ""}
        </span>
        <div className="flex items-center gap-2">
          {hasNextPage && (
            <button
              onClick={() => fetchNextPage()}
              disabled={isFetchingNextPage}
              className="flex h-6 items-center gap-1 rounded border border-border px-2 text-[11px] font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-50"
            >
              {isFetchingNextPage ? (
                <Loader2 size={10} className="animate-spin" />
              ) : (
                <ChevronsDown size={10} />
              )}
              Load more
            </button>
          )}
          <span className="text-[10px] tabular-nums text-muted-foreground/60">
            GET /inventory/counts
          </span>
        </div>
      </div>
    </div>
  );
}

/* ── Count Session List Row ── */

function CountSessionListRow({
  session: s,
  odd,
  onOpen,
}: {
  session: CountSessionRow;
  odd: boolean;
  onOpen: () => void;
}) {
  const d = new Date(s.createdAt);
  const date = d.toLocaleDateString("en-PH", { day: "2-digit", month: "short" });
  const time = d.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit", hour12: false });
  const progress =
    s.totalLines > 0
      ? Math.round((s.countedLines / s.totalLines) * 100)
      : 0;

  return (
    <tr
      className={`cursor-pointer border-b border-border/50 transition-colors hover:bg-primary/[0.03] ${odd ? "bg-muted/20" : ""}`}
      onClick={onOpen}
    >
      <td className="px-3 py-1.5 align-top">
        <div className="max-w-[260px] truncate text-xs font-medium text-foreground" title={s.label}>
          {s.label}
        </div>
        <div className="font-mono text-[10px] text-muted-foreground/60">{s.id.slice(0, 8)}</div>
      </td>
      <td className="whitespace-nowrap px-3 py-1.5 align-top text-xs text-muted-foreground">
        {s.locationName}
      </td>
      <td className="whitespace-nowrap px-3 py-1.5 align-top">
        <span className="text-xs text-foreground">{SCOPE_LABELS[s.scope] ?? s.scope}</span>
        {s.scopeFilter && (
          <div className="text-[10px] text-muted-foreground/70">{s.scopeFilter}</div>
        )}
      </td>
      <td className="whitespace-nowrap px-3 py-1.5 align-top">
        <span
          className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold ${STATUS_COLORS[s.status] ?? ""}`}
        >
          {STATUS_LABELS[s.status] ?? s.status}
        </span>
      </td>
      <td className="whitespace-nowrap px-3 py-1.5 text-right align-top font-mono text-xs tabular-nums text-foreground">
        {s.totalLines.toLocaleString()}
      </td>
      <td className="whitespace-nowrap px-3 py-1.5 text-right align-top">
        <span className="font-mono text-xs tabular-nums text-foreground">
          {s.countedLines.toLocaleString()}
        </span>
        {s.totalLines > 0 && (
          <span className="ml-1 text-[10px] text-muted-foreground">({progress}%)</span>
        )}
      </td>
      <td className="whitespace-nowrap px-3 py-1.5 text-right align-top font-mono text-xs tabular-nums">
        <span className={s.varianceLines > 0 ? "text-amber-600" : "text-muted-foreground"}>
          {s.varianceLines}
        </span>
      </td>
      <td className="whitespace-nowrap px-3 py-1.5 align-top text-xs text-muted-foreground">
        {s.createdByName ?? "—"}
      </td>
      <td className="whitespace-nowrap px-3 py-1.5 align-top">
        <span className="text-xs text-foreground">{date}</span>
        <span className="ml-1 text-[10px] tabular-nums text-muted-foreground">{time}</span>
      </td>
      <td className="whitespace-nowrap px-3 py-1.5 text-center align-top">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onOpen();
          }}
          className="inline-flex h-6 items-center gap-1 rounded border border-border px-2 text-[10px] font-medium text-foreground transition-colors hover:bg-accent"
        >
          <Eye size={10} />
          Open
        </button>
      </td>
    </tr>
  );
}

/* ═══════════════════════════════════════════════════════
 * DETAIL VIEW — Count entry / review
 * ═══════════════════════════════════════════════════════ */

function CountDetailView({
  token,
  locationId,
  countId,
  onBack,
}: {
  token: string;
  locationId: string;
  countId: string;
  onBack: () => void;
}) {
  const [lineSearch, setLineSearch] = useState("");
  const [debouncedLineSearch, setDebouncedLineSearch] = useState("");
  const [varianceOnly, setVarianceOnly] = useState(false);
  const [uncountedOnly, setUncountedOnly] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleLineSearch = (v: string) => {
    setLineSearch(v);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setDebouncedLineSearch(v), 300);
  };

  const filters: CountDetailFilters = {
    search: debouncedLineSearch || undefined,
    varianceOnly,
    uncountedOnly,
  };

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
    error,
  } = useCountDetail(token, locationId, countId, filters);

  const session = data?.pages[0]?.session ?? null;
  const lines = useMemo(
    () => data?.pages.flatMap((p) => p.lines) ?? [],
    [data],
  );

  const recordMutation = useRecordCountLine(token, locationId, countId);
  const transitionMutation = useCountTransition(token, locationId, countId);

  const isEditable =
    session?.status === "DRAFT" || session?.status === "IN_PROGRESS";

  const handleRecordCount = useCallback(
    (lineId: string, countedQty: number) => {
      recordMutation.mutate({ lineId, countedQty });
    },
    [recordMutation],
  );

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 size={20} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError || !session) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2">
        <p className="text-xs font-medium text-destructive">Failed to load count</p>
        <p className="text-[11px] text-muted-foreground">
          {(error as any)?.message ?? "Count session not found"}
        </p>
        <button
          onClick={onBack}
          className="mt-2 text-xs text-primary underline"
        >
          Back to list
        </button>
      </div>
    );
  }

  const progress =
    session.totalLines > 0
      ? Math.round((session.countedLines / session.totalLines) * 100)
      : 0;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border bg-background px-5 py-2.5">
        <div className="flex items-center gap-2.5">
          <button
            onClick={onBack}
            className="flex h-6 w-6 items-center justify-center rounded hover:bg-accent"
            title="Back to list"
          >
            <ChevronLeft size={14} className="text-muted-foreground" />
          </button>
          <div>
            <h1 className="text-sm font-semibold text-foreground">{session.label}</h1>
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
              <span>{session.locationName}</span>
              <span>·</span>
              <span>{SCOPE_LABELS[session.scope] ?? session.scope}</span>
              {session.scopeFilter && (
                <>
                  <span>·</span>
                  <span>{session.scopeFilter}</span>
                </>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`rounded px-2 py-0.5 text-[10px] font-semibold ${STATUS_COLORS[session.status] ?? ""}`}
          >
            {STATUS_LABELS[session.status] ?? session.status}
          </span>
          {/* Workflow buttons */}
          {session.status === "IN_PROGRESS" && (
            <button
              onClick={() => transitionMutation.mutate("complete")}
              disabled={transitionMutation.isPending}
              className="flex h-7 items-center gap-1 rounded border border-border px-2.5 text-[11px] font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-50"
            >
              <Check size={12} />
              Finish Counting
            </button>
          )}
          {session.status === "COMPLETED" && (
            <button
              onClick={() => transitionMutation.mutate("review")}
              disabled={transitionMutation.isPending}
              className="flex h-7 items-center gap-1 rounded border border-violet-300 bg-violet-50 px-2.5 text-[11px] font-medium text-violet-700 transition-colors hover:bg-violet-100 disabled:opacity-50 dark:border-violet-700 dark:bg-violet-900/30 dark:text-violet-400"
            >
              <FileText size={12} />
              Mark Reviewed
            </button>
          )}
          {session.status === "REVIEWED" && (
            <button
              onClick={() => transitionMutation.mutate("post")}
              disabled={transitionMutation.isPending}
              className="flex h-7 items-center gap-1 rounded border border-emerald-300 bg-emerald-50 px-2.5 text-[11px] font-medium text-emerald-700 transition-colors hover:bg-emerald-100 disabled:opacity-50 dark:border-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
            >
              <Send size={12} />
              Post Variances
            </button>
          )}
          {isEditable && (
            <button
              onClick={() => transitionMutation.mutate("cancel")}
              disabled={transitionMutation.isPending}
              className="flex h-7 items-center gap-1 rounded border border-border px-2 text-[11px] text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:hover:bg-red-900/20"
            >
              <Ban size={12} />
              Cancel
            </button>
          )}
        </div>
      </div>

      {/* Summary strip */}
      <div className="flex items-center gap-4 border-b border-border bg-muted/20 px-5 py-1.5">
        <SummaryChip label="Total Items" value={session.totalLines.toLocaleString()} />
        <SummaryChip
          label="Counted"
          value={`${session.countedLines.toLocaleString()} (${progress}%)`}
          color="text-blue-600"
        />
        <SummaryChip
          label="Variances"
          value={String(session.varianceLines)}
          color={session.varianceLines > 0 ? "text-amber-600" : undefined}
        />
        <SummaryChip
          label="Remaining"
          value={String(session.totalLines - session.countedLines)}
          color={
            session.totalLines - session.countedLines > 0
              ? "text-muted-foreground"
              : "text-emerald-600"
          }
        />
        {/* Progress bar */}
        <div className="ml-auto flex items-center gap-2">
          <div className="h-1.5 w-32 rounded-full bg-muted">
            <div
              className="h-1.5 rounded-full bg-primary transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="text-[10px] font-medium tabular-nums text-muted-foreground">
            {progress}%
          </span>
        </div>
      </div>

      {/* Line toolbar */}
      <div className="border-b border-border bg-muted/30 px-5 py-1.5">
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => {
              setVarianceOnly(!varianceOnly);
              if (!varianceOnly) setUncountedOnly(false);
            }}
            className={`h-7 rounded border px-2 text-[11px] font-medium transition-colors ${
              varianceOnly
                ? "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                : "border-border text-muted-foreground hover:bg-accent"
            }`}
          >
            <AlertTriangle size={10} className="mr-1 inline" />
            Variances Only
          </button>
          <button
            onClick={() => {
              setUncountedOnly(!uncountedOnly);
              if (!uncountedOnly) setVarianceOnly(false);
            }}
            className={`h-7 rounded border px-2 text-[11px] font-medium transition-colors ${
              uncountedOnly
                ? "border-primary/30 bg-primary/5 text-primary"
                : "border-border text-muted-foreground hover:bg-accent"
            }`}
          >
            Uncounted Only
          </button>

          <div className="relative ml-auto">
            <Search
              size={12}
              className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground/60"
            />
            <input
              type="text"
              value={lineSearch}
              onChange={(e) => handleLineSearch(e.target.value)}
              placeholder="SKU / product name..."
              className="h-7 w-56 rounded border border-border bg-background pl-7 pr-2 text-[11px] text-foreground outline-none placeholder:text-muted-foreground/50 focus:border-primary"
            />
          </div>
        </div>
      </div>

      {/* Lines table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse text-left">
          <thead className="sticky top-0 z-10 border-b border-border bg-muted/60">
            <tr className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              <th scope="col" className="whitespace-nowrap px-3 py-2">Item</th>
              <th scope="col" className="whitespace-nowrap px-3 py-2">SKU</th>
              <th scope="col" className="whitespace-nowrap px-3 py-2">Category</th>
              <th scope="col" className="whitespace-nowrap px-3 py-2 text-right">System Qty</th>
              <th scope="col" className="whitespace-nowrap px-3 py-2 text-right" style={{ minWidth: 100 }}>
                Counted Qty
              </th>
              <th scope="col" className="whitespace-nowrap px-3 py-2 text-right">Variance</th>
              <th scope="col" className="whitespace-nowrap px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, i) => (
              <CountLineTableRow
                key={line.id}
                line={line}
                odd={i % 2 === 1}
                editable={isEditable}
                onRecord={handleRecordCount}
              />
            ))}
          </tbody>
        </table>
        {lines.length === 0 && !isLoading && (
          <div className="flex h-32 items-center justify-center text-xs text-muted-foreground">
            {debouncedLineSearch || varianceOnly || uncountedOnly
              ? "No lines match current filters"
              : "No items in this count session"}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-border bg-muted/30 px-5 py-1.5">
        <span className="text-[11px] tabular-nums text-muted-foreground">
          {lines.length} line{lines.length !== 1 ? "s" : ""} shown
          {hasNextPage ? " · more available" : ""}
        </span>
        <div className="flex items-center gap-2">
          {hasNextPage && (
            <button
              onClick={() => fetchNextPage()}
              disabled={isFetchingNextPage}
              className="flex h-6 items-center gap-1 rounded border border-border px-2 text-[11px] font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-50"
            >
              {isFetchingNextPage ? (
                <Loader2 size={10} className="animate-spin" />
              ) : (
                <ChevronsDown size={10} />
              )}
              Load more
            </button>
          )}
          <span className="text-[10px] tabular-nums text-muted-foreground/60">
            GET /inventory/counts/:id
          </span>
        </div>
      </div>
    </div>
  );
}

/* ── Count Line Row (with inline editing) ── */

function CountLineTableRow({
  line,
  odd,
  editable,
  onRecord,
}: {
  line: CountLineRow;
  odd: boolean;
  editable: boolean;
  onRecord: (lineId: string, qty: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [inputVal, setInputVal] = useState(
    line.countedQty !== null ? String(line.countedQty) : "",
  );
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  // Update local state when server data changes
  useEffect(() => {
    if (!editing) {
      setInputVal(line.countedQty !== null ? String(line.countedQty) : "");
    }
  }, [line.countedQty, editing]);

  const handleSubmit = () => {
    const val = parseInt(inputVal, 10);
    if (!isNaN(val) && val >= 0) {
      onRecord(line.id, val);
    }
    setEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSubmit();
    } else if (e.key === "Escape") {
      setEditing(false);
      setInputVal(line.countedQty !== null ? String(line.countedQty) : "");
    } else if (e.key === "Tab") {
      handleSubmit();
      // Don't prevent default — let tab naturally move focus
    }
  };

  const isCounted = line.countedQty !== null;
  const hasVariance = line.variance !== null && line.variance !== 0;
  const varianceAbs = line.variance !== null ? Math.abs(line.variance) : 0;
  const isGain = (line.variance ?? 0) > 0;

  return (
    <tr
      className={`border-b border-border/50 transition-colors hover:bg-primary/[0.03] ${odd ? "bg-muted/20" : ""} ${hasVariance ? "bg-amber-50/30 dark:bg-amber-900/5" : ""}`}
    >
      {/* Product */}
      <td className="px-3 py-1.5 align-top">
        <div
          className="max-w-[220px] truncate text-xs font-medium text-foreground"
          title={line.productName}
        >
          {line.productName}
        </div>
        {line.familyName && (
          <div className="text-[10px] text-muted-foreground/60">{line.familyName}</div>
        )}
      </td>

      {/* SKU */}
      <td className="whitespace-nowrap px-3 py-1.5 align-top font-mono text-[11px] text-muted-foreground">
        {line.productSku}
      </td>

      {/* Category */}
      <td className="whitespace-nowrap px-3 py-1.5 align-top text-xs text-muted-foreground">
        {line.category.replace(/_/g, " ").replace(/\b\w/g, (c) => c)}
      </td>

      {/* System Qty */}
      <td className="whitespace-nowrap px-3 py-1.5 text-right align-top font-mono text-xs tabular-nums text-foreground">
        {line.systemQty}
      </td>

      {/* Counted Qty — editable */}
      <td className="whitespace-nowrap px-3 py-1.5 text-right align-top">
        {editable ? (
          editing ? (
            <input
              ref={inputRef}
              type="number"
              min={0}
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              onBlur={handleSubmit}
              onKeyDown={handleKeyDown}
              className="h-6 w-16 rounded border border-primary bg-background px-1.5 text-right font-mono text-xs tabular-nums text-foreground outline-none"
            />
          ) : (
            <button
              onClick={() => setEditing(true)}
              className={`group/edit inline-flex h-6 min-w-[48px] items-center justify-end gap-1 rounded border px-1.5 text-right font-mono text-xs tabular-nums transition-colors ${
                isCounted
                  ? "border-border bg-background text-foreground hover:border-primary"
                  : "border-dashed border-muted-foreground/30 bg-muted/30 text-muted-foreground/50 hover:border-primary hover:text-foreground"
              }`}
              title="Click to enter count"
            >
              {isCounted ? line.countedQty : "\u2014"}
              <Pencil size={10} className="text-muted-foreground opacity-0 transition-opacity group-hover/edit:opacity-100" />
            </button>
          )
        ) : (
          <span className="font-mono text-xs tabular-nums text-foreground">
            {isCounted ? line.countedQty : "—"}
          </span>
        )}
      </td>

      {/* Variance */}
      <td className="whitespace-nowrap px-3 py-1.5 text-right align-top font-mono text-xs tabular-nums">
        {isCounted ? (
          <span
            className={
              hasVariance
                ? isGain
                  ? "font-semibold text-emerald-600"
                  : "font-semibold text-red-600"
                : "text-muted-foreground"
            }
          >
            {hasVariance
              ? `${isGain ? "+" : "−"}${varianceAbs}`
              : "0"}
          </span>
        ) : (
          <span className="text-muted-foreground/30">—</span>
        )}
      </td>

      {/* Status indicator */}
      <td className="whitespace-nowrap px-3 py-1.5 align-top">
        {!isCounted ? (
          <span className="text-[10px] text-muted-foreground/50">Pending</span>
        ) : hasVariance ? (
          <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-amber-600">
            <AlertTriangle size={10} />
            Variance
          </span>
        ) : (
          <span className="inline-flex items-center gap-0.5 text-[10px] text-emerald-600">
            <Check size={10} />
            Match
          </span>
        )}
      </td>
    </tr>
  );
}

/* CreateCountModal removed — uses /inventory/counts/new page instead */
function _UNUSED_CreateCountModal({
  token,
  locationId,
  onClose,
  onCreated,
}: {
  token: string;
  locationId: string;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [label, setLabel] = useState("");
  const [scope, setScope] = useState("FULL_LOCATION");
  const [scopeFilter, setScopeFilter] = useState("");
  const [notes, setNotes] = useState("");

  const createMutation = useCreateCount(token, locationId);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate(
      {
        locationId,
        label,
        scope,
        scopeFilter: scope !== "FULL_LOCATION" ? scopeFilter : undefined,
        notes: notes || undefined,
      },
      {
        onSuccess: (data) => onCreated(data.id),
      },
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-lg border border-border bg-background shadow-xl">
        {/* Modal header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 className="text-sm font-semibold text-foreground">New Count Session</h2>
          <button
            onClick={onClose}
            className="flex h-6 w-6 items-center justify-center rounded hover:bg-accent"
          >
            <X size={14} className="text-muted-foreground" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3 px-5 py-4">
          {/* Label */}
          <div>
            <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
              Count Name
            </label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Tires Cycle Count — March 2026"
              className="h-8 w-full rounded border border-border bg-background px-3 text-xs text-foreground outline-none placeholder:text-muted-foreground/50 focus:border-primary"
              required
            />
          </div>

          {/* Scope */}
          <div>
            <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
              Scope
            </label>
            <div className="relative">
              <select
                value={scope}
                onChange={(e) => setScope(e.target.value)}
                className="h-8 w-full appearance-none rounded border border-border bg-background px-3 pr-8 text-xs text-foreground outline-none focus:border-primary"
              >
                <option value="FULL_LOCATION">Full Location (all items)</option>
                <option value="CATEGORY">By Category</option>
                <option value="FAMILY">By Item Group</option>
              </select>
              <ChevronDown
                size={12}
                className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/60"
              />
            </div>
          </div>

          {/* Scope filter (conditional) */}
          {scope === "CATEGORY" && (
            <div>
              <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                Category
              </label>
              <div className="relative">
                <select
                  value={scopeFilter}
                  onChange={(e) => setScopeFilter(e.target.value)}
                  className="h-8 w-full appearance-none rounded border border-border bg-background px-3 pr-8 text-xs text-foreground outline-none focus:border-primary"
                  required
                >
                  <option value="">Select category...</option>
                  <option value="TIRES">Tires</option>
                  <option value="LUBRICANTS">Lubricants</option>
                  <option value="HARD_PARTS">Hard Parts</option>
                  <option value="ACCESSORIES">Accessories</option>
                  <option value="LABOR_SERVICES">Labor / Services</option>
                </select>
                <ChevronDown
                  size={12}
                  className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/60"
                />
              </div>
            </div>
          )}

          {scope === "FAMILY" && (
            <div>
              <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                Group Slug
              </label>
              <input
                type="text"
                value={scopeFilter}
                onChange={(e) => setScopeFilter(e.target.value)}
                placeholder="e.g. bridgestone-tires"
                className="h-8 w-full rounded border border-border bg-background px-3 text-xs text-foreground outline-none placeholder:text-muted-foreground/50 focus:border-primary"
                required
              />
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
              Notes (optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Reason, frequency, or special instructions..."
              rows={2}
              className="w-full resize-none rounded border border-border bg-background px-3 py-2 text-xs text-foreground outline-none placeholder:text-muted-foreground/50 focus:border-primary"
            />
          </div>

          {/* Error */}
          {createMutation.isError && (
            <p className="text-[11px] text-destructive">
              {(createMutation.error as any)?.message ?? "Failed to create count"}
            </p>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="h-8 rounded border border-border px-4 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!label || createMutation.isPending}
              className="flex h-8 items-center gap-1.5 rounded bg-primary px-4 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              {createMutation.isPending ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Plus size={12} />
              )}
              Create &amp; Open
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
 * SHARED COMPONENTS
 * ═══════════════════════════════════════════════════════ */

function SummaryChip({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-[10px] text-muted-foreground">{label}</span>
      <span className={`text-xs font-semibold tabular-nums ${color ?? "text-foreground"}`}>
        {value}
      </span>
    </div>
  );
}

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
        className="h-7 appearance-none rounded border border-border bg-background pl-2 pr-6 text-[11px] text-foreground outline-none focus:border-primary"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown
        size={10}
        className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground/60"
      />
    </div>
  );
}
