import type { ProductStockRow } from "@/hooks/use-stock-levels";
import { ProductStockTableRow } from "./product-stock-row";

type ProductStockTableProps = {
  rows: ProductStockRow[];
  isFetchingNextPage: boolean;
  onReorder: (productId: string, productName: string) => void;
  reorderLoading: string | null;
};

export function ProductStockTable({
  rows,
  isFetchingNextPage,
  onReorder,
  reorderLoading,
}: ProductStockTableProps) {
  return (
    <div className={`transition-opacity ${isFetchingNextPage ? "opacity-60" : ""}`}>
      <table className="w-full min-w-[980px] text-left text-sm">
        <thead className="sticky top-0 z-10 border-b border-border bg-muted/80 text-xs font-medium text-muted-foreground backdrop-blur">
          <tr>
            <th className="px-4 py-1.5 text-left text-xs font-medium uppercase tracking-wider">Item</th>
            <th className="px-4 py-1.5 text-left text-xs font-medium uppercase tracking-wider">SKU</th>
            <th className="px-4 py-1.5 text-left text-xs font-medium uppercase tracking-wider">Category</th>
            <th className="px-4 py-1.5 text-right text-xs font-medium uppercase tracking-wider">Stock</th>
            <th className="px-4 py-1.5 text-right text-xs font-medium uppercase tracking-wider">Reorder Pt</th>
            <th className="px-4 py-1.5 text-right text-xs font-medium uppercase tracking-wider">Sell Rate</th>
            <th className="px-4 py-1.5 text-right text-xs font-medium uppercase tracking-wider">Days Left</th>
            <th className="px-4 py-1.5 text-right text-xs font-medium uppercase tracking-wider">Last Sold</th>
            <th className="px-4 py-1.5 text-left text-xs font-medium uppercase tracking-wider">Status</th>
            <th className="px-4 py-1.5 text-right text-xs font-medium uppercase tracking-wider" />
          </tr>
        </thead>
        <tbody className="divide-y divide-border/70">
          {rows.map((row, index) => (
            <ProductStockTableRow
              key={`${row.productId}-${row.productSku}-${index}`}
              row={row}
              rowKeySuffix={index}
              onReorder={onReorder}
              reorderLoading={reorderLoading}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
