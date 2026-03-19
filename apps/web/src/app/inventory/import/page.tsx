"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Upload,
  FileText,
  CheckCircle,
  AlertTriangle,
  Loader2,
  ArrowLeft,
  Download,
  X,
  ChevronDown,
} from "lucide-react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/app/auth-context";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";

/* ─────────────────────────────────────────────
 * Types
 * ───────────────────────────────────────────── */

type Step = "upload" | "parsing" | "preview" | "progress" | "results";
type ImportMode = "smart_sync" | "update_only" | "create_only";

interface PreviewRow {
  row: number;
  sku: string;
  name: string;
  action: "CREATE" | "UPDATE" | "SKIP";
  changes?: string[];
}

interface PreviewError {
  row: number;
  field?: string;
  message: string;
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
    creates: number;
    updates: number;
    skips: number;
    errors: number;
  };
  rows: PreviewRow[];
  errors: PreviewError[];
  locations: LocationMatch[];
  newCategories: string[];
}

interface ProgressResponse {
  status: "running" | "done" | "error";
  processed: number;
  total: number;
  created: number;
  updated: number;
  skipped: number;
  errors: number;
  errorLog?: { row: number; message: string }[];
  durationMs?: number;
}

interface LocationOption {
  id: string;
  name: string;
}

/* ─────────────────────────────────────────────
 * Page
 * ───────────────────────────────────────────── */

