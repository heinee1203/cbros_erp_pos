import { Loader2 } from "lucide-react";
import { useAuth } from "@/app/auth-context";
import {
  useInventoryValuationDetail,
  type GroupByOption,
} from "@/hooks/use-inventory-valuation";
import { cn } from "@/lib/utils";
import { fmtCurrency, fmtNumber, marginColor } from "../utils";

type InventoryValuationDrilldownProps = {
  groupBy: GroupByOption;
  groupName: string;
  locationId?: string;
  categoryId?: string;
  brandId?: string;
  excludeZeroCost?: boolean;
  excludeZeroSell?: boolean;
};

export function InventoryValuationDrilldown({
  groupBy,
  groupName,
  locationId,
  categoryId,
  brandId,
  excludeZeroCost,
  excludeZeroSell,
}: InventoryValuationDrilldownProps) {
  const { token, locationId: authLocationId } = useAuth();
  const { data, isLoading } = useInventoryValuationDetail(token, authLocationId, {
    groupBy,
    groupName,
    filterLocationId: locationId,
    categoryId,
    brandId,
    excludeZeroCost,
    excludeZeroSell,
    enabled: true,
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 px-6 py-4 text-[12px] text-muted-foreground">
        <Loader2 size={14} className="animate-spin" /> Loading products...
      </div>
    );
  }

  const products = data?.products ?? [];
  if (products.length === 0) {
    return <div className="px-6 py-4 text-[12px] text-muted-foreground">No products found in this group.</div>;
  }

  return (
    <div className="border-t border-border bg-muted/20">
      <div className="grid grid-cols-[1fr_80px_100px_100px_120px_120px_60px] gap-1 border-b border-border/50 px-6 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        <span>Product</span>
        <span className="text-right">Stock</span>
        <span className="text-right">Cost</span>
        <span className="text-right">Sell</span>
        <span className="text-right">Cost Value</span>
        <span className="text-right">Retail Value</span>
        <span className="text-right">Margin</span>
      </div>
      {products.map((product) => (
        <div
          key={product.productId}
          className="grid grid-cols-[1fr_80px_100px_100px_120px_120px_60px] gap-1 border-b border-border/30 px-6 py-2 text-[12px] transition-colors hover:bg-accent/30"
        >
          <div className="min-w-0 truncate">
            <span className="font-medium text-foreground">{product.productName}</span>
            {product.sku && <span className="ml-2 text-[10px] text-muted-foreground">{product.sku}</span>}
          </div>
          <span className="text-right tabular-nums text-foreground">{fmtNumber(product.stock)}</span>
          <span className="text-right tabular-nums text-muted-foreground">{fmtCurrency(product.costPrice)}</span>
          <span className="text-right tabular-nums text-muted-foreground">{fmtCurrency(product.sellPrice)}</span>
          <span className="text-right tabular-nums font-medium text-foreground">{fmtCurrency(product.costValue)}</span>
          <span className="text-right tabular-nums text-foreground">{fmtCurrency(product.retailValue)}</span>
          <span className={cn("text-right tabular-nums font-semibold", marginColor(product.marginPct))}>
            {product.marginPct}%
          </span>
        </div>
      ))}
      {data?.hasMore && (
        <div className="px-6 py-2 text-[11px] italic text-muted-foreground">Showing first 50 products. More available.</div>
      )}
    </div>
  );
}
