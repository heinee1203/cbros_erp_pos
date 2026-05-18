"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  X,
} from "lucide-react";
import { useAuth } from "@/app/auth-context";
import { apiFetch } from "@/lib/api";
import { ImportBatchPanel } from "./components/import-batch-panel";
import { ImportHistoryHeader } from "./components/import-history-header";
import { ImportPreviewStep } from "./components/import-preview-step";
import { ImportProgressStep } from "./components/import-progress-step";
import { ImportResultsStep } from "./components/import-results-step";
import { ImportStepIndicator } from "./components/import-step-indicator";
import { ImportUploadStep } from "./components/import-upload-step";
import { DEFAULT_CHECKED } from "./constants";
import { downloadExecutionErrorReport } from "../import-report-utils";
import type {
  ImportableReasonType,
  ImportBatch,
  LocationOption,
  PreviewResponse,
  ProgressResponse,
  Step,
} from "./types";


/* ─────────────────────────────────────────────
 * Types
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
  const [selectedReasons, setSelectedReasons] = useState<Set<ImportableReasonType>>(
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
  const toggleReason = useCallback((reason: ImportableReasonType) => {
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
    downloadExecutionErrorReport({
      filename: "history-import-execution-errors",
      errorLog: results.errorLog,
    });
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

  const unmatchedLocations = preview?.locations?.filter((l) => !l.matched) ?? [];
  const hasUnmappedLocations = unmatchedLocations.some((l) => !locationMapping[l.csvName]);

  /* ─────────────────────────────────────────────
   * Render
   * ───────────────────────────────────────────── */
  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <ImportHistoryHeader />
      <ImportStepIndicator step={step} />

      {/* Global error */}
      {error && (
        <div className="flex items-start gap-3 rounded-lg border border-red-300 bg-red-50 px-4 py-3">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-red-600" />
          <div className="flex-1 text-sm text-red-700">{error}</div>
          <button onClick={() => setError(null)} className="text-red-600 hover:text-red-700">
            <X size={14} />
          </button>
        </div>
      )}

      {/* ─── Step 1: Upload ─── */}
      {(step === "upload" || step === "parsing") && (
        <ImportUploadStep
          step={step}
          file={file}
          selectedReasons={selectedReasons}
          fileInputRef={fileInputRef}
          onToggleReason={toggleReason}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onInputChange={handleInputChange}
        />
      )}

      {/* ─── Step 2: Preview ─── */}
      {step === "preview" && preview && (
        <ImportPreviewStep
          preview={preview}
          orgLocations={orgLocations}
          selectedReasons={selectedReasons}
          locationMapping={locationMapping}
          unmatchedExpanded={unmatchedExpanded}
          hasUnmappedLocations={hasUnmappedLocations}
          onToggleUnmatched={() => setUnmatchedExpanded(!unmatchedExpanded)}
          onLocationMappingChange={(csvName, mappedLocationId) =>
            setLocationMapping((prev) => ({
              ...prev,
              [csvName]: mappedLocationId,
            }))
          }
          onReset={handleReset}
          onExecute={handleExecute}
        />
      )}

      {/* ─── Step 3: Progress ─── */}
      {step === "progress" && (
        <ImportProgressStep
          progress={progress}
          elapsed={elapsed}
          pct={pct}
          estRemaining={estRemaining}
        />
      )}

      {/* ─── Step 4: Results ─── */}
      {step === "results" && results && (
        <ImportResultsStep
          results={results}
          onDownloadErrors={handleDownloadErrors}
          onRefreshStockMonitor={handleRefreshStockMonitor}
          onReset={handleReset}
        />
      )}

      {/* ─── Import Batch Management ─── */}
      <ImportBatchPanel
        batches={batches}
        deletingBatch={deletingBatch}
        onDeleteBatch={handleDeleteBatch}
      />
    </div>
  );
}
