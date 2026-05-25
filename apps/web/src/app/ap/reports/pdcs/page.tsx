"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import {
  CreditCard, Search, X, Loader2, AlertTriangle, Clock, CheckCircle,
} from "lucide-react";
import { toast } from "sonner";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { cn } from "@/lib/utils";
import { fmtPeso, fmtDate } from "@/lib/format";
import { useAuth } from "@/app/auth-context";
import { apiFetch } from "@/lib/api";

interface CheckEntry {
  id: string;
  dvId: string;
  dvNumber: string;
  supplierName: string;
  checkNumber: string;
  bankName: string;
  checkDate: string;
  amount: number;
  status: string;
  bounceReason: string | null;
}

interface CheckRegisterResponse {
  data: CheckEntry[];
  summary: {
    totalOutstanding: number;
    maturingThisWeek: number;
    clearedThisMonth: number;
    totalBounced: number;
  };
}

const STATUS_COLORS: Record<string, string> = {
  OUTSTANDING: "bg-gray-100 text-gray-700",
  RELEASED: "bg-blue-100 text-blue-700",
  CLEARED: "bg-emerald-100 text-emerald-700",
  BOUNCED: "bg-red-100 text-red-700",
  CANCELLED: "bg-gray-100 text-gray-400 line-through",
};

