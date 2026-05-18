import type { Dispatch, SetStateAction } from "react";
import { AlertTriangle, CheckCircle } from "lucide-react";
import type { CategoryRow } from "@/hooks/use-categories";
import type { ProductFamily } from "@/hooks/use-products";
import type { SubcategoryRow } from "@/hooks/use-subcategories";
import { cn } from "@/lib/utils";
import type { CategoryMappingChoice, ImportMode, PreviewResponse } from "../types";

type ImportCategoryMappingSectionProps = {
  categoryMapping: PreviewResponse["categoryMapping"];
  importMode: ImportMode;
  mappedCategories: Record<string, CategoryMappingChoice>;
  orgCategories: CategoryRow[];
  orgFamilies: ProductFamily[];
  allSubcategories: SubcategoryRow[];
  onCategoryMappingChange: Dispatch<SetStateAction<Record<string, CategoryMappingChoice>>>;
};

export function ImportCategoryMappingSection({
  categoryMapping,
  importMode,
  mappedCategories,
  orgCategories,
  orgFamilies,
  allSubcategories,
  onCategoryMappingChange,
}: ImportCategoryMappingSectionProps) {
  const relevantCategories =
    importMode === "update_only"
      ? []
      : importMode === "create_only" || importMode === "inventory_sync"
        ? categoryMapping.filter((category) => category.createCount > 0)
        : categoryMapping;

  if (relevantCategories.length === 0) return null;

  const matched = relevantCategories.filter((category) => category.autoMatched);
  const unmatched = relevantCategories.filter((category) => !category.autoMatched);

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
                const defaultFamilyId = orgFamilies[0]?.id || "";
                const all: Record<string, CategoryMappingChoice> = {};
                for (const category of unmatched) {
                  all[category.csvName] = { action: "create", familyId: defaultFamilyId };
                }
                onCategoryMappingChange(all);
              }}
              className="text-[10px] font-medium text-primary hover:underline"
            >
              Create All New
            </button>
            <button
              type="button"
              onClick={() => {
                const all: Record<string, CategoryMappingChoice> = {};
                for (const category of unmatched) all[category.csvName] = { action: "skip" };
                onCategoryMappingChange(all);
              }}
              className="text-[10px] font-medium text-muted-foreground hover:underline"
            >
              Skip All
            </button>
          </div>
          {unmatched.map((category) => (
            <CategoryMappingRow
              key={category.csvName}
              category={category}
              unmatched={unmatched}
              entry={mappedCategories[category.csvName] ?? { action: "create" }}
              mappedCategories={mappedCategories}
              orgCategories={orgCategories}
              orgFamilies={orgFamilies}
              allSubcategories={allSubcategories}
              onCategoryMappingChange={onCategoryMappingChange}
            />
          ))}
        </div>
      )}
    </div>
  );
}

type CategoryMappingRowProps = {
  category: PreviewResponse["categoryMapping"][number];
  unmatched: PreviewResponse["categoryMapping"];
  entry: CategoryMappingChoice;
  mappedCategories: Record<string, CategoryMappingChoice>;
  orgCategories: CategoryRow[];
  orgFamilies: ProductFamily[];
  allSubcategories: SubcategoryRow[];
  onCategoryMappingChange: Dispatch<SetStateAction<Record<string, CategoryMappingChoice>>>;
};

function CategoryMappingRow({
  category,
  unmatched,
  entry,
  mappedCategories,
  orgCategories,
  orgFamilies,
  allSubcategories,
  onCategoryMappingChange,
}: CategoryMappingRowProps) {
  return (
    <div className="rounded-md border border-border bg-background px-3 py-2">
      <div className="mb-2">
        <span className="text-sm font-medium">{category.csvName}</span>
        <span className="ml-1.5 text-[10px] text-muted-foreground">
          ({category.productCount} items
          {(category.createCount > 0 || category.updateCount > 0) && (
            <>
              {" "}
              &middot;{" "}
              {category.createCount > 0 && <span className="text-primary">{category.createCount} new</span>}
              {category.createCount > 0 && category.updateCount > 0 && ", "}
              {category.updateCount > 0 && <span>{category.updateCount} updates</span>}
            </>
          )}
          )
        </span>
      </div>

      <div className="space-y-1.5 pl-1">
        <CreateCategoryOption
          categoryName={category.csvName}
          entry={entry}
          orgFamilies={orgFamilies}
          onCategoryMappingChange={onCategoryMappingChange}
        />
        <MapCategoryOption
          categoryName={category.csvName}
          entry={entry}
          orgCategories={orgCategories}
          allSubcategories={allSubcategories}
          onCategoryMappingChange={onCategoryMappingChange}
        />
        <SkipCategoryOption
          categoryName={category.csvName}
          entry={entry}
          onCategoryMappingChange={onCategoryMappingChange}
        />
      </div>

      {unmatched.length > 1 &&
        ((entry.action === "map" && entry.targetCategoryId) ||
          (entry.action === "create" && entry.familyId) ||
          entry.action === "skip") && (
          <button
            type="button"
            onClick={() => {
              const source = mappedCategories[category.csvName];
              if (!source) return;
              onCategoryMappingChange((prev) => {
                const updated = { ...prev };
                for (const other of unmatched) {
                  if (other.csvName === category.csvName) continue;
                  updated[other.csvName] = { ...source };
                }
                return updated;
              });
            }}
            className="whitespace-nowrap text-[10px] font-medium text-primary hover:underline"
            title="Apply this mapping to all unmapped categories"
          >
            Apply to All ↓
          </button>
        )}
    </div>
  );
}

