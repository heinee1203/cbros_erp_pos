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
import { useCategories } from "@/hooks/use-categories";
import { useSubcategories } from "@/hooks/use-subcategories";
import { useProductFamilies } from "@/hooks/use-products";

/* ─────────────────────────────────────────────
 * Types
 * ───────────────────────────────────────────── */

type Step = "upload" | "parsing" | "preview" | "progress" | "results";
type ImportMode = "smart_sync" | "update_only" | "create_only" | "inventory_sync";

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
  format: string;
  totalRows: number;
  createCount: number;
  updateCount: number;
  skipCount: number;
  errorCount: number;
  locationMapping: Array<{
    csvName: string;
    apexLocationId: string | null;
    apexLocationName: string | null;
    autoMatched: boolean;
  }>;
  categoryMapping: Array<{
    csvName: string;
    apexCategoryId: string | null;
    apexCategoryName: string | null;
    autoMatched: boolean;
    productCount: number;
    createCount: number;
    updateCount: number;
  }>;
  errors: Array<{ rowIndex: number; field?: string; message: string }>;
  preview: Array<{
    rowIndex: number;
    name: string;
    sku: string;
    action: "CREATE" | "UPDATE" | "SKIP";
    changes?: string[];
    errors?: string[];
  }>;
  createPreview?: Array<{
    rowIndex: number;
    name: string;
    sku: string;
    action: "CREATE";
    changes?: string[];
    errors?: string[];
    variantName?: string | null;
    isVariant?: boolean;
  }>;
}

interface ProgressResponse {
  status: "running" | "done" | "completed" | "error" | "failed";
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
  const [importMode, setImportMode] = useState<ImportMode>("create_only");
  const [includeCreates, setIncludeCreates] = useState(true);
  const [includeUpdates, setIncludeUpdates] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [locationMapping, setLocationMapping] = useState<Record<string, string>>({});
  const [catMapping, setCatMapping] = useState<Record<string, { action: "create" | "map" | "skip"; targetCategoryId?: string; targetSubcategoryId?: string; familyId?: string; createSubcategory?: boolean }>>({});
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

  /* ── Fetch categories + families for category mapping ── */
  const categoriesQuery = useCategories(token, locationId, { activeOnly: true });
  const orgCategories = categoriesQuery.data?.data ?? [];
  const familiesQuery = useProductFamilies(token, locationId);
  const orgFamilies = familiesQuery.data?.data ?? [];
  const subcategoriesQuery = useSubcategories(token!, locationId!);
  const allSubcategories = subcategoriesQuery.data?.data ?? [];

  /* ── Initialize location mapping from preview ── */
  useEffect(() => {
    if (preview?.locationMapping) {
      const mapping: Record<string, string> = {};
      for (const loc of preview.locationMapping) {
        if (loc.autoMatched && loc.apexLocationId) {
          mapping[loc.csvName] = loc.apexLocationId;
        }
      }
      setLocationMapping(mapping);
    }
    // Initialize category mapping — auto-matched stay as-is, unmatched default to "create"
    // In create_only / inventory_sync mode, only map categories that have new items (creates)
    // In update_only mode, no category mapping needed
    if (preview?.categoryMapping) {
      const cm: Record<string, { action: "create" | "map" | "skip"; targetCategoryId?: string; familyId?: string }> = {};
      for (const cat of preview.categoryMapping) {
        if (!cat.autoMatched) {
          // Skip categories that only have updates (no new items) in modes that only create
          if ((importMode === "inventory_sync" || importMode === "create_only") && cat.createCount === 0) continue;
          // Skip all in update_only mode (not creating anything)
          if (importMode === "update_only") continue;
          cm[cat.csvName] = { action: "create" };
        }
      }
      setCatMapping(cm);
    }
  }, [preview, importMode]);

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
        // Reset toggles based on import mode
        setIncludeCreates(importMode !== "update_only");
        setIncludeUpdates(importMode !== "create_only");
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
  const hasMissingFamilies = Object.values(catMapping).some(
    (m) => m.action === "create" && !m.familyId,
  );

