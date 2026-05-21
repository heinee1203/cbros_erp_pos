"use client";

import { useMemo, useState, useRef, useEffect } from "react";
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
  Eye,
  CheckCircle2,
  Copy,
} from "lucide-react";
import { toast } from "sonner";
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
  VOIDED: "bg-gray-100 text-gray-500",
  OVERDUE: "bg-red-100 text-red-700",
  CREDIT_MEMO: "bg-purple-100 text-purple-700",
};

const STATUS_LABELS: Record<string, string> = {
  OPEN: "Open",
  PARTIALLY_PAID: "Partial (legacy)",
  PAID: "Paid",
  VOIDED: "Void",
  OVERDUE: "Overdue",
  CREDIT_MEMO: "Credit Memo",
};

const PAGE_SIZES = [25, 50, 100] as const;

/* ─── Helpers ─── */

function dueDateClass(dueDate: string, status: string): string {
  if (status === "PAID" || status === "VOIDED") return "text-muted-foreground";
  const now = new Date();
  const due = new Date(dueDate);
  const diffDays = Math.ceil(
    (due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
  );
  if (diffDays < 0) return "text-red-600 font-semibold";
  if (diffDays <= 7) return "text-amber-600 font-medium";
  return "text-emerald-600";
}

function isCreditMemoInvoice(invoice: Pick<Invoice, "invoiceNumber" | "totalAmount">) {
  return parseFloat(invoice.totalAmount) < 0 || /^CM-/i.test(invoice.invoiceNumber);
}

function isBulkPayableInvoice(invoice: Invoice) {
  return !isCreditMemoInvoice(invoice) && (invoice.status === "OPEN" || invoice.status === "PARTIALLY_PAID");
}

/** Build an array of page numbers with ellipsis gaps. */
function buildPageNumbers(current: number, total: number): (number | "...")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | "...")[] = [];
  pages.push(1);
  if (current > 3) pages.push("...");
  for (let i = Math.max(2, current - 1); i <= Math.min(total - 1, current + 1); i++) {
    pages.push(i);
  }
  if (current < total - 2) pages.push("...");
  pages.push(total);
  return pages;
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
  onMarkAsPaid,
}: {
  invoice: Invoice;
  onEdit: (inv: Invoice) => void;
  onVoid: (inv: Invoice) => void;
  onMarkAsPaid: (inv: Invoice) => void;
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

  // Per spec Menu Contents rules:
  //   Edit / Mark as Paid — OPEN or PARTIALLY_PAID only
  //   Void               — not already VOIDED and not fully paid
  //   View details       — PAID/VOIDED (or whenever Edit isn't offered)
  //   Copy invoice #     — always
  const isEditable = invoice.status === "OPEN" || invoice.status === "PARTIALLY_PAID";
  const isPayable = isBulkPayableInvoice(invoice);
  const isVoidable = isEditable; // excludes PAID and VOIDED

  const copyInvoiceNumber = async () => {
    const text = invoice.invoiceNumber;
    // Prefer the async Clipboard API; fall back to a hidden textarea +
    // execCommand for contexts lacking document focus (headless test
    // browsers, older Safari, iframes without the permission).
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        toast.success(`Copied ${text}`);
        return;
      }
    } catch { /* fall through */ }
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      if (ok) toast.success(`Copied ${text}`);
      else toast.error("Failed to copy invoice number");
    } catch {
      toast.error("Failed to copy invoice number");
    }
  };

  return (
    <div className="relative invoice-row-menu" ref={ref}>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        aria-label="Row actions"
      >
        <MoreVertical size={14} />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-30 mt-1 w-48 rounded-lg border border-border bg-background py-1 shadow-lg">
          {isEditable ? (
            <>
              <button
                onClick={() => { onEdit(invoice); setOpen(false); }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-muted"
              >
                <Pencil size={13} /> Edit
              </button>
              {isPayable && (
                <button
                  onClick={() => { onMarkAsPaid(invoice); setOpen(false); }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-emerald-700 hover:bg-emerald-50"
                >
                  <CheckCircle2 size={13} /> Mark as Paid
                </button>
              )}
            </>
          ) : (
            <button
              onClick={() => { onEdit(invoice); setOpen(false); }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-muted"
            >
              <Eye size={13} /> View details
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
          <button
            onClick={() => { copyInvoiceNumber(); setOpen(false); }}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-muted"
          >
            <Copy size={13} /> Copy invoice #
          </button>
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
  onEdit: (inv: Invoice) => void;
  onVoid: (inv: Invoice) => void;
  onViewSupplier: (supplierId: string) => void;
  onMarkAsPaid: (inv: Invoice) => void;
  /** Rows in this set render with a brief pulse highlight (used by the Record
   *  Invoice success toast's "View" action). */
  highlightedIds?: Set<string>;
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
  onEdit,
  onVoid,
  onViewSupplier,
  onMarkAsPaid,
  highlightedIds,
}: InvoiceTableProps) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(25);

  // Client-side sort
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

  // Reset to page 1 when data or sort changes
  useEffect(() => { setPage(1); }, [invoices, sortField, sortDir]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const startIdx = (safePage - 1) * pageSize;
  const endIdx = Math.min(startIdx + pageSize, sorted.length);
  const pageData = sorted.slice(startIdx, endIdx);
  const pageNumbers = buildPageNumbers(safePage, totalPages);

  const payableInvoices = useMemo(
    () => sorted.filter(isBulkPayableInvoice),
    [sorted],
  );

  const handleExportCSV = () => {
    downloadCSV(
      "supplier-invoices",
      ["Date", "Supplier", "Invoice #", "Due Date", "Amount", "Paid", "Balance", "Status"],
      sorted.map((inv) => [
        inv.invoiceDate,
        inv.supplierName,
        inv.invoiceNumber,
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
              {/* Checkbox */}
              <th className="w-10 px-2 py-1.5">
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
              {/* Date */}
              <th className="w-[120px] px-3 py-1.5 text-left">
                <SortableHeader label="Date" field="invoiceDate" activeField={sortField} activeDir={sortDir} onSort={onSort} />
              </th>
              {/* Supplier */}
              <th className="px-3 py-1.5 text-left">
                <SortableHeader label="Supplier" field="supplier" activeField={sortField} activeDir={sortDir} onSort={onSort} />
              </th>
              {/* Invoice # */}
              <th className="w-[140px] px-3 py-1.5 text-left">
                <SortableHeader label="Invoice #" field="invoiceNumber" activeField={sortField} activeDir={sortDir} onSort={onSort} />
              </th>
              {/* Balance */}
              <th className="w-[140px] px-3 py-1.5 text-right">
                <SortableHeader label="Amount" field="totalAmount" activeField={sortField} activeDir={sortDir} onSort={onSort} align="right" />
              </th>
              {/* Due Date */}
              <th className="w-[120px] px-3 py-1.5 text-left">
                <SortableHeader label="Due Date" field="dueDate" activeField={sortField} activeDir={sortDir} onSort={onSort} />
              </th>
              {/* Status */}
              <th className="w-[100px] px-3 py-1.5 text-left">
                <SortableHeader label="Status" field="status" activeField={sortField} activeDir={sortDir} onSort={onSort} />
              </th>
              {/* Actions */}
              <th className="w-12 px-2 py-1.5" />
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
            ) : pageData.length === 0 ? (
              <tr>
                <td
                  colSpan={8}
                  className="px-3 py-12 text-center text-sm text-muted-foreground"
                >
                  No invoices found. Click &ldquo;Record Invoice&rdquo; to create one.
                </td>
              </tr>
            ) : (
              pageData.map((inv, i) => {
                const isCreditMemo = isCreditMemoInvoice(inv);
                const isOverdue =
                  !isCreditMemo &&
                  (inv.status === "OPEN" || inv.status === "PARTIALLY_PAID") &&
                  new Date(inv.dueDate) < new Date();
                const displayStatus = isCreditMemo ? "CREDIT_MEMO" : isOverdue ? "OVERDUE" : inv.status;
                const isHighlighted = highlightedIds?.has(inv.id) ?? false;

                return (
                  <tr
                    key={inv.id}
                    id={`invoice-row-${inv.id}`}
                    className={cn(
                      "border-b border-border transition-colors hover:bg-accent/50",
                      i % 2 === 0 ? "bg-background" : "bg-muted/20",
                      // Pulse the background for ~1s when the row was just created via
                      // Record Invoice and the user tapped the success toast. The class
                      // overrides the zebra stripe for the duration of the animation.
                      isHighlighted && "!bg-emerald-50 animate-[pulse_1s_ease-in-out_1]",
                    )}
                  >
                    {/* Checkbox */}
                    <td className="w-10 px-2 py-1.5">
                      {isBulkPayableInvoice(inv) ? (
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
                    {/* Date */}
                    <td className="w-[120px] px-3 py-1.5 text-xs text-muted-foreground">
                      {fmtDate(inv.invoiceDate)}
                    </td>
                    {/* Supplier */}
                    <td className="px-3 py-1.5 text-[13px]">
                      <button
                        onClick={() => onViewSupplier(inv.supplierId)}
                        className="text-left hover:text-primary hover:underline"
                      >
                        {inv.supplierName}
                      </button>
                    </td>
                    {/* Invoice # */}
                    <td className="w-[140px] px-3 py-1.5 font-mono text-[13px] font-semibold text-primary">
                      <span className="inline-flex items-center gap-1.5">
                        {inv.invoiceNumber}
                        {isCreditMemo && (
                          <span className="rounded-md bg-purple-50 px-1.5 py-0.5 text-[9px] font-semibold text-purple-600">
                            CM
                          </span>
                        )}
                      </span>
                    </td>
                    {/* Amount */}
                    <td className={`w-[140px] px-3 py-1.5 text-right text-[13px] font-semibold tabular-nums ${
                      isCreditMemo ? "text-emerald-700" : ""
                    }`}>
                      {isCreditMemo
                        ? `(${fmtPeso(Math.abs(parseFloat(inv.totalAmount)))})`
                        : fmtPeso(inv.totalAmount)}
                    </td>
                    {/* Due Date */}
                    <td className={`w-[120px] px-3 py-1.5 text-xs ${
                      isCreditMemo ? "text-muted-foreground" : dueDateClass(inv.dueDate, inv.status)
                    }`}>
                      {fmtDate(inv.dueDate)}
                    </td>
                    {/* Status */}
                    <td className="w-[100px] px-3 py-1.5">
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          STATUS_COLORS[displayStatus] ?? "bg-muted text-muted-foreground"
                        }`}
                      >
                        {STATUS_LABELS[displayStatus] ?? displayStatus.replace(/_/g, " ")}
                      </span>
                    </td>
                    {/* Actions */}
                    <td className="w-12 px-2 py-1.5 text-right">
                      <RowActions invoice={inv} onEdit={onEdit} onVoid={onVoid} onMarkAsPaid={onMarkAsPaid} />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination footer */}
      <div className="flex items-center justify-between border-t border-border bg-muted/30 px-3 py-2">
        <span className="text-[11px] text-muted-foreground">
          {sorted.length > 0
            ? `Showing ${startIdx + 1}\u2013${endIdx} of ${sorted.length} invoice${sorted.length !== 1 ? "s" : ""}`
            : "No invoices"}
        </span>

        {totalPages > 1 && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={safePage <= 1}
              className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:pointer-events-none"
            >
              <ChevronLeft size={14} />
            </button>
            {pageNumbers.map((pn, idx) =>
              pn === "..." ? (
                <span key={`e${idx}`} className="px-1 text-[11px] text-muted-foreground">&hellip;</span>
              ) : (
                <button
                  key={pn}
                  onClick={() => setPage(pn)}
                  className={cn(
                    "min-w-[28px] rounded px-1.5 py-0.5 text-[11px] font-medium",
                    pn === safePage
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  {pn}
                </button>
              ),
            )}
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={safePage >= totalPages}
              className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:pointer-events-none"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        )}

        <select
          value={pageSize}
          onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
          className="rounded border border-border bg-background px-2 py-0.5 text-[11px] text-muted-foreground outline-none"
        >
          {PAGE_SIZES.map((s) => (
            <option key={s} value={s}>{s} / page</option>
          ))}
        </select>
      </div>
    </div>
  );
}
