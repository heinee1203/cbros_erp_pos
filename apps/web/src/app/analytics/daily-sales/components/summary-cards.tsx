import type { ReactNode } from "react";
import { Award, BarChart3, DollarSign, TrendingDown, TrendingUp } from "lucide-react";

import { cn } from "@/lib/utils";

import { fmtDate, fmtPct, fmtPesoFull } from "../formatters";
import type { SummaryResponse } from "../types";

export function SummaryCards({ summary }: { summary: SummaryResponse }) {
  const growthPositive = summary.yoyGrowthPct != null && summary.yoyGrowthPct >= 0;

  return (
    <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <KPICard
        icon={<DollarSign size={14} />}
        label="Total Revenue"
        value={fmtPesoFull(summary.totalSales)}
        sub={`${summary.dayCount} business days`}
        accent
      />
      <KPICard
        icon={<BarChart3 size={14} />}
        label="Avg Daily Sales"
        value={fmtPesoFull(summary.avgDailySales)}
        sub={
          summary.cashShare != null
            ? `${(summary.cashShare * 100).toFixed(0)}% cash, ${((summary.creditShare ?? 0) * 100).toFixed(0)}% credit`
            : ""
        }
      />
      <KPICard
        icon={<Award size={14} />}
        label="Best Day"
        value={summary.bestDay ? fmtPesoFull(summary.bestDay.amount) : "\u2014"}
        sub={summary.bestDay ? fmtDate(summary.bestDay.date) : ""}
      />
      <KPICard
        icon={growthPositive ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
        label="YoY Growth"
        value={fmtPct(summary.yoyGrowthPct)}
        sub={`vs ${fmtPesoFull(summary.prevTotalSales)} prior`}
        color={
          summary.yoyGrowthPct == null
            ? undefined
            : growthPositive
              ? "text-emerald-600"
              : "text-red-600"
        }
      />
    </div>
  );
}

function KPICard({
  icon,
  label,
  value,
  sub,
  accent,
  color,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
  color?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-background p-4 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]",
        accent && "border-amber-200 bg-amber-50/40 dark:border-amber-800 dark:bg-amber-950/20",
      )}
    >
      <div className="flex items-center gap-1.5 text-muted-foreground">
        {icon}
        <span className="text-[11px] font-medium">{label}</span>
      </div>
      <div className={cn("mt-1 text-xl font-bold tabular-nums text-foreground", color)}>
        {value}
      </div>
      {sub && <div className="mt-0.5 text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
}
