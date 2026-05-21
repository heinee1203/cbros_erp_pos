import { Loader2, Plus } from "lucide-react";

type QuickAddFooterProps = {
  isPending: boolean;
  isValid: boolean;
  onSave: () => void;
  onSaveAndOpen: () => void;
};

export function QuickAddFooter({
  isPending,
  isValid,
  onSave,
  onSaveAndOpen,
}: QuickAddFooterProps) {
  return (
    <div className="space-y-2 border-t border-border p-4">
      <button
        onClick={onSave}
        disabled={!isValid || isPending}
        className="flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-primary text-[13px] font-medium text-primary-foreground shadow-sm transition-all hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isPending ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
        {isPending ? "Creating…" : "Save Item"}
      </button>
      <button
        onClick={onSaveAndOpen}
        disabled={!isValid || isPending}
        className="flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-border bg-background text-[13px] font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
      >
        Save & Open Full Setup
      </button>
    </div>
  );
}
