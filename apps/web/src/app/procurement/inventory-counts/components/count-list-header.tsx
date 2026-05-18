import { Plus } from "lucide-react";

type CountListHeaderProps = {
  onCreateNew: () => void;
};

export function CountListHeader({ onCreateNew }: CountListHeaderProps) {
  return (
    <div className="flex items-center justify-between border-b border-border bg-background px-5 py-1.5">
      <div className="flex items-center gap-2.5">
        <h1 className="text-sm font-semibold text-foreground">Inventory Counts</h1>
        <span className="text-[10px] text-muted-foreground">
          Cycle counts &amp; physical inventory verification
        </span>
      </div>
      <button
        onClick={onCreateNew}
        className="flex h-7 items-center gap-1.5 rounded-md bg-primary px-3 text-[11px] font-medium text-primary-foreground transition-colors hover:bg-primary/90"
      >
        <Plus size={12} />
        New Count
      </button>
    </div>
  );
}
