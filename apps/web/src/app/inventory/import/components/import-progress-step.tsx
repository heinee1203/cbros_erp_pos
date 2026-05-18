import { Loader2 } from "lucide-react";

import type { ProgressResponse } from "../types";

type ImportProgressStepProps = {
  progress: ProgressResponse | null;
  elapsed: number;
  pct: number;
  estRemaining: number | null;
};

export function ImportProgressStep({
  progress,
  elapsed,
  pct,
  estRemaining,
}: ImportProgressStepProps) {
  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-border bg-muted/50 p-8">
        <div className="mx-auto max-w-md space-y-6">
          <div>
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="text-foreground">Importing...</span>
              <span className="font-mono text-primary">{pct}%</span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-blue-500 transition-all duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {[
              { label: "Processed", value: progress?.processed ?? 0, total: progress?.total ?? 0, showTotal: true },
              { label: "Created", value: progress?.created ?? 0 },
              { label: "Updated", value: progress?.updated ?? 0 },
              { label: "No Change", value: progress?.noChange ?? 0 },
              { label: "Errors", value: progress?.errors ?? 0 },
            ].map((counter) => (
              <div key={counter.label} className="text-center">
                <div className="text-xs text-muted-foreground">{counter.label}</div>
                <div className="mt-0.5 text-lg font-semibold text-foreground">
                  {counter.value.toLocaleString()}
                  {"showTotal" in counter && counter.showTotal && (
                    <span className="text-sm text-muted-foreground">
                      /{counter.total.toLocaleString()}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-center gap-6 text-xs text-muted-foreground">
            <span>
              Elapsed: {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")}
            </span>
            {estRemaining !== null && (
              <span>
                Est. remaining: {Math.floor(estRemaining / 60)}:
                {String(estRemaining % 60).padStart(2, "0")}
              </span>
            )}
          </div>

          <div className="flex justify-center">
            <Loader2 size={24} className="animate-spin text-primary" />
          </div>
        </div>
      </div>
    </div>
  );
}