export default function ImportItemsPage() {
  const { token, apiLocationId: locationId } = useAuth();

  const [step, setStep] = useState<Step>("upload");
  const [importMode, setImportMode] = useState<ImportMode>("smart_sync");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [locationMapping, setLocationMapping] = useState<Record<string, string>>({});
  const [progress, setProgress] = useState<ProgressResponse | null>(null);
  const [results, setResults] = useState<ProgressResponse | null>(null);
  const [errorsExpanded, setErrorsExpanded] = useState(false);
  const [startTime, setStartTime] = useState<number>(0);
  const [elapsed, setElapsed] = useState(0);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  /* ── Fetch org locations for mapping dropdown ── */
  const { data: locationsData } = useQuery({
    queryKey: ["locations"],
    queryFn: () => apiFetch<{ data: LocationOption[] }>("/locations", { token, locationId }),
    enabled: !!token,
  });

  const orgLocations = locationsData?.data ?? [];

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

  /* ── File handling ── */
  const handleFileSelect = useCallback(
    async (selectedFile: File) => {
      setFile(selectedFile);
      setError(null);
      setStep("parsing");
      try {
        const csvText = await selectedFile.text();
        const resp = await apiFetch<PreviewResponse>("/inventory/import/preview", {
          method: "POST",
          token,
          locationId,
          body: JSON.stringify({ csvText }),
        });
        setPreview(resp);
        setStep("preview");
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Failed to parse CSV";
        setError(message);
        setStep("upload");
      }
    },
    [token, locationId],
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
      const resp = await apiFetch<ProgressResponse>("/inventory/import/execute", {
        method: "POST",
        token,
        locationId,
        body: JSON.stringify({
          previewToken: preview.previewToken,
          locationMapping,
          importMode,
          skipErrors: true,
          createNewCategories: true,
        }),
      });
      setResults(resp);
      setStep("results");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Import failed";
      setError(message);
    }
  }, [preview, token, locationId, locationMapping, importMode]);

  /* ── Poll progress ── */
  useEffect(() => {
    if (step !== "progress" || !preview) return;
    const interval = setInterval(async () => {
      try {
        const prog = await apiFetch<ProgressResponse>(
          `/inventory/import/progress/${preview.previewToken}`,
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
    a.download = "import-errors.csv";
    a.click();
    URL.revokeObjectURL(url);
  }, [results]);

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
          <h1 className="text-xl font-semibold text-zinc-100">Import Items</h1>
          <p className="text-sm text-zinc-400">
            Import items from a Loyverse CSV export
          </p>
        </div>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2 text-xs font-medium">
        {(["upload", "preview", "progress", "results"] as const).map((s, i) => {
          const labels = ["Upload", "Preview", "Import", "Results"];
          const stepIndex = ["upload", "preview", "progress", "results"].indexOf(step === "parsing" ? "upload" : step);
          const isActive = i === stepIndex;
          const isDone = i < stepIndex;
          return (
            <div key={s} className="flex items-center gap-2">
              {i > 0 && <div className={cn("h-px w-8", isDone ? "bg-emerald-500" : "bg-zinc-700")} />}
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
          {/* Import mode */}
          <div className="rounded-lg border border-zinc-700/60 bg-zinc-800/50 p-5">
            <h3 className="mb-3 text-sm font-medium text-zinc-200">Import Mode</h3>
            <div className="flex flex-col gap-2 sm:flex-row sm:gap-4">
              {([
                { value: "smart_sync", label: "Smart Sync", desc: "Create new items, update existing" },
                { value: "update_only", label: "Update Only", desc: "Only update existing items" },
                { value: "create_only", label: "Create Only", desc: "Only create new items" },
              ] as const).map((mode) => (
                <label
                  key={mode.value}
                  className={cn(
                    "flex flex-1 cursor-pointer items-start gap-3 rounded-lg border p-3 transition",
                    importMode === mode.value
                      ? "border-blue-500/50 bg-blue-500/10"
                      : "border-zinc-700 bg-zinc-800/30 hover:border-zinc-600",
                  )}
                >
                  <input
                    type="radio"
                    name="importMode"
                    value={mode.value}
                    checked={importMode === mode.value}
                    onChange={() => setImportMode(mode.value)}
                    className="mt-0.5 accent-blue-500"
                  />
                  <div>
                    <div className="text-sm font-medium text-zinc-200">{mode.label}</div>
                    <div className="text-xs text-zinc-400">{mode.desc}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Drop zone */}
          <div
            ref={dropZoneRef}
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
                    Drop your Loyverse CSV here, or click to browse
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">Supports .csv files</p>
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
            {[
              { label: "Total Rows", value: preview.summary.totalRows, color: "text-zinc-200" },
              { label: "Creates", value: preview.summary.creates, color: "text-emerald-400" },
              { label: "Updates", value: preview.summary.updates, color: "text-blue-400" },
              { label: "Errors", value: preview.summary.errors, color: "text-red-400" },
            ].map((card) => (
              <div
                key={card.label}
                className="rounded-lg border border-zinc-700/60 bg-zinc-800/50 px-4 py-3"
              >
                <div className="text-xs text-zinc-400">{card.label}</div>
                <div className={cn("mt-1 text-2xl font-semibold", card.color)}>
                  {card.value.toLocaleString()}
                </div>
              </div>
            ))}
          </div>

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

          {/* New categories notice */}
          {preview.newCategories.length > 0 && (
            <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3">
              <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-400" />
              <div>
                <div className="text-sm font-medium text-amber-300">
                  {preview.newCategories.length} new{" "}
                  {preview.newCategories.length === 1 ? "category" : "categories"} will be created
                </div>
                <div className="mt-1 text-xs text-amber-400/70">
                  {preview.newCategories.join(", ")}
                </div>
              </div>
            </div>
          )}

          {/* Preview table */}
          <div className="rounded-lg border border-zinc-700/60 bg-zinc-800/50">
            <div className="border-b border-zinc-700/60 px-4 py-3">
              <h3 className="text-sm font-medium text-zinc-200">
                Preview{" "}
                <span className="font-normal text-zinc-500">
                  (first {Math.min(preview.rows.length, 100)} rows)
                </span>
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-700/40 text-left text-xs text-zinc-500">
                    <th className="px-4 py-2 font-medium">Row</th>
                    <th className="px-4 py-2 font-medium">SKU</th>
                    <th className="px-4 py-2 font-medium">Name</th>
                    <th className="px-4 py-2 font-medium">Action</th>
                    <th className="px-4 py-2 font-medium">Changes</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.slice(0, 100).map((row) => (
                    <tr
                      key={row.row}
                      className="border-b border-zinc-700/20 hover:bg-zinc-700/20"
                    >
                      <td className="px-4 py-2 text-zinc-500">{row.row}</td>
                      <td className="px-4 py-2 font-mono text-xs text-zinc-300">{row.sku}</td>
                      <td className="max-w-[200px] truncate px-4 py-2 text-zinc-200">
                        {row.name}
                      </td>
                      <td className="px-4 py-2">
                        <span
                          className={cn(
                            "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                            row.action === "CREATE" && "bg-emerald-500/20 text-emerald-400",
                            row.action === "UPDATE" && "bg-blue-500/20 text-blue-400",
                            row.action === "SKIP" && "bg-zinc-500/20 text-zinc-400",
                          )}
                        >
                          {row.action}
                        </span>
                      </td>
                      <td className="max-w-[200px] truncate px-4 py-2 text-xs text-zinc-400">
                        {row.changes?.join(", ") || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Errors (collapsible) */}
          {preview.errors.length > 0 && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/5">
              <button
                onClick={() => setErrorsExpanded(!errorsExpanded)}
                className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-red-300"
              >
                <span className="flex items-center gap-2">
                  <AlertTriangle size={14} />
                  {preview.errors.length} {preview.errors.length === 1 ? "error" : "errors"} found
                </span>
                <ChevronDown
                  size={14}
                  className={cn("transition-transform", errorsExpanded && "rotate-180")}
                />
              </button>
              {errorsExpanded && (
                <div className="border-t border-red-500/20 px-4 py-3">
                  <div className="max-h-60 space-y-1 overflow-y-auto">
                    {preview.errors.map((err, i) => (
                      <div key={i} className="flex gap-3 text-xs">
                        <span className="shrink-0 text-red-400/60">Row {err.row}</span>
                        {err.field && (
                          <span className="shrink-0 font-mono text-red-400/60">{err.field}</span>
                        )}
                        <span className="text-red-300">{err.message}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
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
              disabled={hasUnmappedLocations}
              className={cn(
                "rounded-lg px-5 py-2 text-sm font-medium transition",
                hasUnmappedLocations
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
                  <span className="text-zinc-300">Importing...</span>
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
                  { label: "Processed", value: progress?.processed ?? 0, total: progress?.total ?? 0, showTotal: true },
                  { label: "Created", value: progress?.created ?? 0 },
                  { label: "Updated", value: progress?.updated ?? 0 },
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
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { label: "Created", value: results.created, color: "text-emerald-400" },
                  { label: "Updated", value: results.updated, color: "text-blue-400" },
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
              <div className="flex gap-3">
                <Link
                  href="/inventory"
                  className="flex flex-1 items-center justify-center rounded-lg border border-zinc-700 px-4 py-2.5 text-sm font-medium text-zinc-300 transition hover:bg-zinc-800"
                >
                  Go to Item List
                </Link>
                <button
                  onClick={handleReset}
                  className="flex-1 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-blue-500"
                >
                  Import Again
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
