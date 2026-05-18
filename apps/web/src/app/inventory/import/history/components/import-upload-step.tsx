import type { ChangeEvent, DragEvent, RefObject } from "react";
import { FileText, Loader2, Upload } from "lucide-react";

import { cn } from "@/lib/utils";
import { ALL_REASONS } from "../constants";
import type { ImportableReasonType, Step } from "../types";

type ImportUploadStepProps = {
  step: Step;
  file: File | null;
  selectedReasons: Set<ImportableReasonType>;
  fileInputRef: RefObject<HTMLInputElement | null>;
  onToggleReason: (reason: ImportableReasonType) => void;
  onDrop: (event: DragEvent<HTMLDivElement>) => void;
  onDragOver: (event: DragEvent<HTMLDivElement>) => void;
  onInputChange: (event: ChangeEvent<HTMLInputElement>) => void;
};

export function ImportUploadStep({
  step,
  file,
  selectedReasons,
  fileInputRef,
  onToggleReason,
  onDrop,
  onDragOver,
  onInputChange,
}: ImportUploadStepProps) {
  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-border bg-muted/30 p-5">
        <h3 className="mb-3 text-sm font-medium text-foreground">Reason Types to Import</h3>
        <div className="flex flex-wrap gap-3">
          {ALL_REASONS.map((reason) => (
            <label
              key={reason}
              className={cn(
                "flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition",
                selectedReasons.has(reason)
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-background text-muted-foreground hover:border-primary/30",
              )}
            >
              <input
                type="checkbox"
                checked={selectedReasons.has(reason)}
                onChange={() => onToggleReason(reason)}
                className="accent-blue-500"
              />
              {reason}
            </label>
          ))}
        </div>
      </div>

      <div
        onDrop={onDrop}
        onDragOver={onDragOver}
        onClick={() => fileInputRef.current?.click()}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-12 transition",
          step === "parsing"
            ? "pointer-events-none border-primary/40 bg-primary/5"
            : "border-border bg-muted/20 hover:border-primary/30 hover:bg-muted/40",
        )}
      >
        {step === "parsing" ? (
          <>
            <Loader2 size={32} className="animate-spin text-primary" />
            <p className="text-sm text-primary">Parsing CSV...</p>
          </>
        ) : (
          <>
            <Upload size={32} className="text-muted-foreground" />
            <div className="text-center">
              <p className="text-sm font-medium text-foreground">Upload Loyverse Inventory History CSV</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Supports Date, Item, SKU, Store, Employee, Reason, Adjustment format
              </p>
            </div>
          </>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          onChange={onInputChange}
          className="hidden"
        />
      </div>

      {file && step !== "parsing" && (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-4 py-1.5 text-sm">
          <FileText size={14} className="text-muted-foreground" />
          <span className="text-foreground">{file.name}</span>
          <span className="text-muted-foreground">({(file.size / 1024).toFixed(1)} KB)</span>
        </div>
      )}
    </div>
  );
}
