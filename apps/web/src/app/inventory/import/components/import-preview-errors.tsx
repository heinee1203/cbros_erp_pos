import { AlertTriangle, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PreviewResponse } from "../types";

type ImportPreviewErrorsProps = {
  errors: PreviewResponse["errors"];
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
};

export function ImportPreviewErrors({
  errors,
  expanded,
  onExpandedChange,
}: ImportPreviewErrorsProps) {
  if (errors.length === 0) return null;

  return (
    <div className="rounded-lg border border-red-300 bg-red-50">
      <button
        onClick={() => onExpandedChange(!expanded)}
        className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-red-700"
      >
        <span className="flex items-center gap-2">
          <AlertTriangle size={14} />
          {errors.length} {errors.length === 1 ? "error" : "errors"} found
        </span>
        <ChevronDown size={14} className={cn("transition-transform", expanded && "rotate-180")} />
      </button>
      {expanded && (
        <div className="border-t border-red-200 px-4 py-3">
          <div className="max-h-60 space-y-1 overflow-y-auto">
            {errors.map((error, index) => {
              const legacyError = error as typeof error & { row?: number };
              return (
                <div key={index} className="flex gap-3 text-xs">
                  <span className="shrink-0 text-red-600">
                    Row {legacyError.row ?? error.rowIndex}
                  </span>
                  {error.field && (
                    <span className="shrink-0 font-mono text-red-600">{error.field}</span>
                  )}
                  <span className="text-red-700">{error.message}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
