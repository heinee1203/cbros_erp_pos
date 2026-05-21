import { BarChart3 } from "lucide-react";

export function ReportsOverviewHeader() {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/[0.06]">
        <BarChart3 className="h-5 w-5 text-primary" />
      </div>
      <div>
        <h1 className="text-lg font-semibold text-foreground">Sales Analytics</h1>
        <p className="text-[13px] text-muted-foreground">
          Revenue performance, daily trends, and period comparisons
        </p>
      </div>
    </div>
  );
}
