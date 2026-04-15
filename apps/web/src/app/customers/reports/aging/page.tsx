"use client";

import { useMemo, useState } from "react";
import {
  BarChart3,
  Download,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  Search,
  X,
} from "lucide-react";
import { useAuth } from "@/app/auth-context";
import { useAgingReport, type AgingRow } from "@/hooks/use-customers-query";
import { cn } from "@/lib/utils";
import { fmtPeso } from "@/lib/format";

/* ── Sort types ── */

type SortCol = "customer" | "current" | "days1to30" | "days31to60" | "days61to90" | "days90plus" | "total";
type SortDir = "asc" | "desc";

function SortableHeader({
  label,
  field,
  activeField,
  activeDir,
  onSort,
  align = "left",
  className,
}: {
  label: string;
  field: SortCol;
  activeField: SortCol;
  activeDir: SortDir;
  onSort: (field: SortCol) => void;
  align?: "left" | "right";
  className?: string;
}) {
  const isActive = field === activeField;
  return (
    <button
      onClick={() => onSort(field)}
      className={cn(
        "group inline-flex items-center gap-0.5 text-[11px] font-semibold uppercase tracking-[0.06em] transition-colors select-none",
        isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground",
        align === "right" && "flex-row-reverse",
        className,
      )}
    >
      {label}
      <span className="inline-flex w-3 justify-center">
        {isActive ? (
          activeDir === "asc" ? <ChevronUp size={11} className="text-primary" strokeWidth={2.5} /> : <ChevronDown size={11} className="text-primary" strokeWidth={2.5} />
        ) : (
          <ChevronsUpDown size={11} className="text-muted-foreground/30 group-hover:text-muted-foreground/60" />
        )}
      </span>
    </button>
  );
}

/* ── Helpers ── */

function fmtCell(v: number): string {
  return v > 0.005 ? fmtPeso(v) : "\u2014";
}

