"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { FileText, Search, X, Loader2, Printer, AlertTriangle } from "lucide-react";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { cn } from "@/lib/utils";
import { fmtPeso } from "@/lib/format";
import { useAuth } from "@/app/auth-context";
import { apiFetch } from "@/lib/api";
import { buildSupplierSOAHtml } from "@/lib/supplier-soa-html";

interface SupplierSOARecord {
  id: string;
  soaNumber: string;
  supplierId: string;
  supplierName: string;
  dateFrom: string;
  dateTo: string;
  generatedAt: string;
  totalAmount: number;
  totalPaid: number;
  totalBalance: number;
  invoiceCount: number;
  status: string;
  notes: string | null;
}

const STATUS_COLORS: Record<string, string> = {
  GENERATED: "bg-blue-100 text-blue-700",
  SENT: "bg-amber-100 text-amber-700",
  VOID: "bg-red-100 text-red-700",
};

function getAgingDays(dateTo: string): number {
  const now = new Date();
  const end = new Date(dateTo);
  return Math.floor((now.getTime() - end.getTime()) / (1000 * 60 * 60 * 24));
}

function agingLabel(days: number): string {
  if (days <= 30) return "Current";
  if (days <= 60) return "30 Days";
  if (days <= 90) return "60 Days";
  return "90+ Days";
}

function agingColor(days: number): string {
  if (days <= 30) return "bg-emerald-100 text-emerald-700";
  if (days <= 60) return "bg-amber-100 text-amber-700";
  if (days <= 90) return "bg-orange-100 text-orange-700";
  return "bg-red-100 text-red-700";
}

/* ═══════════════════════════════════════════════════ */
/*  Supplier SOA History Page                          */
/* ═══════════════════════════════════════════════════ */

