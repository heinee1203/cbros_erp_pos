"use client";

/**
 * Supplier List — AP master data page.
 *
 * Mirrors the Customer List pattern: summary cards on top, then a
 * searchable / filterable / sortable table with per-row AP rollups
 * (open invoice count, total payable, oldest overdue). Clicking a row
 * opens the Supplier Detail drawer for viewing + editing.
 *
 * Data source:
 *   GET  /ap/suppliers                  — list with stats
 *   GET  /ap/suppliers/:id              — detail (used by the drawer)
 *   POST /ap/suppliers                  — create
 *   PATCH /ap/suppliers/:id             — update / deactivate
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Users,
  Plus,
  Search,
  DollarSign,
  AlertTriangle,
  Download,
  X,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  Circle,
  CheckSquare,
  Square,
  MinusSquare,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/app/auth-context";
import { apiFetch } from "@/lib/api";
import { fmtPeso } from "@/lib/format";
import { downloadCSV } from "@/lib/csv-export";
import { SupplierDetailDrawer, type SupplierDetail } from "./supplier-detail-drawer";

/* ─── Types ─── */

interface SupplierRow {
  id: string;
  name: string;
  contactPerson: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  address: string | null;
  tin: string | null;
  mnemonicCode: string | null;
  paymentTermsDays: number;
  creditLimit: number;
  bankName: string | null;
  bankAccountNumber: string | null;
  bankAccountName: string | null;
  notes: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  // Rollups
  openCount: number;
  totalPayable: number;
  overdueCount: number;
  overdueAmount: number;
  oldestOverdueDate: string | null;
}

type SortCol =
  | "name"
  | "contactPerson"
  | "paymentTermsDays"
  | "creditLimit"
  | "openCount"
  | "totalPayable"
  | "oldestOverdueDate"
  | "status";
type SortDir = "asc" | "desc";

/* ─── Helpers ─── */

function daysAgoFromDate(iso: string | null): string {
  if (!iso) return "—";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days < 0) return `in ${-days}d`;
  if (days === 0) return "Today";
  return `${days}d ago`;
}

function termsLabel(days: number): string {
  return days === 0 ? "COD" : `Net ${days}`;
}

/* ─── Sortable column header ─── */

