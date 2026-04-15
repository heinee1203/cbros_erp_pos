"use client";

import { useMemo } from "react";
import { ChevronUp, ChevronDown, ChevronsUpDown, Loader2, FileText, Printer } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtPeso, fmtDate } from "@/lib/format";
import type { DVRecord, SortField, SortDir } from "./dv-types";
import { STATUS_COLORS, METHOD_LABELS } from "./dv-types";

interface DVTableProps {
  data: DVRecord[];
  sortField: SortField;
  sortDir: SortDir;
  onSortChange: (field: SortField) => void;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  onView: (dv: DVRecord) => void;
  onReprint: (dv: DVRecord) => void;
  onVoid: (dv: DVRecord) => void;
  onConfirm: (dv: DVRecord) => void;
  onPrint: (dv: DVRecord) => void;
  isLoading?: boolean;
}

function SortHeader({
  label,
  field,
  active,
  dir,
  onSort,
  align = "left",
}: {
  label: string;
  field: SortField;
  active: SortField;
  dir: SortDir;
  onSort: (f: SortField) => void;
  align?: "left" | "right";
}) {
  const isActive = field === active;
  return (
    <button
      onClick={() => onSort(field)}
      className={cn(
        "group inline-flex items-center gap-0.5 text-[11px] font-semibold uppercase tracking-[0.06em] select-none",
        isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground",
        align === "right" && "flex-row-reverse",
      )}
    >
      {label}
      <span className="inline-flex w-3 justify-center">
        {isActive ? (
          dir === "asc" ? <ChevronUp size={11} className="text-primary" strokeWidth={2.5} /> : <ChevronDown size={11} className="text-primary" strokeWidth={2.5} />
        ) : (
          <ChevronsUpDown size={11} className="text-muted-foreground/30 group-hover:text-muted-foreground/60" />
        )}
      </span>
    </button>
  );
}

