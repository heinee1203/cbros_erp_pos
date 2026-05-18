import { Loader2 } from "lucide-react";
import type { ReactNode } from "react";
import type { StockAdjustmentsController } from "../lib/use-stock-adjustments-controller";
import { AdjustmentRow } from "./adjustment-row";
import { EmptyState } from "./empty-state";

type StockAdjustmentsContentProps = {
  controller: StockAdjustmentsController;
};

export function StockAdjustmentsContent({ controller }: StockAdjustmentsContentProps) {
  return (
    <div className="flex-1 overflow-auto">
      {controller.isLoading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 size={24} className="animate-spin text-muted-foreground" />
        </div>
      ) : controller.isError ? (
        <div className="flex h-64 flex-col items-center justify-center gap-2 text-center">
          <p className="text-sm font-medium text-destructive">Failed to load adjustments</p>
          <p className="text-xs text-muted-foreground">
            {(controller.error as any)?.message ?? "Check API connection"}
          </p>
        </div>
      ) : controller.entries.length === 0 ? (
        <EmptyState hasFilters={controller.hasActiveFilters} />
      ) : (
        <div className={`transition-opacity ${controller.isFetchingNextPage ? "opacity-60" : ""}`}>
          <StockAdjustmentsTable controller={controller} />
        </div>
      )}
    </div>
  );
}

function StockAdjustmentsTable({ controller }: StockAdjustmentsContentProps) {
  return (
    <table className="w-full text-left text-sm">
      <thead className="sticky top-0 z-10 border-b border-border bg-muted/50 text-xs font-medium text-muted-foreground">
        <tr>
          <StockAdjustmentsTableHeader>Date / Time</StockAdjustmentsTableHeader>
          <StockAdjustmentsTableHeader>Item</StockAdjustmentsTableHeader>
          <StockAdjustmentsTableHeader>SKU</StockAdjustmentsTableHeader>
          <StockAdjustmentsTableHeader>Location</StockAdjustmentsTableHeader>
          <StockAdjustmentsTableHeader>Direction</StockAdjustmentsTableHeader>
          <StockAdjustmentsTableHeader align="right">Qty</StockAdjustmentsTableHeader>
          <StockAdjustmentsTableHeader>Reason</StockAdjustmentsTableHeader>
          <StockAdjustmentsTableHeader>Notes</StockAdjustmentsTableHeader>
          <StockAdjustmentsTableHeader>Actor</StockAdjustmentsTableHeader>
          <StockAdjustmentsTableHeader>Reference</StockAdjustmentsTableHeader>
          <StockAdjustmentsTableHeader align="right">Balance After</StockAdjustmentsTableHeader>
        </tr>
      </thead>
      <tbody className="divide-y divide-border">
        {controller.entries.map((entry) => (
          <AdjustmentRow key={entry.id} entry={entry} />
        ))}
      </tbody>
    </table>
  );
}

function StockAdjustmentsTableHeader({
  align,
  children,
}: {
  align?: "right";
  children: ReactNode;
}) {
  return (
    <th
      scope="col"
      className={`whitespace-nowrap px-4 py-1.5 font-medium ${align === "right" ? "text-right" : ""}`}
    >
      {children}
    </th>
  );
}
