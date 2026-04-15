"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { CreditCard, Search, X, Download } from "lucide-react";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { cn } from "@/lib/utils";
import { fmtPeso, fmtDate, fmtDateTime } from "@/lib/format";
import { useAuth } from "@/app/auth-context";
import { apiFetch } from "@/lib/api";
import { downloadCSV } from "@/lib/csv-export";

/* ─── Types ─── */

interface PaymentRecord {
  id: string;
  paymentNumber: string | null;
  recordedAt: string;
  amount: string;
  paymentMethod: string | null;
  referenceNumber: string | null;
  notes: string | null;
  batchNumber: string | null;
  traceNumber: string | null;
  cardType: string | null;
  paymentLines: any[] | null;
  customerId: string;
  customerName: string;
  customerCode: string;
  recordedByName: string | null;
}

interface PaymentSummary {
  total: number;
  today: number;
  thisWeek: number;
  thisMonth: number;
  count: number;
}

interface PaymentResponse {
  data: PaymentRecord[];
  summary: PaymentSummary;
}

const METHODS = [
  { value: "", label: "All Methods" },
  { value: "CASH", label: "Cash" },
  { value: "CHECK", label: "Check" },
  { value: "BANK_TRANSFER", label: "Bank Transfer" },
  { value: "CREDIT_CARD", label: "Credit Card" },
  { value: "GCASH", label: "GCash" },
  { value: "MAYA", label: "Maya" },
  { value: "QRPH", label: "QRPH" },
  { value: "SPLIT", label: "Split Payment" },
];

const METHOD_LABELS: Record<string, string> = {
  CASH: "Cash", CHECK: "Check", BANK_TRANSFER: "Bank Tx", CREDIT_CARD: "Card",
  GCASH: "GCash", MAYA: "Maya", QRPH: "QRPH", SPLIT: "Split", EWT: "EWT", OTHER: "Other",
};

const PAGE_SIZES = [25, 50, 100] as const;

function buildPageNumbers(current: number, total: number): (number | "...")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | "...")[] = [1];
  if (current > 3) pages.push("...");
  for (let i = Math.max(2, current - 1); i <= Math.min(total - 1, current + 1); i++) pages.push(i);
  if (current < total - 2) pages.push("...");
  pages.push(total);
  return pages;
}

/* ═══════════════════════════════════════ */

