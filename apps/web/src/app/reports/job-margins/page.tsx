"use client";

import { Suspense, useState, useMemo, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useAuth } from "@/app/auth-context";
import {
  useJobCardMarginsQuery,
  type JobCardMargin,
} from "@/hooks/use-report-queries";

// ── Role-gating stub ──
const USER_ROLE: "ADMIN" | "MANAGER" | "ADVISOR" | "TECHNICIAN" = "ADMIN";
const isFinancialRole = USER_ROLE === "ADMIN" || USER_ROLE === "MANAGER";

// ── Status styling ──
const STATUS_COLORS: Record<string, string> = {
  SCHEDULED: "bg-muted text-muted-foreground",
  CHECKED_IN: "bg-blue-50 text-blue-700",
  ESTIMATING: "bg-amber-50 text-amber-700",
  APPROVED: "bg-indigo-50 text-indigo-700",
  WAITING_FOR_PARTS: "bg-orange-50 text-orange-700",
  READY_FOR_BAY: "bg-cyan-50 text-cyan-700",
  IN_PROGRESS: "bg-violet-50 text-violet-700",
  WORK_COMPLETED: "bg-emerald-50 text-emerald-700",
  INVOICED: "bg-green-50 text-green-700",
  CLOSED: "bg-green-100 text-green-800",
  CANCELLED: "bg-red-50 text-red-700",
};

const STATUS_LABELS: Record<string, string> = {
  SCHEDULED: "Scheduled",
  CHECKED_IN: "Checked In",
  ESTIMATING: "Estimating",
  APPROVED: "Approved",
  WAITING_FOR_PARTS: "Waiting Parts",
  READY_FOR_BAY: "Bay Queue",
  IN_PROGRESS: "In Progress",
  WORK_COMPLETED: "Work Done",
  INVOICED: "Invoiced",
  CLOSED: "Closed",
  CANCELLED: "Cancelled",
};

// ── Sort configuration ──
type SortField =
  | "jobNo"
  | "status"
  | "totalLaborHours"
  | "netPartsIssued"
  | "totalRevenue"
  | "partsCogs"
  | "grossProfit"
  | "grossMarginPct"
  | "partsMarkupPct";

type SortDir = "asc" | "desc";

/* ═══════════════════════════════════════════════
 * Job Card Margins — Dense Sortable Data Grid
 * ═══════════════════════════════════════════════ */
export default function JobMarginsPage() {
  return (
    <Suspense fallback={<div className="p-6 text-muted-foreground">Loading margins...</div>}>
      <JobMarginsContent />
    </Suspense>
  );
}

