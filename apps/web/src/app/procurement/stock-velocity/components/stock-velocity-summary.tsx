import { Package, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { VELOCITY_CLASSES } from "../constants";
import type { StockVelocityController } from "../lib/use-stock-velocity-controller";
import { fmtPeso } from "../utils";

type StockVelocitySummaryProps = {
  controller: StockVelocityController;
};

export function StockVelocitySummary({ controller }: StockVelocitySummaryProps) {
  if (!controller.summary) return null;

  return (
    <div className="mb-4 flex flex-wrap gap-2">
      {VELOCITY_CLASSES.map((velocityClass) => {
        const count = controller.summary?.[velocityClass.summaryKey] ?? 0;
        const denom = controller.summary?.totalActiveProducts || controller.summary?.total || 0;
        const pct = denom > 0 ? ((count / denom) * 100).toFixed(1) : "0";
        const isActive = controller.velocityFilter === velocityClass.key;

        return (
          <button
            key={velocityClass.key}
            onClick={() => controller.setVelocityFilter(isActive ? "all" : velocityClass.key)}
            className={cn(
              "flex items-center gap-2 rounded-lg border px-3 py-2 text-xs transition-colors",
              isActive ? "border-primary bg-primary/5 ring-1 ring-primary/20" : "border-border bg-background hover:bg-muted",
            )}
          >
            <velocityClass.icon size={14} className={cn(isActive ? "text-primary" : "text-muted-foreground")} />
            <span className="font-semibold">{count.toLocaleString()}</span>
            <span className="text-muted-foreground">{velocityClass.label}</span>
            <span className="text-muted-foreground/60">({pct}%)</span>
          </button>
        );
      })}
      {controller.summary.untrackedCount > 0 && <UntrackedSummaryCard controller={controller} />}
      <div className="ml-auto flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs">
        <XCircle size={14} className="text-destructive" />
        <span className="text-muted-foreground">Dead Stock Value:</span>
        <span className="font-semibold text-destructive">{fmtPeso(controller.summary.deadStockValue)}</span>
      </div>
    </div>
  );
}

function UntrackedSummaryCard({ controller }: StockVelocitySummaryProps) {
  const denom = controller.summary?.totalActiveProducts || controller.summary?.total || 0;
  const pct = denom > 0 ? ((controller.summary!.untrackedCount / denom) * 100).toFixed(1) : "0";
  const isActive = controller.velocityFilter === "UNTRACKED";

  return (
    <button
      onClick={() => controller.setVelocityFilter(isActive ? "all" : "UNTRACKED")}
      title="Active SKUs with no stock and no sales in the last 90 days. Click to include in grid."
      className={cn(
        "flex items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-xs transition-colors",
        isActive ? "border-primary bg-primary/5 ring-1 ring-primary/20" : "border-border bg-muted/40 text-muted-foreground hover:bg-muted",
      )}
    >
      <Package size={14} className={cn(isActive ? "text-primary" : "text-muted-foreground/70")} />
      <span className="font-semibold">{controller.summary!.untrackedCount.toLocaleString()}</span>
      <span>Untracked</span>
      <span className="text-muted-foreground/60">({pct}%)</span>
    </button>
  );
}
