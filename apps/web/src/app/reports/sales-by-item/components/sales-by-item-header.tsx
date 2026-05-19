import type { ReactNode } from "react";
import { DollarSign, Hash, Package, TrendingUp } from "lucide-react";
import type { SalesSummary } from "@/hooks/use-sales-reports";
import { fmt } from "../utils";

type SalesByItemHeaderProps = {
  summary: SalesSummary | undefined;
  uniqueItemCount: number;
};

export function SalesByItemHeader({ summary, uniqueItemCount }: SalesByItemHeaderProps) {
  return (
    <div className="mb-5">
      <div className="flex items-center gap-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/[0.06]">
          <Package size={16} className="text-primary" />
        </div>
        <h1 className="text-[18px] font-semibold tracking-tight text-foreground">Sales by Item</h1>
      </div>
      <p className="mt-1.5 text-[13px] leading-5 text-muted-foreground">
        Item-level sales breakdown with revenue, cost, and margin analysis.
      </p>

      {summary && (
        <div className="mt-4 flex flex-wrap gap-5">
          <SummaryMetric
            icon={<DollarSign size={11} className="text-muted-foreground" />}
            label="Revenue"
            value={"\u20B1" + fmt(summary.totalRevenue)}
          />
          <Divider />
          <SummaryMetric
            icon={<Hash size={11} className="text-muted-foreground" />}
            label="Transactions"
            value={Number(summary.totalTransactions).toLocaleString()}
          />
          <Divider />
          <SummaryMetric
            icon={<TrendingUp size={11} className="text-muted-foreground" />}
            label="Avg Sale"
            value={"\u20B1" + fmt(summary.avgTransactionValue)}
          />
          <Divider />
          <SummaryMetric
            icon={<Package size={11} className="text-muted-foreground" />}
            label="Items Sold"
            value={uniqueItemCount.toLocaleString()}
          />
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
