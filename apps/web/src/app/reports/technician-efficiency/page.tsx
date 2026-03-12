"use client";

import { Suspense, useState, useMemo, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useAuth } from "@/app/auth-context";
import {
  useTechnicianEfficiencyQuery,
  type TechnicianEfficiency,
} from "@/hooks/use-report-queries";

// ── Sort configuration ──
type SortField =
  | "technicianName"
  | "jobsCompleted"
  | "totalActiveWorkHours"
  | "avgActiveHoursPerJob"
  | "totalPartsWaitHours"
  | "totalBayQueueHours"
  | "avgTurnaroundHours"
  | "estimateAccuracyRatio";

type SortDir = "asc" | "desc";

/* ═══════════════════════════════════════════════
 * Technician Efficiency — Fairness-First Layout
 *
 * Efficiency = Active Wrench Time ONLY.
 * Parts delays & bay queue shown separately
 * for operational context, not punitive scoring.
 * ═══════════════════════════════════════════════ */
export default function TechnicianEfficiencyPage() {
  return (
    <Suspense fallback={<div className="p-6 text-muted-foreground">Loading efficiency data...</div>}>
      <TechnicianEfficiencyContent />
    </Suspense>
  );
}

function TechnicianEfficiencyContent() {
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
  const [sortField, setSortField] = useState<SortField>("totalActiveWorkHours");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const applyFilters = useCallback(() => {
    const params = new URLSearchParams();
    if (fromInput) params.set("from", fromInput);
    if (toInput) params.set("to", toInput);
    if (allLocsInput) params.set("allLocations", "true");
    router.push(`/reports/technician-efficiency?${params.toString()}`);
  }, [fromInput, toInput, allLocsInput, router]);

  const filters = useMemo(
    () => ({ from: from || undefined, to: to || undefined, allLocations }),
    [from, to, allLocations],
  );

  const effQuery = useTechnicianEfficiencyQuery(token, locationId, filters);
  const rawData = effQuery.data?.data ?? [];

  // ── Client-side sort ──
  const sortedData = useMemo(() => {
    const sorted = [...rawData].sort((a, b) => {
      let aVal: string | number;
      let bVal: string | number;

      switch (sortField) {
        case "technicianName":
          aVal = a.technicianName;
          bVal = b.technicianName;
          break;
        case "jobsCompleted":
          aVal = a.jobsCompleted;
          bVal = b.jobsCompleted;
          break;
        case "totalActiveWorkHours":
          aVal = parseFloat(a.totalActiveWorkHours);
          bVal = parseFloat(b.totalActiveWorkHours);
          break;
        case "avgActiveHoursPerJob":
          aVal = parseFloat(a.avgActiveHoursPerJob);
          bVal = parseFloat(b.avgActiveHoursPerJob);
          break;
        case "totalPartsWaitHours":
          aVal = parseFloat(a.totalPartsWaitHours);
          bVal = parseFloat(b.totalPartsWaitHours);
          break;
        case "totalBayQueueHours":
          aVal = parseFloat(a.totalBayQueueHours);
          bVal = parseFloat(b.totalBayQueueHours);
          break;
        case "avgTurnaroundHours":
          aVal = parseFloat(a.avgTurnaroundHours);
          bVal = parseFloat(b.avgTurnaroundHours);
          break;
        case "estimateAccuracyRatio":
          aVal = a.estimateAccuracyRatio ? parseFloat(a.estimateAccuracyRatio) : 0;
          bVal = b.estimateAccuracyRatio ? parseFloat(b.estimateAccuracyRatio) : 0;
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
        <h1 className="text-lg font-semibold">Technician Efficiency</h1>
      </div>

      {/* ── Fairness Notice ── */}
      <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
        <p className="font-medium">Fair Measurement Policy</p>
        <p className="mt-0.5 text-blue-700">
          Technician efficiency reflects active wrench time only. Parts delays
          and bay queue are shown separately for operational context &mdash; they
          are not factored into individual performance scores.
        </p>
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

      {/* ── Data Grid ── */}
      <div className="rounded-lg border border-border">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30 text-left text-xs font-medium text-muted-foreground">
                <SortHeader field="technicianName" label="Technician" onClick={toggleSort} icon={sortIcon} />
                <SortHeader field="jobsCompleted" label="Jobs" onClick={toggleSort} icon={sortIcon} align="right" />

                {/* ── Active Work Section (primary metric) ── */}
                <th scope="col" className="border-l-2 border-green-200 px-1 py-2" />
                <SortHeader
                  field="totalActiveWorkHours"
                  label="Active Work (h)"
                  onClick={toggleSort}
                  icon={sortIcon}
                  align="right"
                />
                <SortHeader
                  field="avgActiveHoursPerJob"
                  label="Avg/Job (h)"
                  onClick={toggleSort}
                  icon={sortIcon}
                  align="right"
                />

                {/* ── Operational Context Section (not punitive) ── */}
                <th scope="col" className="border-l-2 border-orange-200 px-1 py-2" />
                <SortHeader
                  field="totalPartsWaitHours"
                  label="Parts Wait (h)"
                  onClick={toggleSort}
                  icon={sortIcon}
                  align="right"
                />
                <SortHeader
                  field="totalBayQueueHours"
                  label="Bay Queue (h)"
                  onClick={toggleSort}
                  icon={sortIcon}
                  align="right"
                />

                {/* ── Turnaround & Accuracy ── */}
                <th scope="col" className="border-l-2 border-border px-1 py-2" />
                <SortHeader
                  field="avgTurnaroundHours"
                  label="Avg Turnaround (h)"
                  onClick={toggleSort}
                  icon={sortIcon}
                  align="right"
                />
                <SortHeader
                  field="estimateAccuracyRatio"
                  label="Est. Accuracy"
                  onClick={toggleSort}
                  icon={sortIcon}
                  align="right"
                />
              </tr>
              {/* ── Section labels row ── */}
              <tr className="border-b border-border text-[10px] font-medium uppercase tracking-wider">
                <td colSpan={2} className="px-4 py-1 text-muted-foreground">
                  Identity
                </td>
                <td className="border-l-2 border-green-200" />
                <td colSpan={2} className="px-4 py-1 text-green-600">
                  Performance (efficiency basis)
                </td>
                <td className="border-l-2 border-orange-200" />
                <td colSpan={2} className="px-4 py-1 text-orange-600">
                  Operational Context (not scored)
                </td>
                <td className="border-l-2 border-border" />
                <td colSpan={2} className="px-4 py-1 text-muted-foreground">
                  Throughput
                </td>
              </tr>
            </thead>
            <tbody>
              {effQuery.isLoading ? (
                <tr>
                  <td colSpan={11} className="px-4 py-12 text-center text-muted-foreground">
                    Loading efficiency data...
                  </td>
                </tr>
              ) : sortedData.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-4 py-12 text-center text-muted-foreground">
                    No technician data found. Efficiency data requires completed job cards with state log history.
                  </td>
                </tr>
              ) : (
                sortedData.map((tech) => (
                  <tr
                    key={tech.technicianId}
                    className="border-b border-border last:border-0 hover:bg-muted/20"
                  >
                    <td className="px-4 py-2 text-sm font-medium">
                      {tech.technicianName}
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-xs">
                      {tech.jobsCompleted}
                    </td>

                    {/* ── Active Work (green zone) ── */}
                    <td className="border-l-2 border-green-200" />
                    <td className="bg-green-50/30 px-4 py-2 text-right font-mono text-xs font-medium text-green-700">
                      {tech.totalActiveWorkHours}
                    </td>
                    <td className="bg-green-50/30 px-4 py-2 text-right font-mono text-xs text-green-600">
                      {tech.avgActiveHoursPerJob}
                    </td>

                    {/* ── Operational Context (orange zone) ── */}
                    <td className="border-l-2 border-orange-200" />
                    <td className="bg-orange-50/30 px-4 py-2 text-right font-mono text-xs text-orange-600">
                      {tech.totalPartsWaitHours}
                    </td>
                    <td className="bg-orange-50/30 px-4 py-2 text-right font-mono text-xs text-orange-600">
                      {tech.totalBayQueueHours}
                    </td>

                    {/* ── Turnaround & Accuracy ── */}
                    <td className="border-l-2 border-border" />
                    <td className="px-4 py-2 text-right font-mono text-xs">
                      {tech.avgTurnaroundHours}
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-xs">
                      {tech.estimateAccuracyRatio ? (
                        <AccuracyBadge value={parseFloat(tech.estimateAccuracyRatio)} />
                      ) : (
                        <span className="text-muted-foreground">&mdash;</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Time Breakdown Cards (visual summary) ── */}
      {sortedData.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground">
            Time Breakdown by Technician
          </h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {sortedData.map((tech) => {
              const active = parseFloat(tech.totalActiveWorkHours);
              const wait = parseFloat(tech.totalPartsWaitHours);
              const queue = parseFloat(tech.totalBayQueueHours);
              const total = active + wait + queue;
              const activePct = total > 0 ? (active / total) * 100 : 0;
              const waitPct = total > 0 ? (wait / total) * 100 : 0;
              const queuePct = total > 0 ? (queue / total) * 100 : 0;

              return (
                <div
                  key={tech.technicianId}
                  className="rounded-lg border border-border bg-background p-4"
                >
                  <p className="text-sm font-medium">{tech.technicianName}</p>
                  <p className="text-xs text-muted-foreground">
                    {tech.jobsCompleted} jobs completed
                  </p>

                  {/* ── Stacked bar ── */}
                  <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-muted">
                    {activePct > 0 && (
                      <div
                        className="bg-green-500 transition-all"
                        style={{ width: `${activePct}%` }}
                        title={`Active work: ${active.toFixed(1)}h (${activePct.toFixed(0)}%)`}
                      />
                    )}
                    {waitPct > 0 && (
                      <div
                        className="bg-orange-400 transition-all"
                        style={{ width: `${waitPct}%` }}
                        title={`Parts wait: ${wait.toFixed(1)}h (${waitPct.toFixed(0)}%)`}
                      />
                    )}
                    {queuePct > 0 && (
                      <div
                        className="bg-amber-300 transition-all"
                        style={{ width: `${queuePct}%` }}
                        title={`Bay queue: ${queue.toFixed(1)}h (${queuePct.toFixed(0)}%)`}
                      />
                    )}
                  </div>

                  {/* ── Legend ── */}
                  <div className="mt-2 flex gap-4 text-xs">
                    <span className="flex items-center gap-1">
                      <span className="inline-block h-2 w-2 rounded-full bg-green-500" />
                      Active {active.toFixed(1)}h
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="inline-block h-2 w-2 rounded-full bg-orange-400" />
                      Parts {wait.toFixed(1)}h
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="inline-block h-2 w-2 rounded-full bg-amber-300" />
                      Queue {queue.toFixed(1)}h
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
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

function AccuracyBadge({ value }: { value: number }) {
  // 1.0 = perfect, < 1.0 = faster than estimate, > 1.0 = slower
  const color =
    value <= 1.05
      ? "text-green-600"
      : value <= 1.25
        ? "text-amber-600"
        : "text-red-600";
  return <span className={color}>{value.toFixed(2)}x</span>;
}
