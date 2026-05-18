"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { FileText, Plus } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/app/auth-context";
import { apiFetch } from "@/lib/api";
import { fmtPeso } from "@/lib/format";

import { InvoiceSummaryCards } from "./components/invoice-summary-cards";
import { InvoiceFilters } from "./components/invoice-filters";
import { InvoiceTable, type Invoice, type SortField, type SortDir } from "./components/invoice-table";
import { RecordInvoiceModal, type RecordInvoiceOutcome } from "./components/record-invoice-modal";
import { EditInvoiceModal, type EditableInvoice } from "./components/edit-invoice-modal";
import { BulkPayDialog } from "./components/bulk-pay-dialog";
import { SupplierDetailDrawer } from "@/app/ap/suppliers/supplier-detail-drawer";

/* ─── Types ─── */

interface Supplier {
  id: string;
  name: string;
  isActive: boolean;
  paymentTermsDays: number | null;
}

interface InvoiceListResponse {
  data: Invoice[];
  nextCursor: string | null;
  hasMore: boolean;
}

function isCreditMemoInvoice(invoice: Pick<Invoice, "invoiceNumber" | "totalAmount">) {
  return parseFloat(invoice.totalAmount) < 0 || /^CM-/i.test(invoice.invoiceNumber);
}

/* ═══════════════════════════════════════════════════ */
/*  Supplier Invoices List Page                        */
/* ═══════════════════════════════════════════════════ */

