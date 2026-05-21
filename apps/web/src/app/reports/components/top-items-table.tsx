import Link from "next/link";
import type { ReactNode } from "react";
import type { SalesByItemRow } from "@/hooks/use-sales-reports";
import { MARGIN_THRESHOLDS } from "@/lib/constants";
import { fmtPeso } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { TopItemsSort } from "../types";

type TopItemsTableProps = {
  items: SalesByItemRow[];
  isLoading: boolean;
  sortBy: TopItemsSort;
  onSortChange: (sort: TopItemsSort) => void;
};

export function TopItemsTable({ items, isLoading, sortBy, onSortChange }: TopItemsTableProps) {
  return (
    <div className="rounded-xl border border-border bg-background shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
      <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
        <div className="flex items-center gap-3">
          <h2 className="text-[13px] font-semibold text-foreground">Top Selling Items</h2>
          <div className="flex rounded-md border border-border text-[10px] font-medium">
            <button
              onClick={() => onSortChange("revenue")}
              className={cn(
                "rounded-l-md px-2 py-0.5 transition-colors",
                sortBy === "revenue"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted",
              )}
            >
              Revenue
            </button>
            <button
              onClick={() => onSortChange("units")}
              className={cn(
                "rounded-r-md px-2 py-0.5 transition-colors",
                sortBy === "units"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted",
              )}
            >
              Units
            </button>
          </div>
        </div>
        <Link
          href="/reports/sales-by-item"
          className="text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          View all &rarr;
        </Link>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              <TopItemsHeader className="w-8 px-5 text-left">#</TopItemsHeader>
              <TopItemsHeader align="left">Item</TopItemsHeader>
              <TopItemsHeader>Units</TopItemsHeader>
              <TopItemsHeader>Revenue</TopItemsHeader>
              <TopItemsHeader>Margin</TopItemsHeader>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, index) => (
                <tr key={index} className="border-b border-border last:border-0">
                  {Array.from({ length: 5 }).map((__, cellIndex) => (
                    <td key={cellIndex} className="px-4 py-1.5">
                      <div className="h-4 animate-pulse rounded bg-muted/40" />
                    </td>
                  ))}
                </tr>
              ))
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-5 py-8 text-center text-[13px] text-muted-foreground">
                  No item sales data for this period
                </td>
              </tr>
            ) : (
              items.map((item, index) => <TopItemsRow key={item.productId} item={item} index={index} />)
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TopItemsHeader({
  align = "right",
  className,
  children,
}: {
  align?: "left" | "right";
  className?: string;
  children: ReactNode;
}) {
  return (
    <th
      scope="col"
      className={cn(
        "px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground",
        align === "right" ? "text-right" : "text-left",
        className,
      )}
    >
      {children}
    </th>
  );
}

function TopItemsRow({ item, index }: { item: SalesByItemRow; index: number }) {
  const margin = parseFloat(item.marginPct);

  return (
    <tr className="border-b border-border transition-colors last:border-0 hover:bg-muted/20">
      <td className="px-5 py-1.5 text-[12px] font-medium text-muted-foreground">{index + 1}</td>
      <td className="px-4 py-1.5">
        <div className="text-[12px] font-medium text-foreground">{item.productName}</div>
        <div className="mt-px font-mono text-[10px] text-muted-foreground">{item.sku}</div>
      </td>
      <td className="px-4 py-1.5 text-right font-mono text-[12px] tabular-nums text-foreground">
        {item.unitsSold.toLocaleString("en-PH")}
      </td>
      <td className="px-4 py-1.5 text-right font-mono text-[12px] tabular-nums text-foreground">
        {fmtPeso(item.totalRevenue)}
      </td>
      <td className="px-4 py-1.5 text-right font-mono text-[12px] tabular-nums">
        <span
          className={cn(
            "font-medium",
            margin >= MARGIN_THRESHOLDS.GOOD
              ? "text-emerald-600"
              : margin >= MARGIN_THRESHOLDS.WARNING
                ? "text-amber-600"
                : "text-red-500",
          )}
        >
          {margin.toFixed(1)}%
        </span>
      </td>
    </tr>
  );
}
