import { Search, X } from "lucide-react";

type FilterBarProps = {
  searchQuery: string;
  hasActiveFilters: boolean;
  onSearchChange: (value: string) => void;
  onClear: () => void;
};

export function FilterBar({
  searchQuery,
  hasActiveFilters,
  onSearchChange,
  onClear,
}: FilterBarProps) {
  return (
    <div className="border-b border-border bg-background/50 px-6 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative ml-auto">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search supplier..."
            className="h-8 w-56 rounded-md border border-border bg-background pl-8 pr-3 text-xs text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-primary focus:ring-1 focus:ring-primary/20"
          />
        </div>
        {hasActiveFilters && (
          <button
            onClick={onClear}
            className="flex h-8 items-center gap-1 rounded-md border border-border px-2.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <X size={12} />
            Clear
          </button>
        )}
      </div>
    </div>
  );
}
