import type { ReactNode } from "react";
import { Hash, Tag, TrendingUp } from "lucide-react";

type DemandByTagHeaderProps = {
  totalApplications: number;
  totalUnits: number;
  mostInDemand: string;
};

export function DemandByTagHeader({
  totalApplications,
  totalUnits,
  mostInDemand,
}: DemandByTagHeaderProps) {
  return (
    <div className="mb-6">
      <div className="flex items-center gap-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/[0.06]">
          <TrendingUp size={16} className="text-primary" />
        </div>
        <h1 className="text-[18px] font-semibold tracking-tight text-foreground">Demand by Application</h1>
      </div>
      <p className="mt-1.5 text-[13px] leading-5 text-muted-foreground">
        Analyze sales demand by tire size, vehicle fitment, and application codes.
      </p>

      <div className="mt-4 flex gap-5">
        <SummaryMetric icon={<Tag size={11} className="text-muted-foreground" />} label="Applications" value={totalApplications} />
        <div className="h-4 w-px bg-border" />
        <SummaryMetric icon={<Hash size={11} className="text-muted-foreground" />} label="Units Sold" value={totalUnits.toLocaleString()} />
        <div className="h-4 w-px bg-border" />
        <SummaryMetric
          icon={<TrendingUp size={11} className="text-muted-foreground" />}
          label="Most In-Demand"
          value={mostInDemand}
          wide
        />
      </div>
    </div>
  );
}

function SummaryMetric({
  icon,
  label,
  value,
  wide = false,
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 text-[13px]">
      <div className="flex h-5 w-5 items-center justify-center rounded bg-muted">{icon}</div>
      <span className="text-muted-foreground">{label}</span>
      <span className={wide ? "max-w-[200px] truncate font-semibold text-foreground" : "font-semibold tabular-nums text-foreground"}>
        {value}
      </span>
    </div>
  );
}
