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
  const [sortCol, setSortCol] = useState<SortCol>("totalPayable");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // Drawer state
  const [drawerSupplierId, setDrawerSupplierId] = useState<string | null>(null);
  const [showNewModal, setShowNewModal] = useState(false);

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

  // Filter + sort
  const filteredAndSorted = useMemo(() => {
    let rows = suppliers;
    if (!showInactive) rows = rows.filter((r) => r.isActive);
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
  }, [suppliers, search, showInactive, sortCol, sortDir]);

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

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-border bg-background shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="px-3 py-2.5 text-left">
                  <SortableHeader label="Supplier" field="name" activeField={sortCol} activeDir={sortDir} onSort={handleSort} align="left" />
                </th>
                <th className="px-3 py-2.5 text-left">
                  <SortableHeader label="Contact Person" field="contactPerson" activeField={sortCol} activeDir={sortDir} onSort={handleSort} align="left" />
                </th>
                <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Phone
                </th>
                <th className="px-3 py-2.5 text-left">
                  <SortableHeader label="Terms" field="paymentTermsDays" activeField={sortCol} activeDir={sortDir} onSort={handleSort} align="left" />
                </th>
                <th className="px-3 py-2.5 text-right">
                  <SortableHeader label="Credit Limit" field="creditLimit" activeField={sortCol} activeDir={sortDir} onSort={handleSort} align="right" />
                </th>
                <th className="px-3 py-2.5 text-right">
                  <SortableHeader label="Open Inv" field="openCount" activeField={sortCol} activeDir={sortDir} onSort={handleSort} align="right" />
                </th>
                <th className="px-3 py-2.5 text-right">
                  <SortableHeader label="Total Payable" field="totalPayable" activeField={sortCol} activeDir={sortDir} onSort={handleSort} align="right" />
                </th>
                <th className="px-3 py-2.5 text-right">
                  <SortableHeader label="Oldest Overdue" field="oldestOverdueDate" activeField={sortCol} activeDir={sortDir} onSort={handleSort} align="right" />
                </th>
                <th className="px-3 py-2.5 text-center">
                  <SortableHeader label="Status" field="status" activeField={sortCol} activeDir={sortDir} onSort={handleSort} align="right" />
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
              ) : filteredAndSorted.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-3 py-12 text-center text-sm text-muted-foreground">
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
                      <td className="px-3 py-2.5">
                        <div className="flex flex-col">
                          <span className="text-[13px] font-medium text-foreground">{s.name}</span>
                          {s.mnemonicCode && (
                            <span className="text-[10px] font-mono text-muted-foreground">
                              {s.mnemonicCode}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-[12px] text-muted-foreground">
                        {s.contactPerson ?? "—"}
                      </td>
                      <td className="px-3 py-2.5 text-[12px] text-muted-foreground">
                        {s.contactPhone ?? "—"}
                      </td>
                      <td className="px-3 py-2.5 text-[12px] text-muted-foreground">
                        {termsLabel(s.paymentTermsDays)}
                      </td>
                      <td className="px-3 py-2.5 text-right text-[12px] tabular-nums text-muted-foreground">
                        {s.creditLimit > 0 ? fmtPeso(s.creditLimit) : "Unlimited"}
                      </td>
                      <td className="px-3 py-2.5 text-right text-[12px] tabular-nums text-foreground">
                        {s.openCount}
                      </td>
                      <td className={cn(
                        "px-3 py-2.5 text-right text-[13px] tabular-nums font-semibold",
                        s.totalPayable > 0 ? "text-foreground" : "text-muted-foreground",
                      )}>
                        {s.totalPayable > 0 ? fmtPeso(s.totalPayable) : "—"}
                      </td>
                      <td className={cn(
                        "px-3 py-2.5 text-right text-[11px] tabular-nums",
                        overdue ? "text-red-600 font-medium" : "text-muted-foreground",
                      )}>
                        {s.oldestOverdueDate ? daysAgoFromDate(s.oldestOverdueDate) : "—"}
                      </td>
                      <td className="px-3 py-2.5 text-center">
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
