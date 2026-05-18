import { Loader2, Trash2 } from "lucide-react";

import type { ImportBatch } from "../types";
import { formatImportMonth } from "../utils";

type ImportBatchPanelProps = {
  batches: ImportBatch[];
  deletingBatch: string | null;
  onDeleteBatch: (batchId: string) => void;
};

export function ImportBatchPanel({
  batches,
  deletingBatch,
  onDeleteBatch,
}: ImportBatchPanelProps) {
  return (
    <div className="rounded-lg border border-border bg-muted/50">
      <div className="border-b border-border px-4 py-3">
        <h3 className="text-sm font-medium text-foreground">Past Import Batches</h3>
      </div>
      {batches.length === 0 ? (
        <div className="px-4 py-8 text-center text-sm text-muted-foreground">No import batches yet</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="px-4 py-2 font-medium">Batch Date</th>
                <th className="px-4 py-2 text-right font-medium">Row Count</th>
                <th className="px-4 py-2 font-medium">Date Range</th>
                <th className="px-4 py-2 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {batches.map((batch, index) => (
                <tr
                  key={batch.id || `batch-${index}`}
                  className="border-b border-border hover:bg-accent"
                >
                  <td className="px-4 py-2 text-foreground">
                    {new Date(batch.importedAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-2 text-right font-mono text-foreground">
                    {batch.rowCount.toLocaleString()}
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {formatImportMonth(batch.dateRangeFrom)} &mdash; {formatImportMonth(batch.dateRangeTo)}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <button
                      onClick={() => onDeleteBatch(batch.id)}
                      disabled={deletingBatch === batch.id}
                      className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-red-600 transition hover:bg-red-50 disabled:opacity-50"
                    >
                      {deletingBatch === batch.id ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : (
                        <Trash2 size={12} />
                      )}
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
