"use client";

import { Loader2 } from "lucide-react";
import { useVariants } from "@/hooks/use-variants";
import { cn } from "@/lib/utils";
import { formatPrice, getMarginPercent } from "../lib/inventory-utils";
import { StockPopover } from "./inventory-stock-display";

type VariantSubRowsProps = {
  parentId: string;
  token: string;
  locationId: string;
  showFinancials: boolean;
  colCount: number;
  selectedIds: Set<string>;
  onToggleVariantSelect: (variantId: string, parentId: string, allVariantIds: string[]) => void;
  onSelectProduct: () => void;
};

export function VariantSubRows({
  parentId,
  token,
  locationId,
  showFinancials,
  colCount,
  selectedIds,
  onToggleVariantSelect,
  onSelectProduct,
}: VariantSubRowsProps) {
  const { data, isLoading } = useVariants(token, locationId, parentId);
  const variants = (data?.data ?? []).slice().sort((a, b) => a.name.localeCompare(b.name));

  if (isLoading) {
    return (
      <tr>
        <td colSpan={colCount} className="py-3 text-center">
          <div className="flex items-center justify-center gap-2 text-[11px] text-muted-foreground">
            <Loader2 size={12} className="animate-spin" /> Loading variants...
          </div>
        </td>
      </tr>
    );
  }

  if (variants.length === 0) {
    return (
      <tr>
        <td colSpan={colCount} className="py-3 text-center text-[11px] text-muted-foreground">
          No variants created yet
        </td>
      </tr>
    );
  }

  const allVariantIds = variants.map((v) => v.id);

  return (
    <>
      {variants.map((v) => {
        const sell = parseFloat(v.unitPrice) || 0;
        const cost = parseFloat(v.costPrice) || 0;
        const margin = getMarginPercent(sell, cost);
        const isVariantSelected = selectedIds.has(v.id);

        return (
          <tr
            key={v.id}
            onClick={onSelectProduct}
            className={cn(
              "cursor-pointer border-l-2 border-l-primary/20 transition-colors duration-75",
              isVariantSelected
                ? "bg-primary/[0.05]"
                : v.stockLevel <= 0
                  ? v.discontinued
                    ? "bg-gray-100 hover:bg-gray-200/70"
                    : v.specialOrder
                      ? "bg-blue-50 hover:bg-blue-100/70"
                      : "bg-red-50 hover:bg-red-100/70"
                  : "bg-background hover:bg-accent/50",
            )}
          >
            <td className="w-8" />
            <td className="w-9 px-2 py-[4px] text-center" onClick={(e) => e.stopPropagation()}>
              <input
                type="checkbox"
                checked={isVariantSelected}
                onChange={() => onToggleVariantSelect(v.id, parentId, allVariantIds)}
                className="h-3.5 w-3.5 rounded border-border accent-primary cursor-pointer"
              />
            </td>
            <td className="py-[4px] pl-8 pr-3">
              <div className="flex flex-col gap-0.5">
                <span className="block truncate text-[12px] font-medium leading-snug text-foreground">
                  {v.name || v.sku}
                </span>
                {v.options.length > 0 && (
                  <div className="flex items-center gap-1 flex-wrap">
                    {v.options.map((o, idx) => (
                      <span
                        key={idx}
                        className="inline-flex items-center rounded-md bg-muted px-1.5 py-px text-[10px] font-medium text-muted-foreground"
                      >
                        {o.value}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </td>
            <td className="px-2 py-[4px] text-right">
              <StockPopover productId={v.id} stockLevel={v.stockLevel} reorderPoint={0} />
            </td>
            <td className="px-3 py-[4px] text-right font-medium tabular-nums text-foreground">
              {v.isVariablePrice ? (
                <span className="inline-block rounded px-1.5 py-px text-[10px] font-medium leading-normal bg-amber-50/80 text-amber-600">
                  Variable
                </span>
              ) : (
                formatPrice(sell)
              )}
            </td>
            <td className="px-3 py-[4px]" />
            <td className="px-3 py-[4px]" />
            <td className="px-3 py-[4px]" />
            {showFinancials && (
              <>
                <td className="px-3 py-[4px] text-right tabular-nums text-muted-foreground">
                  {cost > 0 ? formatPrice(cost) : "\u2014"}
                </td>
                <td
                  className={cn(
                    "px-3 py-[4px] text-right font-medium tabular-nums",
                    margin.value > 0 && margin.value < 20 ? "text-destructive" : "text-muted-foreground",
                  )}
                >
                  {margin.display}
                </td>
              </>
            )}
            <td className="px-1 py-[4px]" />
          </tr>
        );
      })}
    </>
  );
}
