"use client";

import { useMemo } from "react";
import { BarChart3, Download } from "lucide-react";
import { useAuth } from "@/app/auth-context";
import { useAgingReport, type AgingRow } from "@/hooks/use-customers-query";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatPeso(value: number): string {
  return `\u20B1${value.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function exportCSV(data: AgingRow[]) {
  const headers =
    "Customer,Current (0-30),31-60 Days,61-90 Days,Over 90 Days,Total\n";
  const rows = data
    .map(
      (r) =>
        `"${r.customer.name}",${r.current},${r.days31to60},${r.days61to90},${r.over90},${r.total}`,
    )
    .join("\n");
  const blob = new Blob([headers + rows], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `ar-aging-report-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/* ------------------------------------------------------------------ */
/*  Page component                                                     */
/* ------------------------------------------------------------------ */

export default function AgingReportPage() {
  const { token, locationId } = useAuth();
  const agingQuery = useAgingReport(token, locationId);

  const rows = agingQuery.data ?? [];

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, r) => ({
        current: acc.current + r.current,
        days31to60: acc.days31to60 + r.days31to60,
        days61to90: acc.days61to90 + r.days61to90,
        over90: acc.over90 + r.over90,
        total: acc.total + r.total,
      }),
      { current: 0, days31to60: 0, days61to90: 0, over90: 0, total: 0 },
    );
  }, [rows]);

  /* ── Loading skeleton ── */
  if (agingQuery.isLoading) {
    return (
      <div className="mx-auto flex h-full max-w-6xl flex-col">
        <div className="mb-6">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/[0.06]">
              <BarChart3 size={16} className="text-primary" />
            </div>
            <h1 className="text-[18px] font-semibold tracking-tight text-foreground">
              AR Aging Report
            </h1>
          </div>
        </div>
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-full max-w-6xl flex-col">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/[0.06]">
            <BarChart3 size={16} className="text-primary" />
          </div>
          <h1 className="text-[18px] font-semibold tracking-tight text-foreground">
            AR Aging Report
          </h1>
        </div>
        {rows.length > 0 && (
          <button
            onClick={() => exportCSV(rows)}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            <Download size={14} />
            Export CSV
          </button>
        )}
      </div>

      {/* Summary cards */}
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {/* Total Receivables */}
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
          <div className="flex items-center gap-2 text-[12px] font-medium text-muted-foreground">
            <BarChart3 size={14} />
            Total Receivables
          </div>
          <div className="mt-1 text-xl font-bold tabular-nums text-foreground">
            {formatPeso(totals.total)}
          </div>
        </div>

        {/* Customers with Balance */}
        <div className="rounded-xl border border-border bg-background p-4 shadow-sm">
          <div className="flex items-center gap-2 text-[12px] font-medium text-muted-foreground">
            <BarChart3 size={14} />
            Customers with Balance
          </div>
          <div className="mt-1 text-xl font-bold tabular-nums text-foreground">
            {rows.length}
          </div>
          <div className="text-[11px] text-muted-foreground">customers</div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-border bg-background shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
        <div className="flex items-center border-b border-border bg-muted/40 px-4 py-2">
          <div className="flex-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
            Customer
          </div>
          <div className="w-28 text-right text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
            Current (0-30)
          </div>
          <div className="w-28 text-right text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
            31-60 Days
          </div>
          <div className="w-28 text-right text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
            61-90 Days
          </div>
          <div className="w-28 text-right text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
            Over 90 Days
          </div>
          <div className="w-28 text-right text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
            Total
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
              <BarChart3 size={16} className="text-muted-foreground" />
            </div>
            <p className="mt-3 text-[13px] font-medium text-foreground">
              No outstanding receivables found.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {rows.map((r) => (
              <div
                key={r.customer.id}
                className="flex w-full items-center px-4 py-3 text-left transition-colors duration-100 hover:bg-accent/60"
              >
                <div className="flex-1 min-w-0">
                  <span className="block truncate text-[13px] font-medium text-foreground">
                    {r.customer.name}
                  </span>
                </div>
                <div className="w-28 text-right text-[12px] tabular-nums text-muted-foreground">
                  {formatPeso(r.current)}
                </div>
                <div className="w-28 text-right text-[12px] tabular-nums text-muted-foreground">
                  {formatPeso(r.days31to60)}
                </div>
                <div className="w-28 text-right text-[12px] tabular-nums text-muted-foreground">
                  {formatPeso(r.days61to90)}
                </div>
                <div className="w-28 text-right text-[12px] tabular-nums text-muted-foreground">
                  {formatPeso(r.over90)}
                </div>
                <div className="w-28 text-right text-[13px] font-semibold tabular-nums text-foreground">
                  {formatPeso(r.total)}
                </div>
              </div>
            ))}

            {/* Totals row */}
            <div className="flex w-full items-center bg-muted/40 px-4 py-3">
              <div className="flex-1 min-w-0">
                <span className="text-[13px] font-bold text-foreground">
                  Total
                </span>
              </div>
              <div className="w-28 text-right text-[12px] font-bold tabular-nums text-foreground">
                {formatPeso(totals.current)}
              </div>
              <div className="w-28 text-right text-[12px] font-bold tabular-nums text-foreground">
                {formatPeso(totals.days31to60)}
              </div>
              <div className="w-28 text-right text-[12px] font-bold tabular-nums text-foreground">
                {formatPeso(totals.days61to90)}
              </div>
              <div className="w-28 text-right text-[12px] font-bold tabular-nums text-foreground">
                {formatPeso(totals.over90)}
              </div>
              <div className="w-28 text-right text-[13px] font-bold tabular-nums text-foreground">
                {formatPeso(totals.total)}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
