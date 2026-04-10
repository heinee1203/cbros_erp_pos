"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  FileText,
  DollarSign,
  Users,
  AlertTriangle,
  Calendar,
  Search,
  X,
  ChevronRight,
  ChevronDown,
  Loader2,
  Download,
  Printer,
  CheckSquare,
  Square,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/app/auth-context";
import { apiFetch } from "@/lib/api";
import { fmtPeso, fmtDate } from "@/lib/format";
import { downloadCSV } from "@/lib/csv-export";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { buildSupplierSOAHtml } from "@/lib/supplier-soa-html";

/* ── Types ── */
interface SupplierRow {
  supplierId: string;
  supplierName: string;
  contactPhone: string | null;
  address: string | null;
  invoiceCount: number;
  totalBalance: number;
  oldestInvoiceDate: string | null;
  earliestDueDate: string | null;
  overdueCount: number;
  overdueAmount: number;
}

interface Summary {
  totalPayable: number;
  totalOverdue: number;
  supplierCount: number;
  dueThisWeek: number;
}

interface Invoice {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  totalAmount: string;
  paidAmount: string;
  balance: string;
  status: string;
}

function daysAgo(dateStr: string | null): string {
  if (!dateStr) return "—";
  const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
  if (days < 0) return `in ${-days}d`;
  if (days === 0) return "Today";
  return `${days}d ago`;
}

function dueStatus(row: SupplierRow): { label: string; color: string } {
  if (row.overdueCount > 0) return { label: "Overdue", color: "text-red-600 bg-red-50" };
  return { label: "Current", color: "text-emerald-600 bg-emerald-50" };
}

/* ═══════════════════════════════════════════════════════
 * Expanded Supplier Detail — invoice list with selection
 * ═══════════════════════════════════════════════════════ */