function exportCSV(data: AgingRow[]) {
  const headers = "Customer,Type,Terms,Current,1-30 Days,31-60 Days,61-90 Days,90+ Days,Total\n";
  const rows = data
    .map((r) =>
      `"${r.customer.name}",${r.customerType},Net ${r.paymentTerms},${r.current},${r.days1to30},${r.days31to60},${r.days61to90},${r.days90plus},${r.total}`,
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

/* ── Page ── */

export default function AgingReportPage() {
  const { token, locationId } = useAuth();
  const [asOfDate, setAsOfDate] = useState<string>("");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");

  const agingQuery = useAgingReport(token ?? "", locationId ?? "", asOfDate || undefined);
  const report = agingQuery.data;
  const rows = report?.data ?? [];
  const totals = report?.totals ?? { current: 0, days1to30: 0, days31to60: 0, days61to90: 0, days90plus: 0, total: 0 };
  const pct = report?.percentages ?? { current: 0, days1to30: 0, days31to60: 0, days61to90: 0, days90plus: 0 };

  // Sort
  const [sortCol, setSortCol] = useState<SortCol>("total");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const handleSort = (field: SortCol) => {
    if (field === sortCol) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortCol(field); setSortDir(field === "customer" ? "asc" : "desc"); }
  };

  // Filter + sort
  const displayed = useMemo(() => {
    let filtered = rows;
    if (search.trim()) {
      const q = search.toLowerCase();
      filtered = filtered.filter((r) => r.customer.name.toLowerCase().includes(q));
    }
    if (typeFilter) filtered = filtered.filter((r) => r.customerType === typeFilter);
    const copy = [...filtered];
    copy.sort((a, b) => {
      const cmp = sortCol === "customer"
        ? a.customer.name.localeCompare(b.customer.name)
        : ((a as any)[sortCol] as number) - ((b as any)[sortCol] as number);
      return sortDir === "desc" ? -cmp : cmp;
    });
    return copy;
  }, [rows, search, typeFilter, sortCol, sortDir]);

  if (agingQuery.isLoading) {
    return (
      <div className="mx-auto flex h-full max-w-7xl flex-col">
        <div className="mb-6 flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/[0.06]"><BarChart3 size={16} className="text-primary" /></div>
          <h1 className="text-[18px] font-semibold tracking-tight">AR Aging Report</h1>
        </div>
        <div className="space-y-2">{Array.from({ length: 8 }).map((_, i) => (<div key={i} className="h-14 animate-pulse rounded-lg bg-muted" />))}</div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-full max-w-7xl flex-col">
      {/* Header */}
      <div className="mb-5 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/[0.06]"><BarChart3 size={16} className="text-primary" /></div>
          <div>
            <h1 className="text-[18px] font-semibold tracking-tight">AR Aging Report</h1>
            <p className="text-[13px] text-muted-foreground">
              As of {report?.asOfDate ? new Date(report.asOfDate).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" }) : "today"}
            </p>
          </div>
        </div>
        {rows.length > 0 && (
          <button onClick={() => exportCSV(displayed)}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
            <Download size={14} /> Export CSV
          </button>
        )}
      </div>

      {/* Summary Cards */}
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-6">
        <div className="rounded-xl border border-border bg-background p-3 shadow-sm">
          <div className="text-[10px] font-medium text-muted-foreground">Total Receivables</div>
          <div className="mt-1 text-lg font-bold tabular-nums">{fmtPeso(totals.total)}</div>
          <div className="text-[10px] text-muted-foreground">{rows.length} customers</div>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-3 shadow-sm">
          <div className="text-[10px] font-medium text-emerald-600">Current (Not Due)</div>
          <div className="mt-1 text-lg font-bold tabular-nums text-emerald-700">{fmtPeso(totals.current)}</div>
          <div className="text-[10px] text-emerald-600">{pct.current}%</div>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-3 shadow-sm">
          <div className="text-[10px] font-medium text-amber-600">1-30 Days</div>
          <div className="mt-1 text-lg font-bold tabular-nums text-amber-700">{fmtPeso(totals.days1to30)}</div>
          <div className="text-[10px] text-amber-600">{pct.days1to30}%</div>
        </div>
        <div className="rounded-xl border border-orange-200 bg-orange-50/40 p-3 shadow-sm">
          <div className="text-[10px] font-medium text-orange-600">31-60 Days</div>
          <div className="mt-1 text-lg font-bold tabular-nums text-orange-700">{fmtPeso(totals.days31to60)}</div>
          <div className="text-[10px] text-orange-600">{pct.days31to60}%</div>
        </div>
        <div className="rounded-xl border border-red-200 bg-red-50/40 p-3 shadow-sm">
          <div className="text-[10px] font-medium text-red-600">61-90 Days</div>
          <div className="mt-1 text-lg font-bold tabular-nums text-red-700">{fmtPeso(totals.days61to90)}</div>
          <div className="text-[10px] text-red-600">{pct.days61to90}%</div>
        </div>
        <div className={cn("rounded-xl border p-3 shadow-sm", totals.days90plus > 0 ? "border-red-300 bg-red-100/50" : "border-border bg-background")}>
          <div className="text-[10px] font-medium text-red-700">90+ Days</div>
          <div className={cn("mt-1 text-lg font-bold tabular-nums", totals.days90plus > 0 ? "text-red-800" : "text-foreground")}>{fmtPeso(totals.days90plus)}</div>
          <div className="text-[10px] text-red-600">{pct.days90plus}%</div>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-3 rounded-xl border border-border bg-background p-3 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[180px] max-w-sm">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search customer..."
              className="h-8 w-full rounded-lg border border-border bg-background pl-9 pr-8 text-[12px] outline-none focus:border-primary/40 focus:ring-1 focus:ring-primary/20" />
            {search && <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X size={12} /></button>}
          </div>
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}
            className="h-8 rounded-lg border border-border bg-background px-2 text-[12px] outline-none">
            <option value="">All Types</option>
            <option value="INDIVIDUAL">Individual</option>
            <option value="SHOP">Shop</option>
            <option value="FLEET">Fleet</option>
            <option value="WHOLESALE">Wholesale</option>
          </select>
          <div className="flex items-center gap-1.5">
            <label className="text-[11px] text-muted-foreground">As of:</label>
            <input type="date" value={asOfDate} onChange={(e) => setAsOfDate(e.target.value)}
              className="h-8 rounded-lg border border-border bg-background px-2 text-[12px] outline-none" />
            {asOfDate && <button onClick={() => setAsOfDate("")} className="text-[11px] text-primary hover:underline">Today</button>}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-border bg-background shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
        <div className="flex items-center border-b border-border bg-muted/40 px-4 py-2">
          <div className="flex-1"><SortableHeader label="Customer" field="customer" activeField={sortCol} activeDir={sortDir} onSort={handleSort} /></div>
          <div className="w-24 flex justify-end"><SortableHeader label="Current" field="current" activeField={sortCol} activeDir={sortDir} onSort={handleSort} align="right" /></div>
          <div className="w-24 flex justify-end"><SortableHeader label="1-30" field="days1to30" activeField={sortCol} activeDir={sortDir} onSort={handleSort} align="right" /></div>
          <div className="w-24 flex justify-end"><SortableHeader label="31-60" field="days31to60" activeField={sortCol} activeDir={sortDir} onSort={handleSort} align="right" /></div>
          <div className="w-24 flex justify-end"><SortableHeader label="61-90" field="days61to90" activeField={sortCol} activeDir={sortDir} onSort={handleSort} align="right" /></div>
          <div className="w-24 flex justify-end"><SortableHeader label="90+" field="days90plus" activeField={sortCol} activeDir={sortDir} onSort={handleSort} align="right" /></div>
          <div className="w-28 flex justify-end"><SortableHeader label="Total" field="total" activeField={sortCol} activeDir={sortDir} onSort={handleSort} align="right" /></div>
        </div>

        {displayed.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <BarChart3 size={24} className="text-muted-foreground/30" />
            <p className="mt-3 text-[13px] font-medium">No outstanding receivables found</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {displayed.map((r) => (
              <div key={r.customer.id} className="flex items-center px-4 py-1.5 text-[13px] hover:bg-accent/50">
                <div className="flex-1 min-w-0">
                  <span className="block truncate font-medium">{r.customer.name}</span>
                  <span className="text-[10px] text-muted-foreground">{r.customerType} · Net {r.paymentTerms}</span>
                </div>
                <div className="w-24 text-right tabular-nums text-[12px] text-emerald-600">{fmtCell(r.current)}</div>
                <div className="w-24 text-right tabular-nums text-[12px] text-amber-600">{fmtCell(r.days1to30)}</div>
                <div className="w-24 text-right tabular-nums text-[12px] text-orange-600">{fmtCell(r.days31to60)}</div>
                <div className={cn("w-24 text-right tabular-nums text-[12px]", r.days61to90 > 0 ? "text-red-600 font-medium" : "text-muted-foreground")}>{fmtCell(r.days61to90)}</div>
                <div className={cn("w-24 text-right tabular-nums text-[12px]", r.days90plus > 0 ? "text-red-700 font-semibold" : "text-muted-foreground")}>{fmtCell(r.days90plus)}</div>
                <div className="w-28 text-right tabular-nums text-[13px] font-semibold">{fmtPeso(r.total)}</div>
              </div>
            ))}

            {/* Totals row */}
            <div className="flex items-center bg-muted/40 px-4 py-1.5">
              <div className="flex-1 text-[13px] font-bold">Total ({displayed.length})</div>
              <div className="w-24 text-right text-[12px] font-bold tabular-nums">{fmtPeso(totals.current)}</div>
              <div className="w-24 text-right text-[12px] font-bold tabular-nums">{fmtPeso(totals.days1to30)}</div>
              <div className="w-24 text-right text-[12px] font-bold tabular-nums">{fmtPeso(totals.days31to60)}</div>
              <div className="w-24 text-right text-[12px] font-bold tabular-nums">{fmtPeso(totals.days61to90)}</div>
              <div className="w-24 text-right text-[12px] font-bold tabular-nums">{fmtPeso(totals.days90plus)}</div>
              <div className="w-28 text-right text-[13px] font-bold tabular-nums">{fmtPeso(totals.total)}</div>
            </div>

            {/* Percentage row */}
            <div className="flex items-center bg-muted/20 px-4 py-1.5">
              <div className="flex-1 text-[10px] text-muted-foreground">% of Total</div>
              <div className="w-24 text-right text-[10px] tabular-nums text-muted-foreground">{pct.current}%</div>
              <div className="w-24 text-right text-[10px] tabular-nums text-muted-foreground">{pct.days1to30}%</div>
              <div className="w-24 text-right text-[10px] tabular-nums text-muted-foreground">{pct.days31to60}%</div>
              <div className="w-24 text-right text-[10px] tabular-nums text-muted-foreground">{pct.days61to90}%</div>
              <div className="w-24 text-right text-[10px] tabular-nums text-muted-foreground">{pct.days90plus}%</div>
              <div className="w-28 text-right text-[10px] tabular-nums text-muted-foreground">100%</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