function SortableHeader({
  label,
  field,
  activeField,
  activeDir,
  onSort,
  align = "left",
}: {
  label: string;
  field: SortCol;
  activeField: SortCol;
  activeDir: SortDir;
  onSort: (f: SortCol) => void;
  align?: "left" | "right";
}) {
  const isActive = field === activeField;
  return (
    <button
      onClick={() => onSort(field)}
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

/* ═══════════════════════════════════════════════════ */
/*  Bulk Set Terms Dialog                               */
/* ═══════════════════════════════════════════════════ */

const PAYMENT_TERMS = [
  { value: 0, label: "COD" },
  { value: 7, label: "Net 7" },
  { value: 15, label: "Net 15" },
  { value: 30, label: "Net 30" },
  { value: 45, label: "Net 45" },
  { value: 60, label: "Net 60" },
  { value: 90, label: "Net 90" },
  { value: 120, label: "Net 120" },
  { value: 150, label: "Net 150" },
  { value: 180, label: "Net 180" },
];

function SetTermsDialog({
  open,
  onClose,
  onSuccess,
  supplierIds,
  supplierNames,
  token,
  locationId,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  supplierIds: string[];
  supplierNames: string[];
  token: string;
  locationId: string;
}) {
  const [termsDays, setTermsDays] = useState(30);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ updatedCount: number } | null>(null);

  useEffect(() => {
    if (open) {
      setTermsDays(30);
      setError(null);
      setResult(null);
    }
  }, [open]);

  const handleConfirm = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await apiFetch<{ updatedCount: number }>(
        "/ap/suppliers/bulk-terms",
        {
          token,
          locationId,
          method: "PATCH",
          body: JSON.stringify({
            supplierIds,
            paymentTermsDays: termsDays,
          }),
        },
      );
      setResult(res);
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 1000);
    } catch (err: any) {
      setError(err.message || "Failed to update terms");
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-2xl border border-border bg-background p-6 shadow-xl">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Set Payment Terms</h2>
          <button onClick={onClose} className="rounded-md p-1 hover:bg-muted">
            <X size={16} />
          </button>
        </div>

        {/* Success */}
        {result ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-center">
            <p className="text-sm font-semibold text-emerald-700">
              Updated {result.updatedCount} supplier{result.updatedCount !== 1 ? "s" : ""} to{" "}
              {termsLabel(termsDays)}
            </p>
          </div>
        ) : (
          <>
            {/* Summary */}
            <div className="mb-4 rounded-lg border border-primary/20 bg-primary/[0.03] p-3">
              <p className="text-sm">
                Update payment terms for{" "}
                <span className="font-semibold">{supplierIds.length}</span>{" "}
                supplier{supplierIds.length !== 1 ? "s" : ""}
              </p>
            </div>

            {error && (
              <div className="mb-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                {error}
              </div>
            )}

            {/* Terms dropdown */}
            <div className="mb-4">
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Payment Terms
              </label>
              <select
                value={termsDays}
                onChange={(e) => setTermsDays(Number(e.target.value))}
                className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary"
              >
                {PAYMENT_TERMS.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Supplier names list */}
            <div className="mb-4">
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Selected Suppliers
              </label>
              <div className="max-h-32 overflow-y-auto rounded-lg border border-border bg-muted/20 p-2">
                {supplierNames.map((name, i) => (
                  <div
                    key={i}
                    className="truncate py-0.5 text-xs text-muted-foreground"
                  >
                    {name}
                  </div>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2">
              <button
                onClick={onClose}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                disabled={submitting}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {submitting ? "Updating…" : `Set to ${termsLabel(termsDays)}`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════ */
/*  Supplier List Page                                  */
/* ═══════════════════════════════════════════════════ */

export default function SupplierListPage() {
  const { token, locationId, user, loading: authLoading } = useAuth();
  const isManager = user?.role === "ADMIN" || user?.role === "MANAGER";

  const [suppliers, setSuppliers] = useState<SupplierRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [hasOverdue, setHasOverdue] = useState(false);
  const [sortCol, setSortCol] = useState<SortCol>("totalPayable");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // Drawer state — auto-open from ?open= query param
  const searchParams = useSearchParams() ?? new URLSearchParams();
  const [drawerSupplierId, setDrawerSupplierId] = useState<string | null>(
    searchParams.get("open"),
  );
  const [showNewModal, setShowNewModal] = useState(false);

  // Bulk set terms
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showSetTermsDialog, setShowSetTermsDialog] = useState(false);

  const fetchData = useCallback(async () => {
    if (!token || !locationId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ data: SupplierRow[] }>("/ap/suppliers", {
        token,
        locationId,
      });
      setSuppliers(res.data || []);
      setSelectedIds(new Set());
    } catch (err: any) {
      setError(err?.message || "Failed to load suppliers");
    } finally {
      setLoading(false);
    }
  }, [token, locationId]);

  useEffect(() => {
    if (!authLoading && token && locationId) fetchData();
  }, [authLoading, token, locationId, fetchData]);

  const handleSort = (field: SortCol) => {
    if (field === sortCol) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortCol(field);
      setSortDir(field === "name" || field === "contactPerson" ? "asc" : "desc");
    }
  };

  // ── Bulk selection helpers ──
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Filter + sort
  const filteredAndSorted = useMemo(() => {
    let rows = suppliers;
    if (!showInactive) rows = rows.filter((r) => r.isActive);
    if (hasOverdue) rows = rows.filter((r) => r.overdueCount > 0);
    if (search.trim().length >= 1) {
      const q = search.toLowerCase();
      rows = rows.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          (r.contactPerson ?? "").toLowerCase().includes(q) ||
          (r.contactPhone ?? "").toLowerCase().includes(q) ||
          (r.tin ?? "").toLowerCase().includes(q) ||
          (r.mnemonicCode ?? "").toLowerCase().includes(q),
      );
    }
    const copy = [...rows];
    copy.sort((a, b) => {
      let cmp: number;
      switch (sortCol) {
        case "name":
          cmp = (a.name || "").localeCompare(b.name || "");
          break;
        case "contactPerson":
          cmp = (a.contactPerson ?? "").localeCompare(b.contactPerson ?? "");
          break;
        case "paymentTermsDays":
          cmp = a.paymentTermsDays - b.paymentTermsDays;
          break;
        case "creditLimit":
          cmp = a.creditLimit - b.creditLimit;
          break;
        case "openCount":
          cmp = a.openCount - b.openCount;
          break;
        case "totalPayable":
          cmp = a.totalPayable - b.totalPayable;
          break;
        case "oldestOverdueDate": {
          const va = a.oldestOverdueDate ? new Date(a.oldestOverdueDate).getTime() : Infinity;
          const vb = b.oldestOverdueDate ? new Date(b.oldestOverdueDate).getTime() : Infinity;
          cmp = va - vb;
          break;
        }
        case "status":
          cmp = Number(a.isActive) - Number(b.isActive);
          break;
        default:
          cmp = 0;
      }
      return sortDir === "desc" ? -cmp : cmp;
    });
    return copy;
  }, [suppliers, search, showInactive, hasOverdue, sortCol, sortDir]);

  const toggleSelectAll = () => {
    if (
      selectedIds.size === filteredAndSorted.length &&
      filteredAndSorted.length > 0
    ) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredAndSorted.map((s) => s.id)));
    }
  };

  const selectedNames = useMemo(
    () =>
      filteredAndSorted
        .filter((s) => selectedIds.has(s.id))
        .map((s) => s.name),
    [filteredAndSorted, selectedIds],
  );

  // Summary cards
  const summary = useMemo(() => {
    const activeOnly = suppliers.filter((s) => s.isActive);
    return {
      totalSuppliers: suppliers.length,
      activeCount: activeOnly.length,
      withBalance: activeOnly.filter((s) => s.totalPayable > 0).length,
      totalPayable: activeOnly.reduce((sum, s) => sum + s.totalPayable, 0),
      overdueCount: activeOnly.filter((s) => s.overdueCount > 0).length,
      overdueAmount: activeOnly.reduce((sum, s) => sum + s.overdueAmount, 0),
    };
  }, [suppliers]);

  const handleExportCSV = () => {
    const headers = [
      "Supplier",
      "Contact Person",
      "Phone",
      "Email",
      "Terms",
      "Credit Limit",
      "Open Invoices",
      "Total Payable",
      "Overdue Amount",
      "Oldest Overdue",
      "Status",
    ];
    downloadCSV(
      "suppliers",
      headers,
      filteredAndSorted.map((s) => [
        s.name,
        s.contactPerson ?? "",
        s.contactPhone ?? "",
        s.contactEmail ?? "",
        termsLabel(s.paymentTermsDays),
        s.creditLimit.toFixed(2),
        String(s.openCount),
        s.totalPayable.toFixed(2),
        s.overdueAmount.toFixed(2),
        s.oldestOverdueDate ?? "",
        s.isActive ? "Active" : "Inactive",
      ]),
    );
  };

  const handleAfterSave = () => {
    fetchData();
  };

  return (
    <div className="mx-auto flex h-full max-w-7xl flex-col">
      {/* Header */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/[0.06]">
            <Users size={16} className="text-primary" />
          </div>
          <div>
            <h1 className="text-[18px] font-semibold tracking-tight text-foreground">
              Suppliers
            </h1>
            <p className="text-[13px] text-muted-foreground">
              Supplier master data + AP rollups
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {filteredAndSorted.length > 0 && (
            <button
              onClick={handleExportCSV}
              className="flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-[11px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <Download size={12} /> Export CSV
            </button>
          )}
          {isManager && (
            <button
              onClick={() => setShowNewModal(true)}
              className="flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-[12px] font-semibold text-primary-foreground hover:bg-primary/90"
            >
              <Plus size={14} />
              Add Supplier
            </button>
          )}
        </div>
      </div>

      {/* Summary cards */}
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KPICard
          icon={<Users size={14} />}
          label="Total Suppliers"
          value={String(summary.totalSuppliers)}
          sub={`${summary.activeCount} active`}
        />
        <KPICard
          icon={<Users size={14} />}
          label="With Balance"
          value={String(summary.withBalance)}
          sub="active suppliers"
        />
        <KPICard
          icon={<DollarSign size={14} />}
          label="Total Payable"
          value={fmtPeso(summary.totalPayable)}
          accent
        />
        <KPICard
          icon={<AlertTriangle size={14} />}
          label="Overdue"
          value={fmtPeso(summary.overdueAmount)}
          sub={`${summary.overdueCount} supplier${summary.overdueCount === 1 ? "" : "s"}`}
          danger={summary.overdueAmount > 0}
        />
      </div>

      {/* Filters */}
      <div className="mb-3 rounded-xl border border-border bg-background p-3 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search
              size={14}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, contact, phone, TIN…"
              className="h-8 w-full rounded-lg border border-border bg-background pl-9 pr-8 text-[12px] text-foreground placeholder:text-muted-foreground/60 outline-none focus:border-primary/40 focus:ring-1 focus:ring-primary/20"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X size={12} />
              </button>
            )}
          </div>
          <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={hasOverdue}
              onChange={(e) => setHasOverdue(e.target.checked)}
              className="rounded border-border"
            />
            Has overdue
          </label>
          <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
              className="rounded border-border"
            />
            Include inactive
          </label>
        </div>
      </div>

      {error && (
        <div className="mb-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-2 text-sm text-destructive">
          {error}
          <button onClick={fetchData} className="ml-2 underline hover:no-underline">
            Retry
          </button>
        </div>
      )}

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="mb-2 flex items-center justify-between rounded-lg border border-primary/20 bg-primary/[0.03] px-4 py-1.5">
          <span className="text-sm font-medium">
            {selectedIds.size} supplier{selectedIds.size !== 1 ? "s" : ""} selected
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSelectedIds(new Set())}
              className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted"
            >
              Clear
            </button>
            <button
              onClick={() => setShowSetTermsDialog(true)}
              className="rounded-lg bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
            >
              Set Terms
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-border bg-background shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="w-10 px-2 py-1.5">
                  {filteredAndSorted.length > 0 && (
                    <button
                      onClick={toggleSelectAll}
                      className="flex items-center justify-center"
                    >
                      {selectedIds.size === 0 ? (
                        <Square size={14} className="text-muted-foreground/40" />
                      ) : selectedIds.size === filteredAndSorted.length ? (
                        <CheckSquare size={14} className="text-primary" />
                      ) : (
                        <MinusSquare size={14} className="text-primary" />
                      )}
                    </button>
                  )}
                </th>
                <th className="px-3 py-1.5 text-left">
                  <SortableHeader label="Supplier" field="name" activeField={sortCol} activeDir={sortDir} onSort={handleSort} align="left" />
                </th>
                <th className="px-3 py-1.5 text-left">
                  <SortableHeader label="Contact Person" field="contactPerson" activeField={sortCol} activeDir={sortDir} onSort={handleSort} align="left" />
                </th>
                <th className="px-3 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Phone
                </th>
                <th className="px-3 py-1.5 text-left">
                  <SortableHeader label="Terms" field="paymentTermsDays" activeField={sortCol} activeDir={sortDir} onSort={handleSort} align="left" />
                </th>
                <th className="px-3 py-1.5 text-right">
                  <SortableHeader label="Credit Limit" field="creditLimit" activeField={sortCol} activeDir={sortDir} onSort={handleSort} align="right" />
                </th>
                <th className="px-3 py-1.5 text-right">
                  <SortableHeader label="Open Inv" field="openCount" activeField={sortCol} activeDir={sortDir} onSort={handleSort} align="right" />
                </th>
                <th className="px-3 py-1.5 text-right">
                  <SortableHeader label="Total Payable" field="totalPayable" activeField={sortCol} activeDir={sortDir} onSort={handleSort} align="right" />
                </th>
                <th className="px-3 py-1.5 text-right">
                  <SortableHeader label="Oldest Overdue" field="oldestOverdueDate" activeField={sortCol} activeDir={sortDir} onSort={handleSort} align="right" />
                </th>
                <th className="px-3 py-1.5 text-center">
                  <SortableHeader label="Status" field="status" activeField={sortCol} activeDir={sortDir} onSort={handleSort} align="right" />
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="border-b border-border">
                    <td colSpan={10} className="px-3 py-1.5">
                      <div className="h-5 animate-pulse rounded bg-muted" />
                    </td>
                  </tr>
                ))
              ) : filteredAndSorted.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-3 py-12 text-center text-sm text-muted-foreground">
                    {suppliers.length === 0
                      ? "No suppliers yet. Click \u201cAdd Supplier\u201d to create one."
                      : "No suppliers match the filter."}
                  </td>
                </tr>
              ) : (
                filteredAndSorted.map((s, i) => {
                  const overdue = s.overdueAmount > 0;
                  return (
                    <tr
                      key={s.id}
                      onClick={() => setDrawerSupplierId(s.id)}
                      className={cn(
                        "border-b border-border cursor-pointer transition-colors hover:bg-accent/50",
                        i % 2 === 0 ? "bg-background" : "bg-muted/10",
                        !s.isActive && "opacity-50",
                      )}
                    >
                      <td
                        className="w-10 px-2 py-1.5"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          onClick={() => toggleSelect(s.id)}
                          className="flex items-center justify-center"
                        >
                          {selectedIds.has(s.id) ? (
                            <CheckSquare size={14} className="text-primary" />
                          ) : (
                            <Square size={14} className="text-muted-foreground/40" />
                          )}
                        </button>
                      </td>
                      <td className="px-3 py-1.5 text-[13px] font-medium text-foreground">
                        {s.name}
                      </td>
                      <td className="px-3 py-1.5 text-[12px] text-muted-foreground">
                        {s.contactPerson ?? "—"}
                      </td>
                      <td className="px-3 py-1.5 text-[12px] text-muted-foreground">
                        {s.contactPhone ?? "—"}
                      </td>
                      <td className="px-3 py-1.5 text-[12px] text-muted-foreground">
                        {termsLabel(s.paymentTermsDays)}
                      </td>
                      <td className="px-3 py-1.5 text-right text-[12px] tabular-nums text-muted-foreground">
                        {s.creditLimit > 0 ? fmtPeso(s.creditLimit) : "Unlimited"}
                      </td>
                      <td className="px-3 py-1.5 text-right text-[12px] tabular-nums text-foreground">
                        {s.openCount}
                      </td>
                      <td className={cn(
                        "px-3 py-1.5 text-right text-[13px] tabular-nums font-semibold",
                        s.totalPayable > 0 ? "text-foreground" : "text-muted-foreground",
                      )}>
                        {s.totalPayable > 0 ? fmtPeso(s.totalPayable) : "—"}
                      </td>
                      <td className={cn(
                        "px-3 py-1.5 text-right text-[11px] tabular-nums",
                        overdue ? "text-red-600 font-medium" : "text-muted-foreground",
                      )}>
                        {s.oldestOverdueDate ? daysAgoFromDate(s.oldestOverdueDate) : "—"}
                      </td>
                      <td className="px-3 py-1.5 text-center">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[9px] font-semibold",
                            s.isActive
                              ? "bg-emerald-50 text-emerald-600"
                              : "bg-muted text-muted-foreground",
                          )}
                        >
                          <Circle size={6} className={s.isActive ? "fill-emerald-600 text-emerald-600" : "fill-muted-foreground text-muted-foreground"} />
                          {s.isActive ? "Active" : "Inactive"}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-border bg-muted/30 px-3 py-2">
          <span className="text-[11px] text-muted-foreground">
            {filteredAndSorted.length} supplier{filteredAndSorted.length === 1 ? "" : "s"}
          </span>
        </div>
      </div>

      {/* Detail drawer */}
      {drawerSupplierId && (
        <SupplierDetailDrawer
          supplierId={drawerSupplierId}
          token={token ?? ""}
          locationId={locationId ?? ""}
          canEdit={isManager}
          onClose={() => setDrawerSupplierId(null)}
          onSaved={handleAfterSave}
        />
      )}

      {/* New supplier modal (reuses the drawer in "new" mode) */}
      {showNewModal && (
        <SupplierDetailDrawer
          supplierId={null /* null → new-supplier mode */}
          token={token ?? ""}
          locationId={locationId ?? ""}
          canEdit={true}
          onClose={() => setShowNewModal(false)}
          onSaved={handleAfterSave}
        />
      )}

      {/* Bulk Set Terms Dialog */}
      <SetTermsDialog
        open={showSetTermsDialog}
        onClose={() => setShowSetTermsDialog(false)}
        onSuccess={() => {
          fetchData();
          setSelectedIds(new Set());
        }}
        supplierIds={Array.from(selectedIds)}
        supplierNames={selectedNames}
        token={token ?? ""}
        locationId={locationId ?? ""}
      />
    </div>
  );
}

/* ─── KPI card (shared shape) ─── */

function KPICard({
  icon,
  label,
  value,
  sub,
  accent,
  danger,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
  danger?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-background p-4 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]",
        accent && "border-amber-200 bg-amber-50/40 dark:border-amber-800 dark:bg-amber-950/20",
        danger && "border-red-200 bg-red-50/40",
      )}
    >
      <div className="flex items-center gap-1.5 text-muted-foreground">
        {icon}
        <span className="text-[11px] font-medium">{label}</span>
      </div>
      <div
        className={cn(
          "mt-1 text-xl font-bold tabular-nums",
          danger ? "text-red-700" : "text-foreground",
        )}
      >
        {value}
      </div>
      {sub && <div className="mt-0.5 text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

/* Re-export the detail type for the drawer to consume */
export type { SupplierDetail };
