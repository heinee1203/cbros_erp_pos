"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { FileText, Search, X, Loader2, Plus, Printer, AlertTriangle } from "lucide-react";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { cn } from "@/lib/utils";
import { fmtPeso, fmtDate } from "@/lib/format";
import { useAuth } from "@/app/auth-context";
import { apiFetch } from "@/lib/api";
import { buildDisbursementVoucherHtml } from "@/lib/disbursement-voucher-html";

interface DVRecord {
  id: string;
  dvNumber: string;
  supplierId: string;
  supplierName: string;
  soaId: string | null;
  soaNumber: string;
  amount: number;
  paymentMethod: string;
  checkNumber: string | null;
  paymentDate: string;
  status: string;
  createdAt: string;
  voidedAt: string | null;
  voidReason: string | null;
}

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-700",
  PRINTED: "bg-blue-100 text-blue-700",
  CONFIRMED: "bg-emerald-100 text-emerald-700",
  VOIDED: "bg-red-100 text-red-700",
};

const METHOD_LABELS: Record<string, string> = {
  CHECK: "Check",
  CASH: "Cash",
  BANK_TRANSFER: "Bank Trf",
  ONLINE: "Online",
};

/* ── Void Confirmation Dialog ── */

function VoidDialog({
  open,
  dvNumber,
  onClose,
  onConfirm,
}: {
  open: boolean;
  dvNumber: string;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  const [preset, setPreset] = useState("");

  useEffect(() => {
    if (open) { setReason(""); setPreset(""); }
  }, [open]);

  const finalReason = preset === "Other" || !preset ? reason : preset;

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-2xl border border-border bg-background p-6 shadow-xl">
        <div className="mb-3 flex items-center gap-2 text-destructive">
          <AlertTriangle size={18} />
          <h2 className="text-lg font-semibold">Void Disbursement Voucher</h2>
        </div>
        <p className="mb-4 text-sm text-muted-foreground">
          This will reverse the payment and restore the SOA balance for <span className="font-semibold text-foreground">{dvNumber}</span>. This action cannot be undone.
        </p>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Reason</label>
            <select value={preset} onChange={(e) => { setPreset(e.target.value); if (e.target.value && e.target.value !== "Other") setReason(e.target.value); }}
              className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none">
              <option value="">Select a reason...</option>
              <option value="Incorrect amount">Incorrect amount</option>
              <option value="Wrong supplier">Wrong supplier</option>
              <option value="Duplicate payment">Duplicate payment</option>
              <option value="Check bounced">Check bounced</option>
              <option value="Other">Other (type below)</option>
            </select>
          </div>
          {(preset === "Other" || !preset) && (
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                {preset === "Other" ? "Specify reason" : "Or type a reason"}
              </label>
              <input type="text" value={reason} onChange={(e) => setReason(e.target.value)}
                placeholder="Why is this voucher being voided?"
                className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary" />
            </div>
          )}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted">Cancel</button>
          <button onClick={() => { if (finalReason.trim()) onConfirm(finalReason.trim()); }}
            disabled={!finalReason.trim()}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50">
            Confirm Void
          </button>
        </div>
      </div>
    </div>
  );
}

