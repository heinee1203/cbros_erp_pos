import { CheckCircle, Download, RotateCcw, ShieldAlert } from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/utils";
import type { ImportRollbackResult, ProgressResponse } from "../types";

type ImportResultsStepProps = {
  results: ProgressResponse;
  rollbackResult: ImportRollbackResult | null;
  rollbackLoading: boolean;
  onDownloadErrors: () => void;
  onDryRunRollback: () => void;
  onApplyRollback: () => void;
  onDownloadRollbackConflicts: () => void;
  onReset: () => void;
};

export function ImportResultsStep({
  results,
  rollbackResult,
  rollbackLoading,
  onDownloadErrors,
  onDryRunRollback,
  onApplyRollback,
  onDownloadRollbackConflicts,
  onReset,
}: ImportResultsStepProps) {
  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-border bg-muted/50 p-8">
        <div className="mx-auto max-w-md space-y-6">
          <div className="flex justify-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50">
              <CheckCircle size={32} className="text-emerald-600" />
            </div>
          </div>

          <div className="text-center">
            <h2 className="text-lg font-semibold text-foreground">Import Complete</h2>
            {(results.durationMs ?? results.duration) != null && (
              <p className="mt-1 text-sm text-muted-foreground">
                Completed in {(((results.durationMs ?? results.duration) ?? 0) / 1000).toFixed(1)}s
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {[
              { label: "Created", value: results.created, color: "text-emerald-600" },
              { label: "Updated", value: results.updated, color: "text-primary" },
              { label: "No Change", value: results.noChange ?? 0, color: "text-slate-500" },
              { label: "Skipped", value: results.skipped, color: "text-muted-foreground" },
              { label: "Errors", value: results.errors, color: "text-red-600" },
            ].map((counter) => (
              <div key={counter.label} className="rounded-lg bg-muted/50 px-3 py-2 text-center">
                <div className="text-xs text-muted-foreground">{counter.label}</div>
                <div className={cn("mt-0.5 text-xl font-semibold", counter.color)}>
                  {counter.value.toLocaleString()}
                </div>
              </div>
            ))}
          </div>

          {results.audit && (
            <div className="space-y-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3 text-xs text-emerald-800">
              <div>
                Audit saved: <span className="font-mono">{results.audit.id.slice(0, 8)}</span>
                {" "}with {results.audit.rowSnapshotCount.toLocaleString()} row snapshot
                {results.audit.rowSnapshotCount === 1 ? "" : "s"}.
              </div>
              <div className="rounded-md border border-emerald-200 bg-white/70 p-3">
                <div className="flex items-start gap-2">
                  <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
                  <div>
                    <div className="font-semibold text-emerald-900">Last import rollback</div>
                    <p className="mt-0.5 text-emerald-800">
                      Dry-run checks whether current values still match this import before any safe
                      field is restored. Created products are skipped in rollback v1.
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={onDryRunRollback}
                    disabled={rollbackLoading}
                    className="inline-flex items-center gap-1.5 rounded-md border border-emerald-300 bg-white px-3 py-1.5 text-xs font-medium text-emerald-800 transition hover:bg-emerald-50 disabled:opacity-50"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    {rollbackLoading ? "Checking..." : "Dry Run Rollback"}
                  </button>
                  <button
                    type="button"
                    onClick={onApplyRollback}
                    disabled={rollbackLoading || !rollbackResult}
                    className="inline-flex items-center gap-1.5 rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Apply Safe Rollback
                  </button>
                  {rollbackResult &&
                    (rollbackResult.conflicts.length > 0 || rollbackResult.skipped.length > 0) && (
                      <button
                        type="button"
                        onClick={onDownloadRollbackConflicts}
                        className="inline-flex items-center gap-1.5 rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800 transition hover:bg-amber-100"
                      >
                        <Download className="h-3.5 w-3.5" />
                        Download Conflict Report
                      </button>
                    )}
                </div>
                {rollbackResult && <RollbackSummary result={rollbackResult} />}
              </div>
            </div>
          )}

          {results.errorLog && results.errorLog.length > 0 && (
            <>
              <button
                onClick={onDownloadErrors}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-red-300 bg-red-50 px-4 py-1.5 text-sm font-medium text-red-700 transition hover:bg-red-100"
              >
                <Download size={14} />
                Download Error Log ({results.errorLog.length}{" "}
                {results.errorLog.length === 1 ? "error" : "errors"})
              </button>
              <div className="max-h-[300px] overflow-y-auto rounded-lg border border-red-200 bg-background">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 border-b border-red-200 bg-red-50">
                    <tr>
                      <th className="w-16 px-3 py-1.5 text-left font-semibold text-red-800">Row</th>
                      <th className="px-3 py-1.5 text-left font-semibold text-red-800">Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.errorLog.slice(0, 100).map((err, index) => (
                      <tr key={index} className="border-b border-red-100 hover:bg-red-50/50">
                        <td className="px-3 py-1.5 font-mono tabular-nums text-red-600">{err.row}</td>
                        <td className="px-3 py-1.5 text-red-700">{err.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {results.errorLog.length > 100 && (
                  <div className="border-t border-red-200 bg-red-50/30 px-3 py-2 text-center text-[11px] italic text-red-500">
                    Showing 100 of {results.errorLog.length} errors \u2014 download CSV for full list
                  </div>
                )}
              </div>
            </>
          )}

          <div className="flex gap-3">
            <Link
              href="/inventory"
              className="flex flex-1 items-center justify-center rounded-lg border border-border px-4 py-1.5 text-sm font-medium text-muted-foreground transition hover:bg-muted"
            >
              Go to Item List
            </Link>
            <button
              onClick={onReset}
              className="flex-1 rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-blue-500"
            >
              Import Again
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function RollbackSummary({ result }: { result: ImportRollbackResult }) {
  const { summary } = result;
  return (
    <div className="mt-3 rounded-md border border-border bg-background/80 p-3 text-xs">
      <div className="mb-2 font-semibold text-foreground">
        {result.dryRun ? "Rollback dry-run summary" : "Rollback applied summary"}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <RollbackStat label="Rows checked" value={summary.rowsScanned} />
        <RollbackStat label="Safe fields" value={summary.restorableFields} />
        <RollbackStat label="Restored" value={summary.restoredFields} />
        <RollbackStat label="Conflicts" value={summary.conflictedFields} tone="warning" />
      </div>
      {(result.conflicts.length > 0 || result.skipped.length > 0) && (
        <p className="mt-2 text-muted-foreground">
          {result.conflicts.length.toLocaleString()} conflict
          {result.conflicts.length === 1 ? "" : "s"} and{" "}
          {result.skipped.length.toLocaleString()} skipped row
          {result.skipped.length === 1 ? "" : "s"} are available in the CSV report.
        </p>
      )}
    </div>
  );
}

function RollbackStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "warning";
}) {
  return (
    <div className="rounded-md bg-muted/60 px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn("text-base font-semibold text-foreground", tone === "warning" && "text-amber-700")}>
        {value.toLocaleString()}
      </div>
    </div>
  );
}
