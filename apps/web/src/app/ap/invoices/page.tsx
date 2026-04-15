"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { FileText, Plus } from "lucide-react";
import { useAuth } from "@/app/auth-context";
import { apiFetch } from "@/lib/api";
import { fmtPeso } from "@/lib/format";

import { InvoiceSummaryCards } from "./components/invoice-summary-cards";
import { InvoiceFilters } from "./components/invoice-filters";
import { InvoiceTable, type Invoice, type SortField, type SortDir } from "./components/invoice-table";
import { RecordInvoiceModal } from "./components/record-invoice-modal";
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

  // ── Notifications ──
  const [notification, setNotification] = useState<{ type: "success" | "error"; message: string } | null>(null);

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

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
      setNotification({ type: "error", message: "Failed to load suppliers" });
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
          setNotification({ type: "error", message: "Failed to load summary" });
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
    () => invoices.filter((inv) => inv.status === "OPEN" || inv.status === "PARTIALLY_PAID"),
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

  const confirmVoid = async () => {
    if (!voidTarget || !token || !locationId) return;
    try {
      await apiFetch(`/ap/invoices/${voidTarget.id}/void`, {
        token,
        locationId,
        method: "POST",
      });
      setNotification({ type: "success", message: `Invoice ${voidTarget.invoiceNumber} voided` });
      setVoidTarget(null);
      fetchInvoices();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to void invoice";
      setNotification({ type: "error", message });
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
      {/* Notification toast */}
      {notification && (
        <div
          className={`fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-lg border px-4 py-1.5 text-[13px] font-medium shadow-lg animate-in slide-in-from-bottom-2 ${
            notification.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-destructive/30 bg-destructive/5 text-destructive"
          }`}
        >
          {notification.message}
        </div>
      )}

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
        onCreated={() => fetchInvoices()}
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
