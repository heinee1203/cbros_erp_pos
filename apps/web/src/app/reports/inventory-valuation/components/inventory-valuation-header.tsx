import type { ReactNode } from "react";
import { AlertTriangle, DollarSign, Hash, Layers, Package, TrendingUp, X } from "lucide-react";
import type { ValuationTotals } from "@/hooks/use-inventory-valuation";
import { cn } from "@/lib/utils";
import { fmtCompact, fmtNumber, marginColor } from "../utils";

type InventoryValuationHeaderProps = {
  totals: ValuationTotals | undefined;
  dismissWarning: boolean;
  onDismissWarning: () => void;
};

export function InventoryValuationHeader({
  totals,
  dismissWarning,
  onDismissWarning,
}: InventoryValuationHeaderProps) {
  return (
    <div className="mb-5">
      <div className="flex items-center gap-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/[0.06]">
          <DollarSign size={16} className="text-primary" />
        </div>
        <h1 className="text-[18px] font-semibold tracking-tight text-foreground">Inventory Valuation</h1>
      </div>
      <p className="mt-1.5 text-[13px] leading-5 text-muted-foreground">
        Total inventory value at cost and retail across all locations. Track capital allocation by category, brand, family, or branch.
      </p>

      {totals && (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <KpiCard icon={<Hash size={12} />} label="Total SKUs" value={fmtNumber(totals.skuCount)} />
          <KpiCard icon={<Package size={12} />} label="Total Units" value={fmtNumber(totals.totalUnits)} />
          <KpiCard icon={<DollarSign size={12} />} label="Cost Value" value={fmtCompact(totals.costValue)} accent />
          <KpiCard icon={<DollarSign size={12} />} label="Retail Value" value={fmtCompact(totals.retailValue)} />
          <KpiCard
            icon={<TrendingUp size={12} />}
            label="Potential Profit"
            value={fmtCompact(totals.potentialProfit)}
            className={totals.potentialProfit >= 0 ? "text-emerald-600" : "text-red-500"}
          />
          <KpiCard
            icon={<Layers size={12} />}
            label="Avg Margin"
            value={`${totals.adjustedMarginPct}%`}
            className={marginColor(totals.adjustedMarginPct)}
            subtitle={
              totals.zeroSellCount > 0
                ? `Excl. ${fmtNumber(totals.zeroSellCount)} items w/ \u20B10 sell`
                : undefined
            }
          />
        </div>
      )}

      {totals && !dismissWarning && (totals.zeroCostCount > 0 || totals.zeroSellCount > 0) && (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-1.5 text-[12px] dark:border-amber-800 dark:bg-amber-950/30">
          <AlertTriangle size={14} className="flex-shrink-0 text-amber-600" />
          <span className="text-amber-800 dark:text-amber-200">
            {totals.zeroCostCount > 0 && <>{fmtNumber(totals.zeroCostCount)} items have {"\u20B1"}0 cost</>}
            {totals.zeroCostCount > 0 && totals.zeroSellCount > 0 && " and "}
            {totals.zeroSellCount > 0 && <>{fmtNumber(totals.zeroSellCount)} items have {"\u20B1"}0 sell price</>}
            {" "}&mdash; valuation may be incomplete. Use the exclude toggles below to filter them out.
          </span>
          <button onClick={onDismissWarning} className="ml-auto text-amber-600 hover:text-amber-800">
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  accent,
  className,
  subtitle,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  accent?: boolean;
  className?: string;
  subtitle?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-background p-3.5 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]",
        accent && "border-primary/20 bg-primary/[0.02]",
      )}
    >
      <div className="mb-1 flex items-center gap-1.5 text-muted-foreground">
        {icon}
        <span className="text-[11px] font-medium">{label}</span>
      </div>
      <div className={cn("text-[18px] font-bold tabular-nums text-foreground", className)}>{value}</div>
      {subtitle && <div className="mt-0.5 text-[9px] leading-tight text-muted-foreground">{subtitle}</div>}
    </div>
  );
}
