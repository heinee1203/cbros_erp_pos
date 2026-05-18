import { Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ReorderItem } from "../types";
import { fmtPeso, formatRelativeDate, getUrgencyColor } from "../utils";

type SupplierOption = {
  id: string;
  name: string;
};

type ReorderSuggestionsTableProps = {
  allItems: ReorderItem[];
  inline?: boolean;
  isLoading: boolean;
  items: ReorderItem[];
  orderQtys: Record<string, number>;
  panelSearch: string;
  selected: Set<string>;
  selectedCount: number;
  showCost: boolean;
  supplierAssignments: Record<string, string>;
  suppliers: SupplierOption[];
  onAssignSelectedSupplier: (supplierId: string) => void;
  onPanelSearchChange: (value: string) => void;
  onSetOrderQty: (id: string, qty: number) => void;
  onSupplierAssignmentChange: (productId: string, supplierId: string) => void;
  onToggleAll: () => void;
  onToggleOne: (productId: string) => void;
};

export function ReorderSuggestionsTable({
  allItems,
  inline,
  isLoading,
  items,
  orderQtys,
  panelSearch,
  selected,
  selectedCount,
  showCost,
  supplierAssignments,
  suppliers,
  onAssignSelectedSupplier,
  onPanelSearchChange,
  onSetOrderQty,
  onSupplierAssignmentChange,
  onToggleAll,
  onToggleOne,
}: ReorderSuggestionsTableProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Check size={28} className="mb-2 text-green-500" />
        <p className="text-sm font-medium">All stocked up!</p>
        <p className="text-xs text-muted-foreground">
          No products currently need reordering at the selected threshold.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center gap-2 border-b border-border bg-muted/30 px-3 py-1.5">
        <span className="text-[10px] text-muted-foreground">
          Bulk set supplier:
        </span>
        <select
          onChange={(event) => {
            if (!event.target.value) return;
            onAssignSelectedSupplier(event.target.value);
            event.target.value = "";
          }}
          className="h-6 rounded border border-border bg-background px-1 text-[10px] outline-none"
        >
          <option value="">Choose for {selectedCount} selected...</option>
          {suppliers.map((supplier) => (
            <option key={supplier.id} value={supplier.id}>
              {supplier.name}
            </option>
          ))}
        </select>
      </div>

      {!inline && (
        <div className="px-2 pb-2">
          <input
            type="text"
            value={panelSearch}
            onChange={(event) => onPanelSearchChange(event.target.value)}
            placeholder="Search items..."
            className="h-7 w-full rounded border border-border bg-background px-2 text-[11px] outline-none placeholder:text-muted-foreground/60 focus:border-primary"
          />
          {panelSearch && (
            <div className="mt-1 text-[10px] text-muted-foreground">
              Showing {items.length} of {allItems.length} items
            </div>
          )}
        </div>
      )}

      <table className="w-full text-xs">
        <thead className="sticky top-0 z-10 bg-muted/80 backdrop-blur">
          <tr>
            <th className="w-8 px-2 py-1.5">
              <input
                type="checkbox"
                checked={
                  items.length > 0 &&
                  items.every((item) => selected.has(item.productId))
                }
                onChange={onToggleAll}
                className="h-3 w-3"
              />
            </th>
            <th className="px-2 py-1.5 text-left text-[10px] font-semibold uppercase text-muted-foreground">
              Product
            </th>
            <th className="px-2 py-1.5 text-right text-[10px] font-semibold uppercase text-muted-foreground">
              Stock
            </th>
            <th
              className="px-2 py-1.5 text-right text-[10px] font-semibold uppercase text-muted-foreground"
              title="Average units sold per month over the selected window (30/90/180/365d). Computed from stock_metrics.avg_daily_sales_Xd x 30."
            >
              DEMAND
            </th>
            <th className="px-2 py-1.5 text-center text-[10px] font-semibold uppercase text-muted-foreground">
              Urgency
            </th>
            <th className="px-2 py-1.5 text-left text-[10px] font-semibold uppercase text-muted-foreground">
              Last Sold
            </th>
            <th className="px-2 py-1.5 text-right text-[10px] font-semibold uppercase text-muted-foreground">
              Suggest
            </th>
            <th className="px-2 py-1.5 text-right text-[10px] font-semibold uppercase text-muted-foreground">
              Order Qty
            </th>
            {showCost && (
              <th className="px-2 py-1.5 text-right text-[10px] font-semibold uppercase text-muted-foreground">
                Unit Cost
              </th>
            )}
            {showCost && (
              <th className="px-2 py-1.5 text-right text-[10px] font-semibold uppercase text-muted-foreground">
                Line Total
              </th>
            )}
            <th className="px-2 py-1.5 text-left text-[10px] font-semibold uppercase text-muted-foreground">
              Supplier
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <ReorderSuggestionRow
              key={item.productId}
              item={item}
              orderQty={orderQtys[item.productId] ?? item.suggestedQty}
              selected={selected.has(item.productId)}
              showCost={showCost}
              supplierAssignment={
                supplierAssignments[item.productId] ||
                item.primarySupplierId ||
                ""
              }
              suppliers={suppliers}
              onOrderQtyChange={(qty) => onSetOrderQty(item.productId, qty)}
              onSupplierAssignmentChange={(supplierId) =>
                onSupplierAssignmentChange(item.productId, supplierId)
              }
              onToggle={() => onToggleOne(item.productId)}
            />
          ))}
        </tbody>
      </table>
    </>
  );
}

