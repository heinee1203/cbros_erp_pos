"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  FileText,
  AlertTriangle,
  Clock,
  DollarSign,
  Search,
  Plus,
  X,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useAuth } from "@/app/auth-context";
import { apiFetch } from "@/lib/api";
import { fmtPeso, fmtDate } from "@/lib/format";
import { DateRangePicker } from "@/components/ui/date-range-picker";

/* ─── Types ─── */

interface Supplier {
  id: string;
  name: string;
}

interface Invoice {
  id: string;
  invoiceNo: string;
  invoiceDate: string;
  supplierId: string;
  supplierName: string;
  dueDate: string;
  amount: string;
  paidAmount: string;
  balance: string;
  status: string;
  paymentTerms: string | null;
  poReference: string | null;
  notes: string | null;
  createdAt: string;
}

interface InvoiceListResponse {
  data: Invoice[];
  cursor: string | null;
  summary?: {
    totalOpen: number;
    overdueAmount: number;
    dueThisWeek: number;
    invoiceCount: number;
  };
}

/* ─── Status styling ─── */

const STATUS_COLORS: Record<string, string> = {
  OPEN: "bg-blue-100 text-blue-700",
  PARTIALLY_PAID: "bg-amber-100 text-amber-700",
  PAID: "bg-emerald-100 text-emerald-700",
  VOID: "bg-gray-100 text-gray-500",
  OVERDUE: "bg-red-100 text-red-700",
};

const STATUS_LABELS: Record<string, string> = {
  OPEN: "Open",
  PARTIALLY_PAID: "Partially Paid",
  PAID: "Paid",
  VOID: "Void",
  OVERDUE: "Overdue",
};

/* ─── Due date color coding ─── */

