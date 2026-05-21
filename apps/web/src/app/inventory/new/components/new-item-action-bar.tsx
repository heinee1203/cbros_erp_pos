"use client";

import { Check, Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

type NewItemActionBarProps = {
  isCollapsed: boolean;
  isValid: boolean;
  isSaving: boolean;
  savingStep: string | null;
  onCancel: () => void;
  onSave: (addAnother: boolean) => void;
};

export function NewItemActionBar({
  isCollapsed,
  isValid,
  isSaving,
  savingStep,
  onCancel,
  onSave,
}: NewItemActionBarProps) {
  return (
    <div
      className={cn(
        "fixed bottom-0 left-0 right-0 z-30 border-t border-border bg-background/95 backdrop-blur-sm transition-[left] duration-200",
        isCollapsed ? "md:left-16" : "md:left-[252px]",
      )}
    >
      <div className="flex items-center justify-between px-6 py-3">
        <button
          onClick={onCancel}
          className="rounded-lg border border-border bg-background px-4 py-2 text-[13px] font-medium text-foreground transition-colors hover:bg-muted"
        >
          Cancel
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onSave(true)}
            disabled={!isValid || isSaving}
            className="rounded-lg border border-border bg-background px-4 py-2 text-[13px] font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
          >
            Save & Add Another
          </button>
          <button
            onClick={() => onSave(false)}
            disabled={!isValid || isSaving}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-5 py-2 text-[13px] font-medium text-primary-foreground shadow-sm transition-all hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSaving ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Check size={14} />
            )}
            {savingStep ? savingStep : isSaving ? "Saving..." : "Save Item"}
          </button>
        </div>
      </div>
    </div>
  );
}
