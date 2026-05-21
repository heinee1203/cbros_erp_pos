import type { ReactNode } from "react";
import { FolderTree, Grid3x3, Layers, Package, Plus } from "lucide-react";

type CategoriesPageHeaderProps = {
  totalFamilies: number;
  totalCategories: number;
  totalSubcategories: number;
  totalItems: number;
  onCreate: () => void;
  onRemoveEmpty: () => void;
};

export function CategoriesPageHeader({
  totalFamilies,
  totalCategories,
  totalSubcategories,
  totalItems,
  onCreate,
  onRemoveEmpty,
}: CategoriesPageHeaderProps) {
  return (
    <div className="mb-5">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/[0.06]">
              <Grid3x3 size={16} className="text-primary" />
            </div>
            <h1 className="text-[18px] font-semibold tracking-tight text-foreground">
              Categories
            </h1>
          </div>
          <p className="mt-1.5 text-[13px] leading-5 text-muted-foreground">
            Manage product families, categories, and sub-categories
          </p>
        </div>
        <button
          onClick={onCreate}
          className="flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-[13px] font-medium text-primary-foreground shadow-sm transition-all hover:bg-primary/90 active:scale-[0.98]"
        >
          <Plus size={14} strokeWidth={2.5} />
          Add Category
        </button>
      </div>

      <div className="mt-4 flex gap-5">
        <SummaryMetric icon={<Layers size={11} className="text-muted-foreground" />} label="Families" value={totalFamilies.toLocaleString()} />
        <Divider />
        <SummaryMetric icon={<Grid3x3 size={11} className="text-muted-foreground" />} label="Categories" value={totalCategories.toLocaleString()} />
        <Divider />
        <SummaryMetric icon={<FolderTree size={11} className="text-muted-foreground" />} label="Sub-categories" value={totalSubcategories.toLocaleString()} />
        <Divider />
        <SummaryMetric icon={<Package size={11} className="text-muted-foreground" />} label="Items" value={totalItems.toLocaleString()} />
        <div className="ml-auto">
          <button
            onClick={onRemoveEmpty}
            className="rounded-md border border-destructive/30 px-3 py-1.5 text-[11px] font-medium text-destructive transition-colors hover:bg-destructive/5"
          >
            Remove Empty
          </button>
        </div>
      </div>
    </div>
  );
}

function SummaryMetric({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2 text-[13px]">
      <div className="flex h-5 w-5 items-center justify-center rounded bg-muted">
        {icon}
      </div>
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold tabular-nums text-foreground">{value}</span>
    </div>
  );
}

function Divider() {
  return <div className="h-4 w-px bg-border" />;
}
