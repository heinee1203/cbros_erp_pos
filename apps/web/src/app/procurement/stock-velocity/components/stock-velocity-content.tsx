import { SortTh } from "./sort-th";
import { VelocityAnalysisTable } from "./velocity-analysis-table";
import { VelocityRow } from "./velocity-row";
import { DEMAND_TOOLTIP, VELOCITY_CLASSES } from "../constants";
import type { StockVelocityController } from "../lib/use-stock-velocity-controller";
import type { SortField } from "../types";

type StockVelocityContentProps = {
  controller: StockVelocityController;
};

export function StockVelocityContent({ controller }: StockVelocityContentProps) {
  return (
    <>
      {controller.viewMode === "classification" && <ClassificationTable controller={controller} />}
      {controller.viewMode === "velocity" && <VelocityAnalysis controller={controller} />}
      {controller.viewMode !== "reorder" && <StockVelocityFooter controller={controller} />}
    </>
  );
}

function ClassificationTable({ controller }: StockVelocityContentProps) {
  return (
    <div className="flex-1 overflow-auto rounded-lg border border-border">
      <table className="w-full text-xs">
        <thead className="sticky top-0 z-10 bg-muted/80 backdrop-blur">
          <tr>
            <SortTh label="CLASS" />
            <SortTh label="PRODUCT" field="productName" current={controller.sortBy} dir={controller.sortDir} onSort={controller.handleSort} />
            <SortTh label="STOCK" field="totalStock" current={controller.sortBy} dir={controller.sortDir} onSort={controller.handleSort} align="right" />
            <SortTh label="AVG PRICE" align="right" />
            <th className="whitespace-nowrap px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground" title="Suggested retail price based on cost + inflation + velocity markup. Red = selling below suggested. Green = healthy margin.">
              SUGG. PRICE
            </th>
            <SortTh label="DEMAND" field="avgDailySales30d" current={controller.sortBy} dir={controller.sortDir} onSort={controller.handleSort} align="right" tooltip={DEMAND_TOOLTIP} />
            <SortTh label="DOS" field="daysOfStock" current={controller.sortBy} dir={controller.sortDir} onSort={controller.handleSort} align="right" />
            <SortTh label="ACTIVE" field="saleDaysCount" current={controller.sortBy} dir={controller.sortDir} onSort={controller.handleSort} align="right" />
            <SortTh label="TOTAL SOLD" field="totalQtySold" current={controller.sortBy} dir={controller.sortDir} onSort={controller.handleSort} align="right" />
            <SortTh label="LAST SALE" field="daysSinceLastSale" current={controller.sortBy} dir={controller.sortDir} onSort={controller.handleSort} align="right" />
          </tr>
        </thead>
        <tbody>
          {controller.allRows.length === 0 ? (
            <tr>
              <td colSpan={10} className="py-12 text-center text-muted-foreground">
                {controller.velocityFilter !== "all" ? "No items in this class" : "No velocity data - click Recompute"}
              </td>
            </tr>
          ) : (
            controller.allRows.map((row, index) => <VelocityRow key={`${row.id}-${index}`} row={row} />)
          )}
        </tbody>
      </table>
    </div>
  );
}

function VelocityAnalysis({ controller }: StockVelocityContentProps) {
  return (
    <VelocityAnalysisTable
      rows={controller.allRows}
      sortBy={controller.sortBy}
      sortDir={controller.sortDir}
      onSort={(field) => controller.handleSort(field as SortField)}
      leftFilters={{
        all: controller.leftFilterAll,
        m12: controller.leftFilter12m,
        m6: controller.leftFilter6m,
        m3: controller.leftFilter3m,
        m1: controller.leftFilter1m,
      }}
      onLeftFilterChange={controller.handleLeftFilterChange}
      onClearLeftFilters={controller.clearLeftFilters}
      totalCount={controller.monitorPages?.pages?.[0]?.summary?.total ?? 0}
    />
  );
}

function StockVelocityFooter({ controller }: StockVelocityContentProps) {
  return (
    <>
      {controller.hasNextPage && (
        <div className="mt-2 text-center">
          <button onClick={controller.fetchNextPage} className="text-xs text-primary hover:underline">
            Load more
          </button>
        </div>
      )}
      <div className="mt-2 text-[10px] text-muted-foreground">
        Showing {controller.allRows.length} items
        {controller.velocityFilter !== "all" ? ` (filtered: ${VELOCITY_CLASSES.find((velocityClass) => velocityClass.key === controller.velocityFilter)?.label})` : ""}
        {controller.summary ? ` of ${controller.summary.total.toLocaleString()} total` : ""}
      </div>
    </>
  );
}