function CreateCategoryOption({
  categoryName,
  entry,
  orgFamilies,
  onCategoryMappingChange,
}: {
  categoryName: string;
  entry: CategoryMappingChoice;
  orgFamilies: ProductFamily[];
  onCategoryMappingChange: Dispatch<SetStateAction<Record<string, CategoryMappingChoice>>>;
}) {
  return (
    <div className="flex items-center gap-2">
      <label className="flex items-center gap-1 whitespace-nowrap text-xs">
        <input
          type="radio"
          checked={entry.action === "create"}
          onChange={() =>
            onCategoryMappingChange((prev) => ({ ...prev, [categoryName]: { action: "create" } }))
          }
        />
        Create New
      </label>
      {entry.action === "create" && (
        <select
          value={entry.familyId ?? ""}
          onChange={(event) =>
            onCategoryMappingChange((prev) => ({
              ...prev,
              [categoryName]: {
                ...prev[categoryName],
                action: "create",
                familyId: event.target.value || undefined,
              },
            }))
          }
          className={cn(
            "rounded border bg-background px-2 py-0.5 text-xs",
            !entry.familyId ? "border-red-400 ring-1 ring-red-200" : "border-border",
          )}
        >
          <option value="">Select family...</option>
          {orgFamilies.map((family) => (
            <option key={family.id} value={family.id}>
              {family.name}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

function MapCategoryOption({
  categoryName,
  entry,
  orgCategories,
  allSubcategories,
  onCategoryMappingChange,
}: {
  categoryName: string;
  entry: CategoryMappingChoice;
  orgCategories: CategoryRow[];
  allSubcategories: SubcategoryRow[];
  onCategoryMappingChange: Dispatch<SetStateAction<Record<string, CategoryMappingChoice>>>;
}) {
  const subcategories = entry.targetCategoryId
    ? allSubcategories.filter((subcategory) => subcategory.categoryId === entry.targetCategoryId)
    : [];

  return (
    <div className="flex items-center gap-2">
      <label className="flex items-center gap-1 whitespace-nowrap text-xs">
        <input
          type="radio"
          checked={entry.action === "map"}
          onChange={() =>
            onCategoryMappingChange((prev) => ({
              ...prev,
              [categoryName]: { action: "map", targetCategoryId: "" },
            }))
          }
        />
        Map to
      </label>
      {entry.action === "map" && (
        <>
          <select
            value={entry.targetCategoryId ?? ""}
            onChange={(event) =>
              onCategoryMappingChange((prev) => ({
                ...prev,
                [categoryName]: {
                  action: "map",
                  targetCategoryId: event.target.value,
                  targetSubcategoryId: undefined,
                },
              }))
            }
            className="rounded border border-border bg-background px-2 py-0.5 text-xs"
          >
            <option value="">Select category...</option>
            {orgCategories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
          {subcategories.length > 0 && (
            <select
              value={entry.targetSubcategoryId ?? ""}
              onChange={(event) =>
                onCategoryMappingChange((prev) => ({
                  ...prev,
                  [categoryName]: {
                    ...prev[categoryName],
                    action: "map",
                    targetSubcategoryId: event.target.value || undefined,
                  },
                }))
              }
              className="rounded border border-border bg-background px-2 py-0.5 text-xs"
            >
              <option value="">No sub-category</option>
              {subcategories.map((subcategory) => (
                <option key={subcategory.id} value={subcategory.id}>
                  {subcategory.name}
                </option>
              ))}
            </select>
          )}
        </>
      )}
    </div>
  );
}

function SkipCategoryOption({
  categoryName,
  entry,
  onCategoryMappingChange,
}: {
  categoryName: string;
  entry: CategoryMappingChoice;
  onCategoryMappingChange: Dispatch<SetStateAction<Record<string, CategoryMappingChoice>>>;
}) {
  return (
    <div className="flex items-center gap-2">
      <label className="flex items-center gap-1 whitespace-nowrap text-xs">
        <input
          type="radio"
          checked={entry.action === "skip"}
          onChange={() =>
            onCategoryMappingChange((prev) => ({ ...prev, [categoryName]: { action: "skip" } }))
          }
        />
        <span className="text-muted-foreground">Skip</span>
      </label>
    </div>
  );
}
