"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { FileText, Search, X, Download, Plus, MoreVertical, AlertTriangle, Clock, DollarSign } from "lucide-react";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { cn } from "@/lib/utils";
import { fmtPeso, fmtDate } from "@/lib/format";
import { useAuth } from "@/app/auth-context";
import { apiFetch } from "@/lib/api";
import { downloadCSV } from "@/lib/csv-export";

/* ─── Types ─── */

interface InvoiceRow {
  id: string;
  recordedAt: string;
  dueDate: string | null;
  referenceNumber: string | null;
  notes: string | null;
  source: "MANUAL" | "POS" | "IMPORT";
  billed: boolean;
  billedSoaId: string | null;
  customerId: string;
  customerName: string;
  customerCode: string;
  amount: number;
  allocatedAmount: number;
  balance: number;
  paymentStatus: "UNPAID" | "PARTIAL" | "PAID";
}

interface InvoiceSummary {
  openCount: number;
  totalOpen: number;
  totalOverdue: number;
  dueThisWeek: number;
}

interface InvoiceResponse {
  data: InvoiceRow[];
  page: number;
  pageSize: number;
  total: number;
  summary: InvoiceSummary;
}

interface CustomerLite { id: string; name: string; phone?: string | null; }

const SOURCE_OPTIONS = [
  { value: "", label: "All Sources" },
  { value: "MANUAL", label: "Manual" },
  { value: "POS", label: "POS" },
  { value: "IMPORT", label: "Import" },
] as const;

const STATUS_OPTIONS = [
  { value: "", label: "All Status" },
  { value: "UNPAID", label: "Unpaid" },
  { value: "PARTIAL", label: "Partial" },
  { value: "PAID", label: "Paid" },
] as const;

// Status pill — palette mirrors fb5a042 (AR SOA History)
const STATUS_PILL: Record<string, string> = {
  UNPAID:  "border border-blue-200 bg-blue-100 text-blue-700",
  PARTIAL: "border border-amber-200 bg-amber-100 text-amber-700",
  PAID:    "border border-emerald-200 bg-emerald-100 text-emerald-700",
};

