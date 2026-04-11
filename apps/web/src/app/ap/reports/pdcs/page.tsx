"use client";

/**
 * Post-Dated Checks (PDC) Report.
 *
 * Shows every non-void check voucher whose check_date is in the future OR
 * whose status is RELEASED-but-not-CLEARED. Each row is a physical check
 * the business is waiting to see hit the bank.
 *
 * Enhancements over the original page:
 *   - Summary cards (total outstanding, maturing this week/month, past maturity)
 *   - Date range filter (maturity date)
 *   - Bank filter (dropdown derived from actual data)
 *   - Status filter (Approved / Printed / Released / Cleared / Voided)
 *   - Text search (CV#, check#, supplier)
 *   - Sortable columns (maturity date, amount, supplier, bank)
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Calendar,
  CreditCard,
  AlertTriangle,
  Clock,
  DollarSign,
  Search,
  X,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  Filter,
} from "lucide-react";
import { useAuth } from "@/app/auth-context";
import { apiFetch } from "@/lib/api";
import { fmtPeso, fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";

/* ─── Types ─── */

interface PDCEntry {
  id: string;
  cvNo: string;
  supplierName: string;
  checkNo: string;
  bankName: string;
  checkDate: string;
  amount: string;
  status: string;
}

interface PDCListResponse {
  data: PDCEntry[];
  monthlySummary: { month: string; total: number }[];
}

type SortCol = "cvNo" | "supplier" | "bank" | "checkDate" | "amount" | "status";
type SortDir = "asc" | "desc";

/* ─── Status styling ─── */

const STATUS_COLORS: Record<string, string> = {
  APPROVED: "bg-blue-100 text-blue-700",
  PRINTED: "bg-indigo-100 text-indigo-700",
  RELEASED: "bg-emerald-100 text-emerald-700",
  CLEARED: "bg-green-100 text-green-800",
  VOIDED: "bg-red-100 text-red-700",
};

const STATUS_LABELS: Record<string, string> = {
  APPROVED: "Approved",
  PRINTED: "Printed",
  RELEASED: "Released",
  CLEARED: "Cleared",
  VOIDED: "Voided",
};

/* ─── Helpers ─── */

function startOfDay(d = new Date()): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function endOfWeek(d = new Date()): Date {
  const today = startOfDay(d);
  const day = today.getDay(); // 0..6 Sun..Sat
  const daysUntilSaturday = 6 - day;
  const end = new Date(today);
  end.setDate(end.getDate() + daysUntilSaturday);
  end.setHours(23, 59, 59, 999);
  return end;
}

function endOfMonth(d = new Date()): Date {
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  end.setHours(23, 59, 59, 999);
  return end;
}

/* ─── Sortable header component ─── */

function SortableHeader({
  label,
  field,
  activeField,
  activeDir,
  onSort,
  align = "left",
}: {
  label: string;
  field: SortCol;
  activeField: SortCol;
  activeDir: SortDir;
  onSort: (f: SortCol) => void;
  align?: "left" | "right";
}) {
  const isActive = field === activeField;
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onSort(field);
      }}
      className={cn(
        "group inline-flex items-center gap-0.5 text-[10px] font-semibold uppercase tracking-wider transition-colors select-none",
        isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground",
        align === "right" && "flex-row-reverse",
      )}
    >
      {label}
      <span className="inline-flex w-3 justify-center">
        {isActive ? (
          activeDir === "asc" ? (
            <ChevronUp size={11} className="text-primary" strokeWidth={2.5} />
          ) : (
            <ChevronDown size={11} className="text-primary" strokeWidth={2.5} />
          )
        ) : (
          <ChevronsUpDown
            size={11}
            className="text-muted-foreground/30 group-hover:text-muted-foreground/60"
          />
        )}
      </span>
    </button>
  );
}

/* ═══════════════════════════════════════════════════ */
/*  PDC Report Page                                     */
/* ═══════════════════════════════════════════════════ */

