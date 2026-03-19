"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Upload,
  FileText,
  CheckCircle,
  AlertTriangle,
  Loader2,
  ArrowLeft,
  Download,
  Trash2,
  RefreshCw,
  ChevronDown,
  X,
} from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/app/auth-context";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";

/* ─────────────────────────────────────────────
 * Types
 * ───────────────────────────────────────────── */

type Step = "upload" | "parsing" | "preview" | "progress" | "results";

type ReasonType = "Sale" | "Refund" | "PO Receipt" | "Transfer" | "Count" | "Damage" | "Loss";

interface ReasonBreakdown {
  reason: string;
  count: number;
}

interface LocationMatch {
  csvName: string;
  apexId: string | null;
  apexName: string | null;
  matched: boolean;
}

interface PreviewResponse {
  previewToken: string;
  summary: {
    totalRows: number;
    dateRange: { from: string; to: string };
    reasonBreakdown: ReasonBreakdown[];
    skuMatchRate: number;
    matchedSkus: number;
    totalSkus: number;
    unmatchedSkus: string[];
  };
  locations: LocationMatch[];
}

interface ProgressResponse {
  status: "running" | "done" | "error";
  processed: number;
  total: number;
  imported: number;
  skipped: number;
  errors: number;
  byReason?: Record<string, number>;
  errorLog?: { row: number; message: string }[];
  durationMs?: number;
}

interface LocationOption {
  id: string;
  name: string;
}

interface ImportBatch {
  id: string;
  importedAt: string;
  rowCount: number;
  dateRangeFrom: string;
  dateRangeTo: string;
}

const ALL_REASONS: ReasonType[] = ["Sale", "Refund", "PO Receipt", "Transfer", "Count", "Damage", "Loss"];
const DEFAULT_CHECKED: ReasonType[] = ["Sale", "Refund", "PO Receipt"];

/* ─────────────────────────────────────────────
 * Page
 * ───────────────────────────────────────────── */