export default function SupplierSOAHistoryPage() {
  const { token, locationId, loading: authLoading } = useAuth();
  const router = useRouter();

  const [records, setRecords] = useState<SupplierSOARecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [committedSearch, setCommittedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [agingFilter, setAgingFilter] = useState("");
  const [voidingSOA, setVoidingSOA] = useState<SupplierSOARecord | null>(null);

  const fetchData = useCallback(async () => {
    if (!token || !locationId) return;
    setLoading(true);
    const params = new URLSearchParams();
    if (committedSearch) params.set("search", committedSearch);
    if (statusFilter) params.set("status", statusFilter);
    if (dateFrom) params.set("dateFrom", `${dateFrom}T00:00:00Z`);
    if (dateTo) params.set("dateTo", `${dateTo}T23:59:59Z`);
    params.set("limit", "100");
    try {
      const res = await apiFetch<{ data: SupplierSOARecord[]; total: number }>(
        `/ap/supplier-soa/history?${params.toString()}`,
        { token, locationId },
      );
      setRecords(res.data || []);
      setTotal(res.total || 0);
    } catch {
    } finally {
      setLoading(false);
    }
  }, [token, locationId, committedSearch, statusFilter, dateFrom, dateTo]);

  useEffect(() => {
    if (!authLoading) fetchData();
  }, [authLoading, fetchData]);

  const submitSearch = () => setCommittedSearch(search.trim());
  const clearSearch = () => {
    setSearch("");
    setCommittedSearch("");
  };

  const handleReprint = async (r: SupplierSOARecord) => {
    try {
      const snap = await apiFetch<any>(`/ap/supplier-soa/${r.id}`, {
        token,
        locationId,
      });
      const html = buildSupplierSOAHtml({
        supplierName: snap.supplier?.name || r.supplierName,
        invoices: (snap.invoices || []).map((i: any) => ({
          invoiceNumber: i.invoiceNumber,
          invoiceDate: i.invoiceDate,
          dueDate: i.dueDate,
          totalAmount: i.totalAmount,
          paidAmount: i.paidAmount,
          balance: i.balance,
        })),
        soaNumber: snap.soaNumber,
      });
      const w = window.open("", "_blank");
      if (w) {
        w.document.write(html);
        w.document.close();
        w.onload = () => w.print();
      }
    } catch {}
  };

  const handleVoidSOA = async () => {
    if (!voidingSOA) return;
    try {
      await apiFetch(`/ap/supplier-soa/${voidingSOA.id}`, {
        token, locationId, method: "PATCH",
        body: JSON.stringify({ status: "VOID" }),
      });
      setVoidingSOA(null);
      fetchData();
    } catch (err: any) {
      alert(err.message || "Failed to void SOA");
    }
  };

  // Apply client-side aging filter
  const filteredRecords = agingFilter
    ? records.filter((r) => {
        if (r.status === "VOID") return false;
        const days = getAgingDays(r.dateTo);
        if (agingFilter === "current") return days <= 30;
        if (agingFilter === "30") return days > 30 && days <= 60;
        if (agingFilter === "60") return days > 60 && days <= 90;
        if (agingFilter === "90") return days > 90;
        return true;
      })
    : records;

  // Aging breakdown for footer
  const agingBreakdown = { current: 0, d30: 0, d60: 0, d90: 0, total: 0 };
  for (const r of records) {
    if (r.status === "VOID" || r.totalBalance <= 0) continue;
    const days = getAgingDays(r.dateTo);
    agingBreakdown.total += r.totalBalance;
    if (days <= 30) agingBreakdown.current += r.totalBalance;
    else if (days <= 60) agingBreakdown.d30 += r.totalBalance;
    else if (days <= 90) agingBreakdown.d60 += r.totalBalance;
    else agingBreakdown.d90 += r.totalBalance;
  }

  return (
    <div className="mx-auto flex h-full max-w-6xl flex-col">
      <div className="mb-5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/[0.06]">
            <FileText size={16} className="text-primary" />
          </div>
          <div>
            <h1 className="text-[18px] font-semibold tracking-tight text-foreground">
              Supplier SOA History
            </h1>
            <p className="text-[13px] text-muted-foreground">
              Search and reprint all supplier Statements of Account
            </p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-3 rounded-xl border border-border bg-background p-3 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[180px] max-w-sm">
            <Search
              size={14}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitSearch();
              }}
              placeholder="Search SOA #, supplier... (Enter)"
              className="h-8 w-full rounded-lg border border-border bg-background pl-9 pr-14 text-[12px] text-foreground placeholder:text-muted-foreground/60 outline-none focus:border-primary/40 focus:ring-1 focus:ring-primary/20"
            />
            <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
              {search && (
                <button
                  onClick={clearSearch}
                  className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                >
                  <X size={12} />
                </button>
              )}
              <button
                onClick={submitSearch}
                className="rounded p-0.5 text-muted-foreground hover:text-primary"
              >
                <Search size={12} />
              </button>
            </div>
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-8 rounded-lg border border-border bg-background px-2 text-[12px] outline-none"
          >
            <option value="">All Status</option>
            <option value="GENERATED">Generated</option>
            <option value="SENT">Sent</option>
            <option value="VOID">Void</option>
          </select>
          <select value={agingFilter} onChange={(e) => setAgingFilter(e.target.value)}
            className="h-8 rounded-lg border border-border bg-background px-2 text-[12px] outline-none">
            <option value="">All Aging</option>
            <option value="current">Current (0-30d)</option>
            <option value="30">30 Days (31-60d)</option>
            <option value="60">60 Days (61-90d)</option>
            <option value="90">90+ Days</option>
          </select>
          <DateRangePicker
            startDate={dateFrom}
            endDate={dateTo}
            onChange={(s, e) => {
              setDateFrom(s);
              setDateTo(e);
            }}
          />
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-border bg-background shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
        <div className="flex items-center border-b border-border bg-muted/40 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
          <div className="w-40">SOA #</div>
          <div className="flex-1">Supplier</div>
          <div className="w-44">Period</div>
          <div className="w-24 text-right">Amount</div>
          <div className="w-24 text-right">Paid</div>
          <div className="w-24 text-right">Balance</div>
          <div className="w-12 text-center">Inv</div>
          <div className="w-20 text-center">Aging</div>
          <div className="w-20 text-center">Status</div>
          <div className="w-28 text-right">Actions</div>
        </div>

        {loading ? (
          <div className="flex h-48 items-center justify-center">
            <Loader2 size={18} className="animate-spin text-muted-foreground" />
          </div>
        ) : records.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <FileText size={24} className="text-muted-foreground/30" />
            <p className="mt-3 text-[13px] font-medium">
              No supplier SOA records found
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filteredRecords.map((r) => (
              <div
                key={r.id}
                className={cn(
                  "flex items-center px-4 py-2.5 text-[13px] hover:bg-accent/30",
                  r.status === "VOID" && "opacity-50",
                )}
              >
                <div className="w-40 font-mono text-[12px] font-semibold text-primary">
                  {r.soaNumber}
                </div>
                <div className="flex-1 min-w-0">
                  <button
                    onClick={() => router.push(`/ap/suppliers`)}
                    className="text-[13px] font-medium text-foreground hover:text-primary hover:underline truncate block text-left"
                  >
                    {r.supplierName}
                  </button>
                </div>
                <div className="w-44 text-[12px] text-muted-foreground">
                  {new Date(r.dateFrom).toLocaleDateString("en-PH", {
                    month: "short",
                    day: "numeric",
                  })}{" "}
                  &ndash;{" "}
                  {new Date(r.dateTo).toLocaleDateString("en-PH", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </div>
                <div className="w-24 text-right tabular-nums text-[12px]">
                  {fmtPeso(r.totalAmount)}
                </div>
                <div className="w-24 text-right tabular-nums text-[12px]">
                  {r.totalPaid > 0 ? fmtPeso(r.totalPaid) : "\u2014"}
                </div>
                <div className="w-24 text-right tabular-nums font-semibold text-[12px]">
                  {fmtPeso(r.totalBalance)}
                </div>
                <div className="w-12 text-center text-[12px] text-muted-foreground">
                  {r.invoiceCount}
                </div>
                <div className="w-20 text-center">
                  {r.status !== "VOID" && r.totalBalance > 0 && (() => {
                    const days = getAgingDays(r.dateTo);
                    return (
                      <span className={cn("inline-flex rounded-md px-2 py-0.5 text-[9px] font-semibold", agingColor(days))}>
                        {agingLabel(days)}
                      </span>
                    );
                  })()}
                </div>
                <div className="w-20 text-center">
                  <span
                    className={cn(
                      "inline-flex rounded-md px-2 py-0.5 text-[9px] font-semibold uppercase",
                      STATUS_COLORS[r.status] ??
                        "bg-muted text-muted-foreground",
                    )}
                  >
                    {r.status}
                  </span>
                </div>
                <div className="w-28 flex items-center justify-end gap-1">
                  {r.status !== "VOID" && r.totalBalance > 0 && (
                    <button
                      onClick={() =>
                        router.push(
                          `/ap/disbursement-vouchers/new?soaId=${r.id}&supplierId=${r.supplierId}`,
                        )
                      }
                      className="rounded px-2 py-0.5 text-[10px] font-medium text-emerald-600 hover:bg-emerald-50"
                    >
                      Pay
                    </button>
                  )}
                  <button
                    onClick={() => handleReprint(r)}
                    className="rounded px-2 py-0.5 text-[10px] font-medium text-primary hover:bg-primary/10"
                  >
                    <span className="flex items-center gap-1">
                      <Printer size={10} />
                      Reprint
                    </span>
                  </button>
                  {r.status === "GENERATED" && r.totalPaid === 0 && (
                    <button
                      onClick={() => setVoidingSOA(r)}
                      className="rounded px-2 py-0.5 text-[10px] font-medium text-red-500 hover:bg-red-50"
                    >
                      Void
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-muted/30 px-4 py-2">
          <span className="text-[11px] text-muted-foreground">
            {filteredRecords.length} SOA{filteredRecords.length !== 1 ? "s" : ""}
          </span>
          <div className="flex items-center gap-3 text-[11px] tabular-nums">
            {agingBreakdown.current > 0 && <span className="text-emerald-600">Current: {fmtPeso(agingBreakdown.current)}</span>}
            {agingBreakdown.d30 > 0 && <span className="text-amber-600">30d: {fmtPeso(agingBreakdown.d30)}</span>}
            {agingBreakdown.d60 > 0 && <span className="text-orange-600">60d: {fmtPeso(agingBreakdown.d60)}</span>}
            {agingBreakdown.d90 > 0 && <span className="text-red-600 font-semibold">90+: {fmtPeso(agingBreakdown.d90)}</span>}
            {agingBreakdown.total > 0 && <span className="font-semibold text-foreground">Total: {fmtPeso(agingBreakdown.total)}</span>}
          </div>
        </div>
      </div>

      {/* Void SOA Confirmation Dialog */}
      {voidingSOA && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-2xl border border-border bg-background p-6 shadow-xl">
            <div className="mb-3 flex items-center gap-2 text-destructive">
              <AlertTriangle size={18} />
              <h2 className="text-lg font-semibold">Void Supplier SOA</h2>
            </div>
            <div className="mb-4 space-y-2 text-sm">
              <div>
                <span className="text-muted-foreground">SOA:</span>{" "}
                <span className="font-mono font-semibold">{voidingSOA.soaNumber}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Supplier:</span>{" "}
                <span className="font-medium">{voidingSOA.supplierName}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Amount:</span>{" "}
                <span className="font-semibold tabular-nums">{fmtPeso(voidingSOA.totalAmount)}</span>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                This will void the SOA and unmark its invoices so they can be included in a future SOA. This action cannot be undone.
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setVoidingSOA(null)}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
              >
                Cancel
              </button>
              <button
                onClick={handleVoidSOA}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
              >
                Void SOA
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
