import { Warehouse } from "lucide-react";

type EmptyStateProps = {
  hasFilters: boolean;
};

export function EmptyState({ hasFilters }: EmptyStateProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 py-20 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted">
        <Warehouse size={24} className="text-muted-foreground" />
      </div>
      <div>
        <p className="text-sm font-medium text-foreground">
          {hasFilters ? "No items match your filters" : "No inventory tracked"}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {hasFilters
            ? "Try broadening your search criteria or clearing filters."
            : "Inventory records will appear here once stock is received."}
        </p>
      </div>
    </div>
  );
}
