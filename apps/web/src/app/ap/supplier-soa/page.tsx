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
  MinusSquare,
  History,
  Ban,
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

type SupplierSOAView = "" | "current" | "due-week" | "overdue" | "critical" | "largest-overdue";

interface Invoice {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  totalAmount: string;
  paidAmount: string;
  balance: string;
  status: string;
  /** True if the invoice is already on a previous non-void supplier SOA. */
  billed?: boolean;
  /** The supplier SOA id that billed this invoice, or null if unbilled. */
  billedSoaId?: string | null;
}

function moneyValue(value: string | number | null | undefined): number {
  const numeric = typeof value === "number" ? value : parseFloat(value || "0");
  return Number.isFinite(numeric) ? numeric : 0;
}

function isCreditMemoInvoice(inv: Pick<Invoice, "invoiceNumber" | "totalAmount">): boolean {
  const invoiceNumber = inv.invoiceNumber?.trim().toUpperCase() ?? "";
  return moneyValue(inv.totalAmount) < 0 || invoiceNumber.startsWith("CM");
}

function invoiceBalance(inv: Pick<Invoice, "balance" | "totalAmount">): number {
  return moneyValue(inv.balance || inv.totalAmount);
}

function toSupplierSOAInvoiceLines(rows: Invoice[]) {
  return rows.map((i) => ({
    invoiceNumber: i.invoiceNumber,
    invoiceDate: i.invoiceDate,
    dueDate: i.dueDate,
    totalAmount: moneyValue(i.totalAmount),
    paidAmount: moneyValue(i.paidAmount),
    balance: moneyValue(i.balance || i.totalAmount),
  }));
}

/** Shape returned by GET /ap/suppliers/:id/soa-history */
interface SupplierSOAHistoryRow {
  id: string;
  soaNumber: string;
  dateFrom: string;
  dateTo: string;
  generatedAt: string;
  totalAmount: number;
  totalPaid: number;
  totalBalance: number;
  invoiceCount: number;
  status: string; // GENERATED | SENT | VOID
  notes: string | null;
}

function overdueDays(dateStr: string | null): number {
  if (!dateStr) return 0;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}

function overdueColor(days: number): string {
  if (days <= 0) return "text-emerald-600";
  if (days <= 30) return "text-amber-600";
  if (days <= 60) return "text-orange-600";
  if (days <= 90) return "text-red-600";
  return "text-red-700 font-bold";
}

function dueStatus(row: SupplierRow): { label: string; color: string } {
  if (row.overdueCount === 0) return { label: "Current", color: "text-emerald-600 bg-emerald-50" };
  const days = overdueDays(row.earliestDueDate);
  if (days <= 30) return { label: "Overdue", color: "text-amber-700 bg-amber-50" };
  if (days <= 90) return { label: "Seriously Overdue", color: "text-red-600 bg-red-50" };
  return { label: "Critical", color: "text-red-700 bg-red-100 font-bold" };
}

