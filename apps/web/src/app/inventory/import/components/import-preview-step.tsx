import type { Dispatch, SetStateAction } from "react";
import type { CategoryRow } from "@/hooks/use-categories";
import type { ProductFamily } from "@/hooks/use-products";
import type { SubcategoryRow } from "@/hooks/use-subcategories";
import { ImportCategoryMappingSection } from "./import-category-mapping-section";
import { ImportFieldLockNotice } from "./import-field-lock-notice";
import { ImportLocationMappingSection } from "./import-location-mapping-section";
import { ImportPreviewActions } from "./import-preview-actions";
import { ImportPreviewErrors } from "./import-preview-errors";
import { ImportPreviewReports } from "./import-preview-reports";
import { ImportPreviewSummary } from "./import-preview-summary";
import { ImportPreviewTable } from "./import-preview-table";
import { ImportPreviewTypeToggles } from "./import-preview-type-toggles";
import type {
  CategoryMappingChoice,
  ImportMode,
  LocationOption,
  PreviewResponse,
} from "../types";

type ImportPreviewStepProps = {
  preview: PreviewResponse;
  importMode: ImportMode;
  includeCreates: boolean;
  includeUpdates: boolean;
  includeNoChange: boolean;
  locationMapping: Record<string, string>;
  categoryMapping: Record<string, CategoryMappingChoice>;
  orgLocations: LocationOption[];
  orgCategories: CategoryRow[];
  orgFamilies: ProductFamily[];
  allSubcategories: SubcategoryRow[];
  errorsExpanded: boolean;
  hasUnmappedLocations: boolean;
  hasMissingFamilies: boolean;
  profileName: string;
  savingProfile: boolean;
  onIncludeCreatesChange: (value: boolean) => void;
  onIncludeUpdatesChange: (value: boolean) => void;
  onIncludeNoChangeChange: (value: boolean) => void;
  onLocationMappingChange: Dispatch<SetStateAction<Record<string, string>>>;
  onCategoryMappingChange: Dispatch<SetStateAction<Record<string, CategoryMappingChoice>>>;
  onErrorsExpandedChange: (expanded: boolean) => void;
  onProfileNameChange: (name: string) => void;
  onSaveProfile: () => void;
  onCancel: () => void;
  onExecute: () => void;
};

export function ImportPreviewStep({
  preview,
  importMode,
  includeCreates,
  includeUpdates,
  includeNoChange,
  locationMapping,
  categoryMapping,
  orgLocations,
  orgCategories,
  orgFamilies,
  allSubcategories,
  errorsExpanded,
  hasUnmappedLocations,
  hasMissingFamilies,
  profileName,
  savingProfile,
  onIncludeCreatesChange,
  onIncludeUpdatesChange,
  onIncludeNoChangeChange,
  onLocationMappingChange,
  onCategoryMappingChange,
  onErrorsExpandedChange,
  onProfileNameChange,
  onSaveProfile,
  onCancel,
  onExecute,
}: ImportPreviewStepProps) {
  return (
    <div className="space-y-6">
      <ImportFieldLockNotice preview={preview} importMode={importMode} />

      <ImportPreviewTypeToggles
        preview={preview}
        importMode={importMode}
        includeCreates={includeCreates}
        includeUpdates={includeUpdates}
        includeNoChange={includeNoChange}
        onIncludeCreatesChange={onIncludeCreatesChange}
        onIncludeUpdatesChange={onIncludeUpdatesChange}
        onIncludeNoChangeChange={onIncludeNoChangeChange}
      />

      <ImportPreviewSummary
        preview={preview}
        importMode={importMode}
        includeCreates={includeCreates}
        includeUpdates={includeUpdates}
      />

      <ImportPreviewReports preview={preview} importMode={importMode} />

      <ImportLocationMappingSection
        locations={preview.locationMapping ?? []}
        orgLocations={orgLocations}
        locationMapping={locationMapping}
        onLocationMappingChange={onLocationMappingChange}
      />

      <ImportCategoryMappingSection
        categoryMapping={preview.categoryMapping ?? []}
        importMode={importMode}
        mappedCategories={categoryMapping}
        orgCategories={orgCategories}
        orgFamilies={orgFamilies}
        allSubcategories={allSubcategories}
        onCategoryMappingChange={onCategoryMappingChange}
      />

      <ImportPreviewTable
        preview={preview}
        importMode={importMode}
        includeCreates={includeCreates}
        includeUpdates={includeUpdates}
        includeNoChange={includeNoChange}
      />

      <ImportPreviewErrors
        errors={preview.errors ?? []}
        expanded={errorsExpanded}
        onExpandedChange={onErrorsExpandedChange}
      />

      <ImportPreviewActions
        hasUnmappedLocations={hasUnmappedLocations}
        hasMissingFamilies={hasMissingFamilies}
        profileName={profileName}
        savingProfile={savingProfile}
        onProfileNameChange={onProfileNameChange}
        onSaveProfile={onSaveProfile}
        onCancel={onCancel}
        onExecute={onExecute}
      />
    </div>
  );
}
