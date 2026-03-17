"use client";

export function EmptyState({ query, hasFilters, onClearFilters }: { query: string; hasFilters: boolean; onClearFilters: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center rounded-lg border border-dashed border-border py-16 text-center">
      <svg className="mb-3 h-10 w-10 text-muted-foreground/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
      <p className="text-sm font-medium text-muted-foreground">No items found</p>
      {query.trim() && <p className="mt-1 text-xs text-muted-foreground/70">No items match &ldquo;{query.trim()}&rdquo;</p>}
      {hasFilters && <button onClick={onClearFilters} className="mt-3 text-xs font-medium text-primary hover:underline">Clear all filters</button>}
    </div>
  );
}