function isDueThisWeek(dateStr: string | null): boolean {
  if (!dateStr) return false;
  const due = new Date(dateStr);
  if (Number.isNaN(due.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = new Date(today);
  end.setDate(end.getDate() + 7);
  end.setHours(23, 59, 59, 999);
  return due >= today && due <= end;
}

/** Invoice-level aging text for the AGE column. Plural-aware. */
function ageText(ageDays: number): string {
  if (ageDays < 0) return "Not due";
  if (ageDays === 0) return "Due today";
  if (ageDays === 1) return "1 day overdue";
  return `${ageDays} days overdue`;
}

/** Invoice-level aging bucket for the STATUS pill. 4 buckets per spec. */
function agingBucket(ageDays: number): { label: string; classes: string } {
  if (ageDays <= 0) return { label: "Current", classes: "bg-emerald-50 text-emerald-600" };
  if (ageDays <= 30) return { label: "30d", classes: "bg-blue-50 text-blue-600" };
  if (ageDays <= 60) return { label: "60d", classes: "bg-amber-50 text-amber-700" };
  return { label: "90+", classes: "bg-red-50 text-red-600" };
}

/* ═══════════════════════════════════════════════════════
 * Expanded Supplier Detail — invoice list with selection + BILLED tracking
 * ═══════════════════════════════════════════════════════ */
function SupplierDetail({ supplierId, supplierName, token, locationId, onGenerateCV, onAfterMutation }: {
  supplierId: string; supplierName: string; token: string; locationId: string;
  onGenerateCV: (supplierId: string, invoiceIds: string[]) => void;
  /** Called after generate / void actions so the outer supplier list can refresh totals. */
  onAfterMutation?: () => void;
}) {
  const router = useRouter();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [soaHistory, setSoaHistory] = useState<SupplierSOAHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [generating, setGenerating] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [voidingHistory, setVoidingHistory] = useState<SupplierSOAHistoryRow | null>(null);

  // Derived: only UNBILLED invoices are checkbox-eligible
  const unbilledInvoices = useMemo(
    () => invoices.filter((i) => !i.billed),
    [invoices],
  );

  // Lookup table for the BILLED column: invoice.billedSoaId → soaNumber.
  // soaHistory is loaded in fetchAll alongside invoices, so once that resolves
  // every billed invoice's SOA id should resolve to a number here.
  const soaIdToNumber = useMemo(() => {
    const m = new Map<string, string>();
    for (const h of soaHistory) m.set(h.id, h.soaNumber);
    return m;
  }, [soaHistory]);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      // NOTE: status must be a single comma-separated value, NOT a repeated
      // query param. The backend parses `filters.status.split(",")`. Fastify's
      // default fast-querystring parser turns `?status=OPEN&status=PARTIALLY_PAID`
      // into an array, which fails the `z.string().optional()` zod schema
      // and returns 400 — previously swallowed by `.catch(() => {})`.
      const [invRes, histRes] = await Promise.all([
        apiFetch<{ data: Invoice[] }>(
          `/ap/invoices?supplierId=${supplierId}&status=OPEN,PARTIALLY_PAID&limit=100`,
          { token, locationId },
        ),
        apiFetch<{ data: SupplierSOAHistoryRow[] }>(
          `/ap/suppliers/${supplierId}/soa-history`,
          { token, locationId },
        ),
      ]);
      // Sort invoices newest first (by invoiceDate descending, then id)
      const sorted = Array.isArray(invRes.data)
        ? [...invRes.data].sort((a, b) => new Date(b.invoiceDate).getTime() - new Date(a.invoiceDate).getTime())
        : [];
      setInvoices(sorted);
      setSoaHistory(Array.isArray(histRes.data) ? histRes.data : []);
      // Drop any selections that are no longer eligible (e.g. after a refresh)
      setSelected((prev) => {
        const eligibleIds = new Set(
          (invRes.data ?? []).filter((i: any) => !i.billed).map((i: any) => i.id),
        );
        return new Set([...prev].filter((id) => eligibleIds.has(id)));
      });
    } catch (err: any) {
      setLoadError(err?.message || "Failed to load invoices");
      setInvoices([]);
      setSoaHistory([]);
    } finally {
      setLoading(false);
    }
  }, [supplierId, token, locationId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Checkbox toggle — skipped if the invoice is already billed
  const toggle = (id: string, billed: boolean) => {
    if (billed) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // Select / deselect EVERY unbilled row at once. Billed rows are never touched.
  const selectAllUnbilled = () => {
    if (selected.size === unbilledInvoices.length && unbilledInvoices.length > 0) {
      setSelected(new Set());
    } else {
      setSelected(new Set(unbilledInvoices.map((i) => i.id)));
    }
  };

  const selectedInvoices = useMemo(
    () => invoices.filter((i) => selected.has(i.id)),
    [invoices, selected],
  );

  const invoiceSummary = useMemo(() => {
    let payableBalance = 0;
    let currentBalance = 0;
    let overdueBalance = 0;
    let creditMemoAmount = 0;
    let creditMemoCount = 0;
    let overdueCount = 0;
    let unbilledCount = 0;
    let billedCount = 0;

    for (const invoice of invoices) {
      const balance = invoiceBalance(invoice);
      if (invoice.billed) billedCount += 1;
      else unbilledCount += 1;

      if (isCreditMemoInvoice(invoice)) {
        creditMemoCount += 1;
        creditMemoAmount += Math.abs(balance);
        continue;
      }

      payableBalance += balance;
      if (overdueDays(invoice.dueDate) > 0) {
        overdueCount += 1;
        overdueBalance += balance;
      } else {
        currentBalance += balance;
      }
    }

    return {
      billedCount,
      creditMemoAmount,
      creditMemoCount,
      currentBalance,
      overdueBalance,
      overdueCount,
      payableBalance,
      unbilledCount,
    };
  }, [invoices]);

  const selectedSummary = useMemo(() => {
    let creditMemoAmount = 0;
    let creditMemoCount = 0;
    let payableBalance = 0;
    let overdueBalance = 0;
    let netBalance = 0;

    for (const invoice of selectedInvoices) {
      const balance = invoiceBalance(invoice);
      netBalance += balance;

      if (isCreditMemoInvoice(invoice)) {
        creditMemoCount += 1;
        creditMemoAmount += Math.abs(balance);
        continue;
      }

      payableBalance += balance;
      if (overdueDays(invoice.dueDate) > 0) overdueBalance += balance;
    }

    return {
      creditMemoAmount,
      creditMemoCount,
      netBalance,
      overdueBalance,
      payableBalance,
    };
  }, [selectedInvoices]);

  // ── Preview (all invoices, no persistence) ──
  // Ephemeral print of the current outstanding list. Does NOT mark invoices
  // billed and does NOT create a supplier_soa_records row.
  const handlePreviewAll = () => {
    const html = buildSupplierSOAHtml({
      supplierName,
      invoices: toSupplierSOAInvoiceLines(invoices),
    });
    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); w.onload = () => w.print(); }
  };

  const handlePreviewSelected = () => {
    if (selectedInvoices.length === 0) return;
    const html = buildSupplierSOAHtml({
      supplierName,
      invoices: toSupplierSOAInvoiceLines(selectedInvoices),
    });
    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); w.onload = () => w.print(); }
  };

  // ── Generate persistent SOA from selected invoices ──
  // POST /ap/supplier-soa/generate creates the supplier_soa_records row,
  // snapshots each invoice into supplier_soa_line_items, and marks the
  // invoices billed. The response is then used to print the document.
  const handleGenerateSOA = async () => {
    if (selected.size === 0) return;
    setGenerating(true);
    setActionError(null);
    try {
      const created = await apiFetch<{
        id: string;
        soaNumber: string;
        totalAmount: number;
        totalPaid: number;
        totalBalance: number;
        invoiceCount: number;
      }>(`/ap/supplier-soa/generate`, {
        method: "POST",
        token,
        locationId,
        body: JSON.stringify({
          supplierId,
          invoiceIds: Array.from(selected),
        }),
      });

      // Print from the just-generated persistent snapshot so the printed
      // document reflects exactly what was persisted.
      const snap = await apiFetch<any>(`/ap/supplier-soa/${created.id}`, { token, locationId });
      const html = buildSupplierSOAHtml({
        supplierName: snap.supplier?.name || supplierName,
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
      if (w) { w.document.write(html); w.document.close(); w.onload = () => w.print(); }

      // Refresh so the just-billed invoices grey out and the new SOA shows in history.
      setSelected(new Set());
      await fetchAll();
      onAfterMutation?.();
    } catch (err: any) {
      setActionError(err?.message || "Failed to generate SOA");
    } finally {
      setGenerating(false);
    }
  };

  // ── Reprint a historical SOA from snapshot ──
  const handleReprintHistory = async (soaId: string) => {
    setActionError(null);
    try {
      const snap = await apiFetch<any>(`/ap/supplier-soa/${soaId}`, { token, locationId });
      const html = buildSupplierSOAHtml({
        supplierName: snap.supplier?.name || supplierName,
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
      if (w) { w.document.write(html); w.document.close(); w.onload = () => w.print(); }
    } catch (err: any) {
      setActionError(err?.message || "Failed to reprint");
    }
  };

  // ── Void a historical SOA (unmarks its invoices) ──
  const handleVoidHistory = async () => {
    const row = voidingHistory;
    if (!row) return;
    setActionError(null);
    try {
      await apiFetch(`/ap/supplier-soa/${row.id}`, {
        method: "PATCH",
        token,
        locationId,
        body: JSON.stringify({ status: "VOID" }),
      });
      setVoidingHistory(null);
      await fetchAll();
      onAfterMutation?.();
    } catch (err: any) {
      setActionError(err?.message || "Failed to void SOA");
    }
  };

  if (loading)
    return (
      <div className="flex items-center gap-2 px-6 py-4 text-[12px] text-muted-foreground">
        <Loader2 size={14} className="animate-spin" /> Loading invoices...
      </div>
    );

  if (loadError) {
    return (
      <div className="bg-red-50 border-t border-red-200 px-6 py-3 text-[12px] text-red-700">
        <span className="font-semibold">Failed to load invoices:</span> {loadError}
      </div>
    );
  }

  // Pick the right Select-Unbilled icon based on current selection state
  const selectAllIcon =
    unbilledInvoices.length === 0 ? null
    : selected.size === 0 ? <Square size={12} className="text-primary/60" />
    : selected.size === unbilledInvoices.length ? <CheckSquare size={12} className="text-primary" />
    : <MinusSquare size={12} className="text-primary" />;

  return (
    <div className="bg-muted/20 border-t border-border">
      {/* Invoice table header — extra narrow 'Billed' column at the end */}
      <div className="grid grid-cols-[32px_1fr_90px_90px_100px_80px_80px_100px_70px_90px] gap-1 px-6 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground border-b border-border/50">
        <span />
        <span>Invoice #</span>
        <span className="text-right">Date</span>
        <span className="text-right">Due Date</span>
        <span className="text-right">Amount</span>
        <span className="text-right">Paid</span>
        <span className="text-right">Balance</span>
        <span className="text-right">Age</span>
        <span>Status</span>
        <span className="text-center">Billed</span>
      </div>

      {invoices.length === 0 && (
        <div className="px-6 py-4 text-[12px] italic text-muted-foreground">
          No outstanding invoices for this supplier.
        </div>
      )}

      {invoices.length > 0 && (
        <div className="border-b border-border/50 bg-background px-6 py-3">
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
            <SupplierDetailMetric label="Payable balance" value={fmtPeso(invoiceSummary.payableBalance)} />
            <SupplierDetailMetric
              label="Overdue balance"
              value={fmtPeso(invoiceSummary.overdueBalance)}
              tone={invoiceSummary.overdueBalance > 0 ? "danger" : "muted"}
              detail={invoiceSummary.overdueCount > 0 ? `${invoiceSummary.overdueCount} overdue invoice${invoiceSummary.overdueCount !== 1 ? "s" : ""}` : "No overdue invoices"}
            />
            <SupplierDetailMetric label="Current balance" value={fmtPeso(invoiceSummary.currentBalance)} tone="muted" />
            <SupplierDetailMetric
              label="Credit memos"
              value={invoiceSummary.creditMemoCount > 0 ? `(${fmtPeso(invoiceSummary.creditMemoAmount)})` : "\u2014"}
              tone={invoiceSummary.creditMemoCount > 0 ? "credit" : "muted"}
              detail={invoiceSummary.creditMemoCount > 0 ? `${invoiceSummary.creditMemoCount} credit row${invoiceSummary.creditMemoCount !== 1 ? "s" : ""}` : "None detected"}
            />
            <SupplierDetailMetric
              label="SOA readiness"
              value={`${invoiceSummary.unbilledCount} unbilled`}
              tone={invoiceSummary.unbilledCount > 0 ? "default" : "muted"}
              detail={invoiceSummary.billedCount > 0 ? `${invoiceSummary.billedCount} already billed` : "Ready to select"}
            />
          </div>
          {invoiceSummary.creditMemoCount > 0 && (
            <div className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] leading-5 text-emerald-800">
              Credit memo rows are shown separately in green. Select them with the invoices they should offset before previewing an SOA or creating a voucher.
            </div>
          )}
        </div>
      )}

      {invoices.map((inv) => {
        const isCreditMemo = isCreditMemoInvoice(inv);
        const isOverdue = !isCreditMemo && new Date(inv.dueDate) < new Date();
        const ageDays = overdueDays(inv.dueDate);
        const age = isCreditMemo ? "\u2014" : ageText(ageDays);
        const bucket = agingBucket(ageDays);
        const isSelected = selected.has(inv.id);
        const isBilled = inv.billed === true;
        const billedSoaNumber = inv.billedSoaId ? soaIdToNumber.get(inv.billedSoaId) ?? null : null;
        const billedDisplay = billedSoaNumber ? billedSoaNumber.replace(/^SUPP-SOA-/, "") : null;
        return (
          <div
            key={inv.id}
            onClick={() => toggle(inv.id, isBilled)}
            className={cn(
              "grid grid-cols-[32px_1fr_90px_90px_100px_80px_80px_100px_70px_90px] gap-1 px-6 py-2 text-[12px] border-b border-border/30 transition-colors",
              isBilled && "opacity-50 cursor-not-allowed bg-muted/30",
              isCreditMemo && !isBilled && !isSelected && "bg-emerald-50/30",
              !isBilled && (isSelected ? "bg-primary/[0.04] cursor-pointer" : "hover:bg-accent/30 cursor-pointer"),
            )}
          >
            <div className="flex items-center">
              {isBilled ? (
                <Square size={14} className="text-muted-foreground/30" />
              ) : isSelected ? (
                <CheckSquare size={14} className="text-primary" />
              ) : (
                <Square size={14} className="text-muted-foreground/40" />
              )}
            </div>
            <span className="font-mono font-semibold text-foreground truncate flex items-center gap-1.5">
              {inv.invoiceNumber || `INV-${inv.id.slice(0, 8)}`}
              {isCreditMemo && (
                <span className="inline-flex rounded-md bg-purple-50 px-1.5 py-0.5 text-[9px] font-semibold text-purple-600">CM</span>
              )}
            </span>
            <span className="text-right text-muted-foreground">{fmtDate(inv.invoiceDate)}</span>
            <span className={cn("text-right", isOverdue ? "text-red-600 font-medium" : "text-muted-foreground")}>
              {fmtDate(inv.dueDate)}
            </span>
            <span className={cn("text-right tabular-nums", isCreditMemo ? "text-emerald-600" : "text-foreground")}>
              {isCreditMemo ? `(${fmtPeso(Math.abs(parseFloat(inv.totalAmount)))})` : fmtPeso(inv.totalAmount)}
            </span>
            <span className="text-right tabular-nums text-muted-foreground">{fmtPeso(inv.paidAmount || "0")}</span>
            <span className={cn("text-right tabular-nums font-medium", isCreditMemo ? "text-emerald-600" : "text-foreground")}>
              {isCreditMemo ? `(${fmtPeso(Math.abs(parseFloat(inv.balance || inv.totalAmount)))})` : fmtPeso(inv.balance || inv.totalAmount)}
            </span>
            <span className={cn("text-right tabular-nums", isCreditMemo ? "text-muted-foreground" : ageDays <= 0 ? "text-muted-foreground" : "text-foreground")}>
              {age}
            </span>
            <span>
              {isCreditMemo ? (
                <span className="inline-flex rounded-md bg-purple-50 px-1.5 py-0.5 text-[9px] font-semibold text-purple-600">
                  Credit
                </span>
              ) : (
                <span className={cn("inline-flex rounded-md px-1.5 py-0.5 text-[9px] font-semibold", bucket.classes)}>
                  {bucket.label}
                </span>
              )}
            </span>
            <span className="text-center">
              {billedDisplay ? (
                <button
                  onClick={(e) => { e.stopPropagation(); router.push(`/ap/soa-history?soaNumber=${encodeURIComponent(billedDisplay)}`); }}
                  className="font-mono text-[11px] text-primary hover:underline tabular-nums"
                >
                  {billedDisplay}
                </button>
              ) : (
                <span className="text-muted-foreground">&mdash;</span>
              )}
            </span>
          </div>
        );
      })}

      {/* Action bar */}
      <div className="flex items-center justify-between px-6 py-3 bg-muted/30 border-t border-border/50 flex-wrap gap-2">
        <div className="flex items-center gap-3 flex-wrap">
          {unbilledInvoices.length > 0 && (
            <button
              onClick={selectAllUnbilled}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
            >
              {selectAllIcon}
              {selected.size === unbilledInvoices.length && unbilledInvoices.length > 0
                ? "Deselect All"
                : "Select Unbilled"}
            </button>
          )}
          {selected.size > 0 && (
            <span className="text-[11px] text-muted-foreground">
              {selected.size} selected &middot; Net {fmtPeso(selectedSummary.netBalance)}
              {selectedSummary.creditMemoCount > 0 && (
                <span className="ml-2 text-emerald-700">
                  Credits ({fmtPeso(selectedSummary.creditMemoAmount)})
                </span>
              )}
              {selectedSummary.overdueBalance > 0 && (
                <span className="ml-2 text-red-600">
                  Overdue {fmtPeso(selectedSummary.overdueBalance)}
                </span>
              )}
            </span>
          )}
          {soaHistory.length > 0 && (
            <button
              onClick={() => setShowHistory((v) => !v)}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
            >
              <History size={12} />
              {showHistory ? "Hide" : "Show"} SOA history ({soaHistory.length})
            </button>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handlePreviewAll}
            disabled={invoices.length === 0}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-[11px] font-medium text-muted-foreground hover:bg-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Printer size={12} /> Preview All (no record)
          </button>
          <button
            onClick={handlePreviewSelected}
            disabled={selected.size === 0}
            className="flex items-center gap-1.5 rounded-lg border border-emerald-200 px-3 py-1.5 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-50 transition-colors disabled:cursor-not-allowed disabled:border-border disabled:text-muted-foreground disabled:opacity-40"
          >
            <Printer size={12} /> Preview Selected (no record)
          </button>
          <button
            onClick={handleGenerateSOA}
            disabled={selected.size === 0 || generating}
            className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-emerald-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {generating ? <Loader2 size={12} className="animate-spin" /> : <FileText size={12} />}
            Generate SOA {selected.size > 0 ? `(${selected.size})` : ""}
          </button>
          {selected.size > 0 && (
            <button
              onClick={() => onGenerateCV(supplierId, Array.from(selected))}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-[11px] font-medium text-primary-foreground hover:bg-primary/90"
            >
              <FileText size={12} /> Check Voucher
            </button>
          )}
        </div>
      </div>

      {actionError && (
        <div className="px-6 py-2 text-[11px] text-red-600 bg-red-50 border-t border-red-200">
          {actionError}
        </div>
      )}

      {/* SOA history mini-list */}
      {showHistory && soaHistory.length > 0 && (
        <div className="border-t border-border/50 bg-background/60">
          <div className="px-6 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground border-b border-border/50">
            Supplier SOA History
          </div>
          <div className="divide-y divide-border/40">
            {soaHistory.map((h) => (
              <div
                key={h.id}
                className={cn(
                  "grid grid-cols-[160px_1fr_80px_110px_110px_80px_200px] gap-2 px-6 py-2 text-[11px] items-center",
                  h.status === "VOID" && "opacity-50",
                )}
              >
                <span className="font-mono font-semibold text-foreground">{h.soaNumber}</span>
                <span className="text-muted-foreground">
                  {fmtDate(h.dateFrom)} &ndash; {fmtDate(h.dateTo)}
                </span>
                <span className="text-right tabular-nums text-muted-foreground">
                  {h.invoiceCount} inv
                </span>
                <span className="text-right tabular-nums text-foreground">{fmtPeso(h.totalAmount)}</span>
                <span className="text-right tabular-nums font-semibold text-foreground">{fmtPeso(h.totalBalance)}</span>
                <span className="text-center">
                  <span
                    className={cn(
                      "inline-flex rounded-md px-1.5 py-0.5 text-[9px] font-semibold",
                      h.status === "VOID"
                        ? "bg-red-50 text-red-600"
                        : h.status === "SENT"
                        ? "bg-blue-50 text-blue-600"
                        : "bg-slate-100 text-slate-700",
                    )}
                  >
                    {h.status}
                  </span>
                </span>
                <span className="flex items-center justify-end gap-1">
                  <button
                    onClick={() => handleReprintHistory(h.id)}
                    className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-medium text-primary hover:bg-primary/10"
                  >
                    <Printer size={10} /> Reprint
                  </button>
                  {h.status !== "VOID" && (
                    <button
                      onClick={() => setVoidingHistory(h)}
                      className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-medium text-red-600 hover:bg-red-50"
                    >
                      <Ban size={10} /> Void
                    </button>
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {voidingHistory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-2xl border border-border bg-background p-6 shadow-xl">
            <div className="mb-3 flex items-center gap-2 text-destructive">
              <AlertTriangle size={18} />
              <h2 className="text-lg font-semibold">Void Supplier SOA</h2>
            </div>
            <div className="mb-4 space-y-2 text-sm">
              <div>
                <span className="text-muted-foreground">SOA:</span>{" "}
                <span className="font-mono font-semibold">{voidingHistory.soaNumber}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Supplier:</span>{" "}
                <span className="font-medium">{supplierName}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Amount:</span>{" "}
                <span className="font-semibold tabular-nums">{fmtPeso(voidingHistory.totalAmount)}</span>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                This will unmark the invoices and make them available for a new supplier SOA.
                This action cannot be undone.
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setVoidingHistory(null)}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
              >
                Cancel
              </button>
              <button
                onClick={handleVoidHistory}
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
  const [statusFilter, setStatusFilter] = useState<SupplierSOAView>("");
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

  const searchedSuppliers = useMemo(() => {
    let result = [...suppliers];
    if (search.length >= 2) {
      const q = search.toLowerCase();
      result = result.filter((s) => s.supplierName.toLowerCase().includes(q));
    }
    return result;
  }, [suppliers, search]);

  const filtered = useMemo(() => {
    let result = [...searchedSuppliers];
    if (statusFilter === "overdue") result = result.filter((s) => s.overdueCount > 0);
    if (statusFilter === "current") result = result.filter((s) => s.overdueCount === 0);
    if (statusFilter === "critical") result = result.filter((s) => s.overdueCount > 0 && overdueDays(s.earliestDueDate) > 90);
    if (statusFilter === "due-week") result = result.filter((s) => isDueThisWeek(s.earliestDueDate));
    if (statusFilter === "largest-overdue") {
      result = result
        .filter((s) => s.overdueAmount > 0)
        .sort((a, b) => b.overdueAmount - a.overdueAmount || b.totalBalance - a.totalBalance);
    }
    return result;
  }, [searchedSuppliers, statusFilter]);

  const filteredTotal = useMemo(
    () => filtered.reduce((s, r) => s + r.totalBalance, 0),
    [filtered],
  );
  const filteredOverdue = useMemo(
    () => filtered.reduce((s, r) => s + r.overdueAmount, 0),
    [filtered],
  );
  const quickViews = useMemo(
    () => [
      { key: "" as SupplierSOAView, label: "All", count: searchedSuppliers.length },
      { key: "due-week" as SupplierSOAView, label: "Due this week", count: searchedSuppliers.filter((s) => isDueThisWeek(s.earliestDueDate)).length },
      { key: "overdue" as SupplierSOAView, label: "Overdue", count: searchedSuppliers.filter((s) => s.overdueCount > 0).length },
      { key: "critical" as SupplierSOAView, label: "Critical 90+", count: searchedSuppliers.filter((s) => s.overdueCount > 0 && overdueDays(s.earliestDueDate) > 90).length },
      { key: "largest-overdue" as SupplierSOAView, label: "Largest overdue", count: searchedSuppliers.filter((s) => s.overdueAmount > 0).length },
    ],
    [searchedSuppliers],
  );

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
            <p className="text-[13px] text-muted-foreground">Review aging risk, generate supplier SOAs, and prepare payments</p>
          </div>
        </div>

        {/* KPI cards */}
        {summary && (
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
            <KPICard icon={<DollarSign size={12} />} label="Total Payable" value={fmtPeso(summary.totalPayable)} accent />
            <KPICard icon={<Users size={12} />} label="Suppliers" value={`${summary.supplierCount} supplier${summary.supplierCount !== 1 ? "s" : ""} w/ balance`} />
            <KPICard icon={<AlertTriangle size={12} />} label="Overdue"
              value={`${fmtPeso(summary.totalOverdue)}${summary.totalPayable > 0 ? ` (${((summary.totalOverdue / summary.totalPayable) * 100).toFixed(1)}%)` : ""}`}
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

          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as SupplierSOAView)}
            className="h-8 rounded-lg border border-border bg-background px-2 text-[12px] text-foreground outline-none focus:border-primary/40">
            <option value="">All Status</option>
            <option value="current">Current</option>
            <option value="due-week">Due This Week</option>
            <option value="overdue">Overdue (any)</option>
            <option value="critical">Critical (90+ days)</option>
            <option value="largest-overdue">Largest Overdue</option>
          </select>

          {filtered.length > 0 && (
            <button onClick={() => downloadCSV("supplier-soa",
              ["Supplier", "Invoices", "Total Balance", "Overdue", "Oldest", "Status"],
              filtered.map((s) => [s.supplierName, String(s.invoiceCount), s.totalBalance.toFixed(2), s.overdueAmount.toFixed(2), s.oldestInvoiceDate ?? "\u2014", s.overdueCount > 0 ? "Overdue" : "Current"])
            )} className="ml-auto flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-[11px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
              <Download size={12} /> Export CSV
            </button>
          )}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {quickViews.map((view) => (
            <button
              key={view.key || "all"}
              type="button"
              onClick={() => setStatusFilter(view.key)}
              className={cn(
                "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-medium transition-colors",
                statusFilter === view.key
                  ? "border-primary/30 bg-primary/[0.08] text-primary"
                  : "border-border bg-background text-muted-foreground hover:bg-muted/60 hover:text-foreground",
              )}
            >
              {view.label}
              <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground">
                {view.count}
              </span>
            </button>
          ))}
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
          <div className="w-28 text-right text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Overdue</div>
          <div className="w-24 text-right text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Oldest Due</div>
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
                    className={cn("flex items-center px-4 py-1.5 cursor-pointer transition-colors hover:bg-accent/40", isExpanded && "bg-accent/20")}
                  >
                    <div className="flex-1 min-w-0 flex items-center gap-1.5">
                      {isExpanded ? <ChevronDown size={12} className="text-muted-foreground flex-shrink-0" /> : <ChevronRight size={12} className="text-muted-foreground flex-shrink-0" />}
                      <span className="text-[13px] font-medium text-foreground truncate">{s.supplierName}</span>
                    </div>
                    <div className="w-20 text-right text-[12px] tabular-nums text-foreground">{s.invoiceCount}</div>
                    <div className="w-32 text-right text-[13px] tabular-nums font-semibold text-foreground">{fmtPeso(s.totalBalance)}</div>
                    <div className={cn("w-28 text-right text-[12px] tabular-nums", s.overdueAmount > 0 ? "font-semibold text-red-600" : "text-muted-foreground")}>
                      {s.overdueAmount > 0 ? fmtPeso(s.overdueAmount) : "\u2014"}
                    </div>
                    <div className={cn("w-24 text-right text-[11px] tabular-nums", overdueColor(overdueDays(s.earliestDueDate)))}>
                      {s.earliestDueDate ? fmtDate(s.earliestDueDate) : "\u2014"}
                      {s.overdueCount > 0 && s.earliestDueDate && (
                        <div className="text-[9px] opacity-70">{overdueDays(s.earliestDueDate)}d overdue</div>
                      )}
                    </div>
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
                      onAfterMutation={fetchData}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="flex items-center justify-between border-t border-border bg-muted/30 px-4 py-2">
          <span className="text-[11px] text-muted-foreground">
            {filtered.length} supplier{filtered.length !== 1 ? "s" : ""}
            {data && filtered.length < data.suppliers.length ? ` (of ${data.suppliers.length})` : ""}
          </span>
          <span className="text-[11px] font-semibold tabular-nums text-foreground">
            Total: {fmtPeso(filteredTotal)}
            {filteredOverdue > 0 && <span className="ml-3 text-red-600">Overdue: {fmtPeso(filteredOverdue)}</span>}
          </span>
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

function SupplierDetailMetric({
  detail,
  label,
  tone = "default",
  value,
}: {
  detail?: string;
  label: string;
  tone?: "default" | "danger" | "credit" | "muted";
  value: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-background px-3 py-2">
      <div className="text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">{label}</div>
      <div
        className={cn(
          "mt-1 text-[13px] font-bold tabular-nums text-foreground",
          tone === "danger" && "text-red-600",
          tone === "credit" && "text-emerald-700",
          tone === "muted" && "text-muted-foreground",
        )}
      >
        {value}
      </div>
      {detail && <div className="mt-0.5 text-[10px] text-muted-foreground">{detail}</div>}
    </div>
  );
}
