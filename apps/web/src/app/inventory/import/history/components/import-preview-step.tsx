import { AlertTriangle, CheckCircle, ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";
import { REASON_TO_DISPLAY } from "../constants";
import type {
  ImportableReasonType,
  LocationOption,
  PreviewResponse,
  ReasonType,
} from "../types";
import { formatImportMonth, isImportableReason } from "../utils";

type ImportPreviewStepProps = {
  preview: PreviewResponse;
  orgLocations: LocationOption[];
  selectedReasons: Set<ImportableReasonType>;
  locationMapping: Record<string, string>;
  unmatchedExpanded: boolean;
  hasUnmappedLocations: boolean;
  onToggleUnmatched: () => void;
  onLocationMappingChange: (csvName: string, locationId: string) => void;
  onReset: () => void;
  onExecute: () => void;
};

export function ImportPreviewStep({
  preview,
  orgLocations,
  selectedReasons,
  locationMapping,
  unmatchedExpanded,
  hasUnmappedLocations,
  onToggleUnmatched,
  onLocationMappingChange,
  onReset,
  onExecute,
}: ImportPreviewStepProps) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border border-border bg-muted/50 px-4 py-3">
          <div className="text-xs text-muted-foreground">Date Range</div>
          <div className="mt-1 text-lg font-semibold text-foreground">
            {formatImportMonth(preview?.summary?.dateRange?.from ?? "")} &mdash;{" "}
            {formatImportMonth(preview?.summary?.dateRange?.to ?? "")}
          </div>
        </div>
        <div className="rounded-lg border border-border bg-muted/50 px-4 py-3">
          <div className="text-xs text-muted-foreground">Total Rows</div>
          <div className="mt-1 text-2xl font-semibold text-foreground">
            {(preview?.summary?.totalRows ?? 0).toLocaleString()}
          </div>
        </div>
        <div className="rounded-lg border border-border bg-muted/50 px-4 py-3">
          <div className="text-xs text-muted-foreground">SKU Match Rate</div>
          <div className="mt-1 text-2xl font-semibold text-emerald-600">
            {((preview?.summary?.skuMatchRate ?? 0) * 100).toFixed(1)}%
          </div>
          <div className="text-xs text-muted-foreground">
            {(preview?.summary?.matchedSkus ?? 0).toLocaleString()} /{" "}
            {(preview?.summary?.totalSkus ?? 0).toLocaleString()}
          </div>
        </div>
        <div className="rounded-lg border border-border bg-muted/50 px-4 py-3">
          <div className="text-xs text-muted-foreground">Unmatched SKUs</div>
          <div className="mt-1 text-2xl font-semibold text-amber-600">
            {(preview?.summary?.unmatchedSkus?.length ?? 0).toLocaleString()}
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-muted/50 p-5">
        <h3 className="mb-3 text-sm font-medium text-foreground">Reason Type Breakdown</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="px-4 py-2 font-medium">Reason</th>
                <th className="px-4 py-2 text-right font-medium">Rows</th>
                <th className="px-4 py-2 text-right font-medium">Importing</th>
              </tr>
            </thead>
            <tbody>
              {(preview?.summary?.reasonBreakdown ?? []).map((breakdown) => {
                const displayName = REASON_TO_DISPLAY[breakdown.reason] ?? breakdown.reason;
                const importing =
                  isImportableReason(displayName as ReasonType) &&
                  selectedReasons.has(displayName as ImportableReasonType);
                return (
                  <tr
                    key={breakdown.reason}
                    className="border-b border-border hover:bg-accent"
                  >
                    <td className="px-4 py-2 text-foreground">
                      {REASON_TO_DISPLAY[breakdown.reason] ?? breakdown.reason}
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-foreground">
                      {breakdown.count.toLocaleString()}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {importing ? (
                        <span className="inline-flex items-center gap-1 text-emerald-600">
                          <CheckCircle size={14} /> Yes
                        </span>
                      ) : (
                        <span className="text-muted-foreground">No</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {(preview?.summary?.unmatchedSkus?.length ?? 0) > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50">
          <button
            onClick={onToggleUnmatched}
            className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-amber-700"
          >
            <span className="flex items-center gap-2">
              <AlertTriangle size={14} />
              {(preview?.summary?.unmatchedSkus?.length ?? 0)} unmatched{" "}
              {(preview?.summary?.unmatchedSkus?.length ?? 0) === 1 ? "SKU" : "SKUs"}
            </span>
            <ChevronDown
              size={14}
              className={cn("transition-transform", unmatchedExpanded && "rotate-180")}
            />
          </button>
          {unmatchedExpanded && (
            <div className="border-t border-amber-200 px-4 py-3">
              <div className="max-h-60 space-y-1 overflow-y-auto">
                {(preview?.summary?.unmatchedSkus ?? []).slice(0, 20).map((sku) => (
                  <div key={sku} className="font-mono text-xs text-amber-600">
                    {sku}
                  </div>
                ))}
                {(preview?.summary?.unmatchedSkus?.length ?? 0) > 20 && (
                  <div className="text-xs text-amber-500">
                    ... and {(preview?.summary?.unmatchedSkus?.length ?? 0) - 20} more
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {preview?.locations?.length > 0 && (
        <div className="rounded-lg border border-border bg-muted/50 p-5">
          <h3 className="mb-3 text-sm font-medium text-foreground">Location Mapping</h3>
          <div className="space-y-2">
            {preview?.locations?.map((location) => (
              <div
                key={location.csvName}
                className="flex items-center gap-3 rounded-md bg-muted/50 px-3 py-2"
              >
                <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                  {location.csvName}
                </span>
                <span className="text-muted-foreground">&#8594;</span>
                {location.matched ? (
                  <span className="flex items-center gap-1.5 text-sm text-emerald-600">
                    <CheckCircle size={14} />
                    {location.apexName}
                  </span>
                ) : (
                  <select
                    value={locationMapping[location.csvName] ?? ""}
                    onChange={(event) => onLocationMappingChange(location.csvName, event.target.value)}
                    className="rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="">Select location...</option>
                    {orgLocations.map((orgLocation) => (
                      <option key={orgLocation.id} value={orgLocation.id}>
                        {orgLocation.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <button
          onClick={onReset}
          className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground transition hover:bg-muted"
        >
          Cancel
        </button>
        <button
          onClick={onExecute}
          disabled={hasUnmappedLocations || selectedReasons.size === 0}
          className={cn(
            "rounded-lg px-5 py-2 text-sm font-medium transition",
            hasUnmappedLocations || selectedReasons.size === 0
              ? "cursor-not-allowed bg-muted text-muted-foreground"
              : "bg-blue-600 text-white hover:bg-blue-500",
          )}
        >
          Start Import
        </button>
      </div>
    </div>
  );
}
