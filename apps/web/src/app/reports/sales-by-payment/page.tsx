"use client";

import { useState } from "react";
import { CreditCard, DollarSign, Hash, Download, Loader2 } from "lucide-react";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { downloadCSV } from "@/lib/csv-export";
import { cn } from "@/lib/utils";
import { useAuth } from "@/app/auth-context";
import { useSalesByPaymentQuery, type ReportFilters } from "@/hooks/use-sales-reports";

const METHOD_LABELS: Record<string, string> = {
  CASH: "Cash",
  CREDIT_CARD: "Credit Card",
  DEBIT_CARD: "Debit Card",
  GCASH: "GCash",
  MAYA: "Maya",
  QRPH: "QRPH",
  BANK_TRANSFER: "Bank Transfer",
  EFT: "EFT",
  ACCOUNT: "Charge Account",
  CARD: "Card (Legacy)",
  OTHER: "Other",
};

const METHOD_COLORS: Record<string, string> = {
  CASH: "bg-emerald-500",
  CREDIT_CARD: "bg-blue-500",
  DEBIT_CARD: "bg-indigo-500",
  GCASH: "bg-sky-500",
  MAYA: "bg-green-500",
  QRPH: "bg-violet-500",
  BANK_TRANSFER: "bg-slate-500",
  EFT: "bg-gray-500",
  ACCOUNT: "bg-amber-500",
  CARD: "bg-blue-400",
  OTHER: "bg-gray-400",
};

function fmt(v: number) {
  return v.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function getDatePreset(preset: string): { from: string; to: string } {
  const now = new Date();
  const to = now.toISOString();
  let from: Date;
  switch (preset) {
    case "today": from = new Date(now.getFullYear(), now.getMonth(), now.getDate()); break;
    case "week": from = new Date(now); from.setDate(from.getDate() - 7); break;
    case "month": from = new Date(now); from.setMonth(from.getMonth() - 1); break;
    case "30d": from = new Date(now); from.setDate(from.getDate() - 30); break;
    default: from = new Date(now); from.setDate(from.getDate() - 30);
  }
  return { from: from.toISOString(), to };
}

export default function SalesByPaymentPage() {
  const { token, locationId } = useAuth();
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [activePreset, setActivePreset] = useState<string | null>(null);

  const filters: ReportFilters = {
    from: dateFrom ? `${dateFrom}T00:00:00Z` : undefined,
    to: dateTo ? `${dateTo}T23:59:59Z` : undefined,
  };

  const query = useSalesByPaymentQuery(token, locationId, filters);
  const rows = query.data?.data ?? [];
  const grandTotal = query.data?.grandTotal ?? 0;

  function applyPreset(preset: string) {
    setActivePreset(preset);
    const { from, to } = getDatePreset(preset);
    setDateFrom(from.slice(0, 10));
    setDateTo(to.slice(0, 10));
  }

  function clearDates() { setDateFrom(""); setDateTo(""); setActivePreset(null); }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Sales by Payment Method</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">Revenue breakdown by payment type</p>
        </div>
        {rows.length > 0 && (
          <button
            onClick={() => downloadCSV(rows.map(r => ({
              Method: METHOD_LABELS[r.method] || r.method,
              Transactions: r.transactionCount,
              Amount: r.totalAmount.toFixed(2),
              "% of Total": r.percentage.toFixed(1),
            })), "sales-by-payment")}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted/50"
          >
            <Download size={13} /> Export CSV
          </button>
        )}
      </div>

      {/* Date filters */}
      <div className="flex flex-wrap items-center gap-2">
        {["today", "week", "30d", "month"].map((p) => (
          <button
            key={p}
            onClick={() => applyPreset(p)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              activePreset === p
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:bg-muted/50",
            )}
          >
            {p === "today" ? "Today" : p === "week" ? "7 Days" : p === "30d" ? "30 Days" : "Month"}
          </button>
        ))}
        <DateRangePicker
          startDate={dateFrom}
          endDate={dateTo}
          onChange={(start, end) => { setDateFrom(start); setDateTo(end); setActivePreset(null); }}
        />
        {(dateFrom || dateTo) && (
          <button onClick={clearDates} className="text-xs text-muted-foreground hover:text-foreground">Clear</button>
        )}
      </div>

      {query.isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={20} className="animate-spin text-muted-foreground" />
        </div>
      ) : rows.length === 0 ? (
        <div className="py-20 text-center text-sm text-muted-foreground">No payment data for this period</div>
      ) : (
        <>
          {/* Grand Total */}
          <div className="rounded-xl border border-border bg-background p-4">
            <div className="text-sm font-medium text-muted-foreground">Grand Total</div>
            <div className="mt-1 text-2xl font-bold tabular-nums text-foreground">{"\u20B1"}{fmt(grandTotal)}</div>
          </div>

          {/* Bar chart */}
          <div className="rounded-xl border border-border bg-background p-4">
            <div className="space-y-3">
              {rows.map((row) => (
                <div key={row.method} className="flex items-center gap-3">
                  <div className="w-28 text-xs font-medium text-foreground truncate">{METHOD_LABELS[row.method] || row.method}</div>
                  <div className="flex-1">
                    <div className="h-7 rounded-md bg-muted/30 overflow-hidden">
                      <div
                        className={cn("h-full rounded-md flex items-center px-2", METHOD_COLORS[row.method] || "bg-gray-500")}
                        style={{ width: `${Math.max(row.percentage, 2)}%` }}
                      >
                        <span className="text-[10px] font-bold text-white whitespace-nowrap">{row.percentage.toFixed(1)}%</span>
                      </div>
                    </div>
                  </div>
                  <div className="w-28 text-right text-xs font-semibold tabular-nums text-foreground">{"\u20B1"}{fmt(row.totalAmount)}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Table */}
          <div className="rounded-xl border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-xs font-medium text-muted-foreground">
                <tr>
                  <th className="px-4 py-1.5 text-left">Payment Method</th>
                  <th className="px-4 py-1.5 text-right">Transactions</th>
                  <th className="px-4 py-1.5 text-right">Total Amount</th>
                  <th className="px-4 py-1.5 text-right">% of Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((row) => (
                  <tr key={row.method} className="hover:bg-muted/20">
                    <td className="px-4 py-1.5 font-medium text-foreground">
                      <div className="flex items-center gap-2">
                        <div className={cn("h-2.5 w-2.5 rounded-full", METHOD_COLORS[row.method] || "bg-gray-400")} />
                        {METHOD_LABELS[row.method] || row.method}
                      </div>
                    </td>
                    <td className="px-4 py-1.5 text-right tabular-nums text-muted-foreground">{row.transactionCount.toLocaleString()}</td>
                    <td className="px-4 py-1.5 text-right tabular-nums font-medium">{"\u20B1"}{fmt(row.totalAmount)}</td>
                    <td className="px-4 py-1.5 text-right tabular-nums text-muted-foreground">{row.percentage.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
