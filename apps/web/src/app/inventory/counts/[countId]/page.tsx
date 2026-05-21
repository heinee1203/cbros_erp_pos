"use client";

import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ChevronLeft,
  Loader2,
  Search,
  X,
  Check,
  AlertTriangle,
  Play,
  Send,
  Ban,
  Trash2,
  Download,
  RotateCcw,
  Lock,
  ChevronsDown,
  Barcode,
} from "lucide-react";
import { useAuth } from "@/app/auth-context";
import { useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import {
  useCountDetail,
  useCountTransition,
  type CountLineRow,
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

/* ═══════════════════════════════════════════════════════
 * PAGE
 * ═══════════════════════════════════════════════════════ */

export default function CountDetailPage() {
  const params = useParams<{ countId: string }>();
  const countId = params?.countId as string;
  const router = useRouter();
  const { token, locationId, loading: authLoading } = useAuth();
  const queryClient = useQueryClient();

  // Filters
  const [lineSearch, setLineSearch] = useState("");
  const [debouncedLineSearch, setDebouncedLineSearch] = useState("");
  const [statusFilterValue, setStatusFilterValue] = useState("All");
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleLineSearch = (v: string) => {
    setLineSearch(v);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setDebouncedLineSearch(v), 300);
  };

  const filters: CountDetailFilters = {
    search: debouncedLineSearch || undefined,
    varianceOnly: statusFilterValue === "Has Variance",
    uncountedOnly: statusFilterValue === "Pending",
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
  const allLines = useMemo(
    () => data?.pages.flatMap((p) => p.lines) ?? [],
    [data],
  );

  // Client-side filter for "Counted"
  const lines = useMemo(() => {
    if (statusFilterValue === "Counted") {
      return allLines.filter((l) => l.countedQty !== null);
    }
    return allLines;
  }, [allLines, statusFilterValue]);

  const transitionMutation = useCountTransition(token, locationId, countId);

  // PIN modal
  const [showPinModal, setShowPinModal] = useState(false);
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState("");
  const [pinSubmitting, setPinSubmitting] = useState(false);

  // Barcode scan field
  const barcodeRef = useRef<HTMLInputElement>(null);

  // Pending saves for debounced auto-save
  const [pendingSaves, setPendingSaves] = useState<Map<string, { qty: number; timeout: ReturnType<typeof setTimeout> }>>(new Map());

  const isEditable =
    session?.status === "DRAFT" || session?.status === "IN_PROGRESS";
  const isReview = session?.status === "COMPLETED" || session?.status === "REVIEWED";

  // Local state for optimistic count updates
  const [localOverrides, setLocalOverrides] = useState<Map<string, number>>(new Map());

  const handleQtyChange = useCallback(
    (lineId: string, productId: string, qty: number, systemQty: number) => {
      // Update local state immediately
      setLocalOverrides((prev) => {
        const next = new Map(prev);
        next.set(lineId, qty);
        return next;
      });

      // Debounced save
      setPendingSaves((prev) => {
        const existing = prev.get(lineId);
        if (existing) clearTimeout(existing.timeout);

        const timeout = setTimeout(async () => {
          try {
            await apiFetch(`/inventory/counts/${countId}/lines/${lineId}`, {
              method: "PATCH",
              token,
              locationId,
              body: JSON.stringify({ countedQty: qty }),
            });
            queryClient.invalidateQueries({ queryKey: ["inventory-count-detail", countId] });
            queryClient.invalidateQueries({ queryKey: ["inventory-counts"] });
          } catch {
            // silent — user sees stale state until refetch
          }
          setPendingSaves((p) => {
            const next = new Map(p);
            next.delete(lineId);
            return next;
          });
        }, 500);

        const next = new Map(prev);
        next.set(lineId, { qty, timeout });
        return next;
      });
    },
    [countId, token, locationId, queryClient],
  );

  const handleComplete = async () => {
    setPinError("");
    setPinSubmitting(true);
    try {
      await apiFetch(`/inventory/counts/${countId}/post`, {
        method: "POST",
        token,
        locationId,
        body: JSON.stringify({
          approvalPin: pin,
          idempotencyKey: crypto.randomUUID(),
        }),
      });
      queryClient.invalidateQueries({ queryKey: ["inventory-count-detail", countId] });
      queryClient.invalidateQueries({ queryKey: ["inventory-counts"] });
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      setShowPinModal(false);
      setPin("");
    } catch (err: any) {
      setPinError(err?.message ?? "Failed to approve count");
    } finally {
      setPinSubmitting(false);
    }
  };

  if (authLoading || isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 size={20} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError || !session) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2">
        <p className="text-sm font-medium text-destructive">Failed to load count</p>
        <p className="text-xs text-muted-foreground">
          {(error as any)?.message ?? "Count session not found"}
        </p>
        <Link
          href="/inventory/counts"
          className="mt-2 text-xs text-primary underline"
        >
          Back to list
        </Link>
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
      <div className="flex items-center justify-between border-b border-border bg-background px-6 py-4">
        <div className="flex items-center gap-3">
          <Link
            href="/inventory/counts"
            className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-accent"
          >
            <ChevronLeft size={16} className="text-muted-foreground" />
          </Link>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-lg font-semibold text-foreground">{session.label}</h1>
              <span
                className={`rounded px-2 py-0.5 text-[10px] font-semibold ${STATUS_COLORS[session.status] ?? ""}`}
              >
                {STATUS_LABELS[session.status] ?? session.status}
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{session.locationName}</span>
              <span>·</span>
              <span>{SCOPE_LABELS[session.scope] ?? session.scope}</span>
              {session.scopeFilter && (
                <>
                  <span>·</span>
                  <span>{session.scopeFilter}</span>
                </>
              )}
              <span>·</span>
              <span className="font-mono text-[10px]">{session.id.slice(0, 8)}</span>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          {session.status === "DRAFT" && (
            <>
              <button
                onClick={() => transitionMutation.mutate("complete")}
                disabled={transitionMutation.isPending}
                className="flex h-8 items-center gap-1.5 rounded-md bg-blue-600 px-3 text-xs font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
              >
                <Play size={12} />
                Start Count
              </button>
              <button
                onClick={() => transitionMutation.mutate("cancel")}
                disabled={transitionMutation.isPending}
                className="flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
              >
                <Trash2 size={12} />
                Delete
              </button>
            </>
          )}
          {session.status === "IN_PROGRESS" && (
            <>
              <button
                onClick={() => transitionMutation.mutate("complete")}
                disabled={transitionMutation.isPending}
                className="flex h-8 items-center gap-1.5 rounded-md bg-foreground px-3 text-xs font-medium text-background transition-colors hover:bg-foreground/90 disabled:opacity-50"
              >
                <Send size={12} />
                Submit for Review
              </button>
              <button
                onClick={() => transitionMutation.mutate("cancel")}
                disabled={transitionMutation.isPending}
                className="flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
              >
                <Ban size={12} />
                Cancel
              </button>
            </>
          )}
          {(session.status === "COMPLETED" || session.status === "REVIEWED") && (
            <>
              <button
                onClick={() => setShowPinModal(true)}
                className="flex h-8 items-center gap-1.5 rounded-md bg-emerald-600 px-3 text-xs font-medium text-white transition-colors hover:bg-emerald-700"
              >
                <Lock size={12} />
                Approve &amp; Apply
              </button>
              <button
                onClick={() => transitionMutation.mutate("review")}
                disabled={transitionMutation.isPending}
                className="flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent disabled:opacity-50"
              >
                <RotateCcw size={12} />
                Back to Counting
              </button>
            </>
          )}
          {session.status === "POSTED" && (
            <button
              onClick={() => {
                // Placeholder CSV export
                const csvLines = lines.map((l) =>
                  [l.productSku, l.productName, l.systemQty, l.countedQty ?? "", l.variance ?? ""].join(",")
                );
                const csv = ["SKU,Product,System Qty,Counted Qty,Variance", ...csvLines].join("\n");
                const blob = new Blob([csv], { type: "text/csv" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `count-${countId.slice(0, 8)}.csv`;
                a.click();
                URL.revokeObjectURL(url);
              }}
              className="flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-xs font-medium text-foreground transition-colors hover:bg-accent"
            >
              <Download size={12} />
              Export CSV
            </button>
          )}
        </div>
      </div>

      {/* Progress & Variance Summary */}
      <div className="flex items-center gap-6 border-b border-border bg-muted/20 px-6 py-3">
        <div className="flex items-center gap-3">
          <div className="flex items-baseline gap-1.5">
            <span className="text-xs text-muted-foreground">Progress</span>
            <span className="text-sm font-semibold tabular-nums text-foreground">
              {session.countedLines}/{session.totalLines}
            </span>
          </div>
          <div className="h-2 w-40 rounded-full bg-muted">
            <div
              className="h-2 rounded-full bg-primary transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="text-xs font-medium tabular-nums text-muted-foreground">
            {progress}%
          </span>
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-xs text-muted-foreground">Variances</span>
          <span className={`text-sm font-semibold tabular-nums ${
            session.varianceLines > 0 ? "text-amber-600" : "text-foreground"
          }`}>
            {session.varianceLines} item{session.varianceLines !== 1 ? "s" : ""}
          </span>
        </div>
        {pendingSaves.size > 0 && (
          <span className="ml-auto flex items-center gap-1 text-[10px] text-muted-foreground">
            <Loader2 size={10} className="animate-spin" />
            Saving...
          </span>
        )}
      </div>

      {/* Toolbar — barcode scan + search + filter */}
      {isEditable && (
        <div className="border-b border-border bg-muted/30 px-6 py-2">
          <div className="flex items-center gap-2">
            <div className="relative">
              <Barcode size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                ref={barcodeRef}
                type="text"
                placeholder="Scan barcode..."
                className="h-8 w-52 rounded-md border border-border bg-background pl-8 pr-3 text-xs text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-primary focus:ring-1 focus:ring-primary/20"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    const val = (e.target as HTMLInputElement).value.trim();
                    if (val) {
                      setLineSearch(val);
                      setDebouncedLineSearch(val);
                      (e.target as HTMLInputElement).value = "";
                    }
                  }
                }}
              />
            </div>
            <div className="relative ml-auto">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={lineSearch}
                onChange={(e) => handleLineSearch(e.target.value)}
                placeholder="Search name / SKU..."
                className="h-8 w-56 rounded-md border border-border bg-background pl-8 pr-3 text-xs text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-primary focus:ring-1 focus:ring-primary/20"
              />
            </div>
            <StatusFilter value={statusFilterValue} onChange={setStatusFilterValue} />
          </div>
        </div>
      )}

      {/* Review mode filter bar */}
      {isReview && (
        <div className="border-b border-border bg-muted/30 px-6 py-2">
          <div className="flex items-center gap-2">
            <div className="relative ml-auto">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={lineSearch}
                onChange={(e) => handleLineSearch(e.target.value)}
                placeholder="Search name / SKU..."
                className="h-8 w-56 rounded-md border border-border bg-background pl-8 pr-3 text-xs text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-primary focus:ring-1 focus:ring-primary/20"
              />
            </div>
            <StatusFilter value={statusFilterValue} onChange={setStatusFilterValue} />
          </div>
        </div>
      )}

      {/* Items Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 z-10 border-b border-border bg-muted/50 text-xs font-medium text-muted-foreground">
            <tr>
              <th scope="col" className="whitespace-nowrap px-4 py-1.5 font-medium w-8">#</th>
              <th scope="col" className="whitespace-nowrap px-4 py-1.5 font-medium">Product</th>
              <th scope="col" className="whitespace-nowrap px-4 py-1.5 font-medium">SKU</th>
              <th scope="col" className="whitespace-nowrap px-4 py-1.5 font-medium">Brand</th>
              <th scope="col" className="whitespace-nowrap px-4 py-1.5 font-medium text-right">System Qty</th>
              <th scope="col" className="whitespace-nowrap px-4 py-1.5 font-medium text-right" style={{ minWidth: 110 }}>
                Counted Qty
              </th>
              <th scope="col" className="whitespace-nowrap px-4 py-1.5 font-medium text-right">Variance</th>
              <th scope="col" className="whitespace-nowrap px-4 py-1.5 font-medium">Status</th>
              <th scope="col" className="whitespace-nowrap px-4 py-1.5 font-medium">Notes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {lines.map((line, i) => (
              <CountLineRow
                key={line.id}
                line={line}
                index={i + 1}
                editable={isEditable}
                localQty={localOverrides.get(line.id)}
                onQtyChange={handleQtyChange}
              />
            ))}
          </tbody>
        </table>
        {lines.length === 0 && (
          <div className="flex h-32 items-center justify-center text-xs text-muted-foreground">
            {debouncedLineSearch || statusFilterValue !== "All"
              ? "No lines match current filters"
              : "No items in this count session"}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-border bg-background px-6 py-1.5">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {lines.length} line{lines.length !== 1 ? "s" : ""} shown
            {hasNextPage ? " — more available" : ""}
          </span>
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

      {/* PIN Approval Modal */}
      {showPinModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-sm rounded-lg border border-border bg-background shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-5 py-3">
              <div className="flex items-center gap-2">
                <Lock size={14} className="text-emerald-600" />
                <h2 className="text-sm font-semibold text-foreground">Approve &amp; Apply Variances</h2>
              </div>
              <button
                onClick={() => {
                  setShowPinModal(false);
                  setPin("");
                  setPinError("");
                }}
                className="flex h-6 w-6 items-center justify-center rounded hover:bg-accent"
              >
                <X size={14} className="text-muted-foreground" />
              </button>
            </div>
            <div className="space-y-4 px-5 py-4">
              <p className="text-xs text-muted-foreground">
                This will post all variances as stock adjustments. Enter your PIN to confirm.
              </p>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                  Approval PIN
                </label>
                <input
                  type="password"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  placeholder="Enter PIN"
                  autoFocus
                  className="h-10 w-full rounded-md border border-border bg-background px-3 text-center text-sm tracking-widest text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && pin) handleComplete();
                  }}
                />
              </div>
              {pinError && (
                <p className="text-xs text-destructive">{pinError}</p>
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowPinModal(false);
                    setPin("");
                    setPinError("");
                  }}
                  className="flex-1 rounded-md border border-border px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-accent"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleComplete}
                  disabled={!pin || pinSubmitting}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-emerald-600 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
                >
                  {pinSubmitting ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <Check size={12} />
                  )}
                  Approve
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
 * COUNT LINE ROW
 * ═══════════════════════════════════════════════════════ */

