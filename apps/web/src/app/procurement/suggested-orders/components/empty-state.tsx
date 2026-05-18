import { ShoppingCart } from "lucide-react";

type EmptyStateProps = {
  hasFilters: boolean;
};

export function EmptyState({ hasFilters }: EmptyStateProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 py-20 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted">
        <ShoppingCart size={24} className="text-muted-foreground" />
      </div>
      <div>
        <p className="text-sm font-medium text-foreground">
          {hasFilters ? "No suggestions match your filters" : "No reorder suggestions computed yet"}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {hasFilters
            ? "Try broadening your search criteria or clearing filters."
            : 'Click "Refresh Suggestions" to compute reorder points and suggested quantities.'}
        </p>
      </div>
    </div>
  );
}
