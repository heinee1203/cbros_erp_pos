import type { ChangeEvent, DragEvent, RefObject } from "react";
import { FileText, Loader2, Upload } from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/utils";
import { ImportProfilePicker } from "./import-profile-picker";
import type { ImportMode, ImportProfile, Step } from "../types";

const IMPORT_MODES = [
  {
    value: "create_only",
    label: "New Items Only",
    desc: "Skip items that already exist (matched by SKU) \u2014 only add new products",
  },
  {
    value: "inventory_sync",
    label: "Stock & Availability",
    desc: "Update stock, prices & store availability for existing items + create new ones",
  },
  {
    value: "smart_sync",
    label: "Full Sync",
    desc: "Update all fields for existing items + create new ones",
  },
  {
    value: "update_only",
    label: "Update Only",
    desc: "Only update barcode, quantity, and selling price for existing items",
  },
] as const;

type ImportUploadStepProps = {
  step: Step;
  importMode: ImportMode;
  file: File | null;
  dropZoneRef: RefObject<HTMLDivElement | null>;
  fileInputRef: RefObject<HTMLInputElement | null>;
  profiles: ImportProfile[];
  selectedProfileId: string;
  profilesLoading: boolean;
  busyProfileId: string | null;
  onImportModeChange: (mode: ImportMode) => void;
  onSelectedProfileChange: (profileId: string) => void;
  onRenameProfile: (profileId: string, name: string) => Promise<void>;
  onDeleteProfile: (profileId: string) => Promise<void>;
  onDrop: (event: DragEvent<HTMLDivElement>) => void;
  onDragOver: (event: DragEvent<HTMLDivElement>) => void;
  onInputChange: (event: ChangeEvent<HTMLInputElement>) => void;
};

export function ImportUploadStep({
  step,
  importMode,
  file,
  dropZoneRef,
  fileInputRef,
  profiles,
  selectedProfileId,
  profilesLoading,
  busyProfileId,
  onImportModeChange,
  onSelectedProfileChange,
  onRenameProfile,
  onDeleteProfile,
  onDrop,
  onDragOver,
  onInputChange,
}: ImportUploadStepProps) {
  return (
    <div className="space-y-6">
      <ImportProfilePicker
        profiles={profiles}
        selectedProfileId={selectedProfileId}
        isLoading={profilesLoading}
        busyProfileId={busyProfileId}
        onSelectedProfileChange={onSelectedProfileChange}
        onRenameProfile={onRenameProfile}
        onDeleteProfile={onDeleteProfile}
      />

      <div className="rounded-lg border border-border bg-muted/30 p-5">
        <h3 className="mb-3 text-sm font-medium text-foreground">Import Mode</h3>
        <div className="flex flex-col gap-2 sm:flex-row sm:gap-4">
          {IMPORT_MODES.map((mode) => (
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
                onChange={() => onImportModeChange(mode.value)}
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

      <div
        ref={dropZoneRef}
        onDrop={onDrop}
        onDragOver={onDragOver}
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
              <p className="text-sm font-medium text-foreground">Drop your Loyverse CSV here, or click to browse</p>
              <p className="mt-1 text-xs text-muted-foreground">Supports .csv files</p>
            </div>
          </>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          onChange={onInputChange}
          className="hidden"
        />
      </div>
      <p className="mt-2 text-center text-xs text-muted-foreground">
        Or{" "}
        <Link href="/inventory?action=add" className="font-medium text-primary hover:underline">
          add a single item manually
        </Link>
      </p>

      {file && step !== "parsing" && (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-4 py-1.5 text-sm">
          <FileText size={14} className="text-muted-foreground" />
          <span className="text-foreground">{file.name}</span>
          <span className="text-muted-foreground">({(file.size / 1024).toFixed(1)} KB)</span>
        </div>
      )}
    </div>
  );
}
