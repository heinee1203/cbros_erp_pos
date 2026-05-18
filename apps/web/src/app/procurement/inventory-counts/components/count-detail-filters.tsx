import { AlertTriangle, Search } from "lucide-react";

import type { CountDetailController } from "../lib/use-count-detail-controller";

type CountDetailFiltersProps = {
  controller: CountDetailController;
};

export function CountDetailFilters({ controller }: CountDetailFiltersProps) {
  return (
    <div className="border-b border-border bg-muted/30 px-5 py-1.5">
      <div className="flex items-center gap-1.5">
        <button
          onClick={controller.toggleVarianceOnly}
          className={`h-7 rounded border px-2 text-[11px] font-medium transition-colors ${
            controller.varianceOnly
              ? "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
              : "border-border text-muted-foreground hover:bg-accent"
          }`}
        >
          <AlertTriangle size={10} className="mr-1 inline" />
          Variances Only
        </button>
        <button
          onClick={controller.toggleUncountedOnly}
          className={`h-7 rounded border px-2 text-[11px] font-medium transition-colors ${
            controller.uncountedOnly
              ? "border-primary/30 bg-primary/5 text-primary"
              : "border-border text-muted-foreground hover:bg-accent"
          }`}
        >
          Uncounted Only
        </button>

        <div className="relative ml-auto">
          <Search
            size={12}
            className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground/60"
          />
          <input
            type="text"
            value={controller.lineSearch}
            onChange={(e) => controller.handleLineSearch(e.target.value)}
            placeholder="SKU / product name..."
            className="h-7 w-56 rounded border border-border bg-background pl-7 pr-2 text-[11px] text-foreground outline-none placeholder:text-muted-foreground/50 focus:border-primary"
          />
        </div>
      </div>
    </div>
  );
}
