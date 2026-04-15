"use client";

import { FileText, CheckCircle, XCircle } from "lucide-react";
import { fmtPeso } from "@/lib/format";
import type { DVRecord } from "./dv-types";

export function DVSummaryCards({ data }: { data: DVRecord[] }) {
  const confirmed = data.filter((d) => d.status === "CONFIRMED");
  const voided = data.filter((d) => d.status === "VOIDED");
  const confirmedAmt = confirmed.reduce((s, d) => s + d.amount, 0);
  const voidedAmt = voided.reduce((s, d) => s + d.amount, 0);

  return (
    <div className="mb-4 grid grid-cols-3 gap-3">
      <div className="rounded-xl border border-border bg-background p-4 shadow-sm">
        <div className="flex items-center gap-2 text-[11px] font-medium text-muted-foreground">
          <FileText size={14} />
          Total Vouchers
        </div>
        <div className="mt-1 text-xl font-bold tabular-nums">{data.length}</div>
      </div>
      <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4 shadow-sm">
        <div className="flex items-center gap-2 text-[11px] font-medium text-emerald-600">
          <CheckCircle size={14} />
          Confirmed Total
        </div>
        <div className="mt-1 text-xl font-bold tabular-nums text-emerald-700">
          {fmtPeso(confirmedAmt)}
        </div>
        <div className="text-[10px] text-emerald-600">
          {confirmed.length} voucher{confirmed.length !== 1 ? "s" : ""}
        </div>
      </div>
      <div className="rounded-xl border border-red-200 bg-red-50/40 p-4 shadow-sm">
        <div className="flex items-center gap-2 text-[11px] font-medium text-red-600">
          <XCircle size={14} />
          Voided Total
        </div>
        <div className="mt-1 text-xl font-bold tabular-nums text-red-700">
          {fmtPeso(voidedAmt)}
        </div>
        <div className="text-[10px] text-red-600">
          {voided.length} voucher{voided.length !== 1 ? "s" : ""}
        </div>
      </div>
    </div>
  );
}
