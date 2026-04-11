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
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
} from "lucide-react";
import { useAuth } from "@/app/auth-context";
import { apiFetch } from "@/lib/api";
import { fmtPeso, fmtDate } from "@/lib/format";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { cn } from "@/lib/utils";

/* ─── Sortable column header ─── */

type SortField =
  | "invoiceNumber"
  | "invoiceDate"
  | "supplier"
  | "dueDate"
  | "totalAmount"
  | "paidAmount"
  | "balance"
  | "status";
type SortDir = "asc" | "desc";

function SortableHeader({
  label,
  field,
  activeField,
  activeDir,
  onSort,
  align = "left",
}: {
  label: string;
  field: SortField;
  activeField: SortField;
  activeDir: SortDir;
  onSort: (f: SortField) => void;
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

/* ─── Types ─── */

interface Supplier {
  id: string;
  name: string;
}

interface Invoice {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  supplierId: string;
  supplierName: string;
  dueDate: string;
  totalAmount: string;
  paidAmount: string;
  balance: string;
  status: string;
  paymentTermsDays: number | null;
  notes: string | null;
  createdAt: string;
}

interface InvoiceListResponse {
  data: Invoice[];
  nextCursor: string | null;
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
  // Client-side text search — narrows the current page in place.
  const [searchText, setSearchText] = useState("");

  // Client-side sort state. Default: invoice date descending.
  const [sortField, setSortField] = useState<SortField>("invoiceDate");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

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
        setHasMore(!!res.nextCursor);
        setCursor(res.nextCursor);
        // Fetch summary separately
        try {
          const sumRes = await apiFetch<any>("/ap/reports/summary", { token, locationId });
          setSummary({
            totalOpen: parseFloat(sumRes.total_payables ?? "0"),
            overdueAmount: parseFloat(sumRes.total_overdue ?? "0"),
            dueThisWeek: 0,
            invoiceCount: parseInt(sumRes.invoice_count ?? "0", 10),
          });
        } catch {}
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

  // ── Client-side filter + sort ──
  const displayedInvoices = useMemo(() => {
    let rows = invoices;
    if (searchText.trim().length >= 1) {
      const q = searchText.toLowerCase();
      rows = rows.filter(
        (inv) =>
          inv.invoiceNumber.toLowerCase().includes(q) ||
          inv.supplierName.toLowerCase().includes(q) ||
          (inv.notes ?? "").toLowerCase().includes(q),
      );
    }
    const copy = [...rows];
    copy.sort((a, b) => {
      let cmp: number;
      switch (sortField) {
        case "invoiceNumber":
          cmp = a.invoiceNumber.localeCompare(b.invoiceNumber);
          break;
        case "invoiceDate":
          cmp = new Date(a.invoiceDate).getTime() - new Date(b.invoiceDate).getTime();
          break;
        case "supplier":
          cmp = a.supplierName.localeCompare(b.supplierName);
          break;
        case "dueDate":
          cmp = new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
          break;
        case "totalAmount":
          cmp = parseFloat(a.totalAmount) - parseFloat(b.totalAmount);
          break;
        case "paidAmount":
          cmp = parseFloat(a.paidAmount) - parseFloat(b.paidAmount);
          break;
        case "balance":
          cmp = parseFloat(a.balance) - parseFloat(b.balance);
          break;
        case "status":
          cmp = (a.status || "").localeCompare(b.status || "");
          break;
        default:
          cmp = 0;
      }
      return sortDir === "desc" ? -cmp : cmp;
    });
    return copy;
  }, [invoices, searchText, sortField, sortDir]);

  const handleSort = (field: SortField) => {
    if (field === sortField) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir(
        field === "invoiceDate" || field === "dueDate" || field === "totalAmount" || field === "balance"
          ? "desc"
          : "asc",
      );
    }
  };

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
        {/* Text search — filters the current page client-side by invoice
            number / supplier name / notes. For a full search across pages,
            combine with the supplier dropdown below. */}
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search
            size={14}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            type="text"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Search invoice #, supplier, notes…"
            className="h-8 w-full rounded-lg border border-border bg-background pl-9 pr-8 text-[12px] outline-none focus:border-primary/40 focus:ring-1 focus:ring-primary/20"
          />
          {searchText && (
            <button
              onClick={() => setSearchText("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X size={12} />
            </button>
          )}
        </div>

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
                <th className="px-3 py-2.5 text-left">
                  <SortableHeader label="Invoice #" field="invoiceNumber" activeField={sortField} activeDir={sortDir} onSort={handleSort} align="left" />
                </th>
                <th className="px-3 py-2.5 text-left">
                  <SortableHeader label="Date" field="invoiceDate" activeField={sortField} activeDir={sortDir} onSort={handleSort} align="left" />
                </th>
                <th className="px-3 py-2.5 text-left">
                  <SortableHeader label="Supplier" field="supplier" activeField={sortField} activeDir={sortDir} onSort={handleSort} align="left" />
                </th>
                <th className="px-3 py-2.5 text-left">
                  <SortableHeader label="Due Date" field="dueDate" activeField={sortField} activeDir={sortDir} onSort={handleSort} align="left" />
                </th>
                <th className="px-3 py-2.5 text-right">
                  <SortableHeader label="Amount" field="totalAmount" activeField={sortField} activeDir={sortDir} onSort={handleSort} align="right" />
                </th>
                <th className="px-3 py-2.5 text-right">
                  <SortableHeader label="Paid" field="paidAmount" activeField={sortField} activeDir={sortDir} onSort={handleSort} align="right" />
                </th>
                <th className="px-3 py-2.5 text-right">
                  <SortableHeader label="Balance" field="balance" activeField={sortField} activeDir={sortDir} onSort={handleSort} align="right" />
                </th>
                <th className="px-3 py-2.5 text-left">
                  <SortableHeader label="Status" field="status" activeField={sortField} activeDir={sortDir} onSort={handleSort} align="left" />
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
              ) : displayedInvoices.length === 0 ? (
                <tr>
                  <td
                    colSpan={9}
                    className="px-3 py-12 text-center text-sm text-muted-foreground"
                  >
                    {invoices.length === 0
                      ? "No invoices found. Click \u201cRecord Invoice\u201d to create one."
                      : "No invoices match the current filters."}
                  </td>
                </tr>
              ) : (
                displayedInvoices.map((inv, i) => (
                  <tr
                    key={inv.id}
                    className={`border-b border-border transition-colors hover:bg-accent/50 ${
                      i % 2 === 0 ? "bg-background" : "bg-muted/20"
                    }`}
                  >
                    <td className="px-3 py-2.5 font-mono text-[13px] font-semibold text-primary">
                      {inv.invoiceNumber}
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
                      {fmtPeso(inv.totalAmount)}
                    </td>
                    <td className="px-3 py-2.5 text-right text-[13px] tabular-nums text-muted-foreground">
                      {fmtPeso(inv.paidAmount)}
                    </td>
                    <td className="px-3 py-2.5 text-right text-[13px] font-semibold tabular-nums">
                      {fmtPeso(inv.balance)}
                    </td>
                    <td className="px-3 py-2.5">
                      {(() => {
                        const isOverdue = (inv.status === "OPEN" || inv.status === "PARTIALLY_PAID") && new Date(inv.dueDate) < new Date();
                        const displayStatus = isOverdue ? "OVERDUE" : inv.status;
                        return (
                          <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_COLORS[displayStatus] ?? "bg-muted text-muted-foreground"}`}>
                            {STATUS_LABELS[displayStatus] ?? displayStatus.replace(/_/g, " ")}
                          </span>
                        );
                      })()}
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
            Showing {displayedInvoices.length}
            {searchText && displayedInvoices.length !== invoices.length
              ? ` of ${invoices.length}`
              : ""}{" "}
            invoice{displayedInvoices.length !== 1 ? "s" : ""}
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
