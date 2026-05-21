"use client";

import { ChevronRight, Layers } from "lucide-react";
import { useAuth } from "@/app/auth-context";
import type { ProductRow } from "@/hooks/use-products";
import { cn } from "@/lib/utils";
import { formatPrice, getMarginPercent } from "../lib/inventory-utils";
import { ParentAwareCheckbox } from "./inventory-selection-controls";
import { RowActions } from "./inventory-row-actions";
import { StockPopover } from "./inventory-stock-display";
import { VariantSubRows } from "./inventory-variant-rows";

type FlatProductRowProps = {
  product: ProductRow;
  showFinancials: boolean;
  isSelected: boolean;
  selectedIds: Set<string>;
  onToggleSelect: () => void;
  onToggleParentSelect: (parentId: string, variantIds: string[]) => void;
  onToggleVariantSelect: (variantId: string, parentId: string, allVariantIds: string[]) => void;
  getParentCheckState: (parentId: string, variantIds: string[]) => boolean | "indeterminate";
  onSelectProduct: () => void;
  isParentExpanded: boolean;
  onToggleParent: () => void;
  colCount: number;
  onDeleteSingle: (id: string, name: string, isParent?: boolean) => void;
  canEdit?: boolean;
};

export function FlatProductRow({
  product: p,
  showFinancials,
  isSelected,
  selectedIds,
  onToggleSelect,
  onToggleParentSelect,
  onToggleVariantSelect,
  getParentCheckState,
  onSelectProduct,
  isParentExpanded,
  onToggleParent,
  colCount,
  onDeleteSingle,
  canEdit = true,
}: FlatProductRowProps) {
  const sell = parseFloat(p.unitPrice) || 0;
  const cost = parseFloat(p.costPrice) || 0;
  const margin = getMarginPercent(sell, cost);
  const { token, locationId } = useAuth();

  return (
    <>
      <tr
        onClick={onSelectProduct}
        className={cn(
          "cursor-pointer transition-colors duration-75",
          p.isParent && "bg-muted/30 hover:bg-muted/50",
          !p.isParent && isSelected && "bg-primary/[0.05]",
          !p.isParent && !isSelected && p.stockLevel <= 0 && p.discontinued && "bg-gray-100 hover:bg-gray-200/70",
          !p.isParent && !isSelected && p.stockLevel <= 0 && !p.discontinued && p.specialOrder && "bg-blue-50 hover:bg-blue-100/70",
          !p.isParent && !isSelected && p.stockLevel <= 0 && !p.discontinued && !p.specialOrder && "bg-red-50 hover:bg-red-100/70",
          !p.isParent && !isSelected && p.stockLevel > 0 && "hover:bg-accent/70",
        )}
      >
        <td className="w-8 px-1 py-[5px] text-center">
          {p.isParent && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleParent();
              }}
              className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <ChevronRight
                size={14}
                className={cn("transition-transform duration-150", isParentExpanded && "rotate-90")}
              />
            </button>
          )}
        </td>
        <td className="w-9 px-2 py-[5px] text-center" onClick={(e) => e.stopPropagation()}>
          <ParentAwareCheckbox
            isParent={p.isParent ?? false}
            isSelected={isSelected}
            parentId={p.id}
            getParentCheckState={getParentCheckState}
            onToggleSelect={onToggleSelect}
            onToggleParentSelect={onToggleParentSelect}
          />
        </td>
        <td className="px-3 py-[5px]">
          <div className="flex items-center gap-1.5">
            <span className={cn("block truncate text-[12px] leading-snug text-foreground", p.isParent ? "font-semibold" : "font-medium")}>
              {p.name}
            </span>
            {p.specialOrder && (
              <span className="shrink-0 rounded bg-blue-100 px-1.5 py-px text-[10px] font-medium text-blue-700">SO</span>
            )}
            {p.discontinued && (
              <span className="shrink-0 rounded bg-gray-200 px-1.5 py-px text-[10px] font-medium text-gray-600">DC</span>
            )}
            {p.isSerialized && !(p as any).isTire && (
              <span className="shrink-0 rounded bg-violet-100 px-1.5 py-px text-[10px] font-medium text-violet-700">SN</span>
            )}
            {(p as any).isTire && (
              <span className="shrink-0 rounded bg-amber-100 px-1.5 py-px text-[10px] font-medium text-amber-700">DOT</span>
            )}
            {p.isParent && (
              <span className="inline-flex items-center gap-1 shrink-0 rounded-full bg-violet-50 px-1.5 py-px text-[10px] font-medium text-violet-600">
                <Layers size={9} />
                variants
              </span>
            )}
          </div>
        </td>
        <td className="px-2 py-[5px] text-right">
          <StockPopover
            productId={p.id}
            stockLevel={p.stockLevel}
            reorderPoint={p.reorderPoint}
            unitsPerCase={p.unitsPerCase}
            packagingUnit={p.packagingUnit}
          />
        </td>
        <td className="px-3 py-[5px] text-right font-medium tabular-nums text-foreground">
          {p.isParent ? (
            <span className="inline-block rounded px-1.5 py-px text-[10px] font-medium leading-normal bg-violet-50/80 text-violet-600">
              Variable
            </span>
          ) : p.isVariablePrice ? (
            <span className="inline-block rounded px-1.5 py-px text-[10px] font-medium leading-normal bg-amber-50/80 text-amber-600">
              Variable
            </span>
          ) : (
            formatPrice(sell)
          )}
        </td>
        <td className="px-3 py-[5px]">
          {p.brandName ? (
            <span className="text-[12px] text-muted-foreground truncate block max-w-[100px]" title={p.brandName}>{p.brandName}</span>
          ) : (
            <span className="text-[11px] text-muted-foreground/40">{"\u2014"}</span>
          )}
        </td>
        <td className="px-3 py-[5px]">
          {p.subCategoryName ? (
            <span className="text-[12px] text-muted-foreground truncate block max-w-[120px]" title={p.subCategoryName}>{p.subCategoryName}</span>
          ) : (
            <span className="text-[11px] text-muted-foreground/40">{"\u2014"}</span>
          )}
        </td>
        <td className="px-3 py-[5px]">
          {p.subcategoryName ? (
            <span className="text-[12px] text-muted-foreground truncate block max-w-[110px]" title={p.subcategoryName}>{p.subcategoryName}</span>
          ) : (
            <span className="text-[11px] text-muted-foreground/40">{"\u2014"}</span>
          )}
        </td>
        {showFinancials && (
          <>
            <td className="px-3 py-[5px] text-right tabular-nums text-muted-foreground">
              {p.isParent ? <span className="text-muted-foreground/40">{"\u2014"}</span> : cost > 0 ? formatPrice(cost) : "\u2014"}
            </td>
            <td
              className={cn(
                "px-3 py-[5px] text-right font-medium tabular-nums",
                !p.isParent && margin.value > 0 && margin.value < 20 ? "text-destructive" : "text-muted-foreground",
              )}
            >
              {p.isParent ? <span className="text-muted-foreground/40">{"\u2014"}</span> : margin.display}
            </td>
          </>
        )}
        <td className="px-1 py-[5px] text-center" onClick={(e) => e.stopPropagation()}>
          {canEdit ? (
            <RowActions
              productId={p.id}
              productName={p.name}
              isParent={p.isParent ?? false}
              onView={onSelectProduct}
              onDelete={onDeleteSingle}
            />
          ) : null}
        </td>
      </tr>
      {p.isParent && isParentExpanded && (
        <VariantSubRows
          parentId={p.id}
          token={token}
          locationId={locationId}
          showFinancials={showFinancials}
          colCount={colCount}
          selectedIds={selectedIds}
          onToggleVariantSelect={onToggleVariantSelect}
          onSelectProduct={onSelectProduct}
        />
      )}
    </>
  );
}