function CountLineRow({
  line,
  index,
  editable,
  localQty,
  onQtyChange,
}: {
  line: CountLineRow;
  index: number;
  editable: boolean;
  localQty?: number;
  onQtyChange: (lineId: string, productId: string, qty: number, systemQty: number) => void;
}) {
  const countedQty = localQty ?? line.countedQty;
  const isCounted = countedQty !== null && countedQty !== undefined;
  const variance = isCounted ? countedQty - line.systemQty : null;
  const hasVariance = variance !== null && variance !== 0;
  const varianceAbs = variance !== null ? Math.abs(variance) : 0;
  const isGain = (variance ?? 0) > 0;

  const inputRef = useRef<HTMLInputElement>(null);
  const [inputVal, setInputVal] = useState(
    isCounted ? String(countedQty) : "",
  );

  // Sync when server data updates
  useEffect(() => {
    const qty = localQty ?? line.countedQty;
    setInputVal(qty !== null && qty !== undefined ? String(qty) : "");
  }, [line.countedQty, localQty]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setInputVal(v);
    const num = parseInt(v, 10);
    if (!isNaN(num) && num >= 0) {
      onQtyChange(line.id, line.productId, num, line.systemQty);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === "Tab") {
      // Move to next row
      const allInputs = document.querySelectorAll<HTMLInputElement>("[data-count-input]");
      const arr = Array.from(allInputs);
      const idx = arr.indexOf(e.target as HTMLInputElement);
      if (idx >= 0 && idx < arr.length - 1) {
        e.preventDefault();
        arr[idx + 1].focus();
        arr[idx + 1].select();
      }
    }
  };

  // Variance color
  let varianceColor = "text-muted-foreground";
  if (hasVariance) {
    if (varianceAbs >= 10) varianceColor = "font-semibold text-red-600";
    else if (varianceAbs >= 3) varianceColor = "font-semibold text-amber-600";
    else varianceColor = "font-medium text-amber-500";
  } else if (isCounted) {
    varianceColor = "text-emerald-600";
  }

  return (
    <tr className={`transition-colors hover:bg-muted/30 ${hasVariance ? "bg-amber-50/30 dark:bg-amber-900/5" : ""}`}>
      <td className="whitespace-nowrap px-4 py-2 text-xs tabular-nums text-muted-foreground">
        {index}
      </td>
      <td className="max-w-[200px] truncate px-4 py-2 text-sm text-foreground" title={line.productName}>
        {line.productName}
      </td>
      <td className="whitespace-nowrap px-4 py-2 font-mono text-xs text-muted-foreground">
        {line.productSku}
      </td>
      <td className="whitespace-nowrap px-4 py-2 text-xs text-muted-foreground">
        {line.familyName ?? line.category?.replace(/_/g, " ").replace(/\b\w/g, (c) => c) ?? ""}
      </td>
      <td className="whitespace-nowrap px-4 py-2 text-right font-mono text-sm tabular-nums text-foreground">
        {line.systemQty}
      </td>
      <td className="whitespace-nowrap px-4 py-2 text-right">
        {editable ? (
          <input
            ref={inputRef}
            data-count-input
            type="number"
            min={0}
            value={inputVal}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onFocus={(e) => e.target.select()}
            placeholder="--"
            className="h-7 w-20 rounded border border-border bg-background px-2 text-right font-mono text-sm tabular-nums text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
          />
        ) : (
          <span className="font-mono text-sm tabular-nums text-foreground">
            {isCounted ? countedQty : "--"}
          </span>
        )}
      </td>
      <td className={`whitespace-nowrap px-4 py-2 text-right font-mono text-sm tabular-nums ${varianceColor}`}>
        {isCounted ? (
          hasVariance ? (
            `${isGain ? "+" : "\u2212"}${varianceAbs}`
          ) : (
            "0"
          )
        ) : (
          <span className="text-muted-foreground/30">--</span>
        )}
      </td>
      <td className="whitespace-nowrap px-4 py-2">
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
      <td className="max-w-[120px] truncate px-4 py-2 text-xs text-muted-foreground" title={line.notes ?? ""}>
        {line.notes ?? ""}
      </td>
    </tr>
  );
}

/* ═══════════════════════════════════════════════════════
 * STATUS FILTER
 * ═══════════════════════════════════════════════════════ */

function StatusFilter({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const options = ["All", "Pending", "Counted", "Has Variance"];
  return (
    <div className="flex gap-px rounded-md border border-border bg-background">
      {options.map((opt) => (
        <button
          key={opt}
          onClick={() => onChange(opt)}
          className={`px-2.5 py-1 text-[11px] font-medium transition-colors first:rounded-l-md last:rounded-r-md ${
            value === opt
              ? "bg-foreground text-background"
              : "text-muted-foreground hover:bg-accent hover:text-foreground"
          }`}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}
