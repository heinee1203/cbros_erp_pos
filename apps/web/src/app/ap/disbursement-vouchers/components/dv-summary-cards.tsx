"use client";

import { FileText, CheckCircle, XCircle } from "lucide-react";
import { fmtPeso } from "@/lib/format";

export interface DVSummary {
  totalCount: number;
  confirmedCount: number;
  confirmedAmt: number;
  voidedCount: number;
  voidedAmt: number;
}

export function DVSummaryCards({ summary }: { summary: DVSummary }) {
  return (
    <div className="mb-4 grid grid-cols-3 gap-3">
      <div className="rounded-xl border border-border bg-background p-4 shadow-sm">
        <div className="flex items-center gap-2 text-[11px] font-medium text-muted-foreground">
          <FileText size={14} />
          Total Vouchers
        </div>
        <div className="mt-1 text-xl font-bold tabular-nums">{summary.totalCount}</div>
      </div>
      <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4 shadow-sm">
        <div className="flex items-center gap-2 text-[11px] font-medium text-emerald-600">
          <CheckCircle size={14} />
          Confirmed Total
        </div>
        <div className="mt-1 text-xl font-bold tabular-nums text-emerald-700">
          {fmtPeso(summary.confirmedAmt)}
        </div>
        <div className="text-[10px] text-emerald-600">
          {summary.confirmedCount} voucher{summary.confirmedCount !== 1 ? "s" : ""}
        </div>
      </div>
      <div className="rounded-xl border border-red-200 bg-red-50/40 p-4 shadow-sm">
        <div className="flex items-center gap-2 text-[11px] font-medium text-red-600">
          <XCircle size={14} />
          Voided Total
        </div>
        <div className="mt-1 text-xl font-bold tabular-nums text-red-700">
          {fmtPeso(summary.voidedAmt)}
        </div>
        <div className="text-[10px] text-red-600">
          {summary.voidedCount} voucher{summary.voidedCount !== 1 ? "s" : ""}
        </div>
      </div>
    </div>
  );
}
