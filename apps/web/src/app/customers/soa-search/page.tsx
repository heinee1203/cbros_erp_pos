"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { FileText, Search, X, Loader2 } from "lucide-react";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { cn } from "@/lib/utils";
import { fmtPeso } from "@/lib/format";
import { useAuth } from "@/app/auth-context";
import { apiFetch } from "@/lib/api";
import { buildSOAHtml, type CustomerSOAPrintMode } from "@/lib/soa-html";
import { buildPaymentReceiptHtml } from "@/lib/payment-receipt-html";
import {
  DOCUMENT_ACTION_LABELS,
  PRINT_PRESETS,
  customerSOAPresetToMode,
  type PrintPreset,
} from "@/lib/document-actions";

interface SOARecord {
  id: string;
  soaNumber: string;
  customerId: string;
  customerName: string;
  dateFrom: string;
  dateTo: string;
  generatedAt: string;
  totalCharges: number;
  totalCredits: number;
  totalPayable: number;
  transactionCount: number;
  status: string;
}

interface SOAPaymentSummary {
  id: string;
  paymentNumber: string | null;
  totalAmount: number;
  allocatedToSOA: number;
  paymentMethod: string | null;
  paymentLines: any[] | null;
  recordedAt: string;
  notes: string | null;
}

const STATUS_COLORS: Record<string, string> = {
  GENERATED: "border border-blue-200 bg-blue-100 text-blue-700",
  PARTIAL: "border border-amber-200 bg-amber-100 text-amber-700",
  PAID: "border border-emerald-200 bg-emerald-100 text-emerald-700",
  VOID: "bg-gray-200 text-gray-700",
};

const SOA_PRINT_PRESETS: PrintPreset[] = ["concise-half", "detailed"];

