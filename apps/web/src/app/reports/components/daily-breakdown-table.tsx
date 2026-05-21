import Link from "next/link";
import type { ReactNode } from "react";
import { BarChart3 } from "lucide-react";
import type { DailySalesRow } from "@/hooks/use-sales-reports";
import { MARGIN_THRESHOLDS } from "@/lib/constants";
import { fmtPeso } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { DailyTotals, ReportsDateRange } from "../types";
import { fmtRangeLabel } from "../utils";

type DailyBreakdownTableProps = {
  days: DailySalesRow[];
  totals: DailyTotals;
  totalMargin: string;
  range: ReportsDateRange;
  isLoading: boolean;
  onTryAllLocations: () => void;
};

export function DailyBreakdownTable({
  days,
  totals,
  totalMargin,
  range,
  isLoading,
  onTryAllLocations,
}: DailyBreakdownTableProps) {
  return (
    <div className="rounded-xl border border-border bg-background shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
      <div className="border-b border-border px-5 py-3.5">
        <h2 className="text-[13px] font-semibold text-foreground">Daily Breakdown</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              <DailyHeader>Date</DailyHeader>
              <DailyHeader align="right">Gross Sales</DailyHeader>
              <DailyHeader align="right">Refunds</DailyHeader>
              <DailyHeader align="right">Discounts</DailyHeader>
              <DailyHeader align="right">Net Sales</DailyHeader>
              <DailyHeader align="right">Cost of Goods</DailyHeader>
              <DailyHeader align="right">Gross Profit</DailyHeader>
              <DailyHeader align="right">Margin</DailyHeader>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, index) => (
                <tr key={index} className="border-b border-border last:border-0">
                  {Array.from({ length: 8 }).map((__, cellIndex) => (
                    <td key={cellIndex} className="px-4 py-1.5">
                      <div className="h-4 animate-pulse rounded bg-muted/40" />
                    </td>
                  ))}
                </tr>
              ))
            ) : days.length === 0 ? (
              <tr>
                <td colSpan={8}>
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <BarChart3 className="mb-3 h-10 w-10 text-muted-foreground/40" />
                    <p className="text-[14px] font-medium text-foreground">
                      No sales recorded for {fmtRangeLabel(range.from, range.to)}
                    </p>
                    <p className="mt-2 max-w-sm text-[12px] leading-relaxed text-muted-foreground">
                      This could mean no completed transactions in the POS app, sales were made at a
                      different location, or the date range doesn&apos;t include any business days.
                    </p>
                    <div className="mt-4 flex items-center gap-3">
                      <Link
                        href="/sales/shifts"
                        className="rounded-md border border-border px-3 py-1.5 text-[12px] font-medium text-foreground transition-colors hover:bg-muted"
                      >
                        View Shift History
                      </Link>
                      <button
                        onClick={onTryAllLocations}
                        className="rounded-md border border-border px-3 py-1.5 text-[12px] font-medium text-foreground transition-colors hover:bg-muted"
                      >
                        Try All Locations
                      </button>
                    </div>
                  </div>
                </td>
              </tr>
            ) : (
              <>
                {days.map((day) => (
                  <DailyBreakdownRow key={day.date} day={day} />
                ))}
                <DailyTotalsRow totals={totals} totalMargin={totalMargin} />
              </>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DailyHeader({
  align = "left",
  children,
}: {
  align?: "left" | "right";
  children: ReactNode;
}) {
  return (
    <th
      scope="col"
      className={cn(
        "px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground",
        align === "right" ? "text-right" : "px-5 text-left",
      )}
    >
      {children}
    </th>
  );
}

function DailyBreakdownRow({ day }: { day: DailySalesRow }) {
  const margin = parseFloat(day.margin);

  return (
    <tr className="border-b border-border transition-colors last:border-0 hover:bg-muted/20">
      <td className="px-5 py-1.5 text-[12px] font-medium text-foreground">
        {new Date(day.date).toLocaleDateString("en-PH", {
          weekday: "short",
          day: "numeric",
          month: "short",
        })}
      </td>
      <td className="px-4 py-1.5 text-right font-mono text-[12px] text-foreground">
        {fmtPeso(day.grossSales)}
      </td>
      <td className="px-4 py-1.5 text-right font-mono text-[12px] text-red-500">
        {parseFloat(day.refunds) > 0 ? `(${fmtPeso(day.refunds)})` : fmtPeso(day.refunds)}
      </td>
      <td className="px-4 py-1.5 text-right font-mono text-[12px] text-muted-foreground">
        {fmtPeso(day.discounts)}
      </td>
      <td className="px-4 py-1.5 text-right font-mono text-[12px] font-medium text-foreground">
        {fmtPeso(day.netSales)}
      </td>
      <td className="px-4 py-1.5 text-right font-mono text-[12px] text-muted-foreground">
        {fmtPeso(day.costOfGoods)}
      </td>
      <td className="px-4 py-1.5 text-right font-mono text-[12px] font-medium text-foreground">
        {fmtPeso(day.grossProfit)}
      </td>
      <td className="px-4 py-1.5 text-right font-mono text-[12px]">
        <MarginValue value={margin} />
      </td>
    </tr>
  );
}

function DailyTotalsRow({ totals, totalMargin }: { totals: DailyTotals; totalMargin: string }) {
  return (
    <tr className="border-t-2 border-border bg-muted/30">
      <td className="px-5 py-1.5 text-[12px] font-semibold text-foreground">Total</td>
      <td className="px-4 py-1.5 text-right font-mono text-[12px] font-semibold text-foreground">
        {fmtPeso(totals.grossSales)}
      </td>
      <td className="px-4 py-1.5 text-right font-mono text-[12px] font-semibold text-red-500">
        {totals.refunds > 0 ? `(${fmtPeso(totals.refunds)})` : fmtPeso(totals.refunds)}
      </td>
      <td className="px-4 py-1.5 text-right font-mono text-[12px] font-semibold text-muted-foreground">
        {fmtPeso(totals.discounts)}
      </td>
      <td className="px-4 py-1.5 text-right font-mono text-[12px] font-semibold text-foreground">
        {fmtPeso(totals.netSales)}
      </td>
      <td className="px-4 py-1.5 text-right font-mono text-[12px] font-semibold text-muted-foreground">
        {fmtPeso(totals.costOfGoods)}
      </td>
      <td className="px-4 py-1.5 text-right font-mono text-[12px] font-semibold text-foreground">
        {fmtPeso(totals.grossProfit)}
      </td>
      <td className="px-4 py-1.5 text-right font-mono text-[12px]">
        <MarginValue value={parseFloat(totalMargin)} strong />
      </td>
    </tr>
  );
}

function MarginValue({ value, strong = false }: { value: number; strong?: boolean }) {
  return (
    <span
      className={cn(
        strong ? "font-semibold" : "font-medium",
        value >= MARGIN_THRESHOLDS.GOOD
          ? "text-emerald-600"
          : value >= MARGIN_THRESHOLDS.WARNING
            ? "text-amber-600"
            : "text-red-500",
      )}
    >
      {value.toFixed(1)}%
    </span>
  );
}
