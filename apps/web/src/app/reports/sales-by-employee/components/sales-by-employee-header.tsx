import type { ReactNode } from "react";
import { DollarSign, Hash, TrendingUp, UserCog, Users } from "lucide-react";
import type { SalesSummary } from "@/hooks/use-sales-reports";
import { fmtCurrency } from "../utils";

type SalesByEmployeeHeaderProps = {
  summary: SalesSummary | undefined;
  employeeCount: number;
  avgPerEmployee: number;
};

export function SalesByEmployeeHeader({
  summary,
  employeeCount,
  avgPerEmployee,
}: SalesByEmployeeHeaderProps) {
  return (
    <div className="mb-5">
      <div className="flex items-center gap-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/[0.06]">
          <UserCog size={16} className="text-primary" />
        </div>
        <h1 className="text-[18px] font-semibold tracking-tight text-foreground">Sales by Employee</h1>
      </div>
      <p className="mt-1.5 text-[13px] leading-5 text-muted-foreground">
        Per-employee sales metrics, discounts, and refund rates.
      </p>

      {summary && (
        <div className="mt-4 flex flex-wrap gap-5">
          <SummaryMetric icon={<DollarSign size={11} className="text-muted-foreground" />} label="Revenue" value={fmtCurrency(summary.totalRevenue)} />
          <Divider />
          <SummaryMetric icon={<Hash size={11} className="text-muted-foreground" />} label="Transactions" value={Number(summary.totalTransactions).toLocaleString()} />
          <Divider />
          <SummaryMetric icon={<Users size={11} className="text-muted-foreground" />} label="Employees" value={employeeCount} />
          <Divider />
          <SummaryMetric icon={<TrendingUp size={11} className="text-muted-foreground" />} label="Avg / Employee" value={fmtCurrency(avgPerEmployee)} />
          <Divider />
          <SummaryMetric
            icon={<DollarSign size={11} className="text-muted-foreground" />}
            label="Total Discounts"
            value={fmtCurrency(summary.totalDiscounts)}
            valueClassName="text-amber-600"
          />
        </div>
      )}
    </div>
  );
}

function SummaryMetric({
  icon,
  label,
  value,
  valueClassName = "text-foreground",
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  valueClassName?: string;
}) {
  return (
    <div className="flex items-center gap-2 text-[13px]">
      <div className="flex h-5 w-5 items-center justify-center rounded bg-muted">{icon}</div>
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-semibold tabular-nums ${valueClassName}`}>{value}</span>
    </div>
  );
}

function Divider() {
  return <div className="h-4 w-px bg-border" />;
}
