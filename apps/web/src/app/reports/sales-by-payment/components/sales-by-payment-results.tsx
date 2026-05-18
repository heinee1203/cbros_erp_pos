import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PaymentMethodRow } from "@/hooks/use-sales-reports";
import type { SalesByPaymentController } from "../types";
import { fmt, METHOD_COLORS, METHOD_LABELS } from "../utils";

type SalesByPaymentResultsProps = {
  controller: SalesByPaymentController;
};

export function SalesByPaymentResults({ controller }: SalesByPaymentResultsProps) {
  if (controller.isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={20} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (controller.rows.length === 0) {
    return <div className="py-20 text-center text-sm text-muted-foreground">No payment data for this period</div>;
  }

  return (
    <>
      <div className="rounded-xl border border-border bg-background p-4">
        <div className="text-sm font-medium text-muted-foreground">Grand Total</div>
        <div className="mt-1 text-2xl font-bold tabular-nums text-foreground">{"\u20B1"}{fmt(controller.grandTotal)}</div>
      </div>
      <SalesByPaymentBars rows={controller.rows} />
      <SalesByPaymentTable rows={controller.rows} />
    </>
  );
}

function SalesByPaymentBars({ rows }: { rows: PaymentMethodRow[] }) {
  return (
    <div className="rounded-xl border border-border bg-background p-4">
      <div className="space-y-3">
        {rows.map((row) => (
          <div key={row.method} className="flex items-center gap-3">
            <div className="w-28 truncate text-xs font-medium text-foreground">{METHOD_LABELS[row.method] || row.method}</div>
            <div className="flex-1">
              <div className="h-7 overflow-hidden rounded-md bg-muted/30">
                <div
                  className={cn("flex h-full items-center rounded-md px-2", METHOD_COLORS[row.method] || "bg-gray-500")}
                  style={{ width: `${Math.max(row.percentage, 2)}%` }}
                >
                  <span className="whitespace-nowrap text-[10px] font-bold text-white">{row.percentage.toFixed(1)}%</span>
                </div>
              </div>
            </div>
            <div className="w-28 text-right text-xs font-semibold tabular-nums text-foreground">{"\u20B1"}{fmt(row.totalAmount)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SalesByPaymentTable({ rows }: { rows: PaymentMethodRow[] }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border">
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
              <td className="px-4 py-1.5 text-right font-medium tabular-nums">{"\u20B1"}{fmt(row.totalAmount)}</td>
              <td className="px-4 py-1.5 text-right tabular-nums text-muted-foreground">{row.percentage.toFixed(1)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
