"use client";

import { useState } from "react";
import { FileStack, Search, DollarSign, Hash } from "lucide-react";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { cn } from "@/lib/utils";
import { useAuth } from "@/app/auth-context";
import { useSalesListQuery, type SalesFilters } from "@/hooks/use-sales-query";
import { useSalesSummaryQuery, type ReportFilters } from "@/hooks/use-sales-reports";

const STATUS_STYLES: Record<string, string> = {
  COMPLETED: "bg-emerald-500/10 text-emerald-600",
  REFUNDED: "bg-orange-500/10 text-orange-600",
  VOIDED: "bg-red-500/10 text-red-600",
};

function fmt(v: string) {
  return parseFloat(v).toLocaleString("en-PH", { minimumFractionDigits: 2 });
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("en-PH", {
    month: "short", day: "numeric", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function getDatePreset(preset: string): { from: string; to: string } {
  const now = new Date();
  const to = now.toISOString();
  let from: Date;
  switch (preset) {
    case "today": from = new Date(now.getFullYear(), now.getMonth(), now.getDate()); break;
    case "week": from = new Date(now); from.setDate(from.getDate() - 7); break;
    case "month": from = new Date(now); from.setMonth(from.getMonth() - 1); break;
    case "30d": from = new Date(now); from.setDate(from.getDate() - 30); break;
    default: from = new Date(now); from.setDate(from.getDate() - 30);
  }
  return { from: from.toISOString(), to };
}

export default function ReceiptsLogPage() {
  const { token, locationId } = useAuth();
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("COMPLETED,REFUNDED,VOIDED");
  const [search, setSearch] = useState("");

  const salesFilters: SalesFilters = {
    status: statusFilter,
    from: dateFrom ? `${dateFrom}T00:00:00Z` : undefined,
    to: dateTo ? `${dateTo}T23:59:59Z` : undefined,
    q: search || undefined,
    limit: 100,
  };

  const reportFilters: ReportFilters = {
    from: salesFilters.from,
    to: salesFilters.to,
  };

  const salesQuery = useSalesListQuery(token, locationId, salesFilters);
  const summaryQuery = useSalesSummaryQuery(token, locationId, reportFilters);
  const rows = salesQuery.data?.data ?? [];
  const summary = summaryQuery.data;

  function applyPreset(preset: string) {
    setActivePreset(preset);
    const { from, to } = getDatePreset(preset);
    setDateFrom(from.slice(0, 10));
    setDateTo(to.slice(0, 10));
  }

  function clearDates() { setDateFrom(""); setDateTo(""); setActivePreset(null); }

  return (
    <div className="mx-auto flex h-full max-w-6xl flex-col">
      <div className="mb-6">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/[0.06]"><FileStack size={16} className="text-primary" /></div>
          <h1 className="text-[18px] font-semibold tracking-tight text-foreground">Receipts Log</h1>
        </div>
        <p className="mt-1.5 text-[13px] leading-5 text-muted-foreground">Chronological log of all completed, refunded, and voided transactions.</p>
        {summary && (
          <div className="mt-4 flex gap-5">
            <div className="flex items-center gap-2 text-[13px]">
              <div className="flex h-5 w-5 items-center justify-center rounded bg-muted"><DollarSign size={11} className="text-muted-foreground" /></div>
              <span className="text-muted-foreground">Revenue</span>
              <span className="font-semibold tabular-nums text-foreground">PHP {fmt(summary.totalRevenue)}</span>
            </div>
            <div className="h-4 w-px bg-border" />
            <div className="flex items-center gap-2 text-[13px]">
              <div className="flex h-5 w-5 items-center justify-center rounded bg-muted"><Hash size={11} className="text-muted-foreground" /></div>
              <span className="text-muted-foreground">Transactions</span>
              <span className="font-semibold tabular-nums text-foreground">{summary.totalTransactions}</span>
            </div>
            {summary.totalRefunds > 0 && (
              <>
                <div className="h-4 w-px bg-border" />
                <div className="flex items-center gap-2 text-[13px]">
                  <span className="text-muted-foreground">Refunds</span>
                  <span className="font-semibold tabular-nums text-orange-600">{summary.totalRefunds}</span>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {["today", "week", "month", "30d"].map((p) => (
          <button key={p} onClick={() => applyPreset(p)} className={cn("h-8 rounded-lg border px-3 text-[11px] font-medium transition-colors", activePreset === p ? "border-primary/20 bg-primary/[0.04] text-foreground" : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground")}>
            {p === "today" ? "Today" : p === "week" ? "This Week" : p === "month" ? "This Month" : "Last 30 Days"}
          </button>
        ))}
        <div className="h-4 w-px bg-border" />
        {["COMPLETED,REFUNDED,VOIDED", "COMPLETED", "REFUNDED", "VOIDED"].map((s) => {
          const label = s.includes(",") ? "All" : s.charAt(0) + s.slice(1).toLowerCase();
          return (
            <button key={s} onClick={() => setStatusFilter(s)} className={cn("h-8 rounded-lg border px-3 text-[11px] font-medium transition-colors", statusFilter === s ? "border-primary/20 bg-primary/[0.04] text-foreground" : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground")}>
              {label}
            </button>
          );
        })}
        <div className="h-4 w-px bg-border" />
        <DateRangePicker
          startDate={dateFrom}
          endDate={dateTo}
          onChange={(start, end) => { setDateFrom(start); setDateTo(end); setActivePreset(null); }}
        />
        {(dateFrom || dateTo) && <button onClick={clearDates} className="h-8 rounded-lg border border-border px-3 text-[11px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground">Clear</button>}
      </div>

      {/* Search */}
      <div className="relative mb-3">
        <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by sale number..." className="h-9 w-full rounded-lg border border-border bg-background pr-3 text-[13px] text-foreground shadow-[0_1px_2px_0_rgba(0,0,0,0.04)] outline-none placeholder:text-muted-foreground/60 transition-colors focus:border-primary/40 focus:ring-2 focus:ring-primary/[0.08]" style={{ paddingLeft: "2.125rem" }} />
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-border bg-background shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
        <div className="flex items-center border-b border-border bg-muted/40 px-4 py-2">
          <div className="w-24 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Sale No</div>
          <div className="w-40 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Date</div>
          <div className="w-20 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Status</div>
          <div className="flex-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Customer</div>
          <div className="w-32 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Employee</div>
          <div className="w-12 text-right text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Items</div>
          <div className="w-28 text-right text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Total</div>
        </div>

        {salesQuery.isLoading ? (
          <div>{Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-12 animate-pulse border-b border-border bg-muted/20" />)}</div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted"><FileStack size={16} className="text-muted-foreground" /></div>
            <p className="mt-3 text-[13px] font-medium text-foreground">No transactions found</p>
            <p className="mt-1 text-[12px] text-muted-foreground">No receipts match the selected filters</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {rows.map((s) => (
              <div key={s.id} className="flex items-center px-4 py-2.5 transition-colors hover:bg-accent/40">
                <div className="w-24 font-mono text-[12px] font-semibold text-foreground">{s.saleNo}</div>
                <div className="w-40 text-[11px] tabular-nums text-muted-foreground">{fmtDate(s.completedAt ?? s.createdAt)}</div>
                <div className="w-20">
                  <span className={cn("inline-flex rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase", STATUS_STYLES[s.status] ?? "bg-muted text-muted-foreground")}>
                    {s.status}
                  </span>
                </div>
                <div className="flex-1 min-w-0 text-[12px] text-foreground truncate">{s.customerName ?? "Walk-in"}</div>
                <div className="w-32 text-[12px] text-muted-foreground truncate">{s.employeeName}</div>
                <div className="w-12 text-right text-[12px] tabular-nums text-muted-foreground">{s.lineCount}</div>
                <div className="w-28 text-right text-[12px] tabular-nums font-medium text-foreground">PHP {fmt(s.grandTotal)}</div>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between border-t border-border bg-muted/30 px-4 py-2">
          <span className="text-[11px] text-muted-foreground">{rows.length} transactions</span>
          {rows.length > 0 && (
            <span className="text-[11px] tabular-nums text-muted-foreground">
              Total: PHP {fmt(rows.reduce((sum, r) => sum + parseFloat(r.grandTotal), 0).toFixed(2))}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
