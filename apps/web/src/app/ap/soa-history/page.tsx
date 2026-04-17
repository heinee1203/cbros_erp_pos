"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  FileText,
  Search,
  X,
  Loader2,
  Printer,
  AlertTriangle,
  CheckSquare,
  Square,
  MinusSquare,
  DollarSign,
  CheckCircle,
} from "lucide-react";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { cn } from "@/lib/utils";
import { fmtPeso } from "@/lib/format";
import { useAuth } from "@/app/auth-context";
import { apiFetch } from "@/lib/api";
import { buildSupplierSOAHtml } from "@/lib/supplier-soa-html";
import { VoucherDetailModal } from "@/app/ap/disbursement-vouchers/components/voucher-detail-modal";
import { buildDisbursementVoucherHtml } from "@/lib/disbursement-voucher-html";
import type { DVRecord } from "@/app/ap/disbursement-vouchers/components/dv-types";
import {
  type UnifiedPaymentStatus,
  STATUS_LABELS,
  STATUS_BADGE_CLASS,
  dvStatusToUnified,
} from "@/lib/payment-status";

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
  activeDvId: string | null;
  activeDvNumber: string | null;
  activeDvStatus: string | null;
}

// Resolve the post-SOA payment stage. The backend's `status` column only tracks
// the doc lifecycle (GENERATED/SENT/VOID) — the actionable state for this page
// comes from combining it with the active DV status and balance. Delegates the
// raw-DV mapping to the shared dvStatusToUnified helper so the label shown here
// matches the label in the DV detail modal.
function resolveStatus(row: SupplierSOARecord): { state: UnifiedPaymentStatus; dvNumber: string | null; dvId: string | null } {
  if (row.status === "VOID") return { state: "VOIDED", dvNumber: null, dvId: null };

  const hasActiveDv = !!row.activeDvNumber && row.activeDvStatus !== "VOIDED";
  if (hasActiveDv) {
    const dvState = dvStatusToUnified(row.activeDvStatus);
    if (dvState === "PAID" || dvState === "PENDING_CONFIRMATION") {
      return { state: dvState, dvNumber: row.activeDvNumber, dvId: row.activeDvId };
    }
    // Active DV but neither CONFIRMED nor DRAFT/PRINTED — fall through to SOA-level logic
  }

  if (row.totalPaid > 0 && row.totalBalance > 0) {
    return { state: "PARTIAL_NO_DV", dvNumber: null, dvId: null };
  }
  return { state: "BILLED", dvNumber: null, dvId: null };
}

/* ═══════════════════════════════════════════════════ */
/*  Supplier SOA History Page                          */
/* ═══════════════════════════════════════════════════ */

