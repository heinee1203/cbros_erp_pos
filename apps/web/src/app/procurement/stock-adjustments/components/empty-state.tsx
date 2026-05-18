import { ClipboardList } from "lucide-react";

type EmptyStateProps = {
  hasFilters: boolean;
};

export function EmptyState({ hasFilters }: EmptyStateProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 py-20 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted">
        <ClipboardList size={24} className="text-muted-foreground" />
      </div>
      <div>
        <p className="text-sm font-medium text-foreground">
          {hasFilters ? "No adjustments match your filters" : "No adjustments recorded"}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {hasFilters
            ? "Try broadening your search criteria or clearing filters."
            : "Stock adjustments will appear here as they are recorded."}
        </p>
      </div>
    </div>
  );
}
