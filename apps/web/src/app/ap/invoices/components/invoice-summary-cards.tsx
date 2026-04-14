"use client";

import { DollarSign, AlertTriangle, Clock, FileText } from "lucide-react";
import { fmtPeso } from "@/lib/format";

interface InvoiceSummary {
  totalOpen: number;
  overdueAmount: number;
  dueThisWeek: number;
  invoiceCount: number;
}

export function InvoiceSummaryCards({ summary }: { summary: InvoiceSummary }) {
  return (
    <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
      <div className="rounded-xl border border-border bg-background p-4 shadow-sm">
        <div className="flex items-center gap-2 text-[11px] font-medium text-muted-foreground">
          <DollarSign size={14} />
          Total Open Payables
        </div>
        <div className="mt-1 text-xl font-bold tabular-nums">
          {fmtPeso(summary.totalOpen)}
        </div>
      </div>
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 shadow-sm">
        <div className="flex items-center gap-2 text-[11px] font-medium text-red-600">
          <AlertTriangle size={14} />
          Overdue Amount
        </div>
        <div className="mt-1 text-xl font-bold tabular-nums text-red-700">
          {fmtPeso(summary.overdueAmount)}
        </div>
      </div>
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
        <div className="flex items-center gap-2 text-[11px] font-medium text-amber-600">
          <Clock size={14} />
          Due This Week
        </div>
        <div className="mt-1 text-xl font-bold tabular-nums text-amber-700">
          {fmtPeso(summary.dueThisWeek)}
        </div>
      </div>
      <div className="rounded-xl border border-border bg-background p-4 shadow-sm">
        <div className="flex items-center gap-2 text-[11px] font-medium text-muted-foreground">
          <FileText size={14} />
          Open Invoices
        </div>
        <div className="mt-1 text-xl font-bold tabular-nums">
          {summary.invoiceCount}
        </div>
      </div>
    </div>
  );
}