export default function DisbursementVoucherListPage() {
  const { token, locationId, loading: authLoading } = useAuth();
  const router = useRouter();

  const [records, setRecords] = useState<DVRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [committedSearch, setCommittedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [voidingDV, setVoidingDV] = useState<DVRecord | null>(null);

  const fetchData = useCallback(async () => {
    if (!token || !locationId) return;
    setLoading(true);
    const params = new URLSearchParams();
    if (committedSearch) params.set("search", committedSearch);
    if (statusFilter) params.set("status", statusFilter);
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    params.set("limit", "100");
    try {
      const res = await apiFetch<{ data: DVRecord[]; total: number }>(
        `/ap/disbursement-vouchers?${params.toString()}`,
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
  const clearSearch = () => { setSearch(""); setCommittedSearch(""); };

  const handlePrint = async (r: DVRecord) => {
    try {
      // Mark as printed if DRAFT
      if (r.status === "DRAFT") {
        await apiFetch(`/ap/disbursement-vouchers/${r.id}/print`, {
          token, locationId, method: "POST",
        });
      }
      // Fetch full DV details for print
      const dv = await apiFetch<any>(`/ap/disbursement-vouchers/${r.id}`, {
        token, locationId,
      });
      const html = buildDisbursementVoucherHtml({
        dvNumber: dv.dvNumber,
        supplierName: dv.supplierName,
        amount: dv.netAmount ?? dv.amount,
        grossAmount: dv.grossAmount,
        totalDeductions: dv.totalDeductions,
        paymentDate: dv.paymentDate,
        soaNumber: dv.soaNumber || undefined,
        soaDateFrom: dv.soaDateFrom || undefined,
        soaDateTo: dv.soaDateTo || undefined,
        remarks: dv.remarks,
        payments: (dv.payments || []).map((p: any) => ({
          paymentMethod: p.paymentMethod,
          amount: p.amount,
          referenceNumber: p.referenceNumber,
          bankName: p.bankName,
          transactionDate: p.transactionDate,
          platform: p.platform,
        })),
        deductions: (dv.deductions || []).map((d: any) => ({
          description: d.description,
          amount: d.amount,
        })),
        isVoided: dv.status === "VOIDED",
        voidReason: dv.voidReason,
      });
      const w = window.open("", "_blank");
      if (w) { w.document.write(html); w.document.close(); w.onload = () => w.print(); }
      fetchData(); // refresh status
    } catch {}
  };

  const handleConfirm = async (r: DVRecord) => {
    if (!confirm(`Confirm payment of ${fmtPeso(r.amount)} to ${r.supplierName}? This will update invoices and SOA.`)) return;
    try {
      await apiFetch(`/ap/disbursement-vouchers/${r.id}/confirm`, {
        token, locationId, method: "POST",
      });
      fetchData();
    } catch (err: any) {
      alert(err.message || "Failed to confirm");
    }
  };

  const handleVoidConfirm = async (reason: string) => {
    if (!voidingDV) return;
    try {
      await apiFetch(`/ap/disbursement-vouchers/${voidingDV.id}/void`, {
        token, locationId, method: "POST",
        body: JSON.stringify({ reason }),
      });
      setVoidingDV(null);
      fetchData();
    } catch (err: any) {
      alert(err.message || "Failed to void");
    }
  };

  const totalAmount = records.reduce(
    (s, r) => s + (r.status !== "VOIDED" ? r.amount : 0), 0,
  );

  return (
    <div className="mx-auto flex h-full max-w-6xl flex-col">
      <div className="mb-5 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/[0.06]">
            <FileText size={16} className="text-primary" />
          </div>
          <div>
            <h1 className="text-[18px] font-semibold tracking-tight">
              Disbursement Vouchers
            </h1>
            <p className="text-[13px] text-muted-foreground">
              Manage supplier payment vouchers
            </p>
          </div>
        </div>
        <button
          onClick={() => router.push("/ap/disbursement-vouchers/new")}
          className="flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-[12px] font-semibold text-primary-foreground hover:bg-primary/90"
        >
          <Plus size={14} />
          New Voucher
        </button>
      </div>

      {/* Filters */}
      <div className="mb-3 rounded-xl border border-border bg-background p-3 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[180px] max-w-sm">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") submitSearch(); }}
              placeholder="Search DV #, supplier... (Enter)"
              className="h-8 w-full rounded-lg border border-border bg-background pl-9 pr-14 text-[12px] text-foreground placeholder:text-muted-foreground/60 outline-none focus:border-primary/40 focus:ring-1 focus:ring-primary/20"
            />
            <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
              {search && <button onClick={clearSearch} className="rounded p-0.5 text-muted-foreground hover:text-foreground"><X size={12} /></button>}
              <button onClick={submitSearch} className="rounded p-0.5 text-muted-foreground hover:text-primary"><Search size={12} /></button>
            </div>
          </div>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
            className="h-8 rounded-lg border border-border bg-background px-2 text-[12px] outline-none">
            <option value="">All Status</option>
            <option value="DRAFT">Draft</option>
            <option value="PRINTED">Printed</option>
            <option value="CONFIRMED">Confirmed</option>
            <option value="VOIDED">Voided</option>
          </select>
          <DateRangePicker startDate={dateFrom} endDate={dateTo} onChange={(s, e) => { setDateFrom(s); setDateTo(e); }} />
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-border bg-background shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
        <div className="flex items-center border-b border-border bg-muted/40 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
          <div className="w-40">DV #</div>
          <div className="flex-1">Supplier</div>
          <div className="w-36">SOA Ref</div>
          <div className="w-24">Date</div>
          <div className="w-24 text-right">Amount</div>
          <div className="w-20 text-center">Method</div>
          <div className="w-20 text-center">Status</div>
          <div className="w-36 text-right">Actions</div>
        </div>

        {loading ? (
          <div className="flex h-48 items-center justify-center">
            <Loader2 size={18} className="animate-spin text-muted-foreground" />
          </div>
        ) : records.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <FileText size={24} className="text-muted-foreground/30" />
            <p className="mt-3 text-[13px] font-medium">No disbursement vouchers found</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {records.map((r) => (
              <div key={r.id} className={cn(
                "flex items-center px-4 py-2.5 text-[13px] hover:bg-accent/30",
                r.status === "VOIDED" && "opacity-50",
              )}>
                <div className="w-40 font-mono text-[12px] font-semibold text-primary">{r.dvNumber}</div>
                <div className="flex-1 min-w-0 truncate">{r.supplierName}</div>
                <div className="w-36 font-mono text-[11px] text-muted-foreground">{r.soaNumber || "—"}</div>
                <div className="w-24 text-[12px] text-muted-foreground">{fmtDate(r.paymentDate)}</div>
                <div className="w-24 text-right tabular-nums font-semibold text-[12px]">{fmtPeso(r.amount)}</div>
                <div className="w-20 text-center text-[11px] text-muted-foreground">{METHOD_LABELS[r.paymentMethod] ?? r.paymentMethod}</div>
                <div className="w-20 text-center">
                  <span className={cn("inline-flex rounded-md px-2 py-0.5 text-[9px] font-semibold uppercase", STATUS_COLORS[r.status] ?? "bg-muted text-muted-foreground")}>
                    {r.status}
                  </span>
                  {r.status === "VOIDED" && r.voidReason && (
                    <div className="mt-0.5 text-[9px] text-red-400 truncate max-w-[100px]" title={`${r.voidReason}${r.voidedAt ? ` — ${fmtDate(r.voidedAt)}` : ""}`}>
                      {r.voidReason}
                    </div>
                  )}
                </div>
                <div className="w-36 flex items-center justify-end gap-1">
                  {r.status === "PRINTED" && (
                    <button onClick={() => handleConfirm(r)}
                      className="rounded px-2 py-0.5 text-[10px] font-medium text-emerald-600 hover:bg-emerald-50">
                      Confirm
                    </button>
                  )}
                  {(r.status === "DRAFT" || r.status === "PRINTED" || r.status === "CONFIRMED") && (
                    <button onClick={() => handlePrint(r)}
                      className="rounded px-2 py-0.5 text-[10px] font-medium text-primary hover:bg-primary/10">
                      <span className="flex items-center gap-1"><Printer size={10} />{r.status === "DRAFT" ? "Print" : "Reprint"}</span>
                    </button>
                  )}
                  {r.status !== "VOIDED" && (
                    <button onClick={() => setVoidingDV(r)}
                      className="rounded px-2 py-0.5 text-[10px] font-medium text-red-500 hover:bg-red-50">
                      Void
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between border-t border-border bg-muted/30 px-4 py-2">
          <span className="text-[11px] text-muted-foreground">{total} voucher{total !== 1 ? "s" : ""}</span>
          {totalAmount > 0 && <span className="text-[11px] font-semibold tabular-nums">Total: {fmtPeso(totalAmount)}</span>}
        </div>
      </div>

      {/* Void Dialog */}
      <VoidDialog
        open={voidingDV !== null}
        dvNumber={voidingDV?.dvNumber ?? ""}
        onClose={() => setVoidingDV(null)}
        onConfirm={handleVoidConfirm}
      />
    </div>
  );
}