export default function PaymentRegisterPage() {
  const { token, locationId, loading: authLoading } = useAuth();

  const [records, setRecords] = useState<PaymentRecord[]>([]);
  const [summary, setSummary] = useState<PaymentSummary>({ total: 0, today: 0, thisWeek: 0, thisMonth: 0, count: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [committedSearch, setCommittedSearch] = useState("");
  const [methodFilter, setMethodFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const fetchData = useCallback(async () => {
    if (!token || !locationId) return;
    setLoading(true);
    const params = new URLSearchParams();
    params.set("limit", "5000");
    if (committedSearch) params.set("search", committedSearch);
    if (methodFilter) params.set("paymentMethod", methodFilter);
    if (dateFrom) params.set("dateFrom", `${dateFrom}T00:00:00Z`);
    if (dateTo) params.set("dateTo", `${dateTo}T23:59:59Z`);
    try {
      const res = await apiFetch<PaymentResponse>(`/customers/payments?${params.toString()}`, { token, locationId });
      setRecords(res.data || []);
      setSummary(res.summary || { total: 0, today: 0, thisWeek: 0, thisMonth: 0, count: 0 });
    } catch {} finally { setLoading(false); }
  }, [token, locationId, committedSearch, methodFilter, dateFrom, dateTo]);

  useEffect(() => { if (!authLoading) fetchData(); }, [authLoading, fetchData]);
  useEffect(() => { setPage(1); }, [committedSearch, methodFilter, dateFrom, dateTo]);

  const submitSearch = () => setCommittedSearch(search.trim());
  const clearSearch = () => { setSearch(""); setCommittedSearch(""); };

  // Pagination
  const totalPages = Math.max(1, Math.ceil(records.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const startIdx = (safePage - 1) * pageSize;
  const endIdx = Math.min(startIdx + pageSize, records.length);
  const pageData = records.slice(startIdx, endIdx);
  const pageNumbers = buildPageNumbers(safePage, totalPages);

  const handleExportCSV = () => {
    downloadCSV("payment-register",
      ["Payment #", "Date", "Customer", "Code", "Amount", "Method", "Reference", "Notes", "Recorded By"],
      records.map((r) => [
        r.paymentNumber || "", fmtDate(r.recordedAt), r.customerName, r.customerCode,
        r.amount, METHOD_LABELS[r.paymentMethod ?? ""] ?? r.paymentMethod ?? "",
        r.referenceNumber || "", r.notes || "", r.recordedByName || "",
      ]),
    );
  };

  // Extract SOA reference from notes if present
  const extractSoa = (notes: string | null): string | null => {
    if (!notes) return null;
    const match = notes.match(/\[SOA:\s*([^\]]+)\]/);
    return match ? match[1] : null;
  };

  return (
    <div className="mx-auto flex h-full max-w-6xl flex-col">
      {/* Header */}
      <div className="mb-5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/[0.06]">
            <CreditCard size={16} className="text-primary" />
          </div>
          <div>
            <h1 className="text-[18px] font-semibold tracking-tight text-foreground">Payment Register</h1>
            <p className="text-[13px] text-muted-foreground">All customer payments received</p>
          </div>
        </div>

        {/* Summary cards */}
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <SummaryCard label="Total Collected" value={fmtPeso(summary.total)} sub={`${summary.count} payments`} />
          <SummaryCard label="Today" value={fmtPeso(summary.today)} className="text-emerald-600" />
          <SummaryCard label="This Week" value={fmtPeso(summary.thisWeek)} />
          <SummaryCard label="This Month" value={fmtPeso(summary.thisMonth)} />
        </div>
      </div>

      {/* Filters */}
      <div className="mb-3 rounded-xl border border-border bg-background p-3 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[180px] max-w-sm">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submitSearch(); } }}
              placeholder="Search payment #, customer..."
              className="h-8 w-full rounded-lg border border-border bg-background pl-9 pr-8 text-[12px] text-foreground placeholder:text-muted-foreground/60 outline-none focus:border-primary/40 focus:ring-1 focus:ring-primary/20" />
            {search && <button onClick={clearSearch} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X size={12} /></button>}
          </div>

          <select value={methodFilter} onChange={(e) => setMethodFilter(e.target.value)}
            className="h-8 rounded-lg border border-border bg-background px-2 text-[12px] text-foreground outline-none focus:border-primary/40">
            {METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>

          <DateRangePicker startDate={dateFrom} endDate={dateTo} onChange={(s, e) => { setDateFrom(s); setDateTo(e); }} />

          {records.length > 0 && (
            <button onClick={handleExportCSV}
              className="ml-auto flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
              <Download size={12} /> Export CSV
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-border bg-background shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="px-3 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Payment #</th>
                <th className="px-3 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Date</th>
                <th className="px-3 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Customer</th>
                <th className="px-3 py-1.5 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Amount</th>
                <th className="px-3 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Method</th>
                <th className="px-3 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Reference</th>
                <th className="px-3 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">SOA</th>
                <th className="px-3 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Recorded By</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="border-b border-border">
                    <td colSpan={8} className="px-3 py-3"><div className="h-5 animate-pulse rounded bg-muted" /></td>
                  </tr>
                ))
              ) : pageData.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-12 text-center text-sm text-muted-foreground">No payments found.</td>
                </tr>
              ) : (
                pageData.map((r, i) => {
                  const soaRef = extractSoa(r.notes);
                  return (
                    <tr key={r.id} className={`border-b border-border transition-colors hover:bg-accent/50 ${i % 2 === 0 ? "bg-background" : "bg-muted/20"}`}>
                      <td className="px-3 py-1.5 font-mono text-[13px] font-semibold text-primary">{r.paymentNumber || "\u2014"}</td>
                      <td className="px-3 py-1.5 text-xs text-muted-foreground">{fmtDate(r.recordedAt)}</td>
                      <td className="px-3 py-1.5">
                        <span className="text-[13px] font-medium text-foreground">{r.customerName}</span>
                        <span className="ml-1.5 text-[10px] text-muted-foreground">{r.customerCode}</span>
                      </td>
                      <td className="px-3 py-1.5 text-right text-[13px] font-semibold tabular-nums">{fmtPeso(r.amount)}</td>
                      <td className="px-3 py-1.5 text-xs">
                        <span className="inline-flex rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                          {METHOD_LABELS[r.paymentMethod ?? ""] ?? r.paymentMethod ?? "\u2014"}
                        </span>
                      </td>
                      <td className="px-3 py-1.5 text-xs text-muted-foreground font-mono">{r.referenceNumber || "\u2014"}</td>
                      <td className="px-3 py-1.5 text-xs text-muted-foreground font-mono">{soaRef || "\u2014"}</td>
                      <td className="px-3 py-1.5 text-xs text-muted-foreground">{r.recordedByName || "\u2014"}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination footer */}
        <div className="flex items-center justify-between border-t border-border bg-muted/30 px-3 py-2">
          <span className="text-[11px] text-muted-foreground">
            {records.length > 0 ? `Showing ${startIdx + 1}\u2013${endIdx} of ${records.length} payments` : "No payments"}
          </span>
          {totalPages > 1 && (
            <div className="flex items-center gap-1">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={safePage <= 1}
                className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:pointer-events-none">
                <span className="text-xs">&laquo;</span>
              </button>
              {pageNumbers.map((pn, idx) =>
                pn === "..." ? (
                  <span key={`e${idx}`} className="px-1 text-[11px] text-muted-foreground">&hellip;</span>
                ) : (
                  <button key={pn} onClick={() => setPage(pn)}
                    className={cn("min-w-[28px] rounded px-1.5 py-0.5 text-[11px] font-medium",
                      pn === safePage ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>
                    {pn}
                  </button>
                ),
              )}
              <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={safePage >= totalPages}
                className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:pointer-events-none">
                <span className="text-xs">&raquo;</span>
              </button>
            </div>
          )}
          <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
            className="rounded border border-border bg-background px-2 py-0.5 text-[11px] text-muted-foreground outline-none">
            {PAGE_SIZES.map((s) => <option key={s} value={s}>{s} / page</option>)}
          </select>
        </div>
      </div>
    </div>
  );
}

/* ─── Summary Card ─── */
function SummaryCard({ label, value, sub, className }: { label: string; value: string; sub?: string; className?: string }) {
  return (
    <div className="rounded-xl border border-border bg-background p-3.5 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
      <div className="text-[11px] font-medium text-muted-foreground mb-1">{label}</div>
      <div className={cn("text-[18px] font-bold tabular-nums text-foreground", className)}>{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}