export default function PDCReportPage() {
  const { token, locationId, loading: authLoading } = useAuth();
  const router = useRouter();

  const [entries, setEntries] = useState<PDCEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [bankFilter, setBankFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Sort
  const [sortCol, setSortCol] = useState<SortCol>("checkDate");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const fetchPDCs = useCallback(async () => {
    if (!token || !locationId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<PDCListResponse>("/ap/reports/pdcs", {
        token,
        locationId,
      });
      setEntries(Array.isArray(res.data) ? res.data : []);
    } catch (err: any) {
      setError(err.message || "Failed to load PDC report");
    } finally {
      setLoading(false);
    }
  }, [token, locationId]);

  useEffect(() => {
    if (!authLoading && token && locationId) fetchPDCs();
  }, [authLoading, token, locationId, fetchPDCs]);

  // ── Filter + sort pipeline ──
  const filtered = useMemo(() => {
    const now = startOfDay();
    let rows = entries;

    if (search.trim().length >= 1) {
      const q = search.toLowerCase();
      rows = rows.filter(
        (r) =>
          (r.cvNo ?? "").toLowerCase().includes(q) ||
          (r.supplierName ?? "").toLowerCase().includes(q) ||
          (r.checkNo ?? "").toLowerCase().includes(q),
      );
    }
    if (bankFilter) {
      rows = rows.filter((r) => (r.bankName ?? "") === bankFilter);
    }
    if (statusFilter) {
      rows = rows.filter((r) => r.status === statusFilter);
    }
    if (dateFrom) {
      const from = new Date(dateFrom);
      rows = rows.filter((r) => new Date(r.checkDate) >= from);
    }
    if (dateTo) {
      const to = new Date(dateTo);
      to.setHours(23, 59, 59, 999);
      rows = rows.filter((r) => new Date(r.checkDate) <= to);
    }

    const copy = [...rows];
    copy.sort((a, b) => {
      let cmp: number;
      switch (sortCol) {
        case "cvNo":
          cmp = (a.cvNo ?? "").localeCompare(b.cvNo ?? "");
          break;
        case "supplier":
          cmp = (a.supplierName ?? "").localeCompare(b.supplierName ?? "");
          break;
        case "bank":
          cmp = (a.bankName ?? "").localeCompare(b.bankName ?? "");
          break;
        case "checkDate":
          cmp = new Date(a.checkDate).getTime() - new Date(b.checkDate).getTime();
          break;
        case "amount":
          cmp = parseFloat(a.amount) - parseFloat(b.amount);
          break;
        case "status":
          cmp = (a.status ?? "").localeCompare(b.status ?? "");
          break;
        default:
          cmp = 0;
      }
      return sortDir === "desc" ? -cmp : cmp;
    });
    // Note `now` is referenced only for downstream summary totals — not sort
    void now;
    return copy;
  }, [entries, search, bankFilter, statusFilter, dateFrom, dateTo, sortCol, sortDir]);

  // ── Summary (computed from ALL entries, not filtered) ──
  const summary = useMemo(() => {
    const now = startOfDay();
    const weekEnd = endOfWeek();
    const monthEnd = endOfMonth();

    // Count only non-cleared / non-void rows as "outstanding"
    const outstanding = entries.filter(
      (e) => e.status !== "CLEARED" && e.status !== "VOIDED",
    );

    let totalCount = 0;
    let totalAmount = 0;
    let weekCount = 0;
    let weekAmount = 0;
    let monthCount = 0;
    let monthAmount = 0;
    let overdueCount = 0;
    let overdueAmount = 0;

    for (const e of outstanding) {
      const amt = parseFloat(e.amount) || 0;
      const maturity = new Date(e.checkDate);
      totalCount++;
      totalAmount += amt;

      if (maturity <= weekEnd && maturity >= now) {
        weekCount++;
        weekAmount += amt;
      }
      if (maturity <= monthEnd && maturity >= now) {
        monthCount++;
        monthAmount += amt;
      }
      // Past maturity: RELEASED but check_date already elapsed
      if (e.status === "RELEASED" && maturity < now) {
        overdueCount++;
        overdueAmount += amt;
      }
    }

    return {
      totalCount,
      totalAmount,
      weekCount,
      weekAmount,
      monthCount,
      monthAmount,
      overdueCount,
      overdueAmount,
    };
  }, [entries]);

  // Bank dropdown options — derive from the actual data
  const bankOptions = useMemo(() => {
    const set = new Set<string>();
    entries.forEach((e) => e.bankName && set.add(e.bankName));
    return [...set].sort();
  }, [entries]);

  const handleSort = (field: SortCol) => {
    if (field === sortCol) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortCol(field);
      setSortDir(field === "amount" ? "desc" : "asc");
    }
  };

  const clearFilters = () => {
    setSearch("");
    setBankFilter("");
    setStatusFilter("");
    setDateFrom("");
    setDateTo("");
  };

  const hasFilters =
    search || bankFilter || statusFilter || dateFrom || dateTo;

  if (authLoading || loading) {
    return (
      <div className="mx-auto flex h-full max-w-7xl flex-col">
        <div className="mb-6 flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/[0.06]">
            <Calendar size={16} className="text-primary" />
          </div>
          <h1 className="text-[18px] font-semibold tracking-tight">
            Post-Dated Checks Report
          </h1>
        </div>
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-full max-w-7xl flex-col">
      {/* Header */}
      <div className="mb-4 flex items-center gap-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/[0.06]">
          <Calendar size={16} className="text-primary" />
        </div>
        <div>
          <h1 className="text-[18px] font-semibold tracking-tight">
            Post-Dated Checks Report
          </h1>
          <p className="text-xs text-muted-foreground">
            Outstanding checks waiting to clear, grouped by maturity
          </p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KPICard
          icon={<DollarSign size={14} />}
          label="Total Outstanding"
          value={fmtPeso(summary.totalAmount)}
          sub={`${summary.totalCount} check${summary.totalCount === 1 ? "" : "s"}`}
          accent
        />
        <KPICard
          icon={<Clock size={14} />}
          label="Maturing This Week"
          value={fmtPeso(summary.weekAmount)}
          sub={`${summary.weekCount} check${summary.weekCount === 1 ? "" : "s"}`}
        />
        <KPICard
          icon={<Calendar size={14} />}
          label="Maturing This Month"
          value={fmtPeso(summary.monthAmount)}
          sub={`${summary.monthCount} check${summary.monthCount === 1 ? "" : "s"}`}
        />
        <KPICard
          icon={<AlertTriangle size={14} />}
          label="Past Maturity"
          value={fmtPeso(summary.overdueAmount)}
          sub={`${summary.overdueCount} released, not cleared`}
          danger={summary.overdueAmount > 0}
        />
      </div>

      {/* Filters */}
      <div className="mb-3 rounded-xl border border-border bg-background p-3 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search
              size={14}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search CV#, check#, supplier…"
              className="h-8 w-full rounded-lg border border-border bg-background pl-9 pr-8 text-[12px] outline-none focus:border-primary/40 focus:ring-1 focus:ring-primary/20"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X size={12} />
              </button>
            )}
          </div>

          <select
            value={bankFilter}
            onChange={(e) => setBankFilter(e.target.value)}
            className="h-8 rounded-lg border border-border bg-background px-2 text-[12px] outline-none"
          >
            <option value="">All Banks</option>
            {bankOptions.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-8 rounded-lg border border-border bg-background px-2 text-[12px] outline-none"
          >
            <option value="">All Statuses</option>
            <option value="APPROVED">Approved</option>
            <option value="PRINTED">Printed</option>
            <option value="RELEASED">Released</option>
          </select>

          <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <Filter size={12} />
            <span>Maturity:</span>
          </div>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="h-8 rounded-lg border border-border bg-background px-2 text-[12px] outline-none"
          />
          <span className="text-[11px] text-muted-foreground">→</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="h-8 rounded-lg border border-border bg-background px-2 text-[12px] outline-none"
          />

          {hasFilters && (
            <button
              onClick={clearFilters}
              className="ml-auto h-8 rounded-lg border border-border px-3 text-[11px] font-medium text-muted-foreground hover:bg-muted"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-2 text-sm text-destructive">
          {error}
          <button onClick={fetchPDCs} className="ml-2 underline hover:no-underline">
            Retry
          </button>
        </div>
      )}

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-border bg-background shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="px-3 py-2.5 text-left">
                  <SortableHeader
                    label="CV #"
                    field="cvNo"
                    activeField={sortCol}
                    activeDir={sortDir}
                    onSort={handleSort}
                    align="left"
                  />
                </th>
                <th className="px-3 py-2.5 text-left">
                  <SortableHeader
                    label="Supplier"
                    field="supplier"
                    activeField={sortCol}
                    activeDir={sortDir}
                    onSort={handleSort}
                    align="left"
                  />
                </th>
                <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Check #
                </th>
                <th className="px-3 py-2.5 text-left">
                  <SortableHeader
                    label="Bank"
                    field="bank"
                    activeField={sortCol}
                    activeDir={sortDir}
                    onSort={handleSort}
                    align="left"
                  />
                </th>
                <th className="px-3 py-2.5 text-left">
                  <SortableHeader
                    label="Check Date"
                    field="checkDate"
                    activeField={sortCol}
                    activeDir={sortDir}
                    onSort={handleSort}
                    align="left"
                  />
                </th>
                <th className="px-3 py-2.5 text-right">
                  <SortableHeader
                    label="Amount"
                    field="amount"
                    activeField={sortCol}
                    activeDir={sortDir}
                    onSort={handleSort}
                    align="right"
                  />
                </th>
                <th className="px-3 py-2.5 text-left">
                  <SortableHeader
                    label="Status"
                    field="status"
                    activeField={sortCol}
                    activeDir={sortDir}
                    onSort={handleSort}
                    align="left"
                  />
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-3 py-12 text-center text-sm text-muted-foreground"
                  >
                    <div className="flex flex-col items-center">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                        <CreditCard size={16} className="text-muted-foreground" />
                      </div>
                      <p className="mt-3 text-[13px] font-medium">
                        {entries.length === 0
                          ? "No post-dated checks found."
                          : "No results match the filters."}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map((pdc, i) => {
                  const now = startOfDay();
                  const maturity = new Date(pdc.checkDate);
                  const isPastMaturity =
                    pdc.status === "RELEASED" && maturity < now;
                  const isThisWeek =
                    maturity >= now && maturity <= endOfWeek();
                  return (
                    <tr
                      key={pdc.id}
                      onClick={() => router.push(`/ap/check-vouchers/${pdc.id}`)}
                      className={cn(
                        "cursor-pointer border-b border-border transition-colors hover:bg-accent/50",
                        i % 2 === 0 ? "bg-background" : "bg-muted/10",
                        isPastMaturity && "bg-red-50/30",
                      )}
                    >
                      <td className="px-3 py-2.5 font-mono text-[13px] font-semibold text-primary">
                        {pdc.cvNo}
                      </td>
                      <td className="px-3 py-2.5 text-[13px]">{pdc.supplierName}</td>
                      <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">
                        {pdc.checkNo}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-muted-foreground">
                        {pdc.bankName}
                      </td>
                      <td
                        className={cn(
                          "px-3 py-2.5 text-xs font-medium",
                          isPastMaturity && "text-red-600",
                          isThisWeek && !isPastMaturity && "text-amber-600",
                        )}
                      >
                        {fmtDate(pdc.checkDate)}
                        {isPastMaturity && (
                          <span className="ml-1 text-[9px] text-red-600">
                            (overdue)
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right text-[13px] font-semibold tabular-nums">
                        {fmtPeso(pdc.amount)}
                      </td>
                      <td className="px-3 py-2.5">
                        <span
                          className={cn(
                            "inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold",
                            STATUS_COLORS[pdc.status] ??
                              "bg-muted text-muted-foreground",
                          )}
                        >
                          {STATUS_LABELS[pdc.status] ??
                            pdc.status.replace(/_/g, " ")}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between border-t border-border bg-muted/30 px-3 py-2">
          <span className="text-[11px] text-muted-foreground">
            Showing {filtered.length} of {entries.length} post-dated check
            {entries.length !== 1 ? "s" : ""}
          </span>
          <button
            onClick={fetchPDCs}
            className="text-[11px] font-medium text-primary hover:underline"
          >
            Refresh
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── KPI card (shared shape) ─── */

function KPICard({
  icon,
  label,
  value,
  sub,
  accent,
  danger,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
  danger?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-background p-4 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]",
        accent && "border-amber-200 bg-amber-50/40",
        danger && "border-red-200 bg-red-50/40",
      )}
    >
      <div className="flex items-center gap-1.5 text-muted-foreground">
        {icon}
        <span className="text-[11px] font-medium">{label}</span>
      </div>
      <div
        className={cn(
          "mt-1 text-xl font-bold tabular-nums",
          danger ? "text-red-700" : "text-foreground",
        )}
      >
        {value}
      </div>
      {sub && <div className="mt-0.5 text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
}