function SupplierDetail({ supplierId, supplierName, token, locationId, onGenerateCV }: {
  supplierId: string; supplierName: string; token: string; locationId: string;
  onGenerateCV: (supplierId: string, invoiceIds: string[]) => void;
}) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    setLoading(true);
    apiFetch<{ data: Invoice[] }>(`/ap/invoices?supplierId=${supplierId}&status=OPEN&status=PARTIALLY_PAID`, { token, locationId })
      .then((res) => setInvoices(Array.isArray(res.data) ? res.data : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [supplierId, token, locationId]);

  const toggle = (id: string) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const toggleAll = () => {
    if (selected.size === invoices.length) setSelected(new Set());
    else setSelected(new Set(invoices.map((i) => i.id)));
  };

  const selectedTotal = invoices.filter((i) => selected.has(i.id)).reduce((s, i) => s + parseFloat(i.balance || i.totalAmount), 0);

  const handlePrintSOA = () => {
    const printInvoices = selected.size > 0
      ? invoices.filter((i) => selected.has(i.id))
      : invoices;
    const html = buildSupplierSOAHtml({
      supplierName,
      invoices: printInvoices.map((i) => ({
        invoiceNumber: i.invoiceNumber,
        invoiceDate: i.invoiceDate,
        dueDate: i.dueDate,
        totalAmount: parseFloat(i.totalAmount),
        paidAmount: parseFloat(i.paidAmount || "0"),
        balance: parseFloat(i.balance || i.totalAmount),
      })),
    });
    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); w.onload = () => w.print(); }
  };

  if (loading) return <div className="flex items-center gap-2 px-6 py-4 text-[12px] text-muted-foreground"><Loader2 size={14} className="animate-spin" /> Loading invoices...</div>;

  return (
    <div className="bg-muted/20 border-t border-border">
      {/* Invoice table header */}
      <div className="grid grid-cols-[32px_1fr_90px_90px_100px_80px_80px_70px_70px] gap-1 px-6 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground border-b border-border/50">
        <span />
        <span>Invoice #</span>
        <span className="text-right">Date</span>
        <span className="text-right">Due Date</span>
        <span className="text-right">Amount</span>
        <span className="text-right">Paid</span>
        <span className="text-right">Balance</span>
        <span className="text-right">Age</span>
        <span>Status</span>
      </div>

      {invoices.map((inv) => {
        const isOverdue = new Date(inv.dueDate) < new Date();
        const age = daysAgo(inv.dueDate);
        const isSelected = selected.has(inv.id);
        return (
          <div key={inv.id} onClick={() => toggle(inv.id)}
            className={cn("grid grid-cols-[32px_1fr_90px_90px_100px_80px_80px_70px_70px] gap-1 px-6 py-2 text-[12px] border-b border-border/30 cursor-pointer transition-colors",
              isSelected ? "bg-primary/[0.04]" : "hover:bg-accent/30")}>
            <div className="flex items-center">
              {isSelected ? <CheckSquare size={14} className="text-primary" /> : <Square size={14} className="text-muted-foreground/40" />}
            </div>
            <span className="font-mono font-semibold text-foreground">{inv.invoiceNumber || `INV-${inv.id.slice(0, 8)}`}</span>
            <span className="text-right text-muted-foreground">{fmtDate(inv.invoiceDate)}</span>
            <span className={cn("text-right", isOverdue ? "text-red-600 font-medium" : "text-muted-foreground")}>{fmtDate(inv.dueDate)}</span>
            <span className="text-right tabular-nums text-foreground">{fmtPeso(inv.totalAmount)}</span>
            <span className="text-right tabular-nums text-muted-foreground">{fmtPeso(inv.paidAmount || "0")}</span>
            <span className="text-right tabular-nums font-medium text-foreground">{fmtPeso(inv.balance || inv.totalAmount)}</span>
            <span className={cn("text-right tabular-nums", isOverdue ? "text-red-600" : "text-muted-foreground")}>{age}</span>
            <span>
              {isOverdue ? (
                <span className="inline-flex rounded-md bg-red-50 px-1.5 py-0.5 text-[9px] font-semibold text-red-600">Overdue</span>
              ) : (
                <span className="inline-flex rounded-md bg-emerald-50 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-600">Current</span>
              )}
            </span>
          </div>
        );
      })}

      {/* Action bar */}
      <div className="flex items-center justify-between px-6 py-3 bg-muted/30 border-t border-border/50">
        <div className="flex items-center gap-3">
          <button onClick={toggleAll} className="text-[11px] font-medium text-primary hover:underline">
            {selected.size === invoices.length ? "Deselect All" : "Select All"}
          </button>
          {selected.size > 0 && (
            <span className="text-[11px] text-muted-foreground">
              {selected.size} selected &middot; {fmtPeso(selectedTotal)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handlePrintSOA}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-[11px] font-medium text-muted-foreground hover:bg-muted transition-colors">
            <Printer size={12} /> Print SOA {selected.size > 0 ? `(${selected.size})` : "(All)"}
          </button>
          {selected.size > 0 && (
            <button onClick={() => onGenerateCV(supplierId, Array.from(selected))}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-[11px] font-medium text-primary-foreground hover:bg-primary/90">
              <FileText size={12} /> Generate Check Voucher
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
 * Print SOA page (separate route renders print layout)
 * ═══════════════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════════════
 * Main Page
 * ═══════════════════════════════════════════════════════ */
export default function SupplierSOAPage() {
  const { token, locationId, loading: authLoading } = useAuth();
  const router = useRouter();

  const [data, setData] = useState<{ suppliers: SupplierRow[]; summary: Summary } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!token || !locationId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ suppliers: SupplierRow[]; summary: Summary }>("/ap/reports/supplier-soa", { token, locationId });
      setData(res);
    } catch (err: any) {
      setError(err.message || "Failed to load");
    } finally { setLoading(false); }
  }, [token, locationId]);

  useEffect(() => {
    if (!authLoading && token && locationId) fetchData();
  }, [authLoading, token, locationId, fetchData]);

  const suppliers = data?.suppliers ?? [];
  const summary = data?.summary;

  const filtered = useMemo(() => {
    let result = [...suppliers];
    if (search.length >= 2) {
      const q = search.toLowerCase();
      result = result.filter((s) => s.supplierName.toLowerCase().includes(q));
    }
    if (statusFilter === "overdue") result = result.filter((s) => s.overdueCount > 0);
    if (statusFilter === "current") result = result.filter((s) => s.overdueCount === 0);
    return result;
  }, [suppliers, search, statusFilter]);

  const handleGenerateCV = (supplierId: string, invoiceIds: string[]) => {
    const params = new URLSearchParams();
    params.set("supplierId", supplierId);
    params.set("invoiceIds", invoiceIds.join(","));
    router.push(`/ap/check-vouchers/new?${params.toString()}`);
  };

  if (authLoading || loading) {
    return (
      <div className="mx-auto flex h-full max-w-6xl flex-col">
        <div className="mb-6 flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/[0.06]"><FileText size={16} className="text-primary" /></div>
          <h1 className="text-[18px] font-semibold tracking-tight">Supplier Statement of Account</h1>
        </div>
        <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-14 animate-pulse rounded-lg bg-muted" />)}</div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-full max-w-6xl flex-col">
      {/* Header */}
      <div className="mb-5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/[0.06]"><FileText size={16} className="text-primary" /></div>
          <div>
            <h1 className="text-[18px] font-semibold tracking-tight text-foreground">Supplier Statement of Account</h1>
            <p className="text-[13px] text-muted-foreground">View outstanding balances and generate check vouchers</p>
          </div>
        </div>

        {/* KPI cards */}
        {summary && (
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
            <KPICard icon={<DollarSign size={12} />} label="Total Payable" value={fmtPeso(summary.totalPayable)} accent />
            <KPICard icon={<Users size={12} />} label="Suppliers" value={`${summary.supplierCount} w/ balance`} />
            <KPICard icon={<AlertTriangle size={12} />} label="Overdue" value={fmtPeso(summary.totalOverdue)}
              className={summary.totalOverdue > 0 ? "text-red-500" : undefined} />
            <KPICard icon={<Calendar size={12} />} label="Due This Week" value={fmtPeso(summary.dueThisWeek)} />
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="mb-3 rounded-xl border border-border bg-background p-3 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[180px] max-w-md">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search supplier..."
              className="h-8 w-full rounded-lg border border-border bg-background pl-9 pr-8 text-[12px] text-foreground placeholder:text-muted-foreground/60 outline-none focus:border-primary/40 focus:ring-1 focus:ring-primary/20" />
            {search && <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X size={12} /></button>}
          </div>

          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
            className="h-8 rounded-lg border border-border bg-background px-2 text-[12px] text-foreground outline-none focus:border-primary/40">
            <option value="">All Status</option>
            <option value="overdue">Overdue</option>
            <option value="current">Current</option>
          </select>

          {filtered.length > 0 && (
            <button onClick={() => downloadCSV("supplier-soa",
              ["Supplier", "Invoices", "Total Balance", "Overdue", "Oldest", "Status"],
              filtered.map((s) => [s.supplierName, String(s.invoiceCount), s.totalBalance.toFixed(2), s.overdueAmount.toFixed(2), s.oldestInvoiceDate ?? "—", s.overdueCount > 0 ? "Overdue" : "Current"])
            )} className="ml-auto flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-[11px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
              <Download size={12} /> Export CSV
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-2 text-sm text-destructive">
          {error} <button onClick={fetchData} className="ml-2 underline hover:no-underline">Retry</button>
        </div>
      )}

      {/* Supplier table */}
      <div className="overflow-hidden rounded-xl border border-border bg-background shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
        <div className="flex items-center border-b border-border bg-muted/40 px-4 py-2">
          <div className="flex-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Supplier</div>
          <div className="w-20 text-right text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Invoices</div>
          <div className="w-32 text-right text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Total Payable</div>
          <div className="w-24 text-right text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Oldest</div>
          <div className="w-24 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground text-center">Status</div>
        </div>

        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted"><FileText size={16} className="text-muted-foreground" /></div>
            <p className="mt-3 text-[13px] font-medium text-foreground">{search || statusFilter ? "No matching suppliers" : "No outstanding payables"}</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filtered.map((s) => {
              const isExpanded = expandedId === s.supplierId;
              const status = dueStatus(s);
              return (
                <div key={s.supplierId}>
                  <div
                    onClick={() => setExpandedId(isExpanded ? null : s.supplierId)}
                    className={cn("flex items-center px-4 py-3 cursor-pointer transition-colors hover:bg-accent/40", isExpanded && "bg-accent/20")}
                  >
                    <div className="flex-1 min-w-0 flex items-center gap-1.5">
                      {isExpanded ? <ChevronDown size={12} className="text-muted-foreground flex-shrink-0" /> : <ChevronRight size={12} className="text-muted-foreground flex-shrink-0" />}
                      <span className="text-[13px] font-medium text-foreground truncate">{s.supplierName}</span>
                    </div>
                    <div className="w-20 text-right text-[12px] tabular-nums text-foreground">{s.invoiceCount}</div>
                    <div className="w-32 text-right text-[13px] tabular-nums font-semibold text-foreground">{fmtPeso(s.totalBalance)}</div>
                    <div className="w-24 text-right text-[11px] tabular-nums text-muted-foreground">{daysAgo(s.oldestInvoiceDate)}</div>
                    <div className="w-24 text-center">
                      <span className={cn("inline-flex rounded-md px-2 py-0.5 text-[9px] font-semibold", status.color)}>{status.label}</span>
                    </div>
                  </div>
                  {isExpanded && (
                    <SupplierDetail
                      supplierId={s.supplierId}
                      supplierName={s.supplierName}
                      token={token}
                      locationId={locationId}
                      onGenerateCV={handleGenerateCV}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="flex items-center justify-between border-t border-border bg-muted/30 px-4 py-2">
          <span className="text-[11px] text-muted-foreground">{filtered.length} suppliers</span>
          {summary && <span className="text-[11px] text-muted-foreground">Total: {fmtPeso(summary.totalPayable)}</span>}
        </div>
      </div>
    </div>
  );
}

function KPICard({ icon, label, value, accent, className }: { icon: React.ReactNode; label: string; value: string; accent?: boolean; className?: string }) {
  return (
    <div className={cn("rounded-xl border border-border bg-background p-3.5 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]", accent && "border-amber-200 bg-amber-50/30 dark:border-amber-800 dark:bg-amber-950/20")}>
      <div className="flex items-center gap-1.5 text-muted-foreground mb-1">{icon}<span className="text-[11px] font-medium">{label}</span></div>
      <div className={cn("text-[18px] font-bold tabular-nums text-foreground", className)}>{value}</div>
    </div>
  );
}
