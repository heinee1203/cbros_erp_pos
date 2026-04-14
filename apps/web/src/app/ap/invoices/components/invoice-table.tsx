"use client";

import { useMemo, useState, useRef, useEffect } from "react";
import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  CheckSquare,
  Square,
  MinusSquare,
  MoreVertical,
  Download,
  Pencil,
  Ban,
  ExternalLink,
} from "lucide-react";
import { fmtPeso, fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { downloadCSV } from "@/lib/csv-export";

/* ─── Types ─── */

export interface Invoice {
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

export type SortField =
  | "invoiceNumber"
  | "invoiceDate"
  | "supplier"
  | "dueDate"
  | "totalAmount"
  | "balance"
  | "status";
export type SortDir = "asc" | "desc";

/* ─── Constants ─── */

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

/* ─── Helpers ─── */

function dueDateClass(dueDate: string, status: string): string {
  if (status === "PAID" || status === "VOID") return "text-muted-foreground";
  const now = new Date();
  const due = new Date(dueDate);
  const diffDays = Math.ceil(
    (due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
  );
  if (diffDays < 0) return "text-red-600 font-semibold";
  if (diffDays <= 7) return "text-amber-600 font-medium";
  return "text-emerald-600";
}

/* ─── Sortable header ─── */

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
  onSort: (field: SortField) => void;
  align?: "left" | "right";
}) {
  const active = field === activeField;
  return (
    <button
      onClick={() => onSort(field)}
      className={cn(
        "flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider",
        active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
        align === "right" && "ml-auto",
      )}
    >
      {label}
      {active ? (
        activeDir === "asc" ? (
          <ChevronUp size={12} />
        ) : (
          <ChevronDown size={12} />
        )
      ) : (
        <ChevronsUpDown size={10} className="opacity-40" />
      )}
    </button>
  );
}

/* ─── Row action menu ─── */

function RowActions({
  invoice,
  onEdit,
  onVoid,
}: {
  invoice: Invoice;
  onEdit: (inv: Invoice) => void;
  onVoid: (inv: Invoice) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const isEditable = invoice.status === "OPEN";
  const isVoidable = invoice.status === "OPEN";

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <MoreVertical size={14} />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-30 mt-1 w-44 rounded-lg border border-border bg-background py-1 shadow-lg">
          {isEditable && (
            <button
              onClick={() => { onEdit(invoice); setOpen(false); }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-muted"
            >
              <Pencil size={13} /> Edit
            </button>
          )}
          {isVoidable && (
            <button
              onClick={() => { onVoid(invoice); setOpen(false); }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-red-600 hover:bg-red-50"
            >
              <Ban size={13} /> Void
            </button>
          )}
          <Link
            href={`/ap/suppliers`}
            onClick={() => setOpen(false)}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-muted"
          >
            <ExternalLink size={13} /> View Supplier
          </Link>
        </div>
      )}
    </div>
  );
}

/* ─── Main Table ─── */

interface InvoiceTableProps {
  invoices: Invoice[];
  loading: boolean;
  sortField: SortField;
  sortDir: SortDir;
  onSort: (field: SortField) => void;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
  hasMore: boolean;
  hasPrev: boolean;
  onNextPage: () => void;
  onPrevPage: () => void;
  onEdit: (inv: Invoice) => void;
  onVoid: (inv: Invoice) => void;
}

export function InvoiceTable({
  invoices,
  loading,
  sortField,
  sortDir,
  onSort,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
  hasMore,
  hasPrev,
  onNextPage,
  onPrevPage,
  onEdit,
  onVoid,
}: InvoiceTableProps) {
  // Client-side sort (server returns createdAt desc)
  const sorted = useMemo(() => {
    const copy = [...invoices];
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
  }, [invoices, sortField, sortDir]);

  const payableInvoices = useMemo(
    () => sorted.filter((inv) => inv.status === "OPEN" || inv.status === "PARTIALLY_PAID"),
    [sorted],
  );

  const handleExportCSV = () => {
    downloadCSV(
      "supplier-invoices",
      ["Invoice #", "Date", "Supplier", "Due Date", "Amount", "Paid", "Balance", "Status"],
      sorted.map((inv) => [
        inv.invoiceNumber,
        inv.invoiceDate,
        inv.supplierName,
        inv.dueDate,
        inv.totalAmount,
        inv.paidAmount,
        inv.balance,
        inv.status,
      ]),
    );
  };

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-background shadow-sm">
      {/* Export bar */}
      <div className="flex items-center justify-end border-b border-border bg-muted/20 px-3 py-1.5">
        <button
          onClick={handleExportCSV}
          className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Download size={12} /> Export CSV
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              <th className="w-10 px-2 py-2.5">
                {payableInvoices.length > 0 && (
                  <button
                    onClick={onToggleSelectAll}
                    className="flex items-center justify-center"
                  >
                    {selectedIds.size === 0 ? (
                      <Square size={14} className="text-muted-foreground/40" />
                    ) : selectedIds.size === payableInvoices.length ? (
                      <CheckSquare size={14} className="text-primary" />
                    ) : (
                      <MinusSquare size={14} className="text-primary" />
                    )}
                  </button>
                )}
              </th>
              <th className="px-3 py-2.5 text-left">
                <SortableHeader label="Invoice #" field="invoiceNumber" activeField={sortField} activeDir={sortDir} onSort={onSort} />
              </th>
              <th className="px-3 py-2.5 text-left">
                <SortableHeader label="Supplier" field="supplier" activeField={sortField} activeDir={sortDir} onSort={onSort} />
              </th>
              <th className="px-3 py-2.5 text-left">
                <SortableHeader label="Date" field="invoiceDate" activeField={sortField} activeDir={sortDir} onSort={onSort} />
              </th>
              <th className="px-3 py-2.5 text-left">
                <SortableHeader label="Due Date" field="dueDate" activeField={sortField} activeDir={sortDir} onSort={onSort} />
              </th>
              <th className="px-3 py-2.5 text-right">
                <SortableHeader label="Balance" field="balance" activeField={sortField} activeDir={sortDir} onSort={onSort} align="right" />
              </th>
              <th className="px-3 py-2.5 text-left">
                <SortableHeader label="Status" field="status" activeField={sortField} activeDir={sortDir} onSort={onSort} />
              </th>
              <th className="w-12 px-2 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={i} className="border-b border-border">
                  <td colSpan={8} className="px-3 py-3">
                    <div className="h-5 animate-pulse rounded bg-muted" />
                  </td>
                </tr>
              ))
            ) : sorted.length === 0 ? (
              <tr>
                <td
                  colSpan={8}
                  className="px-3 py-12 text-center text-sm text-muted-foreground"
                >
                  No invoices found. Click &ldquo;Record Invoice&rdquo; to create one.
                </td>
              </tr>
            ) : (
              sorted.map((inv, i) => {
                const isOverdue =
                  (inv.status === "OPEN" || inv.status === "PARTIALLY_PAID") &&
                  new Date(inv.dueDate) < new Date();
                const displayStatus = isOverdue ? "OVERDUE" : inv.status;
                const isPartiallyPaid = parseFloat(inv.paidAmount) > 0 && inv.status !== "PAID";

                return (
                  <tr
                    key={inv.id}
                    className={`border-b border-border transition-colors hover:bg-accent/50 ${
                      i % 2 === 0 ? "bg-background" : "bg-muted/20"
                    }`}
                  >
                    {/* Checkbox */}
                    <td className="w-10 px-2 py-2.5">
                      {inv.status === "OPEN" || inv.status === "PARTIALLY_PAID" ? (
                        <button
                          onClick={(e) => { e.stopPropagation(); onToggleSelect(inv.id); }}
                          className="flex items-center justify-center"
                        >
                          {selectedIds.has(inv.id) ? (
                            <CheckSquare size={14} className="text-primary" />
                          ) : (
                            <Square size={14} className="text-muted-foreground/40" />
                          )}
                        </button>
                      ) : (
                        <span className="inline-block w-[14px]" />
                      )}
                    </td>
                    {/* Invoice # */}
                    <td className="px-3 py-2.5 font-mono text-[13px] font-semibold text-primary">
                      {inv.invoiceNumber}
                    </td>
                    {/* Supplier */}
                    <td className="px-3 py-2.5 text-[13px]">
                      <Link
                        href="/ap/suppliers"
                        className="hover:text-primary hover:underline"
                      >
                        {inv.supplierName}
                      </Link>
                    </td>
                    {/* Date */}
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">
                      {fmtDate(inv.invoiceDate)}
                    </td>
                    {/* Due Date */}
                    <td className={`px-3 py-2.5 text-xs ${dueDateClass(inv.dueDate, inv.status)}`}>
                      {fmtDate(inv.dueDate)}
                    </td>
                    {/* Balance */}
                    <td className="px-3 py-2.5 text-right">
                      <span className="text-[13px] font-semibold tabular-nums">
                        {fmtPeso(inv.balance)}
                      </span>
                      {isPartiallyPaid && (
                        <span className="ml-1 text-[10px] text-muted-foreground">
                          of {fmtPeso(inv.totalAmount)}
                        </span>
                      )}
                    </td>
                    {/* Status */}
                    <td className="px-3 py-2.5">
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          STATUS_COLORS[displayStatus] ?? "bg-muted text-muted-foreground"
                        }`}
                      >
                        {STATUS_LABELS[displayStatus] ?? displayStatus.replace(/_/g, " ")}
                      </span>
                    </td>
                    {/* Actions */}
                    <td className="w-12 px-2 py-2.5 text-right">
                      <RowActions invoice={inv} onEdit={onEdit} onVoid={onVoid} />
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
        <span className="text-[10px] text-muted-foreground">
          Showing {sorted.length} invoice{sorted.length !== 1 ? "s" : ""}
        </span>
        <div className="flex items-center gap-2">
          {hasPrev && (
            <button
              onClick={onPrevPage}
              className="flex items-center gap-1 text-[10px] font-medium text-primary hover:underline"
            >
              <ChevronLeft size={12} /> Previous
            </button>
          )}
          {hasMore && (
            <button
              onClick={onNextPage}
              className="flex items-center gap-1 text-[10px] font-medium text-primary hover:underline"
            >
              Next <ChevronRight size={12} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
