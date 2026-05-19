import type { ReactNode } from "react";
import { DollarSign, Grid3x3, Hash, Percent } from "lucide-react";
import type { SalesSummary } from "@/hooks/use-sales-reports";
import { fmtCurrency } from "../utils";

type SalesByCategoryHeaderProps = {
  summary: SalesSummary | undefined;
  avgMargin: number;
  categoryCount: number;
};

export function SalesByCategoryHeader({
  summary,
  avgMargin,
  categoryCount,
}: SalesByCategoryHeaderProps) {
  return (
    <div className="mb-5">
      <div className="flex items-center gap-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/[0.06]">
          <Grid3x3 size={16} className="text-primary" />
        </div>
        <h1 className="text-[18px] font-semibold tracking-tight text-foreground">Sales by Category</h1>
      </div>
      <p className="mt-1.5 text-[13px] leading-5 text-muted-foreground">
        Category-level performance with revenue, margin, and product coverage.
      </p>

      {summary && (
        <div className="mt-4 flex flex-wrap gap-5">
          <SummaryMetric icon={<DollarSign size={11} className="text-muted-foreground" />} label="Revenue" value={fmtCurrency(summary.totalRevenue)} />
          <Divider />
          <SummaryMetric icon={<Hash size={11} className="text-muted-foreground" />} label="Transactions" value={Number(summary.totalTransactions).toLocaleString()} />
          <Divider />
          <SummaryMetric icon={<Percent size={11} className="text-muted-foreground" />} label="Avg Margin" value={`${avgMargin.toFixed(1)}%`} />
          <Divider />
          <SummaryMetric icon={<Grid3x3 size={11} className="text-muted-foreground" />} label="Categories" value={categoryCount} />
        </div>
      )}
    </div>
  );
}

function SummaryMetric({ icon, label, value }: { icon: ReactNode; label: string; value: ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-[13px]">
      <div className="flex h-5 w-5 items-center justify-center rounded bg-muted">{icon}</div>
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold tabular-nums text-foreground">{value}</span>
    </div>
  );
}

function Divider() {
  return <div className="h-4 w-px bg-border" />;
}
