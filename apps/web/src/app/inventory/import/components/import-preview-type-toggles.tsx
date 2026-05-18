import { cn } from "@/lib/utils";
import { getModeScopedUpdateCount } from "../import-mode-policy";
import type { ImportMode, PreviewResponse } from "../types";

type ImportPreviewTypeTogglesProps = {
  preview: PreviewResponse;
  importMode: ImportMode;
  includeCreates: boolean;
  includeUpdates: boolean;
  includeNoChange: boolean;
  onIncludeCreatesChange: (value: boolean) => void;
  onIncludeUpdatesChange: (value: boolean) => void;
  onIncludeNoChangeChange: (value: boolean) => void;
};

export function ImportPreviewTypeToggles({
  preview,
  importMode,
  includeCreates,
  includeUpdates,
  includeNoChange,
  onIncludeCreatesChange,
  onIncludeUpdatesChange,
  onIncludeNoChangeChange,
}: ImportPreviewTypeTogglesProps) {
  const updateCount = getModeScopedUpdateCount(preview, importMode);
  const noChangeCount =
    importMode === "update_only"
      ? preview.noChangeCount + Math.max(0, preview.updateCount - updateCount)
      : preview.noChangeCount;

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm font-medium text-muted-foreground">Import:</span>
      {importMode !== "update_only" && (
        <button
          onClick={() => {
            if (includeUpdates || !includeCreates) onIncludeCreatesChange(!includeCreates);
          }}
          className={cn(
            "rounded-full border px-3 py-1 text-sm font-medium transition-colors",
            includeCreates
              ? "border-emerald-300 bg-emerald-50 text-emerald-700"
              : "border-border bg-muted/50 text-muted-foreground line-through",
          )}
        >
          {includeCreates ? "✓" : "✗"} Creates ({preview.createCount.toLocaleString()})
        </button>
      )}
      {importMode !== "create_only" && (
        <button
          onClick={() => {
            if (includeCreates || !includeUpdates) onIncludeUpdatesChange(!includeUpdates);
          }}
          className={cn(
            "rounded-full border px-3 py-1 text-sm font-medium transition-colors",
            includeUpdates
              ? "border-primary/30 bg-primary/5 text-primary"
              : "border-border bg-muted/50 text-muted-foreground line-through",
          )}
        >
          {includeUpdates ? "✓" : "✗"} Updates ({updateCount.toLocaleString()})
        </button>
      )}
      <button
        onClick={() => onIncludeNoChangeChange(!includeNoChange)}
        className={cn(
          "rounded-full border px-3 py-1 text-sm font-medium transition-colors",
          includeNoChange
            ? "border-slate-300 bg-slate-50 text-slate-700"
            : "border-border bg-muted/50 text-muted-foreground",
        )}
        title={
          includeNoChange
            ? "Hide rows with no detected changes"
            : "Show a sample of rows that will be skipped (no detected changes)"
        }
      >
        {includeNoChange ? "✓" : "+"} No Change ({noChangeCount.toLocaleString()})
      </button>
      <span className="rounded-full border border-border bg-muted/50 px-3 py-1 text-sm text-muted-foreground">
        Errors ({preview.errorCount})
      </span>
    </div>
  );
}