export default function SupplierSOAHistoryPage() {
  const { token, locationId, loading: authLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  // When arriving from an invoice's BILLED badge, pre-seed the search with the
  // target SOA number so the list auto-filters to that row on mount.
  const initialSoaNumber = searchParams.get("soaNumber") ?? "";

  const [records, setRecords] = useState<SupplierSOARecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(initialSoaNumber);
  const [committedSearch, setCommittedSearch] = useState(initialSoaNumber);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"" | UnifiedPaymentStatus>("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [showVoided, setShowVoided] = useState(false);
  const [voidingSOA, setVoidingSOA] = useState<SupplierSOARecord | null>(null);
  const [viewingDvId, setViewingDvId] = useState<string | null>(null);

  // ── Multi-select state ──
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // ── Toast notification ──
  const [notification, setNotification] = useState<{ type: "success" | "error"; message: string } | null>(null);
  useEffect(() => {
    if (!notification) return;
    const timer = setTimeout(() => setNotification(null), 4000);
    return () => clearTimeout(timer);
  }, [notification]);

  const fetchData = useCallback(async () => {
    if (!token || !locationId) return;
    setLoading(true);
    const params = new URLSearchParams();
    if (committedSearch) params.set("search", committedSearch);
    if (dateFrom) params.set("dateFrom", `${dateFrom}T00:00:00Z`);
    if (dateTo) params.set("dateTo", `${dateTo}T23:59:59Z`);
    params.set("limit", "200");
    try {
      const res = await apiFetch<{ data: SupplierSOARecord[]; total: number }>(
        `/ap/supplier-soa/history?${params.toString()}`,
        { token, locationId },
      );
      setRecords(res.data || []);
      setTotal(res.total || 0);
    } catch {} finally {
      setLoading(false);
    }
  }, [token, locationId, committedSearch, dateFrom, dateTo]);

  useEffect(() => {
    if (!authLoading) fetchData();
  }, [authLoading, fetchData]);

  // Briefly highlight the matched SOA row when arriving via ?soaNumber=... so
  // the user sees which record the link landed on. Runs once after data loads.
  useEffect(() => {
    if (!initialSoaNumber || loading || records.length === 0) return;
    const match = records.find(
      (r) => r.soaNumber === initialSoaNumber || r.soaNumber.endsWith(initialSoaNumber),
    );
    if (!match) return;
    setHighlightedId(match.id);
    const t = setTimeout(() => setHighlightedId(null), 2500);
    return () => clearTimeout(t);
  }, [initialSoaNumber, loading, records]);

  // Clear selection when filters change
  useEffect(() => { setSelectedIds(new Set()); }, [committedSearch, statusFilter, dateFrom, dateTo]);

  const submitSearch = () => setCommittedSearch(search.trim());
  const clearSearch = () => { setSearch(""); setCommittedSearch(""); };

  const handleReprint = async (r: SupplierSOARecord) => {
    try {
      const snap = await apiFetch<any>(`/ap/supplier-soa/${r.id}`, { token, locationId });
      const html = buildSupplierSOAHtml({
        supplierName: snap.supplier?.name || r.supplierName,
        invoices: (snap.invoices || []).map((i: any) => ({
          invoiceNumber: i.invoiceNumber, invoiceDate: i.invoiceDate, dueDate: i.dueDate,
          totalAmount: i.totalAmount, paidAmount: i.paidAmount, balance: i.balance,
        })),
        soaNumber: snap.soaNumber,
      });
      const w = window.open("", "_blank");
      if (w) { w.document.write(html); w.document.close(); w.onload = () => w.print(); }
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
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to void SOA");
    }
  };

  // Inline DV confirm — reuses the same endpoint the DV modal's Confirm button
  // calls on the DV list page, so confirming from the row and confirming from
  // inside the modal produce identical results.
  const handleConfirmDv = async (dvId: string | null) => {
    if (!dvId || !token || !locationId) return;
    if (!confirm("Confirm this DV? This releases cash and marks all linked invoices as PAID.")) return;
    try {
      await apiFetch(`/ap/disbursement-vouchers/${dvId}/confirm`, { token, locationId, method: "POST" });
      setNotification({ type: "success", message: "DV confirmed — payment cascade applied" });
      fetchData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to confirm DV";
      setNotification({ type: "error", message: msg });
    }
  };

  const handleVoidDv = async (dvId: string | null) => {
    if (!dvId || !token || !locationId) return;
    // Backend requires a non-empty reason (accounts-payable/routes.ts:857).
    const reason = prompt("Void this DV? Enter a reason — this reverses the payment and restores the SOA to billed state.");
    if (!reason || !reason.trim()) return;
    try {
      await apiFetch(`/ap/disbursement-vouchers/${dvId}/void`, {
        token, locationId, method: "POST",
        body: JSON.stringify({ reason: reason.trim() }),
      });
      setNotification({ type: "success", message: "DV voided — SOA restored" });
      fetchData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to void DV";
      setNotification({ type: "error", message: msg });
    }
  };

  // ── Filtering ──
  // Voided rows are hidden by default unless the "Show voided" toggle is on.
  // The status filter applies the unified state (BILLED/PENDING/PAID/PARTIAL_NO_DV)
  // client-side via resolveStatus — the backend returns all statuses.
  const filteredRecords = useMemo(() => {
    let rows = records;
    if (!showVoided) rows = rows.filter((r) => r.status !== "VOID");
    if (statusFilter) {
      rows = rows.filter((r) => resolveStatus(r).state === statusFilter);
    }
    return rows;
  }, [records, showVoided, statusFilter]);

  // ── Selection logic ──
  // Hide Pay when: voided, already paid, has an active DV, OR any amount has
  // already been paid without a DV (legacy/inconsistent data — prevents
  // accidental double-payment). Such rows surface a "Partial (no DV)" warning
  // in the Actions cell instead.
  const isPayable = (r: SupplierSOARecord) =>
    r.status !== "VOID"
    && r.totalBalance > 0
    && !r.activeDvNumber
    && r.totalPaid === 0;

  const lockedSupplierId = useMemo(() => {
    if (selectedIds.size === 0) return null;
    const firstId = selectedIds.values().next().value;
    return records.find((r) => r.id === firstId)?.supplierId ?? null;
  }, [selectedIds, records]);

  const lockedSupplierName = useMemo(() => {
    if (!lockedSupplierId) return "";
    return records.find((r) => r.supplierId === lockedSupplierId)?.supplierName ?? "";
  }, [lockedSupplierId, records]);

  const payableForSupplier = useMemo(() => {
    if (!lockedSupplierId) return [];
    return filteredRecords.filter((r) => isPayable(r) && r.supplierId === lockedSupplierId);
  }, [filteredRecords, lockedSupplierId]);

  const selectedTotal = useMemo(() => {
    return filteredRecords.filter((r) => selectedIds.has(r.id)).reduce((s, r) => s + r.totalBalance, 0);
  }, [filteredRecords, selectedIds]);

  const toggleSelect = (r: SupplierSOARecord) => {
    if (!isPayable(r)) return;
    if (lockedSupplierId && r.supplierId !== lockedSupplierId) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(r.id)) next.delete(r.id); else next.add(r.id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (payableForSupplier.length === 0) return;
    if (selectedIds.size === payableForSupplier.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(payableForSupplier.map((r) => r.id)));
    }
  };

  // ── Status breakdown ──
  // Groups Amount by the unified payment stage across the filtered rows so the
  // footer shows how much is at each stage (paid / pending / billed).
  const statusBreakdown = useMemo(() => {
    const b = { paid: 0, pending: 0, billed: 0, partial: 0, total: 0 };
    for (const r of filteredRecords) {
      if (r.status === "VOID") continue;
      const { state } = resolveStatus(r);
      b.total += r.totalAmount;
      if (state === "PAID") b.paid += r.totalAmount;
      else if (state === "PENDING_CONFIRMATION") b.pending += r.totalAmount;
      else if (state === "BILLED") b.billed += r.totalAmount;
      else if (state === "PARTIAL_NO_DV") b.partial += r.totalAmount;
    }
    return b;
  }, [filteredRecords]);

  return (
    <div className="mx-auto flex h-full max-w-[1400px] flex-col">
      <div className="mb-5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/[0.06]">
            <FileText size={16} className="text-primary" />
          </div>
          <div>
            <h1 className="text-[18px] font-semibold tracking-tight text-foreground">Supplier SOA History</h1>
            <p className="text-[13px] text-muted-foreground">Search, reprint, and pay supplier Statements of Account</p>
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
              placeholder="Search SOA #, supplier... (Enter)"
              className="h-8 w-full rounded-lg border border-border bg-background pl-9 pr-14 text-[12px] text-foreground placeholder:text-muted-foreground/60 outline-none focus:border-primary/40 focus:ring-1 focus:ring-primary/20" />
            <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
              {search && <button onClick={clearSearch} className="rounded p-0.5 text-muted-foreground hover:text-foreground"><X size={12} /></button>}
              <button onClick={submitSearch} className="rounded p-0.5 text-muted-foreground hover:text-primary"><Search size={12} /></button>
            </div>
          </div>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as "" | UnifiedPaymentStatus)}
            className="h-8 rounded-lg border border-border bg-background px-2 text-[12px] outline-none">
            <option value="">All Status</option>
            <option value="BILLED">Billed (needs payment)</option>
            <option value="PENDING_CONFIRMATION">Pending Confirmation</option>
            <option value="PAID">Paid</option>
            <option value="PARTIAL_NO_DV">Partial (no DV)</option>
          </select>
          <DateRangePicker startDate={dateFrom} endDate={dateTo} onChange={(s, e) => { setDateFrom(s); setDateTo(e); }} />
          <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer">
            <input type="checkbox" checked={showVoided} onChange={(e) => setShowVoided(e.target.checked)} className="rounded border-border" />
            Show voided
          </label>
        </div>
      </div>

      {/* Selection summary bar */}
      {selectedIds.size > 0 && (
        <div className="mb-3 flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50/50 px-4 py-2.5 dark:border-emerald-800 dark:bg-emerald-950/20">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium">
              <CheckSquare size={14} className="inline mr-1 text-emerald-600" />
              {selectedIds.size} SOA{selectedIds.size !== 1 ? "s" : ""} selected
            </span>
            <span className="text-sm text-muted-foreground">{lockedSupplierName}</span>
            <span className="text-sm font-semibold tabular-nums">{fmtPeso(selectedTotal)}</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setSelectedIds(new Set())}
              className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted">
              Clear
            </button>
            <button onClick={() => router.push(`/ap/disbursement-vouchers/new?soaIds=${Array.from(selectedIds).join(",")}&supplierId=${lockedSupplierId}`)}
              className="rounded-lg bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700">
              <DollarSign size={12} className="inline mr-1" /> Pay Selected
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-border bg-background shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[850px] text-[13px]">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                <th className="w-10 px-2 py-2 text-center">
                  {lockedSupplierId && payableForSupplier.length > 0 && (
                    <button onClick={toggleSelectAll} className="flex items-center justify-center mx-auto">
                      {selectedIds.size === 0 ? <Square size={14} className="text-muted-foreground/40" />
                        : selectedIds.size === payableForSupplier.length ? <CheckSquare size={14} className="text-emerald-600" />
                        : <MinusSquare size={14} className="text-emerald-600" />}
                    </button>
                  )}
                </th>
                <th className="px-3 py-2 text-left">SOA #</th>
                <th className="px-3 py-2 text-left">Supplier</th>
                <th className="px-3 py-2 text-right">Amount</th>
                <th className="w-10 px-2 py-2 text-center">Inv</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
        {loading ? (
          <tr><td colSpan={7}>
            <div className="flex h-48 items-center justify-center">
              <Loader2 size={18} className="animate-spin text-muted-foreground" />
            </div>
          </td></tr>
        ) : records.length === 0 ? (
          <tr><td colSpan={7}>
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <FileText size={24} className="text-muted-foreground/30" />
              <p className="mt-3 text-[13px] font-medium">No supplier SOA records found</p>
            </div>
          </td></tr>
        ) : (
          filteredRecords.map((r) => {
              const payable = isPayable(r);
              const isLockedOut = payable && lockedSupplierId !== null && r.supplierId !== lockedSupplierId;
              const isSelected = selectedIds.has(r.id);
              const { state, dvNumber, dvId } = resolveStatus(r);
              return (
                <tr
                  key={r.id}
                  className={cn(
                    "border-b border-border hover:bg-accent/30 transition-colors",
                    r.status === "VOID" && "opacity-50",
                    isLockedOut && "opacity-40",
                    isSelected && "bg-emerald-50/50 dark:bg-emerald-950/10",
                    highlightedId === r.id && "bg-amber-100/70 dark:bg-amber-900/20",
                  )}
                >
                  <td className="w-10 px-2 py-1.5 text-center">
                    {payable && (
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleSelect(r); }}
                        disabled={isLockedOut}
                        className="flex items-center justify-center mx-auto disabled:cursor-not-allowed"
                      >
                        {isSelected ? <CheckSquare size={14} className="text-emerald-600" />
                          : <Square size={14} className={isLockedOut ? "text-muted-foreground/20" : "text-muted-foreground/40"} />}
                      </button>
                    )}
                  </td>
                  <td className="px-3 py-1.5 font-mono text-[12px] font-semibold text-primary whitespace-nowrap">
                    {r.soaNumber.replace(/^SUPP-SOA-/, "")}
                  </td>
                  <td className="px-3 py-1.5">
                    <button
                      onClick={() => router.push(`/ap/suppliers?open=${r.supplierId}`)}
                      className="text-[13px] font-medium text-foreground hover:text-primary hover:underline truncate block text-left max-w-[240px]"
                    >
                      {r.supplierName}
                    </button>
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums font-semibold text-[12px] whitespace-nowrap">{fmtPeso(r.totalAmount)}</td>
                  <td className="w-10 px-2 py-1.5 text-center text-[12px] text-muted-foreground">{r.invoiceCount}</td>
                  <td className="px-3 py-1.5 text-left whitespace-nowrap">
                    <div className="inline-flex items-center gap-1.5">
                      <span
                        className={cn(
                          "inline-flex rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase",
                          STATUS_BADGE_CLASS[state],
                        )}
                        title={state === "PARTIAL_NO_DV"
                          ? `Partially paid (${fmtPeso(r.totalPaid)}) with no DV record — investigate before paying further`
                          : undefined}
                      >
                        {STATUS_LABELS[state]}
                      </span>
                      {dvNumber && (state === "PAID" || state === "PENDING_CONFIRMATION") && (
                        <button
                          onClick={() => setViewingDvId(dvId)}
                          className="font-mono text-[10px] text-muted-foreground hover:text-foreground hover:underline"
                          title={dvNumber}
                        >
                          {dvNumber.replace(/^DV-\d{4}-/, "DV-")}
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-1.5 text-right whitespace-nowrap">
                    <div className="inline-flex items-center gap-1">
                      {state === "BILLED" && (
                        <button
                          onClick={() => router.push(`/ap/disbursement-vouchers/new?soaId=${r.id}&supplierId=${r.supplierId}`)}
                          className="rounded px-2 py-0.5 text-[10px] font-medium text-emerald-600 hover:bg-emerald-50"
                        >
                          Pay
                        </button>
                      )}
                      {state === "PENDING_CONFIRMATION" && (
                        <button
                          onClick={() => handleConfirmDv(dvId)}
                          className="rounded px-2 py-0.5 text-[10px] font-medium text-emerald-600 hover:bg-emerald-50"
                          title="Confirm this DV — cash released, invoices marked PAID"
                        >
                          Confirm
                        </button>
                      )}
                      <button onClick={() => handleReprint(r)}
                        className="rounded px-2 py-0.5 text-[10px] font-medium text-primary hover:bg-primary/10">
                        Reprint
                      </button>
                      {(state === "BILLED" || state === "PARTIAL_NO_DV") && (
                        <button onClick={() => setVoidingSOA(r)}
                          className="rounded px-2 py-0.5 text-[10px] font-medium text-red-500 hover:bg-red-50">
                          Void
                        </button>
                      )}
                      {state === "PENDING_CONFIRMATION" && (
                        <button onClick={() => handleVoidDv(dvId)}
                          className="rounded px-2 py-0.5 text-[10px] font-medium text-red-500 hover:bg-red-50">
                          Void DV
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })
        )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-muted/30 px-4 py-2">
          <span className="text-[11px] text-muted-foreground">
            {filteredRecords.length} SOA{filteredRecords.length !== 1 ? "s" : ""}
          </span>
          <div className="flex items-center gap-3 text-[11px] tabular-nums">
            {statusBreakdown.paid > 0 && <span className="text-emerald-600">Paid: {fmtPeso(statusBreakdown.paid)}</span>}
            {statusBreakdown.pending > 0 && <span className="text-amber-600">Pending: {fmtPeso(statusBreakdown.pending)}</span>}
            {statusBreakdown.billed > 0 && <span className="text-blue-600">Billed: {fmtPeso(statusBreakdown.billed)}</span>}
            {statusBreakdown.partial > 0 && <span className="text-amber-700 font-semibold">Partial: {fmtPeso(statusBreakdown.partial)}</span>}
            {statusBreakdown.total > 0 && <span className="font-semibold text-foreground">Total: {fmtPeso(statusBreakdown.total)}</span>}
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
              <div><span className="text-muted-foreground">SOA:</span> <span className="font-mono font-semibold">{voidingSOA.soaNumber}</span></div>
              <div><span className="text-muted-foreground">Supplier:</span> <span className="font-medium">{voidingSOA.supplierName}</span></div>
              <div><span className="text-muted-foreground">Amount:</span> <span className="font-semibold tabular-nums">{fmtPeso(voidingSOA.totalAmount)}</span></div>
              <p className="mt-2 text-xs text-muted-foreground">
                This will void the SOA and unmark its invoices so they can be included in a future SOA. This action cannot be undone.
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setVoidingSOA(null)} className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted">Cancel</button>
              <button onClick={handleVoidSOA} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700">Void SOA</button>
            </div>
          </div>
        </div>
      )}

      {/* DV Detail Modal */}
      <VoucherDetailModal
        open={viewingDvId !== null}
        dvId={viewingDvId}
        token={token ?? ""}
        locationId={locationId ?? ""}
        onClose={() => setViewingDvId(null)}
        onReprint={() => {}}
        onVoid={(dv) => { setViewingDvId(null); handleVoidDv(dv.id); }}
        onConfirm={(dv) => { setViewingDvId(null); handleConfirmDv(dv.id); }}
      />

      {/* Toast notification */}
      {notification && (
        <div className={cn(
          "fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-lg border px-4 py-3 shadow-lg animate-in slide-in-from-bottom-2",
          notification.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800",
        )}>
          {notification.type === "success" ? <CheckCircle size={14} /> : <AlertTriangle size={14} />}
          <span className="text-[13px] font-medium">{notification.message}</span>
        </div>
      )}
    </div>
  );
}