const SOURCE_PILL: Record<string, string> = {
  MANUAL: "bg-muted text-muted-foreground",
  POS:    "bg-purple-50 text-purple-700",
  IMPORT: "bg-sky-50 text-sky-700",
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

function todayISO(): string { return new Date().toISOString().slice(0, 10); }
function plusDaysISO(days: number): string {
  const d = new Date(); d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Days between dueDate and today. <0 = overdue, 0 = due today, >0 = future. */
function daysToDue(dueDate: string | null): number | null {
  if (!dueDate) return null;
  const due = new Date(dueDate + "T00:00:00").getTime();
  const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00").getTime();
  return Math.round((due - today) / 86400000);
}

/* ═══════════════════════════════════════ */

export default function CustomerInvoicesPage() {
  const { token, locationId, loading: authLoading } = useAuth();
  const router = useRouter();

  const [records, setRecords] = useState<InvoiceRow[]>([]);
  const [summary, setSummary] = useState<InvoiceSummary>({ openCount: 0, totalOpen: 0, totalOverdue: 0, dueThisWeek: 0 });
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [committedSearch, setCommittedSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState<"" | "MANUAL" | "POS" | "IMPORT">("");
  const [statusFilter, setStatusFilter] = useState<"" | "UNPAID" | "PARTIAL" | "PAID">("");
  const [customerFilter, setCustomerFilter] = useState<CustomerLite | null>(null);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(25);

  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editingRow, setEditingRow] = useState<InvoiceRow | null>(null);
  const [deletingRow, setDeletingRow] = useState<InvoiceRow | null>(null);

  const fetchData = useCallback(async () => {
    if (!token || !locationId) return;
    setLoading(true);
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("pageSize", String(pageSize));
    if (committedSearch) params.set("search", committedSearch);
    if (sourceFilter) params.set("source", sourceFilter);
    if (statusFilter) params.set("status", statusFilter);
    if (customerFilter) params.set("customerId", customerFilter.id);
    if (dateFrom) params.set("from", `${dateFrom}T00:00:00Z`);
    if (dateTo) params.set("to", `${dateTo}T23:59:59Z`);
    try {
      const res = await apiFetch<InvoiceResponse>(`/customers/invoices?${params.toString()}`, { token, locationId });
      setRecords(res.data || []);
      setSummary(res.summary || { openCount: 0, totalOpen: 0, totalOverdue: 0, dueThisWeek: 0 });
      setTotal(res.total || 0);
    } catch {} finally { setLoading(false); }
  }, [token, locationId, committedSearch, sourceFilter, statusFilter, customerFilter, dateFrom, dateTo, page, pageSize]);

  useEffect(() => { if (!authLoading) fetchData(); }, [authLoading, fetchData]);
  useEffect(() => { setPage(1); }, [committedSearch, sourceFilter, statusFilter, customerFilter, dateFrom, dateTo, pageSize]);

  // Close action menu on outside click
  useEffect(() => {
    if (!openMenuId) return;
    const onClick = () => setOpenMenuId(null);
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [openMenuId]);

  const submitSearch = () => setCommittedSearch(search.trim());
  const clearSearch = () => { setSearch(""); setCommittedSearch(""); };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageNumbers = buildPageNumbers(safePage, totalPages);
  const startIdx = (safePage - 1) * pageSize;
  const endIdx = Math.min(startIdx + records.length, total);

  const handleExportCSV = () => {
    downloadCSV("customer-invoices",
      ["Invoice #", "Customer", "Date", "Due Date", "Amount", "Paid", "Balance", "Status", "Source"],
      records.map((r) => [
        r.referenceNumber || "", r.customerName, fmtDate(r.recordedAt),
        r.dueDate ? fmtDate(r.dueDate) : "",
        r.amount.toFixed(2), r.allocatedAmount.toFixed(2), r.balance.toFixed(2),
        r.paymentStatus, r.source,
      ]),
    );
  };

  return (
    <div className="mx-auto flex h-full max-w-7xl flex-col">
      {/* Header + KPI cards */}
      <div className="mb-5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/[0.06]">
            <FileText size={16} className="text-primary" />
          </div>
          <div>
            <h1 className="text-[18px] font-semibold tracking-tight text-foreground">Customer Invoices</h1>
            <p className="text-[13px] text-muted-foreground">Manage customer charges and invoices</p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KpiCard icon={<DollarSign size={14} className="text-muted-foreground" />} label="Total Open AR" value={fmtPeso(summary.totalOpen)} sub={`${summary.openCount} open`} />
          <KpiCard icon={<AlertTriangle size={14} className="text-red-600" />} label="Overdue" value={fmtPeso(summary.totalOverdue)} valueClass="text-red-600" />
          <KpiCard icon={<Clock size={14} className="text-amber-600" />} label="Due This Week" value={fmtPeso(summary.dueThisWeek)} valueClass="text-amber-600" />
          <KpiCard icon={<FileText size={14} className="text-muted-foreground" />} label="Open Invoices" value={String(summary.openCount)} />
        </div>
      </div>

      {/* Filters */}
      <div className="mb-3 rounded-xl border border-border bg-background p-3 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[180px] max-w-sm">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submitSearch(); } }}
              placeholder="Search invoice #, customer..."
              className="h-8 w-full rounded-lg border border-border bg-background pl-9 pr-8 text-[12px] text-foreground placeholder:text-muted-foreground/60 outline-none focus:border-primary/40 focus:ring-1 focus:ring-primary/20" />
            {search && <button onClick={clearSearch} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X size={12} /></button>}
          </div>

          <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value as any)}
            className="h-8 rounded-lg border border-border bg-background px-2 text-[12px] outline-none focus:border-primary/40">
            {SOURCE_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>

          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)}
            className="h-8 rounded-lg border border-border bg-background px-2 text-[12px] outline-none focus:border-primary/40">
            {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>

          <CustomerPicker value={customerFilter} onChange={setCustomerFilter} token={token ?? ""} locationId={locationId ?? ""} />

          <DateRangePicker startDate={dateFrom} endDate={dateTo} onChange={(s, e) => { setDateFrom(s); setDateTo(e); }} />

          <div className="ml-auto flex items-center gap-2">
            {records.length > 0 && (
              <button onClick={handleExportCSV}
                className="flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-[11px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground">
                <Download size={12} /> Export CSV
              </button>
            )}
            <button onClick={() => setShowCreate(true)}
              className="flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-[11px] font-semibold text-primary-foreground hover:bg-primary/90">
              <Plus size={12} /> Create Invoice
            </button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-border bg-background shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <Th>Invoice #</Th>
                <Th>Customer</Th>
                <Th>Date</Th>
                <Th>Due Date</Th>
                <Th align="right">Amount</Th>
                <Th align="right">Paid</Th>
                <Th align="right">Balance</Th>
                <Th>Status</Th>
                <Th>Source</Th>
                <Th align="right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="border-b border-border">
                    <td colSpan={10} className="px-3 py-3"><div className="h-5 animate-pulse rounded bg-muted" /></td>
                  </tr>
                ))
              ) : records.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-3 py-12 text-center text-sm text-muted-foreground">No invoices found.</td>
                </tr>
              ) : (
                records.map((r, i) => {
                  const dueDays = daysToDue(r.dueDate);
                  const isOverdue = dueDays !== null && dueDays < 0 && r.balance > 0.005;
                  const isDueSoon = dueDays !== null && dueDays >= 0 && dueDays <= 7 && r.balance > 0.005;
                  const editDisabledReason =
                    r.source !== "MANUAL" ? "Only manually-created invoices can be edited from here"
                    : r.allocatedAmount > 0.005 ? "Invoice has payments — cannot edit"
                    : null;
                  const deleteDisabledReason =
                    r.billed ? "Invoice is on an SOA — cannot delete"
                    : r.allocatedAmount > 0.005 ? "Invoice has payments — cannot delete"
                    : r.source !== "MANUAL" ? "Only manually-created invoices can be deleted from here"
                    : null;
                  return (
                    <tr key={r.id} className={cn("border-b border-border transition-colors hover:bg-accent/50", i % 2 === 0 ? "bg-background" : "bg-muted/20")}>
                      <td className="px-3 py-1.5 font-mono text-[13px] font-semibold text-primary">{r.referenceNumber || "\u2014"}</td>
                      <td className="px-3 py-1.5">
                        <button onClick={() => router.push(`/customers/${r.customerId}`)} className="text-[13px] font-medium text-foreground hover:text-primary hover:underline truncate text-left">
                          {r.customerName}
                        </button>
                      </td>
                      <td className="px-3 py-1.5 text-xs text-muted-foreground">{fmtDate(r.recordedAt)}</td>
                      <td className={cn("px-3 py-1.5 text-xs", isOverdue ? "text-red-600 font-medium" : isDueSoon ? "text-amber-600" : "text-muted-foreground")}>
                        {r.dueDate ? fmtDate(r.dueDate) : "\u2014"}
                      </td>
                      <td className="px-3 py-1.5 text-right text-[13px] tabular-nums">{fmtPeso(r.amount)}</td>
                      <td className="px-3 py-1.5 text-right text-xs tabular-nums text-muted-foreground">{r.allocatedAmount > 0 ? fmtPeso(r.allocatedAmount) : "\u2014"}</td>
                      <td className="px-3 py-1.5 text-right text-[13px] font-semibold tabular-nums">{fmtPeso(r.balance)}</td>
                      <td className="px-3 py-1.5">
                        <span className={cn("inline-flex rounded-md px-2 py-0.5 text-[9px] font-semibold uppercase", STATUS_PILL[r.paymentStatus] ?? "bg-muted text-muted-foreground")}>
                          {r.paymentStatus}
                        </span>
                      </td>
                      <td className="px-3 py-1.5">
                        <span className={cn("inline-flex rounded-md px-1.5 py-0.5 text-[9px] font-semibold uppercase", SOURCE_PILL[r.source] ?? "bg-muted text-muted-foreground")}>
                          {r.source}
                        </span>
                      </td>
                      <td className="px-3 py-1.5 text-right relative">
                        <button
                          onClick={(e) => { e.stopPropagation(); setOpenMenuId(openMenuId === r.id ? null : r.id); }}
                          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                          <MoreVertical size={14} />
                        </button>
                        {openMenuId === r.id && (
                          <div onClick={(e) => e.stopPropagation()}
                            className="absolute right-2 top-7 z-20 w-44 rounded-lg border border-border bg-background shadow-lg">
                            <button
                              onClick={() => { if (!editDisabledReason) { setEditingRow(r); setOpenMenuId(null); } }}
                              disabled={!!editDisabledReason}
                              title={editDisabledReason ?? undefined}
                              className={cn("block w-full text-left px-3 py-1.5 text-[12px]",
                                editDisabledReason ? "text-muted-foreground/50 cursor-not-allowed" : "text-foreground hover:bg-accent")}
                            >Edit</button>
                            <button
                              onClick={() => { if (!deleteDisabledReason) { setDeletingRow(r); setOpenMenuId(null); } }}
                              disabled={!!deleteDisabledReason}
                              title={deleteDisabledReason ?? undefined}
                              className={cn("block w-full text-left px-3 py-1.5 text-[12px]",
                                deleteDisabledReason ? "text-muted-foreground/50 cursor-not-allowed" : "text-red-600 hover:bg-red-50")}
                            >Delete</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between border-t border-border bg-muted/30 px-3 py-2">
          <span className="text-[11px] text-muted-foreground">
            {total > 0 ? `Showing ${startIdx + 1}\u2013${endIdx} of ${total} invoices` : "No invoices"}
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
          <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}
            className="rounded border border-border bg-background px-2 py-0.5 text-[11px] text-muted-foreground outline-none">
            {PAGE_SIZES.map((s) => <option key={s} value={s}>{s} / page</option>)}
          </select>
        </div>
      </div>

      {/* Modals */}
      {showCreate && (
        <CreateInvoiceModal
          token={token ?? ""} locationId={locationId ?? ""}
          onClose={() => setShowCreate(false)}
          onSuccess={() => { setShowCreate(false); fetchData(); }}
        />
      )}
      {editingRow && (
        <EditInvoiceModal
          row={editingRow} token={token ?? ""} locationId={locationId ?? ""}
          onClose={() => setEditingRow(null)}
          onSuccess={() => { setEditingRow(null); fetchData(); }}
        />
      )}
      {deletingRow && (
        <DeleteInvoiceConfirm
          row={deletingRow} token={token ?? ""} locationId={locationId ?? ""}
          onClose={() => setDeletingRow(null)}
          onSuccess={() => { setDeletingRow(null); fetchData(); }}
        />
      )}
    </div>
  );
}

/* ─── KPI Card ─── */
function KpiCard({ icon, label, value, sub, valueClass }: { icon: React.ReactNode; label: string; value: string; sub?: string; valueClass?: string }) {
  return (
    <div className="rounded-xl border border-border bg-background p-3.5 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground mb-1">{icon}{label}</div>
      <div className={cn("text-[18px] font-bold tabular-nums text-foreground", valueClass)}>{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

function Th({ children, align }: { children: React.ReactNode; align?: "left" | "right" | "center" }) {
  return (
    <th className={cn("px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground",
      align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left")}>
      {children}
    </th>
  );
}

/* ─── Customer Picker (typeahead) ─── */
function CustomerPicker({ value, onChange, token, locationId }: {
  value: CustomerLite | null; onChange: (c: CustomerLite | null) => void;
  token: string; locationId: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<CustomerLite[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!open || q.trim().length < 2 || !token || !locationId) { setResults([]); return; }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await apiFetch<{ data: CustomerLite[] }>(`/customers/search?q=${encodeURIComponent(q.trim())}`, { token, locationId });
        setResults(res.data || []);
      } catch { setResults([]); }
    }, 200);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [q, open, token, locationId]);

  if (value) {
    return (
      <div className="flex h-8 items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/5 px-2 text-[12px]">
        <span className="font-medium text-foreground truncate max-w-[140px]">{value.name}</span>
        <button onClick={() => onChange(null)} className="text-muted-foreground hover:text-foreground"><X size={11} /></button>
      </div>
    );
  }
  return (
    <div className="relative">
      <input
        type="text"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 200)}
        placeholder="All Customers"
        className="h-8 w-[160px] rounded-lg border border-border bg-background px-2 text-[12px] outline-none focus:border-primary/40"
      />
      {open && results.length > 0 && (
        <div className="absolute left-0 top-9 z-30 w-[220px] rounded-lg border border-border bg-background shadow-lg max-h-60 overflow-y-auto">
          {results.map((c) => (
            <button key={c.id}
              onMouseDown={(e) => { e.preventDefault(); onChange(c); setQ(""); setOpen(false); }}
              className="block w-full text-left px-3 py-1.5 text-[12px] hover:bg-accent">
              <div className="font-medium text-foreground">{c.name}</div>
              {c.phone && <div className="text-[10px] text-muted-foreground">{c.phone}</div>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Create Invoice Modal ─── */
function CreateInvoiceModal({ token, locationId, onClose, onSuccess }: {
  token: string; locationId: string; onClose: () => void; onSuccess: () => void;
}) {
  const [customer, setCustomer] = useState<CustomerLite | null>(null);
  const [refNum, setRefNum] = useState("");
  const [chargeDate, setChargeDate] = useState(todayISO());
  const [dueDate, setDueDate] = useState(plusDaysISO(30));
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    setError("");
    if (!customer) { setError("Customer is required"); return; }
    if (!refNum.trim()) { setError("Reference # is required"); return; }
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { setError("Amount must be greater than 0"); return; }
    setSubmitting(true);
    try {
      await apiFetch(`/customers/${customer.id}/charges`, {
        method: "POST", token, locationId,
        body: JSON.stringify({
          amount: amt.toFixed(2),
          referenceNumber: refNum.trim(),
          chargeDate: chargeDate ? `${chargeDate}T00:00:00Z` : undefined,
          dueDate: dueDate || undefined,
          description: description.trim() || undefined,
        }),
      });
      onSuccess();
    } catch (err: any) {
      setError(err.message || "Failed to create invoice");
    } finally { setSubmitting(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-[480px] rounded-xl border border-border bg-background shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-[14px] font-semibold">Create Invoice</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X size={16} /></button>
        </div>
        <div className="p-4 space-y-3">
          <Field label="Customer">
            <CustomerPicker value={customer} onChange={setCustomer} token={token} locationId={locationId} />
          </Field>
          <Field label="Reference #">
            <input type="text" value={refNum} onChange={(e) => setRefNum(e.target.value)}
              className="h-8 w-full rounded border border-border bg-background px-2 text-[12px] outline-none focus:border-primary/40" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Invoice Date">
              <input type="date" value={chargeDate} onChange={(e) => setChargeDate(e.target.value)}
                className="h-8 w-full rounded border border-border bg-background px-2 text-[12px] outline-none focus:border-primary/40" />
            </Field>
            <Field label="Due Date">
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)}
                className="h-8 w-full rounded border border-border bg-background px-2 text-[12px] outline-none focus:border-primary/40" />
            </Field>
          </div>
          <Field label="Amount">
            <input type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="h-8 w-full rounded border border-border bg-background px-2 text-[12px] tabular-nums outline-none focus:border-primary/40" />
          </Field>
          <Field label="Description (optional)">
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2}
              className="w-full rounded border border-border bg-background px-2 py-1 text-[12px] outline-none focus:border-primary/40" />
          </Field>
          {error && <div className="text-[11px] text-red-600">{error}</div>}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-3">
          <button onClick={onClose} className="rounded-lg px-3 py-1.5 text-[12px] text-muted-foreground hover:bg-muted">Cancel</button>
          <button onClick={submit} disabled={submitting}
            className="rounded-lg bg-primary px-3 py-1.5 text-[12px] font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            {submitting ? "Saving…" : "Create Invoice"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Edit Invoice Modal ─── */
function EditInvoiceModal({ row, token, locationId, onClose, onSuccess }: {
  row: InvoiceRow; token: string; locationId: string; onClose: () => void; onSuccess: () => void;
}) {
  const [amount, setAmount] = useState(String(row.amount));
  const [dueDate, setDueDate] = useState(row.dueDate ?? "");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    setError("");
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { setError("Amount must be greater than 0"); return; }
    if (!reason.trim()) { setError("Reason is required (audit trail)"); return; }
    setSubmitting(true);
    try {
      await apiFetch(`/customers/${row.customerId}/transactions/${row.id}`, {
        method: "PATCH", token, locationId,
        body: JSON.stringify({
          amount: amt,
          reason: reason.trim(),
          // null = clear, "" treated as null; valid YYYY-MM-DD = set
          dueDate: dueDate === "" ? null : dueDate,
        }),
      });
      onSuccess();
    } catch (err: any) {
      setError(err.message || "Failed to update invoice");
    } finally { setSubmitting(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-[440px] rounded-xl border border-border bg-background shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-[14px] font-semibold">Edit Invoice {row.referenceNumber}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X size={16} /></button>
        </div>
        <div className="p-4 space-y-3">
          <div className="text-[11px] text-muted-foreground">{row.customerName} &middot; {fmtDate(row.recordedAt)}</div>
          <Field label="Amount">
            <input type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)}
              className="h-8 w-full rounded border border-border bg-background px-2 text-[12px] tabular-nums outline-none focus:border-primary/40" />
          </Field>
          <Field label="Due Date">
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)}
              className="h-8 w-full rounded border border-border bg-background px-2 text-[12px] outline-none focus:border-primary/40" />
          </Field>
          <Field label="Reason (required for audit log)">
            <input type="text" value={reason} onChange={(e) => setReason(e.target.value)}
              placeholder="Why is this being changed?"
              className="h-8 w-full rounded border border-border bg-background px-2 text-[12px] outline-none focus:border-primary/40" />
          </Field>
          {error && <div className="text-[11px] text-red-600">{error}</div>}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-3">
          <button onClick={onClose} className="rounded-lg px-3 py-1.5 text-[12px] text-muted-foreground hover:bg-muted">Cancel</button>
          <button onClick={submit} disabled={submitting}
            className="rounded-lg bg-primary px-3 py-1.5 text-[12px] font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            {submitting ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Delete Confirm ─── */
function DeleteInvoiceConfirm({ row, token, locationId, onClose, onSuccess }: {
  row: InvoiceRow; token: string; locationId: string; onClose: () => void; onSuccess: () => void;
}) {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    setError("");
    setSubmitting(true);
    try {
      await apiFetch(`/customers/${row.customerId}/transactions/${row.id}`, {
        method: "DELETE", token, locationId,
        body: JSON.stringify({ reason: reason.trim() || undefined }),
      });
      onSuccess();
    } catch (err: any) {
      setError(err.message || "Failed to delete invoice");
    } finally { setSubmitting(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-[420px] rounded-xl border border-border bg-background shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-[14px] font-semibold text-red-600">Delete Invoice</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X size={16} /></button>
        </div>
        <div className="p-4 space-y-3 text-[12px]">
          <p>Delete invoice <strong className="font-mono">{row.referenceNumber}</strong> for <strong>{row.customerName}</strong>?</p>
          <p className="text-muted-foreground">Amount: <span className="font-semibold tabular-nums text-foreground">{fmtPeso(row.amount)}</span></p>
          <p className="text-[11px] text-amber-700 bg-amber-50 rounded px-2 py-1.5">This action cannot be undone. The customer's balance will be adjusted.</p>
          <Field label="Reason (optional)">
            <input type="text" value={reason} onChange={(e) => setReason(e.target.value)}
              className="h-8 w-full rounded border border-border bg-background px-2 text-[12px] outline-none focus:border-primary/40" />
          </Field>
          {error && <div className="text-[11px] text-red-600">{error}</div>}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-3">
          <button onClick={onClose} className="rounded-lg px-3 py-1.5 text-[12px] text-muted-foreground hover:bg-muted">Cancel</button>
          <button onClick={submit} disabled={submitting}
            className="rounded-lg bg-red-600 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-red-700 disabled:opacity-50">
            {submitting ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Field wrapper ─── */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] font-medium text-muted-foreground mb-1">{label}</label>
      {children}
    </div>
  );
}
