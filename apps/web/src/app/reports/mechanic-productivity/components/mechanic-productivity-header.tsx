import { DollarSign, Hash, TrendingUp, Trophy, Wrench } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { MechanicProductivityController } from "../types";
import { fmtCurrency, fmtNumber } from "../utils";

type MechanicProductivityHeaderProps = {
  controller: MechanicProductivityController;
};

export function MechanicProductivityHeader({ controller }: MechanicProductivityHeaderProps) {
  return (
    <div className="mb-5">
      <div className="flex items-center gap-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/[0.06]">
          <Wrench size={16} className="text-primary" />
        </div>
        <h1 className="text-[18px] font-semibold tracking-tight text-foreground">Mechanic Productivity</h1>
      </div>
      <p className="mt-1.5 text-[13px] text-muted-foreground">
        Labor revenue, job count, and commission per technician
      </p>

      {controller.summary && (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <KPICard icon={<DollarSign size={12} />} label="Total Labor" value={fmtCurrency(controller.summary.totalRevenue)} />
          <KPICard icon={<Hash size={12} />} label="Total Jobs" value={fmtNumber(controller.summary.totalJobs)} />
          <KPICard icon={<TrendingUp size={12} />} label="Avg/Job" value={fmtCurrency(controller.summary.avgPerJob)} />
          <KPICard
            icon={<DollarSign size={12} />}
            label="Total Commission"
            value={fmtCurrency(controller.totalCommission)}
            className="text-amber-600"
            accent
          />
          <KPICard icon={<Trophy size={12} />} label="Top Technician" value={controller.summary.topTechnician} />
        </div>
      )}
    </div>
  );
}

function KPICard({
  icon,
  label,
  value,
  accent,
  className,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  accent?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-background p-3.5 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]",
        accent && "border-amber-200 bg-amber-50/30 dark:border-amber-800 dark:bg-amber-950/20",
      )}
    >
      <div className="mb-1 flex items-center gap-1.5 text-muted-foreground">
        {icon}
        <span className="text-[11px] font-medium uppercase tracking-wider">{label}</span>
      </div>
      <div className={cn("text-[18px] font-bold tabular-nums text-foreground", className)}>{value}</div>
    </div>
  );
}