export default function SOASearchPage() {
  const { token, locationId, loading: authLoading } = useAuth();
  const router = useRouter();

  const [records, setRecords] = useState<SOARecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [committedSearch, setCommittedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [printMode, setPrintMode] = useState<CustomerSOAPrintMode>("concise");
  const [receiptLoadingId, setReceiptLoadingId] = useState<string | null>(null);
  const [receiptError, setReceiptError] = useState("");

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
      const res = await apiFetch<{ data: SOARecord[]; total: number }>(`/customers/soa/search?${params.toString()}`, { token, locationId });
      setRecords(res.data || []);
      setTotal(res.total || 0);
    } catch {} finally { setLoading(false); }
  }, [token, locationId, committedSearch, statusFilter, dateFrom, dateTo]);

  useEffect(() => { if (!authLoading) fetchData(); }, [authLoading, fetchData]);

  const submitSearch = () => setCommittedSearch(search.trim());
  const clearSearch = () => { setSearch(""); setCommittedSearch(""); };

  const handleReprint = async (r: SOARecord) => {
    try {
      // Historical reprint reads the stored soa_line_items snapshot — see
      // customers/routes.ts /reports/soa-by-id/:soaId. The old date-range path
      // produced Lucky Se7en's wrong ₱17,361 total because two SOAs with
      // overlapping periods both returned the customer's full ledger slice.
      const soaRes = await apiFetch<any>(`/customers/reports/soa-by-id/${r.id}`, { token, locationId });
      const html = buildSOAHtml({
        customer: soaRes.customer,
        transactions: soaRes.transactions,
        openingBalance: soaRes.openingBalance,
        closingBalance: soaRes.closingBalance,
        from: r.dateFrom,
        to: r.dateTo,
        soaNumber: r.soaNumber,
        printMode,
      });
      const w = window.open("", "_blank");
      if (w) { w.document.write(html); w.document.close(); w.onload = () => w.print(); }
    } catch {}
  };

  const handleReceiptReprint = async (r: SOARecord) => {
    if (!token || !locationId) return;
    setReceiptLoadingId(r.id);
    setReceiptError("");
    try {
      const [paymentsRes, customerRes] = await Promise.all([
        apiFetch<{ data: SOAPaymentSummary[] }>(`/customers/${r.customerId}/soa/${r.id}/payment-summary`, { token, locationId }),
        apiFetch<{ customer: { name: string; phone: string } }>(`/customers/${r.customerId}`, { token, locationId }),
      ]);
      const payments = (paymentsRes.data || [])
        .filter((payment) => payment.paymentNumber || payment.totalAmount > 0)
        .sort((a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime());
      const payment = payments[0];
      if (!payment) {
        setReceiptError(`No receipt payment found for ${r.soaNumber}.`);
        return;
      }
      const html = buildPaymentReceiptHtml({
        receiptNumber: payment.paymentNumber || "PAY-N/A",
        date: payment.recordedAt,
        customer: {
          name: customerRes.customer?.name || r.customerName,
          code: customerRes.customer?.phone || "",
        },
        amount: Math.abs(payment.totalAmount),
        method: payment.paymentMethod || "CASH",
        paymentLines: payment.paymentLines || undefined,
        soaApplications: [{
          soaNumber: r.soaNumber,
          period: `${new Date(r.dateFrom).toLocaleDateString("en-PH", { month: "short", day: "numeric" })} - ${new Date(r.dateTo).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}`,
          amount: payment.allocatedToSOA || r.totalPayable,
          soaTotal: r.totalPayable,
        }],
        previousBalance: 0,
        newBalance: 0,
      });
      const w = window.open("", "_blank");
      if (w) { w.document.write(html); w.document.close(); w.onload = () => w.print(); }
    } catch (err: any) {
      setReceiptError(err?.message || `Failed to reprint receipt for ${r.soaNumber}.`);
    } finally {
      setReceiptLoadingId(null);
    }
  };

  const totalPayable = records.reduce((s, r) => s + (r.status !== "VOID" ? r.totalPayable : 0), 0);

  return (
    <div className="mx-auto flex h-full max-w-6xl flex-col">
      <div className="mb-5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/[0.06]"><FileText size={16} className="text-primary" /></div>
          <div>
            <h1 className="text-[18px] font-semibold tracking-tight text-foreground">SOA History</h1>
            <p className="text-[13px] text-muted-foreground">Search and reprint all Statements of Account</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-3 rounded-xl border border-border bg-background p-3 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[180px] max-w-sm">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") submitSearch(); }}
              placeholder="Search SOA #, customer... (Enter)"
              className="h-8 w-full rounded-lg border border-border bg-background pl-9 pr-14 text-[12px] text-foreground placeholder:text-muted-foreground/60 outline-none focus:border-primary/40 focus:ring-1 focus:ring-primary/20" />
            <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
              {search && <button onClick={clearSearch} className="rounded p-0.5 text-muted-foreground hover:text-foreground"><X size={12} /></button>}
              <button onClick={submitSearch} className="rounded p-0.5 text-muted-foreground hover:text-primary"><Search size={12} /></button>
            </div>
          </div>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
            className="h-8 rounded-lg border border-border bg-background px-2 text-[12px] outline-none">
            <option value="">All Status</option>
            <option value="GENERATED">Generated</option>
            <option value="SENT">Sent</option>
            <option value="PAID">Paid</option>
            <option value="VOID">Void</option>
          </select>
          <DateRangePicker startDate={dateFrom} endDate={dateTo} onChange={(s, e) => { setDateFrom(s); setDateTo(e); }} />
          <div className="flex h-8 items-center rounded-lg border border-border bg-muted/40 p-0.5 text-[11px] font-semibold">
            {SOA_PRINT_PRESETS.map((preset) => {
              const mode = customerSOAPresetToMode(preset) as CustomerSOAPrintMode;
              const active = printMode === mode;
              return (
              <button
                key={preset}
                type="button"
                onClick={() => setPrintMode(mode)}
                className={cn(
                  "h-7 rounded-md px-2.5 capitalize transition-colors",
                  active
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
                title={PRINT_PRESETS[preset].description}
              >
                {PRINT_PRESETS[preset].label}
              </button>
            )})}
          </div>
          {receiptError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-[11px] font-medium text-red-700">
              {receiptError}
            </div>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-border bg-background shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
        <div className="flex items-center border-b border-border bg-muted/40 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
          <div className="w-32">SOA #</div>
          <div className="flex-1">Customer</div>
          <div className="w-40">Period</div>
          <div className="w-24 text-right">Amount</div>
          <div className="w-24 text-right">Credits</div>
          <div className="w-24 text-right">Balance</div>
          <div className="w-20 text-center">Status</div>
          <div className="w-44 text-right">Actions</div>
        </div>

        {loading ? (
          <div className="flex h-48 items-center justify-center"><Loader2 size={18} className="animate-spin text-muted-foreground" /></div>
        ) : records.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <FileText size={24} className="text-muted-foreground/30" />
            <p className="mt-3 text-[13px] font-medium">No SOA records found</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {records.map((r) => (
              <div key={r.id} className="flex items-center px-4 py-1.5 text-[13px] hover:bg-accent/30">
                <div
                  className={cn(
                    "w-32 font-mono text-[12px] font-semibold text-primary",
                    r.status === "VOID" && "line-through text-muted-foreground",
                  )}
                >
                  {r.soaNumber.replace(/^SOA-/, "")}
                </div>
                <div className="flex-1 min-w-0">
                  <button onClick={() => router.push(`/customers/${r.customerId}`)} className="text-[13px] font-medium text-foreground hover:text-primary hover:underline truncate block text-left">
                    {r.customerName}
                  </button>
                </div>
                <div className="w-40 text-[12px] text-muted-foreground">
                  {new Date(r.dateFrom).toLocaleDateString("en-PH", { month: "short", day: "numeric" })} &ndash;{" "}
                  {new Date(r.dateTo).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}
                </div>
                <div className="w-24 text-right tabular-nums text-[12px]">{fmtPeso(r.totalCharges)}</div>
                <div className="w-24 text-right tabular-nums text-[12px]">{r.totalCredits > 0 ? fmtPeso(r.totalCredits) : "\u2014"}</div>
                <div className="w-24 text-right tabular-nums font-semibold text-[12px]">{fmtPeso(r.totalPayable)}</div>
                <div className="w-20 text-center">
                  <span className={cn("inline-flex rounded-md px-2 py-0.5 text-[9px] font-semibold uppercase", STATUS_COLORS[r.status] ?? "bg-muted text-muted-foreground")}>{r.status}</span>
                </div>
                <div className="w-44 flex items-center justify-end gap-1">
                  <button onClick={() => handleReprint(r)} className="rounded px-2 py-0.5 text-[10px] font-medium text-primary hover:bg-primary/10">{DOCUMENT_ACTION_LABELS.reprint}</button>
                  {(r.status === "PAID" || r.status === "PARTIAL") && (
                    <button
                      onClick={() => void handleReceiptReprint(r)}
                      disabled={receiptLoadingId === r.id}
                      className="rounded px-2 py-0.5 text-[10px] font-medium text-emerald-700 hover:bg-emerald-50 disabled:pointer-events-none disabled:opacity-50"
                    >
                      {receiptLoadingId === r.id ? "..." : DOCUMENT_ACTION_LABELS.receipt}
                    </button>
                  )}
                  {(r.status === "GENERATED" || r.status === "SENT" || r.status === "PARTIAL") && (
                    <button onClick={() => router.push(`/customers/${r.customerId}?pay=${r.soaNumber}`)} className="rounded px-2 py-0.5 text-[10px] font-medium text-emerald-600 hover:bg-emerald-50">{DOCUMENT_ACTION_LABELS.pay}</button>
                  )}
                  <button onClick={() => router.push(`/customers/${r.customerId}`)} className="rounded px-2 py-0.5 text-[10px] font-medium text-muted-foreground hover:bg-muted">{DOCUMENT_ACTION_LABELS.view}</button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between border-t border-border bg-muted/30 px-4 py-2">
          <span className="text-[11px] text-muted-foreground">{total} SOA{total !== 1 ? "s" : ""}</span>
          {totalPayable > 0 && <span className="text-[11px] font-semibold tabular-nums text-foreground">Total Payable: {fmtPeso(totalPayable)}</span>}
        </div>
      </div>
    </div>
  );
}
