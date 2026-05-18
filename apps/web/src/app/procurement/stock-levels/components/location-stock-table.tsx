import type { SortDir, SortField, StockLevelRow } from "@/hooks/use-stock-levels";
import { SortHeader } from "./sort-header";
import { StockRow } from "./stock-row";

type LocationStockTableProps = {
  rows: StockLevelRow[];
  isFetchingNextPage: boolean;
  sortBy: SortField;
  sortDir: SortDir;
  onSort: (field: SortField) => void;
  onReorder: (productId: string, productName: string) => void;
  reorderLoading: string | null;
};

export function LocationStockTable({
  rows,
  isFetchingNextPage,
  sortBy,
  sortDir,
  onSort,
  onReorder,
  reorderLoading,
}: LocationStockTableProps) {
  return (
    <div className={`transition-opacity ${isFetchingNextPage ? "opacity-60" : ""}`}>
      <table className="w-full min-w-[1180px] text-left text-sm">
        <thead className="sticky top-0 z-10 border-b border-border bg-muted/80 text-xs font-medium text-muted-foreground backdrop-blur">
          <tr>
            <SortHeader label="Item" field="name" currentSort={sortBy} currentDir={sortDir} onSort={onSort} />
            <SortHeader label="SKU" field="sku" currentSort={sortBy} currentDir={sortDir} onSort={onSort} />
            <SortHeader label="Category" field="category" currentSort={sortBy} currentDir={sortDir} onSort={onSort} />
            <SortHeader label="Location" field="location" currentSort={sortBy} currentDir={sortDir} onSort={onSort} />
            <SortHeader label="On Hand" field="stockLevel" currentSort={sortBy} currentDir={sortDir} onSort={onSort} align="right" />
            <SortHeader label="Reserved" field="reservedLevel" currentSort={sortBy} currentDir={sortDir} onSort={onSort} align="right" />
            <SortHeader label="Available" field="available" currentSort={sortBy} currentDir={sortDir} onSort={onSort} align="right" />
            <SortHeader label="Reorder Pt" field="reorderPoint" currentSort={sortBy} currentDir={sortDir} onSort={onSort} align="right" />
            <th className="px-4 py-1.5 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">Sell Rate</th>
            <th className="px-4 py-1.5 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">Days Left</th>
            <SortHeader label="Last Sold" field="lastSoldAt" currentSort={sortBy} currentDir={sortDir} onSort={onSort} align="right" />
            <SortHeader label="Status" field="status" currentSort={sortBy} currentDir={sortDir} onSort={onSort} />
            <th className="px-4 py-1.5" />
          </tr>
        </thead>
        <tbody className="divide-y divide-border/70">
          {rows.map((row) => (
            <StockRow
              key={row.id}
              row={row}
              onReorder={onReorder}
              reorderLoading={reorderLoading}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
