import { CheckCircle, Download, RefreshCw } from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/utils";
import type { ProgressResponse } from "../types";

type ImportResultsStepProps = {
  results: ProgressResponse;
  onDownloadErrors: () => void;
  onRefreshStockMonitor: () => void;
  onReset: () => void;
};

export function ImportResultsStep({
  results,
  onDownloadErrors,
  onRefreshStockMonitor,
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
            {results.durationMs != null && (
              <p className="mt-1 text-sm text-muted-foreground">
                Completed in {(results.durationMs / 1000).toFixed(1)}s
              </p>
            )}
          </div>

          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Imported", value: results.imported, color: "text-emerald-600" },
              { label: "Skipped", value: results.skipped, color: "text-muted-foreground" },
              { label: "Errors", value: results.errors, color: "text-red-600" },
            ].map((counter) => (
              <div key={counter.label} className="rounded-lg bg-muted/50 px-3 py-2 text-center">
                <div className="text-xs text-muted-foreground">{counter.label}</div>
                <div className={cn("mt-0.5 text-xl font-semibold", counter.color)}>
                  {counter.value != null ? counter.value.toLocaleString() : "\u2014"}
                </div>
              </div>
            ))}
          </div>

          {results.byReason && Object.keys(results.byReason).length > 0 && (
            <div className="rounded-lg bg-muted/50 p-3">
              <div className="mb-2 text-xs font-medium text-muted-foreground">Imported by Reason</div>
              <div className="space-y-1">
                {Object.entries(results.byReason).map(([reason, count]) => (
                  <div key={reason} className="flex items-center justify-between text-sm">
                    <span className="text-foreground">{reason}</span>
                    <span className="font-mono text-foreground">{count.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {results.errorLog && results.errorLog.length > 0 && (
            <button
              onClick={onDownloadErrors}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-red-300 bg-red-50 px-4 py-1.5 text-sm font-medium text-red-700 transition hover:bg-red-100"
            >
              <Download size={14} />
              Download Error Log ({results.errorLog.length}{" "}
              {results.errorLog.length === 1 ? "error" : "errors"})
            </button>
          )}

          <div className="flex flex-col gap-3">
            <button
              onClick={onRefreshStockMonitor}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-border px-4 py-1.5 text-sm font-medium text-muted-foreground transition hover:bg-muted"
            >
              <RefreshCw size={14} />
              Refresh Stock Monitor
            </button>
            <div className="flex gap-3">
              <Link
                href="/inventory/stock-monitor"
                className="flex flex-1 items-center justify-center rounded-lg border border-border px-4 py-1.5 text-sm font-medium text-muted-foreground transition hover:bg-muted"
              >
                Go to Stock Monitor
              </Link>
              <button
                onClick={onReset}
                className="flex-1 rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-blue-500"
              >
                Import More
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
