import { cn } from "@/lib/utils";
import { getModeScopedUpdateCount } from "../import-mode-policy";
import type { ImportMode, PreviewResponse } from "../types";

type ImportPreviewSummaryProps = {
  preview: PreviewResponse;
  importMode: ImportMode;
  includeCreates: boolean;
  includeUpdates: boolean;
};

export function ImportPreviewSummary({
  preview,
  importMode,
  includeCreates,
  includeUpdates,
}: ImportPreviewSummaryProps) {
  const updateCount = getModeScopedUpdateCount(preview, importMode);
  const noChangeCount =
    importMode === "update_only"
      ? preview.noChangeCount + Math.max(0, preview.updateCount - updateCount)
      : preview.noChangeCount;

  const cards = [
    {
      label: "Will Import",
      value: (includeCreates ? preview.createCount : 0) + (includeUpdates ? updateCount : 0),
      color: "text-foreground",
    },
    {
      label: "Creates",
      value: preview.createCount,
      color: includeCreates ? "text-emerald-600" : "text-muted-foreground/50",
      dimmed: !includeCreates,
    },
    {
      label: "Updates",
      value: updateCount,
      color: includeUpdates ? "text-primary" : "text-muted-foreground/50",
      dimmed: !includeUpdates,
    },
    {
      label: "No Change",
      value: noChangeCount,
      color: "text-muted-foreground",
    },
    { label: "Errors", value: preview.errorCount, color: "text-red-600" },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
      {cards.map((card) => (
        <div
          key={card.label}
          className={cn(
            "rounded-lg border border-border bg-muted/50 px-4 py-3 transition-opacity",
            card.dimmed && "opacity-40",
          )}
        >
          <div className="text-xs text-muted-foreground">{card.label}</div>
          <div className={cn("mt-1 text-2xl font-semibold", card.color)}>
            {card.value.toLocaleString()}
          </div>
        </div>
      ))}
    </div>
  );
}