function ReorderSuggestionRow({
  item,
  orderQty,
  selected,
  showCost,
  supplierAssignment,
  suppliers,
  onOrderQtyChange,
  onSupplierAssignmentChange,
  onToggle,
}: {
  item: ReorderItem;
  orderQty: number;
  selected: boolean;
  showCost: boolean;
  supplierAssignment: string;
  suppliers: SupplierOption[];
  onOrderQtyChange: (qty: number) => void;
  onSupplierAssignmentChange: (supplierId: string) => void;
  onToggle: () => void;
}) {
  const cost = parseFloat(item.costPrice || "0");
  const lineTotal = cost > 0 ? orderQty * cost : null;

  return (
    <tr
      className={cn(
        "border-b border-border/30 hover:bg-muted/30",
        selected && "bg-primary/[0.03]",
      )}
    >
      <td className="px-2 py-1.5 text-center">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          className="h-3 w-3"
        />
      </td>
      <td className="max-w-[200px] px-2 py-1.5">
        <div className="flex items-center gap-1">
          <span className="truncate font-medium" title={item.productName}>
            {item.productName}
          </span>
          {item.specialOrder && (
            <span className="shrink-0 rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">
              SO
            </span>
          )}
          {item.discontinued && (
            <span className="shrink-0 rounded bg-gray-200 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">
              DC
            </span>
          )}
        </div>
        <div className="font-mono text-[9px] text-muted-foreground">
          {item.productSku}
        </div>
      </td>
      <td className="px-2 py-1.5 text-right tabular-nums">
        {item.totalStock}
      </td>
      <td className="px-2 py-1.5 text-right tabular-nums">
        {item.avgMonth3m.toFixed(1)}
      </td>
      <td className="px-2 py-1.5 text-center">
        <span
          className={cn(
            "inline-block rounded px-1.5 py-0.5 text-[10px] font-medium tabular-nums",
            getUrgencyColor(item.minMonthsLeft),
          )}
        >
          {item.minMonthsLeft !== null
            ? `${item.minMonthsLeft.toFixed(1)}mo`
            : "\u221e"}
        </span>
      </td>
      <td
        className={cn(
          "px-2 py-1.5 text-[10px]",
          item.lastSaleDate &&
            Date.now() - new Date(item.lastSaleDate).getTime() >
              180 * 86400000
            ? "text-muted-foreground/50"
            : "text-muted-foreground",
        )}
      >
        {item.lastSaleDate ? formatRelativeDate(item.lastSaleDate) : "Never"}
      </td>
      <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
        {item.suggestedQty}
      </td>
      <td className="px-2 py-1.5 text-right">
        <input
          type="number"
          min={1}
          value={orderQty}
          onChange={(event) =>
            onOrderQtyChange(parseInt(event.target.value) || 1)
          }
          className="w-14 rounded border border-border bg-background px-1 py-0.5 text-right text-xs tabular-nums outline-none focus:border-primary"
        />
      </td>
      {showCost && (
        <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
          {cost > 0 ? fmtPeso(cost) : "\u2014"}
        </td>
      )}
      {showCost && (
        <td className="px-2 py-1.5 text-right tabular-nums font-medium">
          {lineTotal ? fmtPeso(lineTotal) : "\u2014"}
        </td>
      )}
      <td className="px-2 py-1.5">
        <select
          value={supplierAssignment}
          onChange={(event) =>
            onSupplierAssignmentChange(event.target.value)
          }
          className={cn(
            "w-28 rounded border bg-background px-1 py-0.5 text-[10px] outline-none focus:border-primary",
            !supplierAssignment && "border-amber-300 text-amber-600",
          )}
        >
          <option value="">Select...</option>
          {suppliers.map((supplier) => (
            <option key={supplier.id} value={supplier.id}>
              {supplier.name}
            </option>
          ))}
        </select>
      </td>
    </tr>
  );
}