export function DVTable({
  data,
  sortField,
  sortDir,
  onSortChange,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
  onView,
  onReprint,
  onVoid,
  onConfirm,
  onPrint,
  isLoading,
}: DVTableProps) {
  const sorted = useMemo(() => {
    const copy = [...data];
    copy.sort((a, b) => {
      let cmp: number;
      switch (sortField) {
        case "dvNumber": cmp = a.dvNumber.localeCompare(b.dvNumber); break;
        case "supplierName": cmp = a.supplierName.localeCompare(b.supplierName); break;
        case "paymentDate": cmp = a.paymentDate.localeCompare(b.paymentDate); break;
        case "amount": cmp = a.amount - b.amount; break;
        case "status": cmp = a.status.localeCompare(b.status); break;
        default: cmp = 0;
      }
      return sortDir === "desc" ? -cmp : cmp;
    });
    return copy;
  }, [data, sortField, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * pageSize;
  const pageData = sorted.slice(start, start + pageSize);

  const confirmedTotal = data
    .filter((d) => d.status === "CONFIRMED")
    .reduce((s, d) => s + d.amount, 0);

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-background shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
      {/* Header */}
      <div className="flex items-center border-b border-border bg-muted/40 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
        <div className="w-28"><SortHeader label="DV #" field="dvNumber" active={sortField} dir={sortDir} onSort={onSortChange} /></div>
        <div className="flex-1"><SortHeader label="Supplier" field="supplierName" active={sortField} dir={sortDir} onSort={onSortChange} /></div>
        <div className="w-24 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">SOA Ref</div>
        <div className="w-24"><SortHeader label="Date" field="paymentDate" active={sortField} dir={sortDir} onSort={onSortChange} /></div>
        <div className="w-24 flex justify-end"><SortHeader label="Amount" field="amount" active={sortField} dir={sortDir} onSort={onSortChange} align="right" /></div>
        <div className="w-20 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground text-center">Method</div>
        <div className="w-20 text-center"><SortHeader label="Status" field="status" active={sortField} dir={sortDir} onSort={onSortChange} /></div>
        <div className="w-48 text-right text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Actions</div>
      </div>

      {/* Body */}
      {isLoading ? (
        <div className="flex h-48 items-center justify-center">
          <Loader2 size={18} className="animate-spin text-muted-foreground" />
        </div>
      ) : pageData.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <FileText size={24} className="text-muted-foreground/30" />
          <p className="mt-3 text-[13px] font-medium">No vouchers found</p>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {pageData.map((r) => (
            <div
              key={r.id}
              onClick={() => onView(r)}
              className={cn(
                "flex items-center px-4 py-1.5 text-[13px] cursor-pointer hover:bg-accent/30",
                r.status === "VOIDED" && "opacity-50",
              )}
            >
              <div className="w-28 font-mono text-[12px] font-semibold text-primary">
                {r.dvNumber.replace(/^DV-/, "")}
              </div>
              <div className="flex-1 min-w-0 truncate">{r.supplierName}</div>
              <div className="w-28 font-mono text-[11px] text-muted-foreground" title={(r.soaNumbers || []).map(s => s.replace(/^SUPP-SOA-/, "")).join(", ")}>
                {(r.soaNumbers && r.soaNumbers.length > 1)
                  ? `${r.soaNumbers.length} SOAs`
                  : r.soaNumber ? r.soaNumber.replace(/^SUPP-SOA-/, "") : "\u2014"}
              </div>
              <div className="w-24 text-[12px] text-muted-foreground">{fmtDate(r.paymentDate)}</div>
              <div className="w-24 text-right tabular-nums font-semibold text-[12px]">{fmtPeso(r.amount)}</div>
              <div className="w-20 text-center text-[11px] text-muted-foreground">
                {METHOD_LABELS[r.paymentMethod] ?? r.paymentMethod}
              </div>
              <div className="w-20 text-center">
                <span
                  className={cn("inline-flex rounded-md px-2 py-0.5 text-[9px] font-semibold uppercase", STATUS_COLORS[r.status] ?? "bg-muted text-muted-foreground")}
                  title={r.status === "VOIDED" && r.voidReason ? `Voided: ${r.voidReason}` : undefined}
                >
                  {r.status}
                </span>
              </div>
              <div className="w-48 flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                <button onClick={() => onView(r)} className="rounded px-2 py-0.5 text-[10px] font-medium text-muted-foreground hover:bg-muted">View</button>
                {(r.status === "CONFIRMED" || r.status === "PRINTED") && (
                  <button onClick={() => onReprint(r)} className="rounded px-2 py-0.5 text-[10px] font-medium text-primary hover:bg-primary/10">
                    <span className="flex items-center gap-1"><Printer size={10} />Reprint</span>
                  </button>
                )}
                {r.status === "PRINTED" && (
                  <button onClick={() => onConfirm(r)} className="rounded px-2 py-0.5 text-[10px] font-medium text-emerald-600 hover:bg-emerald-50">Confirm</button>
                )}
                {r.status === "DRAFT" && (
                  <button onClick={() => onPrint(r)} className="rounded px-2 py-0.5 text-[10px] font-medium text-primary hover:bg-primary/10">Print</button>
                )}
                {r.status !== "VOIDED" && (
                  <button onClick={() => onVoid(r)} className="rounded px-2 py-0.5 text-[10px] font-medium text-red-500 hover:bg-red-50">Void</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-border bg-muted/30 px-4 py-2">
        <div className="flex items-center gap-3">
          <span className="text-[11px] text-muted-foreground">
            Showing {sorted.length === 0 ? 0 : start + 1}-{Math.min(start + pageSize, sorted.length)} of {sorted.length}
          </span>
          <select
            value={pageSize}
            onChange={(e) => { onPageSizeChange(parseInt(e.target.value)); onPageChange(1); }}
            className="h-6 rounded border border-border bg-background px-1 text-[10px] outline-none"
          >
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          {totalPages > 1 && (
            <>
              <button onClick={() => onPageChange(safePage - 1)} disabled={safePage <= 1}
                className="text-[10px] font-medium text-primary hover:underline disabled:text-muted-foreground disabled:no-underline">Prev</button>
              <span className="text-[10px] text-muted-foreground">{safePage}/{totalPages}</span>
              <button onClick={() => onPageChange(safePage + 1)} disabled={safePage >= totalPages}
                className="text-[10px] font-medium text-primary hover:underline disabled:text-muted-foreground disabled:no-underline">Next</button>
            </>
          )}
          {confirmedTotal > 0 && (
            <span className="text-[11px] font-semibold tabular-nums">Confirmed Total: {fmtPeso(confirmedTotal)}</span>
          )}
        </div>
      </div>
    </div>
  );
}
