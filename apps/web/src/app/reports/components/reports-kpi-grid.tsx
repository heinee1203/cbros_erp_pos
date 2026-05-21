import { TrendingDown, TrendingUp } from "lucide-react";
import type { SalesKPIs } from "@/hooks/use-sales-reports";
import { fmtPeso } from "@/lib/format";
import { cn } from "@/lib/utils";

type ReportsKpiGridProps = {
  kpis: SalesKPIs | undefined;
  isLoading: boolean;
};

const KPI_FIELDS = [
  ["Gross Sales", "grossSales"],
  ["Refunds", "refunds"],
  ["Discounts", "discounts"],
  ["Net Sales", "netSales"],
  ["Gross Profit", "grossProfit"],
] as const;

export function ReportsKpiGrid({ kpis, isLoading }: ReportsKpiGridProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="h-[100px] animate-pulse rounded-xl border border-border bg-muted/30" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
      {KPI_FIELDS.map(([label, field]) => (
        <ReportsKpiCard
          key={field}
          label={label}
          currentRaw={kpis?.current[field]}
          priorRaw={kpis?.prior[field]}
          totalTransactions={kpis?.current.totalTransactions ?? 0}
          showComparison={!!kpis}
        />
      ))}
    </div>
  );
}

function ReportsKpiCard({
  label,
  currentRaw,
  priorRaw,
  totalTransactions,
  showComparison,
}: {
  label: string;
  currentRaw: string | undefined;
  priorRaw: string | undefined;
  totalTransactions: number;
  showComparison: boolean;
}) {
  const current = parseFloat(currentRaw ?? "0");
  const prior = parseFloat(priorRaw ?? "0");
  const diff = current - prior;
  const pctChange = prior > 0 ? ((diff / prior) * 100).toFixed(1) : null;
  const isUp = current >= prior;

  return (
    <div className="rounded-xl border border-border bg-background p-4 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
      <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-1.5 text-[20px] font-semibold leading-tight text-foreground">
        {fmtPeso(current)}
      </p>
      <div className="mt-1.5">
        {showComparison && pctChange !== null ? (
          <span
            className={cn(
              "inline-flex items-center gap-1 text-[11px] font-medium",
              isUp ? "text-emerald-600" : "text-red-500",
            )}
          >
            {isUp ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {isUp ? "+" : ""}
            {pctChange}%
            <span className="text-muted-foreground">
              ({isUp ? "+" : ""}
              {fmtPeso(diff)})
            </span>
          </span>
        ) : showComparison ? (
          <span className="text-[11px] text-muted-foreground">
            {totalTransactions} transactions
          </span>
        ) : null}
      </div>
    </div>
  );
}