export default function SupplierInvoicesPage() {
  const { token, locationId, loading: authLoading, user } = useAuth();

  // ── Data state ──
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── Filters ──
  const [supplierFilter, setSupplierFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [search, setSearch] = useState("");

  // ── Sort ──
  const [sortField, setSortField] = useState<SortField>("invoiceDate");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // ── Modals & drawers ──
  const [showRecordModal, setShowRecordModal] = useState(false);
  const [editInvoice, setEditInvoice] = useState<EditableInvoice | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [voidTarget, setVoidTarget] = useState<Invoice | null>(null);
  const [viewSupplierId, setViewSupplierId] = useState<string | null>(null);

  // ── Bulk pay ──
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkPayDialog, setShowBulkPayDialog] = useState(false);

  // ── Reference data ──
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [summary, setSummary] = useState({
    totalOpen: 0,
    overdueAmount: 0,
    dueThisWeek: 0,
    invoiceCount: 0,
  });

  // ── Row highlight (tap a success toast to scroll + pulse matching rows) ──
  const [highlightedIds, setHighlightedIds] = useState<Set<string>>(new Set());
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear any pending timer on unmount.
  useEffect(() => {
    return () => {
      if (highlightTimer.current) clearTimeout(highlightTimer.current);
    };
  }, []);

  const pulseRows = useCallback((ids: string[]) => {
    if (ids.length === 0) return;
    setHighlightedIds(new Set(ids));
    // Scroll the first row into view — the row DOM id is set by InvoiceTable.
    setTimeout(() => {
      const firstRow = document.getElementById(`invoice-row-${ids[0]}`);
      firstRow?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 50);
    // Clear the highlight after the pulse animation completes.
    if (highlightTimer.current) clearTimeout(highlightTimer.current);
    highlightTimer.current = setTimeout(() => setHighlightedIds(new Set()), 1500);
  }, []);

  // ── Fetch suppliers ──
  const fetchSuppliers = useCallback(async () => {
    if (!token || !locationId) return;
    try {
      const res = await apiFetch<{ data: Supplier[] }>(
        "/procurement/suppliers",
        { token, locationId },
      );
      setSuppliers(res.data);
    } catch {
      toast.error("Failed to load suppliers");
    }
  }, [token, locationId]);

  // ── Fetch invoices + summary ──
  const fetchInvoices = useCallback(
    async () => {
      if (!token || !locationId) return;
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        params.set("limit", "5000");
        if (supplierFilter) params.set("supplierId", supplierFilter);
        if (statusFilter) params.set("status", statusFilter);
        if (overdueOnly) params.set("overdue", "true");
        if (dateFrom) params.set("dateFrom", dateFrom);
        if (dateTo) params.set("dateTo", dateTo);
        if (search) params.set("search", search);

        const res = await apiFetch<InvoiceListResponse>(
          `/ap/invoices?${params.toString()}`,
          { token, locationId },
        );
        setInvoices(res.data);
        setSelectedIds(new Set());

        // Fetch summary
        try {
          const sumRes = await apiFetch<Record<string, string>>("/ap/reports/summary", { token, locationId });
          setSummary({
            totalOpen: parseFloat(sumRes.total_payables ?? "0"),
            overdueAmount: parseFloat(sumRes.total_overdue ?? "0"),
            dueThisWeek: parseFloat(sumRes.due_this_week ?? "0"),
            invoiceCount: parseInt(sumRes.invoice_count ?? "0", 10),
          });
        } catch {
          toast.error("Failed to load summary");
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Failed to load invoices";
        setError(message);
      } finally {
        setLoading(false);
      }
    },
    [token, locationId, supplierFilter, statusFilter, overdueOnly, dateFrom, dateTo, search],
  );

  useEffect(() => {
    if (!authLoading && token && locationId) {
      fetchInvoices();
      fetchSuppliers();
    }
  }, [authLoading, token, locationId, fetchInvoices, fetchSuppliers]);

  // ── Selection helpers ──
  const payableInvoices = useMemo(
    () => invoices.filter((inv) =>
      !isCreditMemoInvoice(inv) && (inv.status === "OPEN" || inv.status === "PARTIALLY_PAID")
    ),
    [invoices],
  );

  const selectedTotal = useMemo(
    () =>
      invoices
        .filter((inv) => selectedIds.has(inv.id))
        .reduce((sum, inv) => sum + parseFloat(inv.balance), 0),
    [invoices, selectedIds],
  );

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === payableInvoices.length && payableInvoices.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(payableInvoices.map((inv) => inv.id)));
    }
  };

  // ── Sort handler ──
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

  // ── Record Invoice success/partial handler ──
  //
  // Three outcomes the server reports:
  //   (a) All rows created           → success toast, auto-dismiss 4s, tap to pulse new rows
  //   (b) Some rows failed (partial) → warning toast summarising both counts
  //   (c) All rows failed            → (handled inside the modal) modal stays open, no toast here
  //
  // Because the bulk-create endpoint does not return invoice IDs (response shape frozen per
  // the Item List audit), we refetch the list first, then resolve the newly-created invoices
  // by matching (supplierId, invoiceNumber). Only then can we trigger the row pulse.
  const handleRecordInvoiceOutcome = useCallback(
    async (outcome: RecordInvoiceOutcome) => {
      // Kick off the list refresh — summary cards + list both update off this single call.
      await fetchInvoices();

      // Build the toast BEFORE resolving IDs so the user sees feedback within ~100ms of the
      // API response. The tap-to-navigate action resolves IDs lazily on click.
      const single = outcome.successInvoiceNumbers.length === 1;
      const soleInvoiceNumber = single ? outcome.successInvoiceNumbers[0] : null;
      const hasErrors = outcome.errors.length > 0;
      const creditMemoCount = outcome.successCreditMemoNumbers.length;
      const invoiceCount = outcome.successInvoiceNumbers.length - creditMemoCount;
      const amountText = single && creditMemoCount === 1
        ? `Credit ${fmtPeso(Math.abs(outcome.successTotal))}`
        : fmtPeso(outcome.successTotal);

      const title = hasErrors
        ? `${outcome.created} created, ${outcome.errors.length} failed`
        : single && creditMemoCount === 1
          ? `Credit memo ${soleInvoiceNumber} recorded`
        : single
          ? `Invoice ${soleInvoiceNumber} recorded`
        : invoiceCount === 0 && creditMemoCount > 0
          ? `${creditMemoCount} credit memos recorded`
        : invoiceCount > 0 && creditMemoCount > 0
          ? `${invoiceCount} invoices + ${creditMemoCount} credit memo${creditMemoCount !== 1 ? "s" : ""} recorded`
          : `${outcome.created} invoices recorded`;

      const description = single
        ? `${outcome.supplierName} · ${amountText}`
        : `${outcome.supplierName} · ${amountText} total`;

      // `pulseRows` needs the fresh list in state — setState is async, so grab the latest
      // via a ref-style read inside the action handler.
      const action = {
        label: single ? "View" : "View rows",
        onClick: () => {
          // Pull the latest invoices from state at click-time.
          setInvoices((current) => {
            const matched = current
              .filter(
                (inv) =>
                  inv.supplierId === outcome.supplierId &&
                  outcome.successInvoiceNumbers.includes(inv.invoiceNumber),
              )
              .map((inv) => inv.id);
            if (matched.length > 0) pulseRows(matched);
            return current; // no-op setter — we only needed read access to `current`
          });
        },
      };

      if (hasErrors) {
        // Partial success: surface both sides. Longer duration, action still available.
        toast.warning(title, {
          description: `${description} — ${outcome.errors
            .map((e) => `${e.invoiceNumber}: ${e.message}`)
            .join(", ")}`,
          duration: 6000,
          action,
        });
      } else {
        toast.success(title, {
          description,
          duration: 4000,
          action,
        });
      }
    },
    [fetchInvoices, pulseRows],
  );

  // ── Edit handler ──
  const handleEdit = (inv: Invoice) => {
    setEditInvoice({
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      invoiceDate: inv.invoiceDate,
      supplierName: inv.supplierName,
      totalAmount: inv.totalAmount,
      paymentTermsDays: inv.paymentTermsDays,
      notes: inv.notes,
    });
    setShowEditModal(true);
  };

  // ── Void handler ──
  const handleVoidRequest = (inv: Invoice) => {
    setVoidTarget(inv);
  };

  // ── Single-row Mark as Paid ──
  // Reuses BulkPayDialog with a one-element selection set, matching the
  // bulk flow 1:1 per spec ("same as bulk Mark as Paid button for 1 row").
  const handleMarkAsPaidSingle = (inv: Invoice) => {
    setSelectedIds(new Set([inv.id]));
    setShowBulkPayDialog(true);
  };

  const confirmVoid = async () => {
    if (!voidTarget || !token || !locationId) return;
    try {
      await apiFetch(`/ap/invoices/${voidTarget.id}/void`, {
        token,
        locationId,
        method: "POST",
      });
      toast.success(`Invoice ${voidTarget.invoiceNumber} voided`);
      setVoidTarget(null);
      fetchInvoices();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to void invoice";
      toast.error(message, { duration: Infinity });
    }
  };

  // ── Auth loading ──
  if (authLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-sm text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Toasts are rendered globally via <Toaster /> in app/layout.tsx — no per-page host needed. */}

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
          onClick={() => setShowRecordModal(true)}
          className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
        >
          <Plus size={14} />
          Record Invoice
        </button>
      </div>

      <InvoiceSummaryCards summary={summary} />

      <InvoiceFilters
        suppliers={suppliers}
        supplierFilter={supplierFilter}
        onSupplierFilterChange={setSupplierFilter}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        overdueOnly={overdueOnly}
        onOverdueOnlyChange={setOverdueOnly}
        dateFrom={dateFrom}
        dateTo={dateTo}
        onDateRangeChange={(start, end) => { setDateFrom(start); setDateTo(end); }}
        onSearchChange={setSearch}
      />

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

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="mb-2 flex items-center justify-between rounded-lg border border-primary/20 bg-primary/[0.03] px-4 py-1.5">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium">
              {selectedIds.size} invoice{selectedIds.size !== 1 ? "s" : ""} selected
            </span>
            <span className="text-sm text-muted-foreground">
              Total: {fmtPeso(selectedTotal)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSelectedIds(new Set())}
              className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted"
            >
              Clear
            </button>
            <button
              onClick={() => setShowBulkPayDialog(true)}
              className="rounded-lg bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
            >
              Mark as Paid
            </button>
          </div>
        </div>
      )}

      <InvoiceTable
        invoices={invoices}
        loading={loading}
        sortField={sortField}
        sortDir={sortDir}
        onSort={handleSort}
        selectedIds={selectedIds}
        onToggleSelect={toggleSelect}
        onToggleSelectAll={toggleSelectAll}
        onEdit={handleEdit}
        onVoid={handleVoidRequest}
        onViewSupplier={setViewSupplierId}
        onMarkAsPaid={handleMarkAsPaidSingle}
        highlightedIds={highlightedIds}
      />

      {/* Void Confirmation Dialog */}
      {voidTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-sm rounded-xl border border-border bg-background p-6 shadow-xl">
            <h3 className="text-lg font-semibold">Void Invoice</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Are you sure you want to void invoice{" "}
              <span className="font-semibold text-foreground">{voidTarget.invoiceNumber}</span>?
              This action cannot be undone.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setVoidTarget(null)}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
              >
                Cancel
              </button>
              <button
                onClick={confirmVoid}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
              >
                Void Invoice
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Record Invoice Modal */}
      <RecordInvoiceModal
        open={showRecordModal}
        onClose={() => setShowRecordModal(false)}
        onCreated={handleRecordInvoiceOutcome}
        token={token!}
        locationId={locationId!}
      />

      {/* Edit Invoice Modal */}
      <EditInvoiceModal
        open={showEditModal}
        invoice={editInvoice}
        onClose={() => { setShowEditModal(false); setEditInvoice(null); }}
        onUpdated={() => fetchInvoices()}
        token={token!}
        locationId={locationId!}
      />

      {/* Supplier Detail Drawer */}
      {viewSupplierId && (
        <SupplierDetailDrawer
          supplierId={viewSupplierId}
          token={token!}
          locationId={locationId!}
          canEdit={user?.role === "ADMIN" || user?.role === "MANAGER"}
          onClose={() => setViewSupplierId(null)}
          onSaved={() => {}}
        />
      )}

      {/* Bulk Pay Dialog */}
      <BulkPayDialog
        open={showBulkPayDialog}
        onClose={() => setShowBulkPayDialog(false)}
        onSuccess={() => {
          fetchInvoices();
          setSelectedIds(new Set());
        }}
        invoiceCount={selectedIds.size}
        totalAmount={selectedTotal}
        invoiceIds={Array.from(selectedIds)}
        token={token!}
        locationId={locationId!}
      />
    </div>
  );
}
