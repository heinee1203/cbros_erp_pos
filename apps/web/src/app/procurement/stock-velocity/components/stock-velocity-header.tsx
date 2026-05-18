import { Activity, Download, Loader2, RefreshCw, ShoppingCart } from "lucide-react";
import { cn } from "@/lib/utils";
import type { StockVelocityController } from "../lib/use-stock-velocity-controller";

type StockVelocityHeaderProps = {
  controller: StockVelocityController;
};

export function StockVelocityHeader({ controller }: StockVelocityHeaderProps) {
  return (
    <div className="mb-4 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/[0.06]">
          <Activity size={18} className="text-primary" />
        </div>
        <div>
          <h1 className="text-lg font-semibold">Stock Velocity</h1>
          <p className="text-xs text-muted-foreground">
            Demand frequency x days-of-stock classification
            {controller.summary && (
              <span className="ml-2 text-muted-foreground/60">
                Last computed: {getComputedAtLabel(controller)}
              </span>
            )}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => controller.refreshMutation.mutateAsync(undefined)}
          disabled={controller.refreshMutation.isPending}
          className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
        >
          <RefreshCw size={13} className={cn(controller.refreshMutation.isPending && "animate-spin")} />
          {controller.refreshMutation.isPending ? "Computing..." : "Recompute"}
        </button>
        <button
          onClick={controller.handleExport}
          disabled={controller.isExporting}
          title="Download current grid as CSV (respects all filters)"
          className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
        >
          {controller.isExporting ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
          {controller.isExporting ? "Exporting..." : "Export CSV"}
        </button>
        <button
          onClick={() => controller.setViewMode("reorder")}
          className={cn(
            "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium",
            controller.viewMode === "reorder"
              ? "bg-primary text-primary-foreground"
              : "bg-primary text-primary-foreground hover:bg-primary/90",
          )}
        >
          <ShoppingCart size={13} />
          Reorder Suggestions
        </button>
      </div>
    </div>
  );
}

function getComputedAtLabel(controller: StockVelocityController) {
  const ts = controller.summary?.computedAt || controller.allRows[0]?.computedAt;
  if (!ts) return "Never";

  const date = new Date(ts);
  return isNaN(date.getTime()) ? "Unknown" : date.toLocaleString("en-PH");
}
