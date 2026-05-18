import type { RefObject } from "react";

import type { SupplierMetricsRow } from "@/hooks/use-stock-monitor";
import type { SortDir, SortField } from "../types";
import { SortHeader } from "./sort-header";
import { SupplierRow } from "./supplier-row";

type SupplierMetricsTableProps = {
  rows: SupplierMetricsRow[];
  isFetchingNextPage: boolean;
  sortBy: SortField;
  sortDir: SortDir;
  onSort: (field: SortField) => void;
  sentinelRef: RefObject<HTMLDivElement | null>;
};

export function SupplierMetricsTable({
  rows,
  isFetchingNextPage,
  sortBy,
  sortDir,
  onSort,
  sentinelRef,
}: SupplierMetricsTableProps) {
  return (
    <div className={`transition-opacity ${isFetchingNextPage ? "opacity-60" : ""}`}>
      <table className="w-full text-left text-sm">
        <thead className="sticky top-0 z-10 border-b border-border bg-muted/50 text-xs font-medium text-muted-foreground">
          <tr>
            <SortHeader label="Supplier" field="supplierName" currentSort={sortBy} currentDir={sortDir} onSort={onSort} />
            <SortHeader label="PO Count (6m)" field="poCount6m" currentSort={sortBy} currentDir={sortDir} onSort={onSort} align="right" />
            <SortHeader label="Avg Lead Time" field="avgLeadTimeDays" currentSort={sortBy} currentDir={sortDir} onSort={onSort} align="right" />
            <th scope="col" className="whitespace-nowrap px-4 py-1.5 text-right text-[11px] font-semibold uppercase tracking-wider">
              Min
            </th>
            <th scope="col" className="whitespace-nowrap px-4 py-1.5 text-right text-[11px] font-semibold uppercase tracking-wider">
              Max
            </th>
            <SortHeader label="Reliability" field="reliabilityPct" currentSort={sortBy} currentDir={sortDir} onSort={onSort} align="right" />
            <th scope="col" className="whitespace-nowrap px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wider">
              Last PO
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row) => (
            <SupplierRow key={row.id} row={row} />
          ))}
        </tbody>
      </table>
      <div ref={sentinelRef} className="h-4" />
    </div>
  );
}
