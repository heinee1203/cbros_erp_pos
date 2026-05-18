import { cn } from "@/lib/utils";
import { filterPreviewChangesForMode, getModeScopedUpdateRows } from "../import-mode-policy";
import type { ImportMode, PreviewResponse, PreviewSummaryRow } from "../types";

type ImportPreviewTableProps = {
  preview: PreviewResponse;
  importMode: ImportMode;
  includeCreates: boolean;
  includeUpdates: boolean;
  includeNoChange: boolean;
};

export function ImportPreviewTable({
  preview,
  importMode,
  includeCreates,
  includeUpdates,
  includeNoChange,
}: ImportPreviewTableProps) {
  const rows: PreviewSummaryRow[] = [];
  if (includeCreates) rows.push(...(preview.createPreview ?? []));
  if (includeUpdates) rows.push(...getModeScopedUpdateRows(preview, importMode));
  if (includeNoChange) rows.push(...(preview.noChangePreview ?? []));

  return (
    <div className="rounded-lg border border-border bg-muted/50">
      <div className="border-b border-border px-4 py-3">
        <h3 className="text-sm font-medium text-foreground">
          Preview{" "}
          <span className="font-normal text-muted-foreground">
            (first {Math.min(preview.preview?.length ?? 0, 100)} rows)
          </span>
        </h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="px-4 py-2 font-medium">Row</th>
              <th className="px-4 py-2 font-medium">SKU</th>
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">Variant</th>
              <th className="px-4 py-2 font-medium">Action</th>
              <th className="px-4 py-2 font-medium">Changes</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 100).map((row) => (
              <ImportPreviewTableRow key={row.rowIndex} row={row} importMode={importMode} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ImportPreviewTableRow({
  row,
  importMode,
}: {
  row: PreviewSummaryRow;
  importMode: ImportMode;
}) {
  const changes = row.changes ?? [];
  const filteredChanges = filterPreviewChangesForMode(changes, importMode);

  return (
    <tr className="border-b border-border hover:bg-accent">
      <td className="px-4 py-2 text-muted-foreground">{row.rowIndex}</td>
      <td className="px-4 py-2 font-mono text-xs text-foreground">{row.sku}</td>
      <td className="max-w-[200px] truncate px-4 py-2 text-foreground">{row.name}</td>
      <td className="max-w-[150px] truncate px-4 py-2 text-muted-foreground">
        {row.variantName || "—"}
      </td>
      <td className="px-4 py-2">
        <span
          className={cn(
            "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
            row.action === "CREATE" && "bg-emerald-50 text-emerald-600",
            row.action === "UPDATE" && "bg-primary/10 text-primary",
            row.action === "NO_CHANGE" && "bg-slate-100 text-slate-500",
            row.action === "SKIP" && "bg-muted text-muted-foreground",
          )}
        >
          {row.action === "NO_CHANGE" ? "NO CHANGE" : row.action}
        </span>
      </td>
      <td className="max-w-[200px] truncate px-4 py-2 text-xs text-muted-foreground">
        {filteredChanges.length > 0 ? filteredChanges.join(", ") : "—"}
      </td>
    </tr>
  );
}
