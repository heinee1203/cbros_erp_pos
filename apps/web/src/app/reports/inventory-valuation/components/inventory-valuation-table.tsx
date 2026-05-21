import { ChevronDown, ChevronRight, ChevronUp, DollarSign } from "lucide-react";
import type { ValuationGroup, ValuationTotals } from "@/hooks/use-inventory-valuation";
import { cn } from "@/lib/utils";
import type { InventoryValuationController, SortField } from "../types";
import { fmtCurrency, fmtNumber, marginColor } from "../utils";
import { InventoryValuationDrilldown } from "./inventory-valuation-drilldown";

type InventoryValuationTableProps = {
  controller: InventoryValuationController;
};

export function InventoryValuationTable({ controller }: InventoryValuationTableProps) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-background shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
      <div className="flex items-center border-b border-border bg-muted/40 px-4 py-2">
        <div className="w-10 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">#</div>
        <div className="w-44 text-[11px] font-semibold uppercase capitalize tracking-[0.06em] text-muted-foreground">
          {controller.groupBy}
        </div>
        <div className="flex-1" />
        <SortHeader controller={controller} label="SKUs" field="skuCount" width="w-16" />
        <SortHeader controller={controller} label="Units" field="totalUnits" width="w-20" />
        <SortHeader controller={controller} label="Cost Value" field="costValue" width="w-32" />
        <SortHeader controller={controller} label="Retail Value" field="retailValue" width="w-32" />
        <SortHeader controller={controller} label="Margin" field="marginPct" width="w-16" />
        <SortHeader controller={controller} label="% Total" field="pctOfTotal" width="w-16" />
      </div>

      {controller.isLoading ? (
        <div>
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="h-14 animate-pulse border-b border-border bg-muted/20" />
          ))}
        </div>
      ) : controller.filtered.length === 0 ? (
        <InventoryValuationEmptyState search={controller.search} />
      ) : (
        <div className="divide-y divide-border">
          {controller.filtered.map((group, index) => (
            <InventoryValuationRow
              key={group.groupName}
              group={group}
              rank={index + 1}
              controller={controller}
            />
          ))}
        </div>
      )}

      <InventoryValuationTableFooter
        groupCount={controller.filtered.length}
        totals={controller.totals}
      />
    </div>
  );
}

function SortHeader({
  controller,
  label,
  field,
  width,
}: {
  controller: InventoryValuationController;
  label: string;
  field: SortField;
  width: string;
}) {
  const active = controller.sortBy === field;
  return (
    <button
      onClick={() => controller.handleSort(field)}
      className={cn(
        "flex items-center justify-end gap-0.5 text-[11px] font-semibold uppercase tracking-[0.06em] transition-colors",
        width,
        active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
      {active && (controller.sortDir === "desc" ? <ChevronDown size={10} /> : <ChevronUp size={10} />)}
    </button>
  );
}

function InventoryValuationRow({
  group,
  rank,
  controller,
}: {
  group: ValuationGroup;
  rank: number;
  controller: InventoryValuationController;
}) {
  const pct = (group.costValue / controller.maxCostValue) * 100;
  const isExpanded = controller.expandedGroup === group.groupName;

  return (
    <div>
      <div
        className={cn(
          "flex cursor-pointer items-center px-4 py-3 transition-colors hover:bg-accent/40",
          isExpanded && "bg-accent/20",
        )}
        onClick={() => controller.setExpandedGroup(isExpanded ? null : group.groupName)}
      >
        <div className="w-10 text-[13px] tabular-nums text-muted-foreground">{rank}</div>
        <div className="flex w-44 min-w-0 flex-col gap-0">
          <div className="flex items-center gap-1.5">
            <ChevronRight
              size={12}
              className={cn("flex-shrink-0 text-muted-foreground transition-transform", isExpanded && "rotate-90")}
            />
            <span className="truncate text-[13px] font-medium text-foreground">{group.groupName}</span>
          </div>
          {group.topCategories && (
            <span className="ml-5 truncate text-[10px] text-muted-foreground" title={group.topCategories}>
              Top: {group.topCategories}
            </span>
          )}
        </div>
        <div className="flex-1 pr-4">
          <div className="h-4 w-full overflow-hidden rounded-r-md bg-muted/40">
            <div
              className="h-4 rounded-r-md transition-all"
              style={{
                background: "linear-gradient(90deg, #10B981, #059669)",
                minWidth: "4px",
                width: `${Math.max(pct, 1)}%`,
              }}
            />
          </div>
        </div>
        <div className="w-16 text-right text-[12px] tabular-nums text-muted-foreground">{fmtNumber(group.skuCount)}</div>
        <div className="w-20 text-right text-[12px] tabular-nums text-foreground">{fmtNumber(group.totalUnits)}</div>
        <div className="w-32 text-right text-[12px] font-medium tabular-nums text-foreground">{fmtCurrency(group.costValue)}</div>
        <div className="w-32 text-right text-[12px] tabular-nums text-foreground">{fmtCurrency(group.retailValue)}</div>
        <div className={cn("w-16 text-right text-[12px] font-semibold tabular-nums", marginColor(group.marginPct))}>
          {group.marginPct}%
        </div>
        <div className="w-16 text-right text-[12px] tabular-nums text-muted-foreground">{group.pctOfTotal}%</div>
      </div>
      {isExpanded && (
        <InventoryValuationDrilldown
          groupBy={controller.groupBy}
          groupName={group.groupName}
          locationId={controller.filterLocationId || undefined}
          categoryId={controller.filterCategoryId || undefined}
          brandId={controller.filterBrandId || undefined}
          excludeZeroCost={controller.excludeZeroCost}
          excludeZeroSell={controller.excludeZeroSell}
        />
      )}
    </div>
  );
}

function InventoryValuationEmptyState({ search }: { search: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
        <DollarSign size={16} className="text-muted-foreground" />
      </div>
      <p className="mt-3 text-[13px] font-medium text-foreground">
        {search ? "No matching groups" : "No inventory data"}
      </p>
      <p className="mt-1 text-[12px] text-muted-foreground">
        {search ? "Try adjusting your search" : "No products with stock found"}
      </p>
    </div>
  );
}

function InventoryValuationTableFooter({
  groupCount,
  totals,
}: {
  groupCount: number;
  totals: ValuationTotals | undefined;
}) {
  return (
    <div className="flex items-center justify-between border-t border-border bg-muted/30 px-4 py-2">
      <span className="text-[11px] text-muted-foreground">{groupCount} groups</span>
      {totals && <span className="text-[11px] text-muted-foreground">Total cost: {fmtCurrency(totals.costValue)}</span>}
    </div>
  );
}