export default function ImportHistoryPage() {
  const { token, apiLocationId: locationId } = useAuth();
  const queryClient = useQueryClient();

  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [locationMapping, setLocationMapping] = useState<Record<string, string>>({});
  const [progress, setProgress] = useState<ProgressResponse | null>(null);
  const [results, setResults] = useState<ProgressResponse | null>(null);
  const [unmatchedExpanded, setUnmatchedExpanded] = useState(false);
  const [startTime, setStartTime] = useState<number>(0);
  const [elapsed, setElapsed] = useState(0);
  const [selectedReasons, setSelectedReasons] = useState<Set<ReasonType>>(
    () => new Set(DEFAULT_CHECKED),
  );
  const [deletingBatch, setDeletingBatch] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  /* ── Fetch org locations for mapping dropdown ── */
  const { data: locationsData } = useQuery({
    queryKey: ["locations"],
    queryFn: () => apiFetch<{ data: LocationOption[] }>("/locations", { token, locationId }),
    enabled: !!token,
  });

  const orgLocations = locationsData?.data ?? [];

  /* ── Fetch past import batches ── */
  const { data: batchesData, refetch: refetchBatches } = useQuery({
    queryKey: ["history-import-batches"],
    queryFn: () =>
      apiFetch<{ data: ImportBatch[] }>("/inventory/import/history/batches", {
        token,
        locationId,
      }),
    enabled: !!token,
  });

  const batches = batchesData?.data ?? [];

  /* ── Initialize location mapping from preview ── */
  useEffect(() => {
    if (preview?.locations) {
      const mapping: Record<string, string> = {};
      for (const loc of preview.locations) {
        if (loc.matched && loc.apexId) {
          mapping[loc.csvName] = loc.apexId;
        }
      }
      setLocationMapping(mapping);
    }
  }, [preview]);

  /* ── Reason checkbox toggle ── */
  const toggleReason = useCallback((reason: ReasonType) => {
    setSelectedReasons((prev) => {
      const next = new Set(prev);
      if (next.has(reason)) {
        next.delete(reason);
      } else {
        next.add(reason);
      }
      return next;
    });
  }, []);

  /* ── File handling ── */
  const handleFileSelect = useCallback(
    async (selectedFile: File) => {
      setFile(selectedFile);
      setError(null);
      setStep("parsing");
      try {
        const csvText = await selectedFile.text();
        const resp = await apiFetch<PreviewResponse>("/inventory/import/history/preview", {
          method: "POST",
          token,
          locationId,
          body: JSON.stringify({ csvText, reasons: Array.from(selectedReasons) }),
        });
        setPreview(resp);
        setStep("preview");
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Failed to parse CSV";
        setError(message);
        setStep("upload");
      }
    },
    [token, locationId, selectedReasons],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile && (droppedFile.name.endsWith(".csv") || droppedFile.type === "text/csv")) {
        handleFileSelect(droppedFile);
      } else {
        setError("Please upload a CSV file");
      }
    },
    [handleFileSelect],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selectedFile = e.target.files?.[0];
      if (selectedFile) {
        handleFileSelect(selectedFile);
      }
    },
    [handleFileSelect],
  );

  /* ── Execute import ── */
  const handleExecute = useCallback(async () => {
    if (!preview) return;
    setStep("progress");
    setStartTime(Date.now());
    setProgress(null);
    try {
      const resp = await apiFetch<ProgressResponse>("/inventory/import/history/execute", {
        method: "POST",
        token,
        locationId,
        body: JSON.stringify({
          previewToken: preview.previewToken,
          locationMapping,
          reasons: Array.from(selectedReasons),
        }),
      });
      setResults(resp);
      setStep("results");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Import failed";
      setError(message);
    }
  }, [preview, token, locationId, locationMapping, selectedReasons]);

  /* ── Poll progress ── */
  useEffect(() => {
    if (step !== "progress" || !preview) return;
    const interval = setInterval(async () => {
      try {
        const prog = await apiFetch<ProgressResponse>(
          `/inventory/import/history/progress/${preview.previewToken}`,
          { token, locationId },
        );
        setProgress(prog);
        if (prog.status === "done" || prog.status === "error") {
          clearInterval(interval);
          setResults(prog);
          setStep("results");
        }
      } catch {
        // Polling error — keep trying
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [step, preview, token, locationId]);

  /* ── Elapsed time counter ── */
  useEffect(() => {
    if (step !== "progress") return;
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [step, startTime]);

  /* ── Reset ── */
  const handleReset = useCallback(() => {
    setStep("upload");
    setFile(null);
    setError(null);
    setPreview(null);
    setProgress(null);
    setResults(null);
    setLocationMapping({});
    setElapsed(0);
    setUnmatchedExpanded(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  /* ── Download error log ── */
  const handleDownloadErrors = useCallback(() => {
    if (!results?.errorLog?.length) return;
    const lines = ["Row,Error", ...results.errorLog.map((e) => `${e.row},"${e.message}"`)];
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "history-import-errors.csv";
    a.click();
    URL.revokeObjectURL(url);
  }, [results]);

  /* ── Refresh stock monitor ── */
  const handleRefreshStockMonitor = useCallback(async () => {
    try {
      await apiFetch("/inventory/stock-monitor/refresh", {
        method: "POST",
        token,
        locationId,
      });
    } catch {
      // silent
    }
  }, [token, locationId]);

  /* ── Delete batch ── */
  const handleDeleteBatch = useCallback(
    async (batchId: string) => {
      if (!confirm("Delete this import batch? This will remove all inventory history rows from this batch.")) return;
      setDeletingBatch(batchId);
      try {
        await apiFetch(`/inventory/import/history/batches/${batchId}`, {
          method: "DELETE",
          token,
          locationId,
        });
        refetchBatches();
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Failed to delete batch";
        setError(message);
      } finally {
        setDeletingBatch(null);
      }
    },
    [token, locationId, refetchBatches],
  );

  /* ── Computed values ── */
  const pct =
    progress && progress.total > 0
      ? Math.round((progress.processed / progress.total) * 100)
      : 0;

  const estRemaining =
    progress && progress.processed > 0 && elapsed > 0
      ? Math.round(((progress.total - progress.processed) / progress.processed) * elapsed)
      : null;

  const unmatchedLocations = preview?.locations.filter((l) => !l.matched) ?? [];
  const hasUnmappedLocations = unmatchedLocations.some((l) => !locationMapping[l.csvName]);

  const formatDate = (d: string) => {
    try {
      return new Date(d).toLocaleDateString("en-US", { month: "short", year: "numeric" });
    } catch {
      return d;
    }
  };

  /* ─────────────────────────────────────────────
   * Render
   * ───────────────────────────────────────────── */
  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href="/inventory"
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-800 text-zinc-400 transition hover:bg-zinc-700 hover:text-zinc-200"
        >
          <ArrowLeft size={16} />
        </Link>
        <div>
          <h1 className="text-xl font-semibold text-zinc-100">Import History</h1>
          <p className="text-sm text-zinc-400">
            Import inventory history from a Loyverse CSV export
          </p>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-4 border-b border-border">
        <Link
          href="/inventory/import"
          className="px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground border-b-2 border-transparent"
        >
          Import Items
        </Link>
        <Link
          href="/inventory/import/history"
          className={cn(
            "px-3 py-2 text-sm font-medium border-b-2",
            "border-primary text-primary",
          )}
        >
          Import History
        </Link>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2 text-xs font-medium">
        {(["upload", "preview", "progress", "results"] as const).map((s, i) => {
          const labels = ["Upload", "Preview", "Import", "Results"];
          const stepIndex = ["upload", "preview", "progress", "results"].indexOf(
            step === "parsing" ? "upload" : step,
          );
          const isActive = i === stepIndex;
          const isDone = i < stepIndex;
          return (
            <div key={s} className="flex items-center gap-2">
              {i > 0 && (
                <div className={cn("h-px w-8", isDone ? "bg-emerald-500" : "bg-zinc-700")} />
              )}
              <div
                className={cn(
                  "flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold transition",
                  isDone && "bg-emerald-500/20 text-emerald-400",
                  isActive && "bg-blue-500/20 text-blue-400 ring-1 ring-blue-500/30",
                  !isDone && !isActive && "bg-zinc-800 text-zinc-500",
                )}
              >
                {isDone ? <CheckCircle size={12} /> : i + 1}
              </div>
              <span
                className={cn(
                  "hidden sm:inline",
                  isDone && "text-emerald-400",
                  isActive && "text-blue-400",
                  !isDone && !isActive && "text-zinc-500",
                )}
              >
                {labels[i]}
              </span>
            </div>
          );
        })}
      </div>

      {/* Global error */}
      {error && (
        <div className="flex items-start gap-3 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-red-400" />
          <div className="flex-1 text-sm text-red-300">{error}</div>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-300">
            <X size={14} />
          </button>
        </div>
      )}

      {/* ─── Step 1: Upload ─── */}
      {(step === "upload" || step === "parsing") && (
        <div className="space-y-6">
          {/* Reason type selection */}
          <div className="rounded-lg border border-zinc-700/60 bg-zinc-800/50 p-5">
            <h3 className="mb-3 text-sm font-medium text-zinc-200">
              Reason Types to Import
            </h3>
            <div className="flex flex-wrap gap-3">
              {ALL_REASONS.map((reason) => (
                <label
                  key={reason}
                  className={cn(
                    "flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition",
                    selectedReasons.has(reason)
                      ? "border-blue-500/50 bg-blue-500/10 text-blue-300"
                      : "border-zinc-700 bg-zinc-800/30 text-zinc-400 hover:border-zinc-600",
                  )}
                >
                  <input
                    type="checkbox"
                    checked={selectedReasons.has(reason)}
                    onChange={() => toggleReason(reason)}
                    className="accent-blue-500"
                  />
                  {reason}
                </label>
              ))}
            </div>
          </div>

          {/* Drop zone */}
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-12 transition",
              step === "parsing"
                ? "pointer-events-none border-blue-500/40 bg-blue-500/5"
                : "border-zinc-700 bg-zinc-800/30 hover:border-zinc-500 hover:bg-zinc-800/50",
            )}
          >
            {step === "parsing" ? (
              <>
                <Loader2 size={32} className="animate-spin text-blue-400" />
                <p className="text-sm text-blue-300">Parsing CSV...</p>
              </>
            ) : (
              <>
                <Upload size={32} className="text-zinc-500" />
                <div className="text-center">
                  <p className="text-sm font-medium text-zinc-300">
                    Upload Loyverse Inventory History CSV
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">
                    Supports Date, Item, SKU, Store, Employee, Reason, Adjustment format
                  </p>
                </div>
              </>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              onChange={handleInputChange}
              className="hidden"
            />
          </div>

          {file && step !== "parsing" && (
            <div className="flex items-center gap-2 rounded-lg border border-zinc-700/60 bg-zinc-800/50 px-4 py-2.5 text-sm">
              <FileText size={14} className="text-zinc-400" />
              <span className="text-zinc-300">{file.name}</span>
              <span className="text-zinc-500">({(file.size / 1024).toFixed(1)} KB)</span>
            </div>
          )}
        </div>
      )}

      {/* ─── Step 2: Preview ─── */}
      {step === "preview" && preview && (
        <div className="space-y-6">
          {/* Summary cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-lg border border-zinc-700/60 bg-zinc-800/50 px-4 py-3">
              <div className="text-xs text-zinc-400">Date Range</div>
              <div className="mt-1 text-lg font-semibold text-zinc-200">
                {formatDate(preview.summary.dateRange.from)} &mdash;{" "}
                {formatDate(preview.summary.dateRange.to)}
              </div>
            </div>
            <div className="rounded-lg border border-zinc-700/60 bg-zinc-800/50 px-4 py-3">
              <div className="text-xs text-zinc-400">Total Rows</div>
              <div className="mt-1 text-2xl font-semibold text-zinc-200">
                {preview.summary.totalRows.toLocaleString()}
              </div>
            </div>
            <div className="rounded-lg border border-zinc-700/60 bg-zinc-800/50 px-4 py-3">
              <div className="text-xs text-zinc-400">SKU Match Rate</div>
              <div className="mt-1 text-2xl font-semibold text-emerald-400">
                {(preview.summary.skuMatchRate * 100).toFixed(1)}%
              </div>
              <div className="text-xs text-zinc-500">
                {preview.summary.matchedSkus.toLocaleString()} / {preview.summary.totalSkus.toLocaleString()}
              </div>
            </div>
            <div className="rounded-lg border border-zinc-700/60 bg-zinc-800/50 px-4 py-3">
              <div className="text-xs text-zinc-400">Unmatched SKUs</div>
              <div className="mt-1 text-2xl font-semibold text-amber-400">
                {preview.summary.unmatchedSkus.length.toLocaleString()}
              </div>
            </div>
          </div>

          {/* Reason breakdown */}
          <div className="rounded-lg border border-zinc-700/60 bg-zinc-800/50 p-5">
            <h3 className="mb-3 text-sm font-medium text-zinc-200">Reason Type Breakdown</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-700/40 text-left text-xs text-zinc-500">
                    <th className="px-4 py-2 font-medium">Reason</th>
                    <th className="px-4 py-2 font-medium text-right">Rows</th>
                    <th className="px-4 py-2 font-medium text-right">Importing</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.summary.reasonBreakdown.map((rb) => {
                    const importing = selectedReasons.has(rb.reason as ReasonType);
                    return (
                      <tr
                        key={rb.reason}
                        className="border-b border-zinc-700/20 hover:bg-zinc-700/20"
                      >
                        <td className="px-4 py-2 text-zinc-300">{rb.reason}</td>
                        <td className="px-4 py-2 text-right font-mono text-zinc-300">
                          {rb.count.toLocaleString()}
                        </td>
                        <td className="px-4 py-2 text-right">
                          {importing ? (
                            <span className="inline-flex items-center gap-1 text-emerald-400">
                              <CheckCircle size={14} /> Yes
                            </span>
                          ) : (
                            <span className="text-zinc-500">No</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Unmatched SKUs (collapsible) */}
          {preview.summary.unmatchedSkus.length > 0 && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5">
              <button
                onClick={() => setUnmatchedExpanded(!unmatchedExpanded)}
                className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-amber-300"
              >
                <span className="flex items-center gap-2">
                  <AlertTriangle size={14} />
                  {preview.summary.unmatchedSkus.length} unmatched{" "}
                  {preview.summary.unmatchedSkus.length === 1 ? "SKU" : "SKUs"}
                </span>
                <ChevronDown
                  size={14}
                  className={cn("transition-transform", unmatchedExpanded && "rotate-180")}
                />
              </button>
              {unmatchedExpanded && (
                <div className="border-t border-amber-500/20 px-4 py-3">
                  <div className="max-h-60 space-y-1 overflow-y-auto">
                    {preview.summary.unmatchedSkus.slice(0, 20).map((sku) => (
                      <div key={sku} className="font-mono text-xs text-amber-400/70">
                        {sku}
                      </div>
                    ))}
                    {preview.summary.unmatchedSkus.length > 20 && (
                      <div className="text-xs text-amber-400/50">
                        ... and {preview.summary.unmatchedSkus.length - 20} more
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Location mapping */}
          {preview.locations.length > 0 && (
            <div className="rounded-lg border border-zinc-700/60 bg-zinc-800/50 p-5">
              <h3 className="mb-3 text-sm font-medium text-zinc-200">Location Mapping</h3>
              <div className="space-y-2">
                {preview.locations.map((loc) => (
                  <div
                    key={loc.csvName}
                    className="flex items-center gap-3 rounded-md bg-zinc-900/40 px-3 py-2"
                  >
                    <span className="min-w-0 flex-1 truncate text-sm text-zinc-300">
                      {loc.csvName}
                    </span>
                    <span className="text-zinc-500">&#8594;</span>
                    {loc.matched ? (
                      <span className="flex items-center gap-1.5 text-sm text-emerald-400">
                        <CheckCircle size={14} />
                        {loc.apexName}
                      </span>
                    ) : (
                      <select
                        value={locationMapping[loc.csvName] ?? ""}
                        onChange={(e) =>
                          setLocationMapping((prev) => ({
                            ...prev,
                            [loc.csvName]: e.target.value,
                          }))
                        }
                        className="rounded-md border border-zinc-600 bg-zinc-800 px-2 py-1 text-sm text-zinc-200 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      >
                        <option value="">Select location...</option>
                        {orgLocations.map((ol) => (
                          <option key={ol.id} value={ol.id}>
                            {ol.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between">
            <button
              onClick={handleReset}
              className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:bg-zinc-800"
            >
              Cancel
            </button>
            <button
              onClick={handleExecute}
              disabled={hasUnmappedLocations || selectedReasons.size === 0}
              className={cn(
                "rounded-lg px-5 py-2 text-sm font-medium transition",
                hasUnmappedLocations || selectedReasons.size === 0
                  ? "cursor-not-allowed bg-zinc-700 text-zinc-400"
                  : "bg-blue-600 text-white hover:bg-blue-500",
              )}
            >
              Start Import
            </button>
          </div>
        </div>
      )}

      {/* ─── Step 3: Progress ─── */}
      {step === "progress" && (
        <div className="space-y-6">
          <div className="rounded-lg border border-zinc-700/60 bg-zinc-800/50 p-8">
            <div className="mx-auto max-w-md space-y-6">
              {/* Progress bar */}
              <div>
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span className="text-zinc-300">Importing history...</span>
                  <span className="font-mono text-blue-400">{pct}%</span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-zinc-700">
                  <div
                    className="h-full rounded-full bg-blue-500 transition-all duration-500"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>

              {/* Counters */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  {
                    label: "Processed",
                    value: progress?.processed ?? 0,
                    total: progress?.total ?? 0,
                    showTotal: true,
                  },
                  { label: "Imported", value: progress?.imported ?? 0 },
                  { label: "Skipped", value: progress?.skipped ?? 0 },
                  { label: "Errors", value: progress?.errors ?? 0 },
                ].map((c) => (
                  <div key={c.label} className="text-center">
                    <div className="text-xs text-zinc-500">{c.label}</div>
                    <div className="mt-0.5 text-lg font-semibold text-zinc-200">
                      {c.value.toLocaleString()}
                      {"showTotal" in c && c.showTotal && (
                        <span className="text-sm text-zinc-500">
                          /{(c as { total: number }).total.toLocaleString()}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Time info */}
              <div className="flex justify-center gap-6 text-xs text-zinc-500">
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

              {/* Spinner */}
              <div className="flex justify-center">
                <Loader2 size={24} className="animate-spin text-blue-400" />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Step 4: Results ─── */}
      {step === "results" && results && (
        <div className="space-y-6">
          <div className="rounded-lg border border-zinc-700/60 bg-zinc-800/50 p-8">
            <div className="mx-auto max-w-md space-y-6">
              {/* Success icon */}
              <div className="flex justify-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/20">
                  <CheckCircle size={32} className="text-emerald-400" />
                </div>
              </div>

              <div className="text-center">
                <h2 className="text-lg font-semibold text-zinc-100">Import Complete</h2>
                {results.durationMs != null && (
                  <p className="mt-1 text-sm text-zinc-400">
                    Completed in {(results.durationMs / 1000).toFixed(1)}s
                  </p>
                )}
              </div>

              {/* Summary grid */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: "Imported", value: results.imported, color: "text-emerald-400" },
                  { label: "Skipped", value: results.skipped, color: "text-zinc-400" },
                  { label: "Errors", value: results.errors, color: "text-red-400" },
                ].map((c) => (
                  <div key={c.label} className="rounded-lg bg-zinc-900/40 px-3 py-2 text-center">
                    <div className="text-xs text-zinc-500">{c.label}</div>
                    <div className={cn("mt-0.5 text-xl font-semibold", c.color)}>
                      {c.value.toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>

              {/* Breakdown by reason */}
              {results.byReason && Object.keys(results.byReason).length > 0 && (
                <div className="rounded-lg bg-zinc-900/40 p-3">
                  <div className="mb-2 text-xs font-medium text-zinc-400">Imported by Reason</div>
                  <div className="space-y-1">
                    {Object.entries(results.byReason).map(([reason, count]) => (
                      <div key={reason} className="flex items-center justify-between text-sm">
                        <span className="text-zinc-300">{reason}</span>
                        <span className="font-mono text-zinc-200">{count.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Error log download */}
              {results.errorLog && results.errorLog.length > 0 && (
                <button
                  onClick={handleDownloadErrors}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm font-medium text-red-300 transition hover:bg-red-500/20"
                >
                  <Download size={14} />
                  Download Error Log ({results.errorLog.length}{" "}
                  {results.errorLog.length === 1 ? "error" : "errors"})
                </button>
              )}

              {/* Actions */}
              <div className="flex flex-col gap-3">
                <button
                  onClick={handleRefreshStockMonitor}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-zinc-700 px-4 py-2.5 text-sm font-medium text-zinc-300 transition hover:bg-zinc-800"
                >
                  <RefreshCw size={14} />
                  Refresh Stock Monitor
                </button>
                <div className="flex gap-3">
                  <Link
                    href="/inventory/stock-monitor"
                    className="flex flex-1 items-center justify-center rounded-lg border border-zinc-700 px-4 py-2.5 text-sm font-medium text-zinc-300 transition hover:bg-zinc-800"
                  >
                    Go to Stock Monitor
                  </Link>
                  <button
                    onClick={handleReset}
                    className="flex-1 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-blue-500"
                  >
                    Import More
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Import Batch Management ─── */}
      <div className="rounded-lg border border-zinc-700/60 bg-zinc-800/50">
        <div className="border-b border-zinc-700/60 px-4 py-3">
          <h3 className="text-sm font-medium text-zinc-200">Past Import Batches</h3>
        </div>
        {batches.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-zinc-500">
            No import batches yet
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-700/40 text-left text-xs text-zinc-500">
                  <th className="px-4 py-2 font-medium">Batch Date</th>
                  <th className="px-4 py-2 font-medium text-right">Row Count</th>
                  <th className="px-4 py-2 font-medium">Date Range</th>
                  <th className="px-4 py-2 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {batches.map((batch) => (
                  <tr
                    key={batch.id}
                    className="border-b border-zinc-700/20 hover:bg-zinc-700/20"
                  >
                    <td className="px-4 py-2 text-zinc-300">
                      {new Date(batch.importedAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-zinc-300">
                      {batch.rowCount.toLocaleString()}
                    </td>
                    <td className="px-4 py-2 text-zinc-400">
                      {formatDate(batch.dateRangeFrom)} &mdash; {formatDate(batch.dateRangeTo)}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <button
                        onClick={() => handleDeleteBatch(batch.id)}
                        disabled={deletingBatch === batch.id}
                        className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-red-400 transition hover:bg-red-500/10 disabled:opacity-50"
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
    </div>
  );
}
