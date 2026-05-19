import { ChevronDown, ChevronUp, Package } from "lucide-react";
import type { SalesByItemRow } from "@/hooks/use-sales-reports";
import { cn } from "@/lib/utils";
import type { SalesByItemController, SortField } from "../types";
import { fmt } from "../utils";

type SalesByItemTableProps = {
  controller: SalesByItemController;
};

export function SalesByItemTable({ controller }: SalesByItemTableProps) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-background shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
      <div className="flex items-center border-b border-border bg-muted/40 px-4 py-2">
        <div className="w-8 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">#</div>
        <div className="flex-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Item</div>
        <div className="w-24 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Category</div>
        <SortHeader controller={controller} label="Units" field="unitsSold" width="w-16" />
        <SortHeader controller={controller} label="Revenue" field="totalRevenue" width="w-28" />
        <SortHeader controller={controller} label="Cost" field="totalCost" width="w-28" />
        <SortHeader controller={controller} label="Profit" field="grossProfit" width="w-28" />
        <SortHeader controller={controller} label="Margin" field="marginPct" width="w-16" />
      </div>

      {controller.isLoading ? (
        <div className="space-y-0">
          {Array.from({ length: 10 }).map((_, index) => (
            <div key={index} className="h-12 animate-pulse border-b border-border bg-muted/20" />
          ))}
        </div>
      ) : controller.paginated.length === 0 ? (
        <SalesByItemEmptyState hasFilters={!!(controller.search || controller.categoryFilter)} />
      ) : (
        <div className="divide-y divide-border">
          {controller.paginated.map((item, index) => (
            <SalesByItemRowView
              key={item.productId + index}
              item={item}
              rank={(controller.page - 1) * controller.perPage + index + 1}
            />
          ))}
        </div>
      )}

      <SalesByItemPagination controller={controller} />
    </div>
  );
}

function SortHeader({
  controller,
  label,
  field,
  width,
}: {
  controller: SalesByItemController;
  label: string;
  field: SortField;
  width: string;
}) {
  const active = controller.sortBy === field;
  return (
    <button
      onClick={() => controller.handleSort(field)}
      className={cn(
        "flex items-center justify-end gap-0.5 text-right text-[11px] font-semibold uppercase tracking-[0.06em] transition-colors",
        width,
        active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
      {active && (controller.sortDir === "desc" ? <ChevronDown size={10} /> : <ChevronUp size={10} />)}
    </button>
  );
}

function SalesByItemRowView({ item, rank }: { item: SalesByItemRow; rank: number }) {
  const profit = parseFloat(item.grossProfit);

  return (
    <div className="flex items-center px-4 py-1.5 transition-colors hover:bg-accent/40">
      <div className="w-8 text-[11px] tabular-nums text-muted-foreground">{rank}</div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-medium text-foreground">{item.productName}</div>
        <span className="font-mono text-[10px] text-muted-foreground">{item.sku}</span>
      </div>
      <div className="w-24">
        <span className="inline-flex rounded-md bg-muted px-1.5 py-0.5 text-[9px] font-semibold text-muted-foreground">
          {item.categoryName ?? "Uncategorized"}
        </span>
      </div>
      <div className="w-16 text-right text-[12px] tabular-nums text-foreground">{item.unitsSold.toLocaleString()}</div>
      <div className="w-28 text-right text-[12px] font-medium tabular-nums text-foreground">{"\u20B1"}{fmt(item.totalRevenue)}</div>
      <div className="w-28 text-right text-[12px] tabular-nums text-muted-foreground">{"\u20B1"}{fmt(item.totalCost)}</div>
      <div className={cn("w-28 text-right text-[12px] font-medium tabular-nums", profit >= 0 ? "text-emerald-600" : "text-red-500")}>
        {"\u20B1"}{fmt(item.grossProfit)}
      </div>
      <div className="w-16 text-right text-[12px] font-semibold tabular-nums text-foreground">{item.marginPct}%</div>
    </div>
  );
}

function SalesByItemEmptyState({ hasFilters }: { hasFilters: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
        <Package size={16} className="text-muted-foreground" />
      </div>
      <p className="mt-3 text-[13px] font-medium text-foreground">{hasFilters ? "No matching items" : "No sales data"}</p>
      <p className="mt-1 text-[12px] text-muted-foreground">
        {hasFilters ? "Try adjusting your filters" : "No completed sales found for the selected period"}
      </p>
    </div>
  );
}

function SalesByItemPagination({ controller }: { controller: SalesByItemController }) {
  return (
    <div className="flex items-center justify-between border-t border-border bg-muted/30 px-4 py-2">
      <span className="text-[11px] text-muted-foreground">
        Showing {controller.filtered.length === 0 ? 0 : (controller.page - 1) * controller.perPage + 1}
        &ndash;{Math.min(controller.page * controller.perPage, controller.filtered.length)} of {controller.filtered.length.toLocaleString()} items
      </span>
      <div className="flex items-center gap-2">
        <select
          value={controller.perPage}
          onChange={(event) => controller.setPerPageValue(parseInt(event.target.value))}
          className="rounded border border-border bg-background px-1.5 py-0.5 text-[11px] text-foreground outline-none"
        >
          <option value={25}>25</option>
          <option value={50}>50</option>
          <option value={100}>100</option>
          <option value={500}>All</option>
        </select>
        <button
          onClick={() => controller.setPage(Math.max(1, controller.page - 1))}
          disabled={controller.page <= 1}
          className="rounded border border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground hover:bg-muted disabled:opacity-30"
        >
          Prev
        </button>
        <span className="text-[11px] tabular-nums text-muted-foreground">
          {controller.page} / {controller.totalPages || 1}
        </span>
        <button
          onClick={() => controller.setPage(Math.min(controller.totalPages, controller.page + 1))}
          disabled={controller.page >= controller.totalPages}
          className="rounded border border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground hover:bg-muted disabled:opacity-30"
        >
          Next
        </button>
      </div>
    </div>
  );
}