  const handleExecute = useCallback(async () => {
    if (!preview) return;
    // Validate: all "Create New" categories must have a family
    const missing = Object.entries(catMapping).filter(
      ([, m]) => m.action === "create" && !m.familyId,
    );
    if (missing.length > 0) {
      setError(`Please select a family for: ${missing.map(([name]) => name).join(", ")}`);
      return;
    }
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
          categoryMapping: importMode === "inventory_sync" ? undefined : (Object.keys(catMapping).length > 0 ? catMapping : undefined),
          importMode: !includeCreates ? "update_only" : !includeUpdates ? "create_only" : importMode,
          skipErrors: true,
          createNewCategories: importMode !== "inventory_sync",
        }),
      });
      setResults(resp);
      setStep("results");
      // Save location mappings for future imports
      if (Object.keys(locationMapping).length > 0) {
        try {
          await apiFetch("/inventory/import/save-location-mappings", {
            method: "POST",
            token,
            locationId,
            body: JSON.stringify({ mappings: locationMapping }),
          });
        } catch {
          // Non-critical — don't block on save failure
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Import failed";
      setError(message);
    }
  }, [preview, token, locationId, locationMapping, catMapping, importMode, includeCreates, includeUpdates]);

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
        if (prog.status === "done" || prog.status === "completed" || prog.status === "error" || prog.status === "failed") {
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
    setCatMapping({});
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

  const allLocations = preview?.locationMapping ?? [];
  const hasUnmappedLocations = allLocations.some((l) => !locationMapping[l.csvName]);

  /* ─────────────────────────────────────────────
   * Render
   * ───────────────────────────────────────────── */
  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href="/inventory"
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground transition hover:bg-muted hover:text-foreground"
        >
          <ArrowLeft size={16} />
        </Link>
        <div>
          <h1 className="text-xl font-semibold text-foreground">Import Center</h1>
          <p className="text-sm text-muted-foreground">
            Import data from Loyverse CSV exports
          </p>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-4 border-b border-border">
        <Link
          href="/inventory/import"
          className="px-3 py-2 text-sm font-medium border-b-2 border-primary text-primary"
        >
          Item Catalog
        </Link>
        <Link
          href="/inventory/import-sales"
          className="px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground border-b-2 border-transparent"
        >
          Sales Receipts
        </Link>
        <Link
          href="/inventory/import/history"
          className="px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground border-b-2 border-transparent"
        >
          Inventory Movements
        </Link>
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
              {i > 0 && <div className={cn("h-px w-8", isDone ? "bg-emerald-500" : "bg-border")} />}
              <div
                className={cn(
                  "flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold transition",
                  isDone && "bg-emerald-500/20 text-emerald-600",
                  isActive && "bg-primary/10 text-primary ring-1 ring-primary/30",
                  !isDone && !isActive && "bg-muted text-muted-foreground",
                )}
              >
                {isDone ? <CheckCircle size={12} /> : i + 1}
              </div>
              <span
                className={cn(
                  "hidden sm:inline font-medium",
                  isDone && "text-emerald-600",
                  isActive && "text-primary",
                  !isDone && !isActive && "text-muted-foreground",
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
        <div className="space-y-6">
          {/* Import mode */}
          <div className="rounded-lg border border-border bg-muted/30 p-5">
            <h3 className="mb-3 text-sm font-medium text-foreground">Import Mode</h3>
            <div className="flex flex-col gap-2 sm:flex-row sm:gap-4">
              {([
                { value: "create_only", label: "New Items Only", desc: "Skip items that already exist (matched by SKU) \u2014 only add new products" },
                { value: "inventory_sync", label: "Stock & Availability", desc: "Update stock, prices & store availability for existing items + create new ones" },
                { value: "smart_sync", label: "Full Sync", desc: "Update all fields for existing items + create new ones" },
                { value: "update_only", label: "Update Only", desc: "Only update existing items \u2014 do not create new ones" },
              ] as const).map((mode) => (
                <label
                  key={mode.value}
                  className={cn(
                    "flex flex-1 cursor-pointer items-start gap-3 rounded-lg border p-3 transition",
                    importMode === mode.value
                      ? "border-primary bg-primary/10"
                      : "border-border bg-background hover:border-primary/30",
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
                    <div className="text-sm font-medium text-foreground">{mode.label}</div>
                    <div className="text-xs text-muted-foreground">{mode.desc}</div>
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
                ? "pointer-events-none border-primary/40 bg-primary/5"
                : "border-border bg-muted/20 hover:border-primary/30 hover:bg-muted/40",
            )}
          >
            {step === "parsing" ? (
              <>
                <Loader2 size={32} className="animate-spin text-primary" />
                <p className="text-sm text-primary">Parsing CSV...</p>
              </>
            ) : (
              <>
                <Upload size={32} className="text-muted-foreground" />
                <div className="text-center">
                  <p className="text-sm font-medium text-foreground">
                    Drop your Loyverse CSV here, or click to browse
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">Supports .csv files</p>
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
          <p className="mt-2 text-center text-xs text-muted-foreground">
            Or <Link href="/inventory?action=add" className="font-medium text-primary hover:underline">add a single item manually</Link>
          </p>

          {file && step !== "parsing" && (
            <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-4 py-1.5 text-sm">
              <FileText size={14} className="text-muted-foreground" />
              <span className="text-foreground">{file.name}</span>
              <span className="text-muted-foreground">({(file.size / 1024).toFixed(1)} KB)</span>
            </div>
          )}
        </div>
      )}

      {/* ─── Step 2: Preview ─── */}
      {step === "preview" && preview && (
        <div className="space-y-6">
          {/* Import type toggles */}
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-muted-foreground">Import:</span>
            {importMode !== "update_only" && (
              <button
                onClick={() => { if (includeUpdates || !includeCreates) setIncludeCreates(!includeCreates); }}
                className={cn(
                  "rounded-full border px-3 py-1 text-sm font-medium transition-colors",
                  includeCreates
                    ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                    : "border-border bg-muted/50 text-muted-foreground line-through",
                )}
              >
                {includeCreates ? "✓" : "✗"} Creates ({preview.createCount.toLocaleString()})
              </button>
            )}
            {importMode !== "create_only" && (
              <button
                onClick={() => { if (includeCreates || !includeUpdates) setIncludeUpdates(!includeUpdates); }}
                className={cn(
                  "rounded-full border px-3 py-1 text-sm font-medium transition-colors",
                  includeUpdates
                    ? "border-primary/30 bg-primary/5 text-primary"
                    : "border-border bg-muted/50 text-muted-foreground line-through",
                )}
              >
                {includeUpdates ? "✓" : "✗"} Updates ({preview.updateCount.toLocaleString()})
              </button>
            )}
            <span className="rounded-full border border-border bg-muted/50 px-3 py-1 text-sm text-muted-foreground">
              Errors ({preview.errorCount})
            </span>
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              {
                label: "Will Import",
                value: (includeCreates ? preview.createCount : 0) + (includeUpdates ? preview.updateCount : 0),
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
                value: preview.updateCount,
                color: includeUpdates ? "text-primary" : "text-muted-foreground/50",
                dimmed: !includeUpdates,
              },
              { label: "Errors", value: preview.errorCount, color: "text-red-600" },
            ].map((card) => (
              <div
                key={card.label}
                className={cn(
                  "rounded-lg border border-border bg-muted/50 px-4 py-3 transition-opacity",
                  (card as any).dimmed && "opacity-40",
                )}
              >
                <div className="text-xs text-muted-foreground">{card.label}</div>
                <div className={cn("mt-1 text-2xl font-semibold", card.color)}>
                  {card.value.toLocaleString()}
                </div>
              </div>
            ))}
          </div>

          {/* Location mapping */}
          {(preview.locationMapping?.length ?? 0) > 0 && (
            <div className="rounded-lg border border-border bg-muted/50 p-5">
              <h3 className="mb-3 text-sm font-medium text-foreground">Location Mapping</h3>
              <div className="space-y-2">
                {preview.locationMapping.map((loc) => (
                  <div
                    key={loc.csvName}
                    className="flex items-center gap-3 rounded-md bg-muted/50 px-3 py-2"
                  >
                    <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                      {loc.csvName}
                    </span>
                    <span className="text-muted-foreground">&#8594;</span>
                    <select
                      value={locationMapping[loc.csvName] ?? ""}
                      onChange={(e) =>
                        setLocationMapping((prev) => ({
                          ...prev,
                          [loc.csvName]: e.target.value,
                        }))
                      }
                      className="rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                    >
                      <option value="">Select location...</option>
                      {orgLocations.map((ol) => (
                        <option key={ol.id} value={ol.id}>
                          {ol.name}
                        </option>
                      ))}
                    </select>
                    {loc.autoMatched && locationMapping[loc.csvName] && (
                      <span className="text-[10px] text-emerald-600 whitespace-nowrap">✓ auto</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Category Mapping — only show categories relevant to the import mode */}
          {preview.categoryMapping && preview.categoryMapping.length > 0 && (() => {
            // Filter categories to only those relevant for the current import mode:
            // - create_only / inventory_sync: only categories with new items (createCount > 0)
            // - update_only: no category mapping needed (not creating anything)
            // - smart_sync: show all categories (everything is processed)
            const relevantCategories = importMode === "update_only"
              ? []
              : (importMode === "create_only" || importMode === "inventory_sync")
                ? preview.categoryMapping.filter((c) => c.createCount > 0)
                : preview.categoryMapping;
            if (relevantCategories.length === 0) return null; // Nothing to map
            const matched = relevantCategories.filter((c) => c.autoMatched);
            const unmatched = relevantCategories.filter((c) => !c.autoMatched);
            return (
              <div className="rounded-lg border border-border bg-muted/50 px-4 py-3">
                <h3 className="mb-2 text-sm font-medium text-foreground">Category Mapping</h3>
                {(importMode === "inventory_sync" || importMode === "create_only") && (
                  <div className="mb-2 text-[11px] text-muted-foreground">
                    Only categories with new items are shown. Existing items keep their current categories.
                  </div>
                )}
                {matched.length > 0 && (
                  <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
                    <CheckCircle size={14} className="text-green-500" />
                    {matched.length} {matched.length === 1 ? "category" : "categories"} matched automatically
                  </div>
                )}
                {unmatched.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-xs font-medium text-amber-600">
                        <AlertTriangle size={14} />
                        {unmatched.length} {unmatched.length === 1 ? "category needs" : "categories need"} mapping
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          // Use the first family as default, or prompt
                          const defaultFamilyId = orgFamilies[0]?.id || "";
                          const all: typeof catMapping = {};
                          for (const c of unmatched) all[c.csvName] = { action: "create", familyId: defaultFamilyId };
                          setCatMapping(all);
                        }}
                        className="text-[10px] font-medium text-primary hover:underline"
                      >
                        Create All New
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const all: typeof catMapping = {};
                          for (const c of unmatched) all[c.csvName] = { action: "skip" };
                          setCatMapping(all);
                        }}
                        className="text-[10px] font-medium text-muted-foreground hover:underline"
                      >
                        Skip All
                      </button>
                    </div>
                    {unmatched.map((cat) => {
                      const entry = catMapping[cat.csvName] ?? { action: "create" };
                      return (
                        <div key={cat.csvName} className="rounded-md border border-border bg-background px-3 py-2">
                          {/* Header: category name + counts */}
                          <div className="mb-2">
                            <span className="text-sm font-medium">{cat.csvName}</span>
                            <span className="ml-1.5 text-[10px] text-muted-foreground">
                              ({cat.productCount} items
                              {(cat.createCount > 0 || cat.updateCount > 0) && (
                                <> · {cat.createCount > 0 && <span className="text-primary">{cat.createCount} new</span>}{cat.createCount > 0 && cat.updateCount > 0 && ", "}{cat.updateCount > 0 && <span>{cat.updateCount} updates</span>}</>
                              )})
                            </span>
                          </div>
                          {/* Radio options — stacked vertically */}
                          <div className="space-y-1.5 pl-1">
                            {/* Create New */}
                            <div className="flex items-center gap-2">
                              <label className="flex items-center gap-1 text-xs whitespace-nowrap">
                                <input
                                  type="radio"
                                  checked={entry.action === "create"}
                                  onChange={() => setCatMapping((prev) => ({ ...prev, [cat.csvName]: { action: "create" } }))}
                                />
                                Create New
                              </label>
                              {entry.action === "create" && (
                                <select
                                  value={entry.familyId ?? ""}
                                  onChange={(e) => setCatMapping((prev) => ({ ...prev, [cat.csvName]: { ...prev[cat.csvName], familyId: e.target.value || undefined } }))}
                                  className={cn(
                                    "rounded border bg-background px-2 py-0.5 text-xs",
                                    !entry.familyId ? "border-red-400 ring-1 ring-red-200" : "border-border",
                                  )}
                                >
                                  <option value="">Select family…</option>
                                  {orgFamilies.map((f: any) => <option key={f.id} value={f.id}>{f.name}</option>)}
                                </select>
                              )}
                            </div>
                            {/* Map to */}
                            <div className="flex items-center gap-2">
                              <label className="flex items-center gap-1 text-xs whitespace-nowrap">
                                <input
                                  type="radio"
                                  checked={entry.action === "map"}
                                  onChange={() => setCatMapping((prev) => ({ ...prev, [cat.csvName]: { action: "map", targetCategoryId: "" } }))}
                                />
                                Map to
                              </label>
                              {entry.action === "map" && (
                                <>
                                  <select
                                    value={entry.targetCategoryId ?? ""}
                                    onChange={(e) => setCatMapping((prev) => ({ ...prev, [cat.csvName]: { action: "map", targetCategoryId: e.target.value, targetSubcategoryId: undefined } }))}
                                    className="rounded border border-border bg-background px-2 py-0.5 text-xs"
                                  >
                                    <option value="">Select category…</option>
                                    {orgCategories.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                                  </select>
                                  {entry.targetCategoryId && (() => {
                                    const subs = allSubcategories.filter((s: any) => s.categoryId === entry.targetCategoryId);
                                    return subs.length > 0 ? (
                                      <select
                                        value={entry.targetSubcategoryId ?? ""}
                                        onChange={(e) => setCatMapping((prev) => ({ ...prev, [cat.csvName]: { ...prev[cat.csvName], targetSubcategoryId: e.target.value || undefined } }))}
                                        className="rounded border border-border bg-background px-2 py-0.5 text-xs"
                                      >
                                        <option value="">No sub-category</option>
                                        {subs.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                                      </select>
                                    ) : null;
                                  })()}
                                </>
                              )}
                            </div>
                            {/* Skip */}
                            <div className="flex items-center gap-2">
                              <label className="flex items-center gap-1 text-xs whitespace-nowrap">
                                <input
                                  type="radio"
                                  checked={entry.action === "skip"}
                                  onChange={() => setCatMapping((prev) => ({ ...prev, [cat.csvName]: { action: "skip" } }))}
                                />
                                <span className="text-muted-foreground">Skip</span>
                              </label>
                            </div>
                          </div>
                          {/* Apply to All button — visible when row has a valid mapping */}
                          {unmatched.length > 1 && (
                            (entry.action === "map" && entry.targetCategoryId) ||
                            (entry.action === "create" && entry.familyId) ||
                            entry.action === "skip"
                          ) && (
                            <button
                              type="button"
                              onClick={() => {
                                const source = catMapping[cat.csvName];
                                if (!source) return;
                                setCatMapping((prev) => {
                                  const updated = { ...prev };
                                  for (const c of unmatched) {
                                    if (c.csvName === cat.csvName) continue;
                                    updated[c.csvName] = { ...source };
                                  }
                                  return updated;
                                });
                              }}
                              className="text-[10px] font-medium text-primary hover:underline whitespace-nowrap"
                              title="Apply this mapping to all unmapped categories"
                            >
                              Apply to All ↓
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })()}

          {/* Preview table */}
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
                  {(() => {
                    // When updates are off, use createPreview (which has ALL create rows, not just first 100)
                    if (includeCreates && !includeUpdates) {
                      return (preview.createPreview ?? []).slice(0, 100);
                    }
                    if (!includeCreates && includeUpdates) {
                      return (preview.preview ?? []).filter((r) => r.action === "UPDATE").slice(0, 100);
                    }
                    // Both on — show creates first, then updates
                    const creates = preview.createPreview ?? [];
                    const updates = (preview.preview ?? []).filter((r) => r.action === "UPDATE");
                    return [...creates, ...updates].slice(0, 100);
                  })().map((row) => (
                    <tr
                      key={row.rowIndex}
                      className="border-b border-border hover:bg-accent"
                    >
                      <td className="px-4 py-2 text-muted-foreground">{row.rowIndex}</td>
                      <td className="px-4 py-2 font-mono text-xs text-foreground">{row.sku}</td>
                      <td className="max-w-[200px] truncate px-4 py-2 text-foreground">
                        {row.name}
                      </td>
                      <td className="max-w-[150px] truncate px-4 py-2 text-muted-foreground">
                        {(row as any).variantName || "—"}
                      </td>
                      <td className="px-4 py-2">
                        <span
                          className={cn(
                            "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                            row.action === "CREATE" && "bg-emerald-50 text-emerald-600",
                            row.action === "UPDATE" && "bg-primary/10 text-primary",
                            row.action === "SKIP" && "bg-muted text-muted-foreground",
                          )}
                        >
                          {row.action}
                        </span>
                      </td>
                      <td className="max-w-[200px] truncate px-4 py-2 text-xs text-muted-foreground">
                        {(() => {
                          const ch = row.changes ?? [];
                          // In inventory_sync mode, only show price changes (stock/availability not tracked as "changes")
                          const filtered = importMode === "inventory_sync"
                            ? ch.filter((c) => c.startsWith("unitPrice") || c.startsWith("costPrice"))
                            : ch;
                          return filtered.length > 0 ? filtered.join(", ") : "\u2014";
                        })()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Errors (collapsible) */}
          {(preview.errors?.length ?? 0) > 0 && (
            <div className="rounded-lg border border-red-300 bg-red-50">
              <button
                onClick={() => setErrorsExpanded(!errorsExpanded)}
                className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-red-700"
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
                <div className="border-t border-red-200 px-4 py-3">
                  <div className="max-h-60 space-y-1 overflow-y-auto">
                    {preview.errors.map((err, i) => (
                      <div key={i} className="flex gap-3 text-xs">
                        <span className="shrink-0 text-red-600">Row {(err as any).row ?? (err as any).rowIndex}</span>
                        {(err as any).field && (
                          <span className="shrink-0 font-mono text-red-600">{err.field}</span>
                        )}
                        <span className="text-red-700">{err.message}</span>
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
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground transition hover:bg-muted"
            >
              Cancel
            </button>
            <button
              onClick={handleExecute}
              disabled={hasUnmappedLocations || hasMissingFamilies}
              className={cn(
                "rounded-lg px-5 py-2 text-sm font-medium transition",
                hasUnmappedLocations || hasMissingFamilies
                  ? "cursor-not-allowed bg-muted text-muted-foreground"
                  : "bg-blue-600 text-white hover:bg-blue-500",
              )}
            >
              {hasMissingFamilies ? "Select families for new categories" : "Start Import"}
            </button>
          </div>
        </div>
      )}

      {/* ─── Step 3: Progress ─── */}
      {step === "progress" && (
        <div className="space-y-6">
          <div className="rounded-lg border border-border bg-muted/50 p-8">
            <div className="mx-auto max-w-md space-y-6">
              {/* Progress bar */}
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

              {/* Counters */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { label: "Processed", value: progress?.processed ?? 0, total: progress?.total ?? 0, showTotal: true },
                  { label: "Created", value: progress?.created ?? 0 },
                  { label: "Updated", value: progress?.updated ?? 0 },
                  { label: "Errors", value: progress?.errors ?? 0 },
                ].map((c) => (
                  <div key={c.label} className="text-center">
                    <div className="text-xs text-muted-foreground">{c.label}</div>
                    <div className="mt-0.5 text-lg font-semibold text-foreground">
                      {c.value.toLocaleString()}
                      {"showTotal" in c && c.showTotal && (
                        <span className="text-sm text-muted-foreground">
                          /{(c as { total: number }).total.toLocaleString()}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Time info */}
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

              {/* Spinner */}
              <div className="flex justify-center">
                <Loader2 size={24} className="animate-spin text-primary" />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Step 4: Results ─── */}
      {step === "results" && results && (
        <div className="space-y-6">
          <div className="rounded-lg border border-border bg-muted/50 p-8">
            <div className="mx-auto max-w-md space-y-6">
              {/* Success icon */}
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

              {/* Summary grid */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { label: "Created", value: results.created, color: "text-emerald-600" },
                  { label: "Updated", value: results.updated, color: "text-primary" },
                  { label: "Skipped", value: results.skipped, color: "text-muted-foreground" },
                  { label: "Errors", value: results.errors, color: "text-red-600" },
                ].map((c) => (
                  <div key={c.label} className="rounded-lg bg-muted/50 px-3 py-2 text-center">
                    <div className="text-xs text-muted-foreground">{c.label}</div>
                    <div className={cn("mt-0.5 text-xl font-semibold", c.color)}>
                      {c.value.toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>

              {/* Error log download + inline display */}
              {results.errorLog && results.errorLog.length > 0 && (
                <>
                  <button
                    onClick={handleDownloadErrors}
                    className="flex w-full items-center justify-center gap-2 rounded-lg border border-red-300 bg-red-50 px-4 py-1.5 text-sm font-medium text-red-700 transition hover:bg-red-100"
                  >
                    <Download size={14} />
                    Download Error Log ({results.errorLog.length}{" "}
                    {results.errorLog.length === 1 ? "error" : "errors"})
                  </button>
                  <div className="max-h-[300px] overflow-y-auto rounded-lg border border-red-200 bg-background">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-red-50 border-b border-red-200">
                        <tr>
                          <th className="px-3 py-1.5 text-left font-semibold text-red-800 w-16">Row</th>
                          <th className="px-3 py-1.5 text-left font-semibold text-red-800">Error</th>
                        </tr>
                      </thead>
                      <tbody>
                        {results.errorLog.slice(0, 100).map((err, i) => (
                          <tr key={i} className="border-b border-red-100 hover:bg-red-50/50">
                            <td className="px-3 py-1.5 font-mono text-red-600 tabular-nums">{err.row}</td>
                            <td className="px-3 py-1.5 text-red-700">{err.message}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {results.errorLog.length > 100 && (
                      <div className="px-3 py-2 text-center text-[11px] text-red-500 italic border-t border-red-200 bg-red-50/30">
                        Showing 100 of {results.errorLog.length} errors — download CSV for full list
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* Actions */}
              <div className="flex gap-3">
                <Link
                  href="/inventory"
                  className="flex flex-1 items-center justify-center rounded-lg border border-border px-4 py-1.5 text-sm font-medium text-muted-foreground transition hover:bg-muted"
                >
                  Go to Item List
                </Link>
                <button
                  onClick={handleReset}
                  className="flex-1 rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-blue-500"
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
