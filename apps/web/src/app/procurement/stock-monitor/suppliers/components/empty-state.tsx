import { Truck } from "lucide-react";

type EmptyStateProps = {
  hasFilters: boolean;
};

export function EmptyState({ hasFilters }: EmptyStateProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 py-20 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted">
        <Truck size={24} className="text-muted-foreground" />
      </div>
      <div>
        <p className="text-sm font-medium text-foreground">
          {hasFilters ? "No suppliers match your search" : "No supplier metrics computed yet"}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {hasFilters
            ? "Try broadening your search."
            : "Refresh metrics from the Stock Monitor page to compute supplier data."}
        </p>
      </div>
    </div>
  );
}
