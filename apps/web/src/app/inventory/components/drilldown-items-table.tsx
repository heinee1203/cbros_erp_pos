"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { useProducts } from "@/hooks/use-products";
import { cn } from "@/lib/utils";
import { formatPrice, getMarginPercent } from "../lib/inventory-utils";

type LoadingRowProps = {
  colCount: number;
};

export function DrilldownLoadingRow({ colCount }: LoadingRowProps) {
  return (
    <tr>
      <td className="w-9" />
      <td colSpan={colCount - 1} className="py-6">
        <div className="flex items-center justify-center">
          <Loader2 size={16} className="animate-spin text-muted-foreground" />
        </div>
      </td>
    </tr>
  );
}

type DrilldownItemsTableProps = {
  token: string;
  locationId: string;
  familyId?: string;
  categoryId?: string;
  brandId?: string;
  vehicleMake?: string;
  stockStatus?: string;
  showFinancials: boolean;
  onSelectProduct: (id: string) => void;
  colCount: number;
  allLocations?: boolean;
};

export function DrilldownItemsTable({
  token,
  locationId,
  familyId,
  categoryId,
  brandId,
  vehicleMake,
  stockStatus,
  showFinancials,
  onSelectProduct,
  colCount,
  allLocations,
}: DrilldownItemsTableProps) {
  const [page, setPage] = useState(1);
  const limit = 50;

  const { data, isLoading } = useProducts(token, locationId, {
    familyId,
    categoryId,
    brandId,
    vehicleMake,
    stockStatus,
    page,
    limit,
    allLocations,
  });

  const products = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;
  const startIdx = (page - 1) * limit + 1;
  const endIdx = Math.min(page * limit, total);

  const gridCols = showFinancials
    ? "grid-cols-[1fr_70px_80px_75px_65px]"
    : "grid-cols-[1fr_70px_80px]";

  if (isLoading) return <DrilldownLoadingRow colCount={colCount} />;

  return (
    <>
      <tr className="border-b border-border/40">
        <td className="w-9" />
        <td colSpan={colCount - 1} className="py-[3px]">
          <div className={cn("grid items-center gap-1", gridCols)} style={{ paddingLeft: "96px" }}>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Name</span>
            <span className="text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Stock</span>
            <span className="text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Sell</span>
            {showFinancials && (
              <>
                <span className="text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Cost</span>
                <span className="text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Margin</span>
              </>
            )}
          </div>
        </td>
      </tr>

      {products.map((p) => {
        const sell = parseFloat(p.unitPrice) || 0;
        const cost = parseFloat(p.costPrice) || 0;
        const margin = getMarginPercent(sell, cost);

        return (
          <tr
            key={p.id}
            onClick={() => onSelectProduct(p.id)}
            className="cursor-pointer hover:bg-accent/70 transition-colors"
          >
            <td className="w-9" />
            <td colSpan={colCount - 1} className="py-[4px]">
              <div className={cn("grid items-center gap-1", gridCols)} style={{ paddingLeft: "96px" }}>
                <span className="truncate text-[11px] font-medium text-foreground">{p.name}</span>
                <span className="flex justify-end">
                  <span
                    className={cn(
                      "inline-flex min-w-[36px] items-center justify-end rounded-md px-2 py-0.5 text-[11px] font-semibold tabular-nums",
                      p.stockLevel === 0
                        ? "bg-red-50 text-red-700"
                        : p.stockLevel <= p.reorderPoint
                          ? "bg-amber-50 text-amber-700"
                          : "text-foreground",
                    )}
                  >
                    {p.stockLevel.toLocaleString()}
                  </span>
                </span>
                <span className="text-right text-[11px] font-medium tabular-nums">{formatPrice(sell)}</span>
                {showFinancials && (
                  <>
                    <span className="text-right text-[10px] text-muted-foreground tabular-nums">
                      {cost > 0 ? formatPrice(cost) : "\u2014"}
                    </span>
                    <span className="text-right text-[10px] font-medium tabular-nums">{margin.display}</span>
                  </>
                )}
              </div>
            </td>
          </tr>
        );
      })}

      {products.length === 0 && (
        <tr>
          <td className="w-9" />
          <td colSpan={colCount - 1} className="py-4 text-center text-[11px] text-muted-foreground">
            No products found
          </td>
        </tr>
      )}

      {totalPages > 1 && (
        <tr className="border-t border-border/30">
          <td className="w-9" />
          <td colSpan={colCount - 1} className="py-[5px]">
            <div className="flex items-center justify-end gap-3 pr-2" style={{ paddingLeft: "96px" }}>
              <span className="text-[10px] text-muted-foreground tabular-nums">
                Showing {startIdx}-{endIdx} of {total}
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setPage((p) => Math.max(1, p - 1));
                }}
                disabled={page <= 1}
                className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-medium text-muted-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronLeft size={11} /> Prev
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setPage((p) => Math.min(totalPages, p + 1));
                }}
                disabled={page >= totalPages}
                className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-medium text-muted-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Next <ChevronRight size={11} />
              </button>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
