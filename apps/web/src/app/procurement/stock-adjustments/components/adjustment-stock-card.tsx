import { Package } from "lucide-react";

import type { ProductSearchResult } from "@/hooks/use-product-search";

type AdjustmentStockCardProps = {
  product: ProductSearchResult;
};

export function AdjustmentStockCard({ product }: AdjustmentStockCardProps) {
  return (
    <div className="rounded-lg border border-border bg-muted/20 p-3">
      <div className="mb-1.5 flex items-center gap-1.5">
        <Package size={12} className="text-muted-foreground" />
        <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Current Stock
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-lg font-semibold tabular-nums text-foreground">
            {product.stockLevel}
          </p>
          <p className="text-xs text-muted-foreground">On Hand</p>
        </div>
        <div>
          <p className="text-lg font-semibold tabular-nums text-foreground">
            {product.reorderPoint}
          </p>
          <p className="text-xs text-muted-foreground">Reorder Point</p>
        </div>
      </div>
    </div>
  );
}