function JobMarginsContent() {
  const { token, locationId } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  // ── URL-persisted filters ──
  const from = searchParams.get("from") ?? "";
  const to = searchParams.get("to") ?? "";
  const allLocations = searchParams.get("allLocations") === "true";

  const [fromInput, setFromInput] = useState(from);
  const [toInput, setToInput] = useState(to);
  const [allLocsInput, setAllLocsInput] = useState(allLocations);

  // ── Client-side sorting ──
  const [sortField, setSortField] = useState<SortField>("jobNo");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // ── Pagination ──
  const [cursorStack, setCursorStack] = useState<string[]>([]);
  const [currentCursor, setCurrentCursor] = useState<string | undefined>();

  const applyFilters = useCallback(() => {
    const params = new URLSearchParams();
    if (fromInput) params.set("from", fromInput);
    if (toInput) params.set("to", toInput);
    if (allLocsInput) params.set("allLocations", "true");
    router.push(`/reports/job-margins?${params.toString()}`);
    setCursorStack([]);
    setCurrentCursor(undefined);
  }, [fromInput, toInput, allLocsInput, router]);

  const filters = useMemo(
    () => ({
      from: from || undefined,
      to: to || undefined,
      allLocations,
      cursor: currentCursor,
      limit: 50,
    }),
    [from, to, allLocations, currentCursor],
  );

  const marginsQuery = useJobCardMarginsQuery(token, locationId, filters);
  const rawData = marginsQuery.data?.data ?? [];
  const hasMore = marginsQuery.data?.hasMore ?? false;
  const nextCursor = marginsQuery.data?.nextCursor ?? null;

  // ── Client-side sort ──
  const sortedData = useMemo(() => {
    const sorted = [...rawData].sort((a, b) => {
      let aVal: string | number;
      let bVal: string | number;

      switch (sortField) {
        case "jobNo":
          aVal = a.jobNo;
          bVal = b.jobNo;
          break;
        case "status":
          aVal = a.status;
          bVal = b.status;
          break;
        case "totalLaborHours":
          aVal = parseFloat(a.totalLaborHours);
          bVal = parseFloat(b.totalLaborHours);
          break;
        case "netPartsIssued":
          aVal = a.netPartsIssued;
          bVal = b.netPartsIssued;
          break;
        case "totalRevenue":
          aVal = parseFloat(a.totalRevenue);
          bVal = parseFloat(b.totalRevenue);
          break;
        case "partsCogs":
          aVal = parseFloat(a.partsCogs);
          bVal = parseFloat(b.partsCogs);
          break;
        case "grossProfit":
          aVal = parseFloat(a.grossProfit);
          bVal = parseFloat(b.grossProfit);
          break;
        case "grossMarginPct":
          aVal = parseFloat(a.grossMarginPct);
          bVal = parseFloat(b.grossMarginPct);
          break;
        case "partsMarkupPct":
          aVal = parseFloat(a.partsMarkupPct);
          bVal = parseFloat(b.partsMarkupPct);
          break;
        default:
          return 0;
      }

      if (aVal < bVal) return sortDir === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [rawData, sortField, sortDir]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  };

  const sortIcon = (field: SortField) => {
    if (sortField !== field) return " \u2195";
    return sortDir === "asc" ? " \u2191" : " \u2193";
  };

  const goNext = () => {
    if (nextCursor) {
      setCursorStack((s) => [...s, currentCursor ?? ""]);
      setCurrentCursor(nextCursor);
    }
  };

  const goPrev = () => {
    const stack = [...cursorStack];
    const prev = stack.pop();
    setCursorStack(stack);
    setCurrentCursor(prev || undefined);
  };

  // ── Summary totals ──
  const totals = useMemo(() => {
    let revenue = 0;
    let cogs = 0;
    let profit = 0;
    for (const r of rawData) {
      revenue += parseFloat(r.totalRevenue);
      cogs += parseFloat(r.partsCogs);
      profit += parseFloat(r.grossProfit);
    }
    return { revenue, cogs, profit };
  }, [rawData]);

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      {/* ── Page Header ── */}
      <div className="flex items-center gap-3">
        <a
          href="/reports"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          &larr; Reports
        </a>
        <span className="text-muted-foreground">/</span>
        <h1 className="text-lg font-semibold">Job Card Margins</h1>
      </div>

      {/* ── Filters ── */}
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-muted/20 p-4">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">From</label>
          <input
            type="date"
            value={fromInput}
            onChange={(e) => setFromInput(e.target.value)}
            className="rounded-md border border-border bg-background px-3 py-1.5 text-sm"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">To</label>
          <input
            type="date"
            value={toInput}
            onChange={(e) => setToInput(e.target.value)}
            className="rounded-md border border-border bg-background px-3 py-1.5 text-sm"
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={allLocsInput}
            onChange={(e) => setAllLocsInput(e.target.checked)}
            className="rounded"
          />
          All locations
        </label>
        <button
          onClick={applyFilters}
          className="rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Apply
        </button>
      </div>

      {/* ── Summary Strip (financial roles only) ── */}
      {isFinancialRole && rawData.length > 0 && (
        <div className="flex gap-6 rounded-lg border border-border bg-muted/10 px-4 py-3 text-sm">
          <div>
            <span className="text-muted-foreground">Page Revenue: </span>
            <span className="font-medium">{fmtCurrency(totals.revenue)}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Page COGS: </span>
            <span className="font-medium">{fmtCurrency(totals.cogs)}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Page Profit: </span>
            <span className="font-medium text-green-600">{fmtCurrency(totals.profit)}</span>
          </div>
        </div>
      )}

      {/* ── Data Grid ── */}
      <div className="rounded-lg border border-border">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30 text-left text-xs font-medium text-muted-foreground">
                <SortHeader field="jobNo" label="Job #" onClick={toggleSort} icon={sortIcon} />
                <SortHeader field="status" label="Status" onClick={toggleSort} icon={sortIcon} />
                <SortHeader field="totalLaborHours" label="Labor Hrs" onClick={toggleSort} icon={sortIcon} align="right" />
                <th scope="col" className="px-4 py-2 text-right">Labor Lines</th>
                <SortHeader field="netPartsIssued" label="Parts Net" onClick={toggleSort} icon={sortIcon} align="right" />
                <th scope="col" className="px-4 py-2 text-right">Part Lines</th>
                {isFinancialRole && (
                  <>
                    <SortHeader field="totalRevenue" label="Revenue" onClick={toggleSort} icon={sortIcon} align="right" />
                    <SortHeader field="partsCogs" label="COGS" onClick={toggleSort} icon={sortIcon} align="right" />
                    <SortHeader field="grossProfit" label="Gross Profit" onClick={toggleSort} icon={sortIcon} align="right" />
                    <SortHeader field="grossMarginPct" label="Margin %" onClick={toggleSort} icon={sortIcon} align="right" />
                    <SortHeader field="partsMarkupPct" label="Markup %" onClick={toggleSort} icon={sortIcon} align="right" />
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {marginsQuery.isLoading ? (
                <tr>
                  <td
                    colSpan={isFinancialRole ? 11 : 6}
                    className="px-4 py-12 text-center text-muted-foreground"
                  >
                    Loading margins...
                  </td>
                </tr>
              ) : sortedData.length === 0 ? (
                <tr>
                  <td
                    colSpan={isFinancialRole ? 11 : 6}
                    className="px-4 py-12 text-center text-muted-foreground"
                  >
                    No job cards found for the selected filters.
                  </td>
                </tr>
              ) : (
                sortedData.map((job) => (
                  <tr
                    key={job.jobCardId}
                    className="border-b border-border last:border-0 hover:bg-muted/20"
                  >
                    <td className="px-4 py-2 font-mono text-xs font-medium">
                      <a
                        href={`/service/job-cards/${job.jobNo}`}
                        className="text-primary underline-offset-2 hover:underline"
                      >
                        {job.jobNo}
                      </a>
                    </td>
                    <td className="px-4 py-2">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[job.status] ?? "bg-muted text-muted-foreground"}`}>
                        {STATUS_LABELS[job.status] ?? job.status}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-xs">{job.totalLaborHours}</td>
                    <td className="px-4 py-2 text-right font-mono text-xs text-muted-foreground">{job.laborLineCount}</td>
                    <td className="px-4 py-2 text-right font-mono text-xs">{job.netPartsIssued}</td>
                    <td className="px-4 py-2 text-right font-mono text-xs text-muted-foreground">{job.partsLineCount}</td>
                    {isFinancialRole && (
                      <>
                        <td className="px-4 py-2 text-right font-mono text-xs">
                          {fmtCurrency(parseFloat(job.totalRevenue))}
                        </td>
                        <td className="px-4 py-2 text-right font-mono text-xs text-muted-foreground">
                          {fmtCurrency(parseFloat(job.partsCogs))}
                        </td>
                        <td className="px-4 py-2 text-right font-mono text-xs font-medium">
                          {fmtCurrency(parseFloat(job.grossProfit))}
                        </td>
                        <td className="px-4 py-2 text-right font-mono text-xs">
                          <MarginBadge value={parseFloat(job.grossMarginPct)} suffix="%" />
                        </td>
                        <td className="px-4 py-2 text-right font-mono text-xs">
                          <MarginBadge value={parseFloat(job.partsMarkupPct)} suffix="%" />
                        </td>
                      </>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* ── Pagination ── */}
        {(cursorStack.length > 0 || hasMore) && (
          <div className="flex items-center justify-between border-t border-border px-4 py-2">
            <button
              onClick={goPrev}
              disabled={cursorStack.length === 0}
              className="rounded-md px-3 py-1 text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-40"
            >
              &larr; Previous
            </button>
            <span className="text-xs text-muted-foreground">
              Page {cursorStack.length + 1}
            </span>
            <button
              onClick={goNext}
              disabled={!hasMore}
              className="rounded-md px-3 py-1 text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-40"
            >
              Next &rarr;
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
 * Subcomponents
 * ═══════════════════════════════════════════════ */

function SortHeader({
  field,
  label,
  onClick,
  icon,
  align = "left",
}: {
  field: SortField;
  label: string;
  onClick: (field: SortField) => void;
  icon: (field: SortField) => string;
  align?: "left" | "right";
}) {
  return (
    <th
      scope="col"
      className={`cursor-pointer select-none px-4 py-2 transition-colors hover:text-foreground ${align === "right" ? "text-right" : "text-left"}`}
      onClick={() => onClick(field)}
    >
      {label}
      <span className="text-muted-foreground/60">{icon(field)}</span>
    </th>
  );
}

function MarginBadge({ value, suffix }: { value: number; suffix: string }) {
  const color =
    value >= 30
      ? "text-green-600"
      : value >= 15
        ? "text-amber-600"
        : "text-red-600";
  return <span className={color}>{value.toFixed(2)}{suffix}</span>;
}

function fmtCurrency(value: number): string {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "ZAR",
    minimumFractionDigits: 2,
  }).format(value);
}