export default function CheckRegisterPage() {
  const { token, locationId, loading: authLoading } = useAuth();

  const [checks, setChecks] = useState<CheckEntry[]>([]);
  const [summary, setSummary] = useState({ totalOutstanding: 0, maturingThisWeek: 0, clearedThisMonth: 0, totalBounced: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [committedSearch, setCommittedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [bankFilter, setBankFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [pendingBounce, setPendingBounce] = useState<CheckEntry | null>(null);
  const [bounceReason, setBounceReason] = useState("");

  const fetchChecks = useCallback(async () => {
    if (!token || !locationId) return;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (committedSearch) params.set("search", committedSearch);
    if (statusFilter) params.set("status", statusFilter);
    if (bankFilter) params.set("bank", bankFilter);
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    try {
      const res = await apiFetch<CheckRegisterResponse>(
        `/ap/check-register?${params.toString()}`,
        { token, locationId },
      );
      setChecks(res.data || []);
      setSummary(res.summary || { totalOutstanding: 0, maturingThisWeek: 0, clearedThisMonth: 0, totalBounced: 0 });
    } catch (err: any) {
      setError(err.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [token, locationId, committedSearch, statusFilter, bankFilter, dateFrom, dateTo]);

  useEffect(() => { if (!authLoading) fetchChecks(); }, [authLoading, fetchChecks]);

  const submitSearch = () => setCommittedSearch(search.trim());
  const clearSearch = () => { setSearch(""); setCommittedSearch(""); };

  const banks = useMemo(() => {
    const set = new Set(checks.map((c) => c.bankName).filter(Boolean));
    return Array.from(set).sort();
  }, [checks]);

  const handleAction = async (id: string, action: "release" | "clear" | "bounce" | "cancel", reason?: string) => {
    if (!token || !locationId) return;
    let body: string | undefined;
    if (action === "bounce") {
      if (!reason) return;
      body = JSON.stringify({ reason });
    }
    try {
      await apiFetch(`/ap/check-register/${id}/${action}`, {
        token, locationId, method: "POST", body,
      });
      if (action === "bounce") {
        setPendingBounce(null);
        setBounceReason("");
      }
      fetchChecks();
    } catch (err: any) {
      toast.error(err.message || `Failed to ${action} check`);
    }
  };

  return (
    <div className="mx-auto flex h-full max-w-6xl flex-col">
      <div className="mb-5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/[0.06]">
            <CreditCard size={16} className="text-primary" />
          </div>
          <div>
            <h1 className="text-[18px] font-semibold tracking-tight">Check Register</h1>
            <p className="text-[13px] text-muted-foreground">Track check lifecycle from issuance through clearing</p>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-4 shadow-sm">
          <div className="flex items-center gap-1.5 text-muted-foreground"><CreditCard size={14} /><span className="text-[11px] font-medium">Total Outstanding</span></div>
          <div className="mt-1 text-xl font-bold tabular-nums">{fmtPeso(summary.totalOutstanding)}</div>
        </div>
        <div className="rounded-xl border border-border bg-background p-4 shadow-sm">
          <div className="flex items-center gap-1.5 text-muted-foreground"><Clock size={14} /><span className="text-[11px] font-medium">Maturing This Week</span></div>
          <div className="mt-1 text-xl font-bold tabular-nums">{fmtPeso(summary.maturingThisWeek)}</div>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4 shadow-sm">
          <div className="flex items-center gap-1.5 text-emerald-600"><CheckCircle size={14} /><span className="text-[11px] font-medium">Cleared This Month</span></div>
          <div className="mt-1 text-xl font-bold tabular-nums text-emerald-700">{fmtPeso(summary.clearedThisMonth)}</div>
        </div>
        <div className={cn("rounded-xl border p-4 shadow-sm", summary.totalBounced > 0 ? "border-red-200 bg-red-50/40" : "border-border bg-background")}>
          <div className="flex items-center gap-1.5 text-muted-foreground"><AlertTriangle size={14} /><span className="text-[11px] font-medium">Bounced</span></div>
          <div className={cn("mt-1 text-xl font-bold tabular-nums", summary.totalBounced > 0 && "text-red-700")}>{fmtPeso(summary.totalBounced)}</div>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-3 rounded-xl border border-border bg-background p-3 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[180px] max-w-sm">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") submitSearch(); }}
              placeholder="Search DV#, check#, supplier... (Enter)"
              className="h-8 w-full rounded-lg border border-border bg-background pl-9 pr-14 text-[12px] text-foreground placeholder:text-muted-foreground/60 outline-none focus:border-primary/40 focus:ring-1 focus:ring-primary/20" />
            <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
              {search && <button onClick={clearSearch} className="rounded p-0.5 text-muted-foreground hover:text-foreground"><X size={12} /></button>}
              <button onClick={submitSearch} className="rounded p-0.5 text-muted-foreground hover:text-primary"><Search size={12} /></button>
            </div>
          </div>
          {banks.length > 0 && (
            <select value={bankFilter} onChange={(e) => setBankFilter(e.target.value)}
              className="h-8 rounded-lg border border-border bg-background px-2 text-[12px] outline-none">
              <option value="">All Banks</option>
              {banks.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          )}
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
            className="h-8 rounded-lg border border-border bg-background px-2 text-[12px] outline-none">
            <option value="">All Statuses</option>
            <option value="OUTSTANDING">Outstanding</option>
            <option value="RELEASED">Released</option>
            <option value="CLEARED">Cleared</option>
            <option value="BOUNCED">Bounced</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
          <DateRangePicker startDate={dateFrom} endDate={dateTo} onChange={(s, e) => { setDateFrom(s); setDateTo(e); }} />
        </div>
      </div>

      {error && (
        <div className="mb-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-2 text-sm text-destructive">
          {error} <button onClick={fetchChecks} className="ml-2 underline hover:no-underline">Retry</button>
        </div>
      )}

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-border bg-background shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
        <div className="flex items-center border-b border-border bg-muted/40 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
          <div className="w-36">DV #</div>
          <div className="flex-1">Supplier</div>
          <div className="w-28">Check #</div>
          <div className="w-20">Bank</div>
          <div className="w-28">Check Date</div>
          <div className="w-24 text-right">Amount</div>
          <div className="w-24 text-center">Status</div>
          <div className="w-36 text-right">Actions</div>
        </div>

        {loading ? (
          <div className="flex h-48 items-center justify-center"><Loader2 size={18} className="animate-spin text-muted-foreground" /></div>
        ) : checks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <CreditCard size={24} className="text-muted-foreground/30" />
            <p className="mt-3 text-[13px] font-medium">No checks found in the register</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {checks.map((c) => (
              <div key={c.id} className={cn("flex items-center px-4 py-1.5 text-[13px] hover:bg-accent/30", c.status === "CANCELLED" && "opacity-40")}>
                <div className="w-36 font-mono text-[12px] font-semibold text-primary">{c.dvNumber.replace(/^DV-/, "")}</div>
                <div className="flex-1 min-w-0 truncate">{c.supplierName}</div>
                <div className="w-28 font-mono text-[12px]">{c.checkNumber || "\u2014"}</div>
                <div className="w-20 text-[12px] text-muted-foreground">{c.bankName || "\u2014"}</div>
                <div className="w-28 text-[12px] text-muted-foreground">{c.checkDate ? fmtDate(c.checkDate) : "\u2014"}</div>
                <div className="w-24 text-right tabular-nums font-semibold text-[12px]">{fmtPeso(c.amount)}</div>
                <div className="w-24 text-center">
                  <span className={cn("inline-flex rounded-md px-2 py-0.5 text-[9px] font-semibold uppercase", STATUS_COLORS[c.status] ?? "bg-muted text-muted-foreground")}>{c.status}</span>
                  {c.status === "BOUNCED" && c.bounceReason && (
                    <div className="mt-0.5 text-[8px] text-red-400 truncate max-w-[90px]" title={c.bounceReason}>{c.bounceReason}</div>
                  )}
                </div>
                <div className="w-36 flex items-center justify-end gap-1">
                  {c.status === "OUTSTANDING" && (
                    <>
                      <button onClick={() => handleAction(c.id, "release")} className="rounded px-2 py-0.5 text-[10px] font-medium text-blue-600 hover:bg-blue-50">Release</button>
                      <button onClick={() => handleAction(c.id, "cancel")} className="rounded px-2 py-0.5 text-[10px] font-medium text-gray-500 hover:bg-gray-100">Cancel</button>
                    </>
                  )}
                  {c.status === "RELEASED" && (
                    <>
                      <button onClick={() => handleAction(c.id, "clear")} className="rounded px-2 py-0.5 text-[10px] font-medium text-emerald-600 hover:bg-emerald-50">Clear</button>
                      <button
                        onClick={() => {
                          setPendingBounce(c);
                          setBounceReason(c.bounceReason ?? "");
                        }}
                        className="rounded px-2 py-0.5 text-[10px] font-medium text-red-500 hover:bg-red-50"
                      >
                        Bounce
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between border-t border-border bg-muted/30 px-4 py-2">
          <span className="text-[11px] text-muted-foreground">{checks.length} check{checks.length !== 1 ? "s" : ""}</span>
        </div>
      </div>

      {pendingBounce && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setPendingBounce(null)}>
          <div className="w-full max-w-md rounded-xl border border-border bg-background p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-full bg-red-100 text-red-700">
                <AlertTriangle size={18} />
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-foreground">Mark Check as Bounced?</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  {pendingBounce.dvNumber} - {pendingBounce.checkNumber || "No check #"} - {fmtPeso(pendingBounce.amount)}
                </p>
                <label className="mt-4 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Bounce reason
                </label>
                <textarea
                  value={bounceReason}
                  onChange={(event) => setBounceReason(event.target.value)}
                  rows={3}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
                  placeholder="e.g. Account closed, insufficient funds, stale check"
                />
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingBounce(null)}
                className="rounded-lg px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-muted"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleAction(pendingBounce.id, "bounce", bounceReason.trim())}
                disabled={!bounceReason.trim()}
                className="rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                Mark Bounced
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
