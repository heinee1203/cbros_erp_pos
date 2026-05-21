import { Search, X } from "lucide-react";

type CategorySearchBarProps = {
  value: string;
  onChange: (value: string) => void;
  onClear: () => void;
};

export function CategorySearchBar({ value, onChange, onClear }: CategorySearchBarProps) {
  return (
    <div className="mb-4">
      <div className="relative">
        <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Search families, categories, and sub-categories..."
          className="h-9 w-full rounded-lg border border-border bg-background pr-3 text-[13px] text-foreground shadow-[0_1px_2px_0_rgba(0,0,0,0.04)] outline-none placeholder:text-muted-foreground/60 transition-colors focus:border-primary/40 focus:ring-2 focus:ring-primary/[0.08]"
          style={{ paddingLeft: "2.125rem" }}
        />
        {value && (
          <button
            onClick={onClear}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
          >
            <X size={12} />
          </button>
        )}
      </div>
    </div>
  );
}
