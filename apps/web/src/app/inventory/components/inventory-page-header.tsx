"use client";

import { Download, Layers, Loader2, Package, Plus, Upload } from "lucide-react";
import { PageHeader } from "@/components/ui/layout";
import { cn } from "@/lib/utils";

type InventoryViewMode = "flat" | "nested";

interface InventoryPageHeaderProps {
  canEdit: boolean;
  isFetching: boolean;
  isLoading: boolean;
  totalItems: number;
  viewMode: InventoryViewMode;
  onExport: () => void;
  onImport: () => void;
  onQuickAdd: () => void;
  onToggleViewMode: () => void;
}

export function InventoryPageHeader({
  canEdit,
  isFetching,
  isLoading,
  totalItems,
  viewMode,
  onExport,
  onImport,
  onQuickAdd,
  onToggleViewMode,
}: InventoryPageHeaderProps) {
  return (
    <PageHeader
      icon={Package}
      eyebrow="Inventory Workspace"
      title="Item List"
      description={
        totalItems > 0
          ? `${totalItems.toLocaleString()} items at current location. Search, group, import, export, and manage variants from one surface.`
          : isLoading
            ? "Loading inventory..."
            : "No items found."
      }
      actions={
        <>
          {isFetching && !isLoading && (
            <span className="inline-flex items-center gap-1.5 rounded-xl border border-border/80 bg-background/70 px-3 py-2 text-[12px] font-semibold text-muted-foreground">
              <Loader2 size={13} className="animate-spin" />
              Syncing
            </span>
          )}
          <button
            onClick={onToggleViewMode}
            title={viewMode === "nested" ? "Switch to flat list" : "Switch to grouped view"}
            className={cn(
              "flex items-center gap-1.5 rounded-xl border px-3 py-2 text-[12px] font-semibold shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md",
              viewMode === "nested"
                ? "border-primary/30 bg-primary/[0.06] text-primary hover:bg-primary/[0.1]"
                : "border-border/80 bg-background/70 text-muted-foreground hover:bg-muted",
            )}
          >
            <Layers size={13} />
            {viewMode === "nested" ? "List" : "Group"}
          </button>
          {canEdit && (
            <>
              <button
                onClick={onImport}
                className="flex items-center gap-1.5 rounded-xl border border-border/80 bg-background/70 px-3 py-2 text-[12px] font-semibold text-foreground shadow-sm transition-all hover:-translate-y-0.5 hover:bg-muted hover:shadow-md"
              >
                <Download size={13} />
                Import
              </button>
              <button
                onClick={onExport}
                className="flex items-center gap-1.5 rounded-xl border border-border/80 bg-background/70 px-3 py-2 text-[12px] font-semibold text-foreground shadow-sm transition-all hover:-translate-y-0.5 hover:bg-muted hover:shadow-md"
              >
                <Upload size={13} />
                Export
              </button>
              <button
                onClick={onQuickAdd}
                className="flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-[12px] font-semibold text-primary-foreground shadow-sm transition-all hover:-translate-y-0.5 hover:bg-primary/90 hover:shadow-md active:scale-[0.98]"
              >
                <Plus size={13} strokeWidth={2.5} />
                Add Item
              </button>
            </>
          )}
        </>
      }
    />
  );
}