function dueDateClass(dueDate: string, status: string): string {
  if (status === "PAID" || status === "VOID") return "text-muted-foreground";
  const now = new Date();
  const due = new Date(dueDate);
  const diffDays = Math.ceil(
    (due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
  );
  if (diffDays < 0) return "text-red-600 font-semibold";
  if (diffDays <= 7) return "text-amber-600 font-medium";
  return "text-emerald-600";
}

/* ═══════════════════════════════════════════════════ */
/*  Record Invoice Modal                               */
/* ═══════════════════════════════════════════════════ */

function RecordInvoiceModal({
  open,
  onClose,
  onCreated,
  token,
  locationId,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  token: string;
  locationId: string;
}) {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [form, setForm] = useState({
    supplierId: "",
    invoiceNo: "",
    invoiceDate: new Date().toISOString().slice(0, 10),
    amount: "",
    paymentTerms: "NET_30",
    poReference: "",
    notes: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && token && locationId) {
      apiFetch<{ data: Supplier[] }>("/procurement/suppliers", {
        token,
        locationId,
      })
        .then((res) => setSuppliers(res.data))
        .catch(() => {});
    }
  }, [open, token, locationId]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.supplierId || !form.invoiceNo || !form.amount) return;
    setSaving(true);
    setError(null);
    try {
      await apiFetch("/ap/invoices", {
        token,
        locationId,
        method: "POST",
        body: JSON.stringify({
          supplierId: form.supplierId,
          invoiceNo: form.invoiceNo,
          invoiceDate: form.invoiceDate,
          amount: form.amount,
          paymentTerms: form.paymentTerms,
          poReference: form.poReference || undefined,
          notes: form.notes || undefined,
        }),
      });
      onCreated();
      onClose();
      setForm({
        supplierId: "",
        invoiceNo: "",
        invoiceDate: new Date().toISOString().slice(0, 10),
        amount: "",
        paymentTerms: "NET_30",
        poReference: "",
        notes: "",
      });
    } catch (err: any) {
      setError(err.message || "Failed to record invoice");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg rounded-xl border border-border bg-background p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">Record Supplier Invoice</h3>
          <button
            onClick={onClose}
            className="rounded-lg p-1 hover:bg-muted"
          >
            <X size={18} />
          </button>
        </div>

        {error && (
          <div className="mb-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          {/* Supplier */}
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Supplier *
            </label>
            <select
              value={form.supplierId}
              onChange={(e) =>
                setForm((f) => ({ ...f, supplierId: e.target.value }))
              }
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
              required
            >
              <option value="">Select supplier...</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          {/* Invoice # and Date */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Invoice # *
              </label>
              <input
                type="text"
                value={form.invoiceNo}
                onChange={(e) =>
                  setForm((f) => ({ ...f, invoiceNo: e.target.value }))
                }
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Invoice Date *
              </label>
              <input
                type="date"
                value={form.invoiceDate}
                onChange={(e) =>
                  setForm((f) => ({ ...f, invoiceDate: e.target.value }))
                }
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                required
              />
            </div>
          </div>

          {/* Amount and Payment Terms */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Amount *
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.amount}
                onChange={(e) =>
                  setForm((f) => ({ ...f, amount: e.target.value }))
                }
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Payment Terms
              </label>
              <select
                value={form.paymentTerms}
                onChange={(e) =>
                  setForm((f) => ({ ...f, paymentTerms: e.target.value }))
                }
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
              >
                <option value="COD">COD</option>
                <option value="NET_7">Net 7</option>
                <option value="NET_15">Net 15</option>
                <option value="NET_30">Net 30</option>
                <option value="NET_45">Net 45</option>
                <option value="NET_60">Net 60</option>
              </select>
            </div>
          </div>

          {/* PO Reference */}
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              PO Reference
            </label>
            <input
              type="text"
              value={form.poReference}
              onChange={(e) =>
                setForm((f) => ({ ...f, poReference: e.target.value }))
              }
              placeholder="e.g. PO-2024-0001"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Notes
            </label>
            <textarea
              value={form.notes}
              onChange={(e) =>
                setForm((f) => ({ ...f, notes: e.target.value }))
              }
              rows={2}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {saving ? "Saving..." : "Record Invoice"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════ */
/*  Supplier Invoices List Page                        */
/* ═══════════════════════════════════════════════════ */

export default function SupplierInvoicesPage() {
  const { token, locationId, loading: authLoading } = useAuth();
  const router = useRouter();

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [prevCursors, setPrevCursors] = useState<string[]>([]);

  // Filters
  const [supplierFilter, setSupplierFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Modal
  const [showModal, setShowModal] = useState(false);

  // Suppliers for filter
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);

  // Summary
  const [summary, setSummary] = useState({
    totalOpen: 0,
    overdueAmount: 0,
    dueThisWeek: 0,
    invoiceCount: 0,
  });

  const fetchSuppliers = useCallback(async () => {
    if (!token || !locationId) return;
    try {
      const res = await apiFetch<{ data: Supplier[] }>(
        "/procurement/suppliers",
        { token, locationId }
      );
      setSuppliers(res.data);
    } catch {}
  }, [token, locationId]);

  const fetchInvoices = useCallback(
    async (newCursor?: string) => {
      if (!token || !locationId) return;
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (newCursor) params.set("cursor", newCursor);
        params.set("limit", "50");
        if (supplierFilter) params.set("supplierId", supplierFilter);
        if (statusFilter) params.set("status", statusFilter);
        if (overdueOnly) params.set("overdue", "true");
        if (dateFrom) params.set("dateFrom", dateFrom);
        if (dateTo) params.set("dateTo", dateTo);

        const res = await apiFetch<InvoiceListResponse>(
          `/ap/invoices?${params.toString()}`,
          { token, locationId }
        );
        setInvoices(res.data);
        setHasMore(!!res.cursor);
        setCursor(res.cursor);
        if (res.summary) setSummary(res.summary);
      } catch (err: any) {
        setError(err.message || "Failed to load invoices");
      } finally {
        setLoading(false);
      }
    },
    [token, locationId, supplierFilter, statusFilter, overdueOnly, dateFrom, dateTo]
  );

  useEffect(() => {
    if (!authLoading && token && locationId) {
      fetchInvoices();
      fetchSuppliers();
    }
  }, [authLoading, token, locationId, fetchInvoices, fetchSuppliers]);

  const handleNextPage = () => {
    if (cursor) {
      setPrevCursors((p) => [...p, ""]);
      fetchInvoices(cursor);
    }
  };

  const handlePrevPage = () => {
    const prev = [...prevCursors];
    prev.pop();
    setPrevCursors(prev);
    fetchInvoices(prev[prev.length - 1] || undefined);
  };

  if (authLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-sm text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/[0.06]">
            <FileText size={16} className="text-primary" />
          </div>
          <div>
            <h1 className="text-[18px] font-semibold tracking-tight">
              Supplier Invoices
            </h1>
            <p className="text-xs text-muted-foreground">
              Track and manage accounts payable invoices
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
        >
          <Plus size={14} />
          Record Invoice
        </button>
      </div>

      {/* Summary Cards */}
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-xl border border-border bg-background p-4 shadow-sm">
          <div className="flex items-center gap-2 text-[11px] font-medium text-muted-foreground">
            <DollarSign size={14} />
            Total Open Payables
          </div>
          <div className="mt-1 text-xl font-bold tabular-nums">
            {fmtPeso(summary.totalOpen)}
          </div>
        </div>
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 shadow-sm">
          <div className="flex items-center gap-2 text-[11px] font-medium text-red-600">
            <AlertTriangle size={14} />
            Overdue Amount
          </div>
          <div className="mt-1 text-xl font-bold tabular-nums text-red-700">
            {fmtPeso(summary.overdueAmount)}
          </div>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
          <div className="flex items-center gap-2 text-[11px] font-medium text-amber-600">
            <Clock size={14} />
            Due This Week
          </div>
          <div className="mt-1 text-xl font-bold tabular-nums text-amber-700">
            {fmtPeso(summary.dueThisWeek)}
          </div>
        </div>
        <div className="rounded-xl border border-border bg-background p-4 shadow-sm">
          <div className="flex items-center gap-2 text-[11px] font-medium text-muted-foreground">
            <FileText size={14} />
            Invoice Count
          </div>
          <div className="mt-1 text-xl font-bold tabular-nums">
            {summary.invoiceCount}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <select
          value={supplierFilter}
          onChange={(e) => setSupplierFilter(e.target.value)}
          className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-primary"
        >
          <option value="">All Suppliers</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-primary"
        >
          <option value="">All Statuses</option>
          <option value="OPEN">Open</option>
          <option value="PARTIALLY_PAID">Partially Paid</option>
          <option value="PAID">Paid</option>
          <option value="VOID">Void</option>
        </select>

        <label className="flex items-center gap-1.5 text-sm">
          <input
            type="checkbox"
            checked={overdueOnly}
            onChange={(e) => setOverdueOnly(e.target.checked)}
            className="rounded border-border"
          />
          Overdue only
        </label>

        <DateRangePicker
          startDate={dateFrom}
          endDate={dateTo}
          onChange={(start, end) => { setDateFrom(start); setDateTo(end); }}
        />
      </div>

      {/* Error */}
      {error && (
        <div className="mb-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-2 text-sm text-destructive">
          {error}
          <button
            onClick={() => fetchInvoices()}
            className="ml-2 underline hover:no-underline"
          >
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
                <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Invoice #
                </th>
                <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Date
                </th>
                <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Supplier
                </th>
                <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Due Date
                </th>
                <th className="px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Amount
                </th>
                <th className="px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Paid
                </th>
                <th className="px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Balance
                </th>
                <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Status
                </th>
                <th className="px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="border-b border-border">
                    <td colSpan={9} className="px-3 py-3">
                      <div className="h-5 animate-pulse rounded bg-muted" />
                    </td>
                  </tr>
                ))
              ) : invoices.length === 0 ? (
                <tr>
                  <td
                    colSpan={9}
                    className="px-3 py-12 text-center text-sm text-muted-foreground"
                  >
                    No invoices found. Click &quot;Record Invoice&quot; to
                    create one.
                  </td>
                </tr>
              ) : (
                invoices.map((inv, i) => (
                  <tr
                    key={inv.id}
                    className={`border-b border-border transition-colors hover:bg-accent/50 ${
                      i % 2 === 0 ? "bg-background" : "bg-muted/20"
                    }`}
                  >
                    <td className="px-3 py-2.5 font-mono text-[13px] font-semibold text-primary">
                      {inv.invoiceNo}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">
                      {fmtDate(inv.invoiceDate)}
                    </td>
                    <td className="px-3 py-2.5 text-[13px]">
                      {inv.supplierName}
                    </td>
                    <td
                      className={`px-3 py-2.5 text-xs ${dueDateClass(inv.dueDate, inv.status)}`}
                    >
                      {fmtDate(inv.dueDate)}
                    </td>
                    <td className="px-3 py-2.5 text-right text-[13px] tabular-nums">
                      {fmtPeso(inv.amount)}
                    </td>
                    <td className="px-3 py-2.5 text-right text-[13px] tabular-nums text-muted-foreground">
                      {fmtPeso(inv.paidAmount)}
                    </td>
                    <td className="px-3 py-2.5 text-right text-[13px] font-semibold tabular-nums">
                      {fmtPeso(inv.balance)}
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          STATUS_COLORS[inv.status] ??
                          "bg-muted text-muted-foreground"
                        }`}
                      >
                        {STATUS_LABELS[inv.status] ??
                          inv.status.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {(inv.status === "OPEN" ||
                        inv.status === "PARTIALLY_PAID") && (
                        <button
                          onClick={() =>
                            router.push(
                              `/ap/check-vouchers/new?invoiceId=${inv.id}`
                            )
                          }
                          className="rounded-md bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary hover:bg-primary/20"
                        >
                          Pay
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination footer */}
        <div className="flex items-center justify-between border-t border-border bg-muted/30 px-3 py-2">
          <span className="text-[10px] text-muted-foreground">
            Showing {invoices.length} invoice{invoices.length !== 1 ? "s" : ""}
          </span>
          <div className="flex items-center gap-2">
            {prevCursors.length > 0 && (
              <button
                onClick={handlePrevPage}
                className="flex items-center gap-1 text-[10px] font-medium text-primary hover:underline"
              >
                <ChevronLeft size={12} /> Previous
              </button>
            )}
            {hasMore && (
              <button
                onClick={handleNextPage}
                className="flex items-center gap-1 text-[10px] font-medium text-primary hover:underline"
              >
                Next <ChevronRight size={12} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Record Invoice Modal */}
      <RecordInvoiceModal
        open={showModal}
        onClose={() => setShowModal(false)}
        onCreated={() => fetchInvoices()}
        token={token!}
        locationId={locationId!}
      />
    </div>
  );
}
