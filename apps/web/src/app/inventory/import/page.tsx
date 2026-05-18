"use client";

import { useCallback, useEffect, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { AlertTriangle, X } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/app/auth-context";
import { useCategories } from "@/hooks/use-categories";
import { useProductFamilies } from "@/hooks/use-products";
import { useSubcategories } from "@/hooks/use-subcategories";
import { apiFetch } from "@/lib/api";
import { downloadCSV } from "@/lib/csv-export";
import { ImportItemsHeader } from "./components/import-items-header";
import { ImportItemsStepIndicator } from "./components/import-items-step-indicator";
import { ImportPreviewStep } from "./components/import-preview-step";
import { ImportProgressStep } from "./components/import-progress-step";
import { ImportResultsStep } from "./components/import-results-step";
import { ImportUploadStep } from "./components/import-upload-step";
import { IMPORT_PROFILE_FIELD_LOCK_POLICY_VERSION } from "./import-mode-policy";
import { downloadExecutionErrorReport } from "./import-report-utils";
import type {
  CategoryMappingChoice,
  ImportMode,
  ImportProfile,
  LocationOption,
  ImportRollbackResult,
  PreviewResponse,
  ProgressResponse,
  Step,
} from "./types";

export default function ImportItemsPage() {
  const { token, apiLocationId: locationId } = useAuth();
  const queryClient = useQueryClient();

  const [step, setStep] = useState<Step>("upload");
  const [importMode, setImportMode] = useState<ImportMode>("create_only");
  const [includeCreates, setIncludeCreates] = useState(true);
  const [includeUpdates, setIncludeUpdates] = useState(true);
  const [includeNoChange, setIncludeNoChange] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [locationMapping, setLocationMapping] = useState<Record<string, string>>({});
  const [catMapping, setCatMapping] = useState<Record<string, CategoryMappingChoice>>({});
  const [progress, setProgress] = useState<ProgressResponse | null>(null);
  const [results, setResults] = useState<ProgressResponse | null>(null);
  const [rollbackResult, setRollbackResult] = useState<ImportRollbackResult | null>(null);
  const [rollbackLoading, setRollbackLoading] = useState(false);
  const [errorsExpanded, setErrorsExpanded] = useState(false);
  const [selectedProfileId, setSelectedProfileId] = useState("");
  const [profileName, setProfileName] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [busyProfileId, setBusyProfileId] = useState<string | null>(null);
  const [profileStatus, setProfileStatus] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [startTime, setStartTime] = useState(0);
  const [elapsed, setElapsed] = useState(0);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  const { data: locationsData } = useQuery({
    queryKey: ["locations"],
    queryFn: () => apiFetch<{ data: LocationOption[] }>("/locations", { token, locationId }),
    enabled: !!token,
  });

  const profilesQuery = useQuery({
    queryKey: ["import-profiles", "items"],
    queryFn: () =>
      apiFetch<{ data: ImportProfile[] }>("/inventory/import/profiles?importType=items", {
        token,
        locationId,
      }),
    enabled: !!token,
  });

  const orgLocations = locationsData?.data ?? [];
  const importProfiles = profilesQuery.data?.data ?? [];
  const selectedProfile =
    importProfiles.find((profile) => profile.id === selectedProfileId) ?? null;
  const categoriesQuery = useCategories(token, locationId, { activeOnly: true });
  const orgCategories = categoriesQuery.data?.data ?? [];
  const familiesQuery = useProductFamilies(token, locationId);
  const orgFamilies = familiesQuery.data?.data ?? [];
  const subcategoriesQuery = useSubcategories(token!, locationId!);
  const allSubcategories = subcategoriesQuery.data?.data ?? [];

  useEffect(() => {
    if (preview?.locationMapping) {
      const mapping = buildAutoLocationMapping(preview);
      if (selectedProfile?.locationMapping) {
        Object.assign(mapping, selectedProfile.locationMapping);
      }
      setLocationMapping(mapping);
    }

    if (preview?.categoryMapping) {
      if (importMode === "inventory_sync" || importMode === "update_only") {
        setCatMapping({});
      } else {
        const mapping = buildDefaultCategoryMapping(preview, importMode);
        if (selectedProfile?.categoryMapping) {
          Object.assign(mapping, selectedProfile.categoryMapping);
        }
        setCatMapping(mapping);
      }
    }
  }, [preview, importMode, selectedProfile]);

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
        setIncludeCreates(selectedProfile?.includeCreates ?? importMode !== "update_only");
        setIncludeUpdates(selectedProfile?.includeUpdates ?? importMode !== "create_only");
        setIncludeNoChange(selectedProfile?.includeNoChange ?? false);
        setStep("preview");
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Failed to parse CSV";
        setError(message);
        setStep("upload");
      }
    },
    [token, locationId, importMode, selectedProfile],
  );

  const handleSelectedProfileChange = useCallback(
    (profileId: string) => {
      setSelectedProfileId(profileId);
      setProfileStatus(null);

      const profile = importProfiles.find((item) => item.id === profileId);
      if (!profile) {
        return;
      }

      setImportMode(profile.importMode);
      setIncludeCreates(profile.includeCreates);
      setIncludeUpdates(profile.includeUpdates);
      setIncludeNoChange(profile.includeNoChange);
      setProfileName(profile.name);
    },
    [importProfiles],
  );

  const handleSaveProfile = useCallback(async () => {
    const name = profileName.trim();
    if (!name) {
      setProfileStatus({ type: "error", message: "Enter a profile name before saving." });
      return;
    }

    setSavingProfile(true);
    setProfileStatus(null);
    try {
      const response = await apiFetch<{ data: ImportProfile }>("/inventory/import/profiles", {
        method: "POST",
        token,
        locationId,
        body: {
          name,
          importType: "items",
          importMode,
          locationMapping,
          categoryMapping:
            importMode === "inventory_sync" || importMode === "update_only" ? {} : catMapping,
          includeCreates,
          includeUpdates,
          includeNoChange,
          createNewCategories: importMode !== "inventory_sync" && importMode !== "update_only",
          fieldLockPolicyVersion: IMPORT_PROFILE_FIELD_LOCK_POLICY_VERSION,
        },
      });

      setSelectedProfileId(response.data.id);
      setProfileName(response.data.name);
      setProfileStatus({ type: "success", message: `Saved import profile "${response.data.name}".` });
      await queryClient.invalidateQueries({ queryKey: ["import-profiles", "items"] });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to save import profile";
      setProfileStatus({ type: "error", message });
    } finally {
      setSavingProfile(false);
    }
  }, [
    profileName,
    token,
    locationId,
    importMode,
    locationMapping,
    catMapping,
    includeCreates,
    includeUpdates,
    includeNoChange,
    queryClient,
  ]);

  const handleRenameProfile = useCallback(
    async (profileId: string, name: string) => {
      const trimmedName = name.trim();
      if (!trimmedName) {
        setProfileStatus({ type: "error", message: "Profile name is required." });
        return;
      }

      setBusyProfileId(profileId);
      setProfileStatus(null);
      try {
        const response = await apiFetch<{ data: ImportProfile }>(
          `/inventory/import/profiles/${encodeURIComponent(profileId)}`,
          {
            method: "PATCH",
            token,
            locationId,
            body: { name: trimmedName },
          },
        );
        setProfileName(response.data.name);
        setProfileStatus({ type: "success", message: `Renamed profile to "${response.data.name}".` });
        await queryClient.invalidateQueries({ queryKey: ["import-profiles", "items"] });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Failed to rename import profile";
        setProfileStatus({ type: "error", message });
      } finally {
        setBusyProfileId(null);
      }
    },
    [token, locationId, queryClient],
  );

  const handleDeleteProfile = useCallback(
    async (profileId: string) => {
      setBusyProfileId(profileId);
      setProfileStatus(null);
      try {
        await apiFetch(`/inventory/import/profiles/${encodeURIComponent(profileId)}`, {
          method: "DELETE",
          token,
          locationId,
        });
        if (selectedProfileId === profileId) {
          setSelectedProfileId("");
          setProfileName("");
        }
        setProfileStatus({ type: "success", message: "Deleted import profile." });
        await queryClient.invalidateQueries({ queryKey: ["import-profiles", "items"] });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Failed to delete import profile";
        setProfileStatus({ type: "error", message });
      } finally {
        setBusyProfileId(null);
      }
    },
    [token, locationId, selectedProfileId, queryClient],
  );

  const handleDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      const droppedFile = event.dataTransfer.files[0];
      if (droppedFile && (droppedFile.name.endsWith(".csv") || droppedFile.type === "text/csv")) {
        handleFileSelect(droppedFile);
      } else {
        setError("Please upload a CSV file");
      }
    },
    [handleFileSelect],
  );

  const handleDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
  }, []);

  const handleInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const selectedFile = event.target.files?.[0];
      if (selectedFile) {
        handleFileSelect(selectedFile);
      }
    },
    [handleFileSelect],
  );

  const hasMissingFamilies = Object.values(catMapping).some(
    (mapping) => mapping.action === "create" && !mapping.familyId,
  );

  const handleExecute = useCallback(async () => {
    if (!preview) return;

    const missing = Object.entries(catMapping).filter(
      ([, mapping]) => mapping.action === "create" && !mapping.familyId,
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
          fileName: file?.name,
          locationMapping,
          categoryMapping:
            importMode === "inventory_sync" || importMode === "update_only"
              ? undefined
              : Object.keys(catMapping).length > 0
                ? catMapping
                : undefined,
          importMode: !includeCreates ? "update_only" : !includeUpdates ? "create_only" : importMode,
          skipErrors: true,
          createNewCategories: importMode !== "inventory_sync" && importMode !== "update_only",
        }),
      });
      setResults(resp);
      setStep("results");

      if (Object.keys(locationMapping).length > 0) {
        try {
          await apiFetch("/inventory/import/save-location-mappings", {
            method: "POST",
            token,
            locationId,
            body: JSON.stringify({ mappings: locationMapping }),
          });
        } catch {
          // Non-critical: importing already completed successfully.
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Import failed";
      setError(message);
    }
  }, [preview, token, locationId, locationMapping, catMapping, importMode, includeCreates, includeUpdates, file]);

  useEffect(() => {
    if (step !== "progress" || !preview) return;
    const interval = setInterval(async () => {
      try {
        const prog = await apiFetch<ProgressResponse>(
          `/inventory/import/progress/${preview.previewToken}`,
          { token, locationId },
        );
        setProgress(prog);
        if (
          prog.status === "done" ||
          prog.status === "completed" ||
          prog.status === "error" ||
          prog.status === "failed"
        ) {
          clearInterval(interval);
          setResults(prog);
          setStep("results");
        }
      } catch {
        // Polling errors are transient; keep trying until the interval is cleared.
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [step, preview, token, locationId]);

  useEffect(() => {
    if (step !== "progress") return;
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [step, startTime]);

  const handleReset = useCallback(() => {
    setStep("upload");
    setFile(null);
    setError(null);
    setPreview(null);
    setProgress(null);
    setResults(null);
    setRollbackResult(null);
    setRollbackLoading(false);
    setProfileStatus(null);
    setLocationMapping({});
    setCatMapping({});
    setElapsed(0);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const handleDownloadErrors = useCallback(() => {
    if (!results?.errorLog?.length) return;
    downloadExecutionErrorReport({
      filename: "item-import-execution-errors",
      errorLog: results.errorLog,
      preview,
      importMode,
    });
  }, [results, preview, importMode]);

  const handleRollback = useCallback(
    async (dryRun: boolean) => {
      setRollbackLoading(true);
      setError(null);
      try {
        const response = await apiFetch<ImportRollbackResult>("/inventory/import/rollback/latest", {
          method: "POST",
          token,
          locationId,
          body: JSON.stringify({ dryRun }),
        });
        setRollbackResult(response);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Rollback failed";
        setError(message);
      } finally {
        setRollbackLoading(false);
      }
    },
    [token, locationId],
  );

  const handleDownloadRollbackConflicts = useCallback(() => {
    if (!rollbackResult) return;
    const conflictRows = rollbackResult.conflicts.map((conflict) => [
      String(conflict.rowIndex),
      conflict.sku,
      conflict.name,
      conflict.entity,
      conflict.field,
      conflict.reason,
      formatRollbackCsvValue(conflict.expectedAfterValue),
      formatRollbackCsvValue(conflict.currentValue),
      formatRollbackCsvValue(conflict.beforeValue),
    ]);
    const skippedRows = rollbackResult.skipped.map((skipped) => [
      String(skipped.rowIndex || ""),
      skipped.sku,
      skipped.name,
      "row",
      "",
      skipped.reason,
      "",
      "",
      "",
    ]);
    downloadCSV(
      "item-import-rollback-conflicts",
      ["Row", "SKU", "Name", "Entity", "Field", "Reason", "Expected After", "Current Value", "Restore Value"],
      [...conflictRows, ...skippedRows],
    );
  }, [rollbackResult]);

  const pct =
    progress && progress.total > 0
      ? Math.round((progress.processed / progress.total) * 100)
      : 0;

  const estRemaining =
    progress && progress.processed > 0 && elapsed > 0
      ? Math.round(((progress.total - progress.processed) / progress.processed) * elapsed)
      : null;

  const allLocations = preview?.locationMapping ?? [];
  const hasUnmappedLocations = allLocations.some((location) => !locationMapping[location.csvName]);

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <ImportItemsHeader />
      <ImportItemsStepIndicator step={step} />

      {error && (
        <div className="flex items-start gap-3 rounded-lg border border-red-300 bg-red-50 px-4 py-3">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-red-600" />
          <div className="flex-1 text-sm text-red-700">{error}</div>
          <button onClick={() => setError(null)} className="text-red-600 hover:text-red-700">
            <X size={14} />
          </button>
        </div>
      )}

      {profileStatus && (
        <div
          className={
            profileStatus.type === "success"
              ? "rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700"
              : "rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700"
          }
        >
          {profileStatus.message}
        </div>
      )}

      {(step === "upload" || step === "parsing") && (
        <ImportUploadStep
          step={step}
          importMode={importMode}
          file={file}
          dropZoneRef={dropZoneRef}
          fileInputRef={fileInputRef}
          profiles={importProfiles}
          selectedProfileId={selectedProfileId}
          profilesLoading={profilesQuery.isLoading}
          busyProfileId={busyProfileId}
          onImportModeChange={setImportMode}
          onSelectedProfileChange={handleSelectedProfileChange}
          onRenameProfile={handleRenameProfile}
          onDeleteProfile={handleDeleteProfile}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onInputChange={handleInputChange}
        />
      )}

      {step === "preview" && preview && (
        <ImportPreviewStep
          preview={preview}
          importMode={importMode}
          includeCreates={includeCreates}
          includeUpdates={includeUpdates}
          includeNoChange={includeNoChange}
          locationMapping={locationMapping}
          categoryMapping={catMapping}
          orgLocations={orgLocations}
          orgCategories={orgCategories}
          orgFamilies={orgFamilies}
          allSubcategories={allSubcategories}
          errorsExpanded={errorsExpanded}
          hasUnmappedLocations={hasUnmappedLocations}
          hasMissingFamilies={hasMissingFamilies}
          profileName={profileName}
          savingProfile={savingProfile}
          onIncludeCreatesChange={setIncludeCreates}
          onIncludeUpdatesChange={setIncludeUpdates}
          onIncludeNoChangeChange={setIncludeNoChange}
          onLocationMappingChange={setLocationMapping}
          onCategoryMappingChange={setCatMapping}
          onErrorsExpandedChange={setErrorsExpanded}
          onProfileNameChange={setProfileName}
          onSaveProfile={handleSaveProfile}
          onCancel={handleReset}
          onExecute={handleExecute}
        />
      )}

      {step === "progress" && (
        <ImportProgressStep
          progress={progress}
          elapsed={elapsed}
          pct={pct}
          estRemaining={estRemaining}
        />
      )}

      {step === "results" && results && (
        <ImportResultsStep
          results={results}
          rollbackResult={rollbackResult}
          rollbackLoading={rollbackLoading}
          onDownloadErrors={handleDownloadErrors}
          onDryRunRollback={() => handleRollback(true)}
          onApplyRollback={() => handleRollback(false)}
          onDownloadRollbackConflicts={handleDownloadRollbackConflicts}
          onReset={handleReset}
        />
      )}
    </div>
  );
}

function formatRollbackCsvValue(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function buildAutoLocationMapping(preview: PreviewResponse): Record<string, string> {
  const mapping: Record<string, string> = {};
  for (const location of preview.locationMapping ?? []) {
    if (location.autoMatched && location.apexLocationId) {
      mapping[location.csvName] = location.apexLocationId;
    }
  }
  return mapping;
}

function buildDefaultCategoryMapping(
  preview: PreviewResponse,
  importMode: ImportMode,
): Record<string, CategoryMappingChoice> {
  const mapping: Record<string, CategoryMappingChoice> = {};
  for (const category of preview.categoryMapping ?? []) {
    if (category.autoMatched) continue;
    if (
      (importMode === "inventory_sync" || importMode === "create_only") &&
      category.createCount === 0
    ) {
      continue;
    }
    if (importMode === "update_only") continue;
    mapping[category.csvName] = { action: "create" };
  }
  return mapping;
}
