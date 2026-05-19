import { ChevronDown, ChevronRight, Tag } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DemandByTagController, DemandRow, SortDir, SortKey } from "../types";
import { fmt, TAG_TYPE_BADGE } from "../utils";
import { TagDemandDetail } from "./tag-demand-detail";

type DemandByTagTableProps = {
  controller: DemandByTagController;
};

export function DemandByTagTable({ controller }: DemandByTagTableProps) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-background shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
      <div className="flex items-center border-b border-border bg-muted/40 px-4 py-2">
        <div className="w-8" />
        <SortHeader label="Application" sortKey="tagName" current={controller.sortKey} dir={controller.sortDir} onSort={controller.toggleSort} className="flex-1" />
        <div className="w-28 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Type</div>
        <SortHeader label="Units Sold" sortKey="unitsSold" current={controller.sortKey} dir={controller.sortDir} onSort={controller.toggleSort} className="w-24 text-right" />
        <SortHeader label="Revenue" sortKey="revenue" current={controller.sortKey} dir={controller.sortDir} onSort={controller.toggleSort} className="w-32 text-right" />
        <SortHeader label="Products" sortKey="productCount" current={controller.sortKey} dir={controller.sortDir} onSort={controller.toggleSort} className="w-20 text-right" />
        <div className="w-24 text-right text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Top Brand</div>
        <SortHeader label="Stock" sortKey="stockLeft" current={controller.sortKey} dir={controller.sortDir} onSort={controller.toggleSort} className="w-20 text-right" />
        <SortHeader label="Days" sortKey="daysOfStock" current={controller.sortKey} dir={controller.sortDir} onSort={controller.toggleSort} className="w-16 text-right" />
        <div className="w-16" />
      </div>

      {controller.isLoading ? (
        <div className="space-y-0">
          {Array.from({ length: 8 }).map((_, index) => (
            <div key={index} className="h-11 animate-pulse border-b border-border bg-muted/20" />
          ))}
        </div>
      ) : controller.rows.length === 0 ? (
        <DemandByTagEmptyState />
      ) : (
        <div className="divide-y divide-border">
          {controller.rows.map((row) => (
            <DemandByTagRow key={row.tagId} row={row} controller={controller} />
          ))}
        </div>
      )}

      <div className="flex items-center justify-between border-t border-border bg-muted/30 px-4 py-2">
        <span className="text-[11px] text-muted-foreground">{controller.rows.length} applications</span>
        <span className="text-[11px] text-muted-foreground">
          Total revenue: PHP {fmt(controller.rows.reduce((sum, row) => sum + (row.revenue ?? row.totalRevenue ?? 0), 0))}
        </span>
      </div>
    </div>
  );
}

function SortHeader({
  label,
  sortKey,
  current,
  dir,
  onSort,
  className,
}: {
  label: string;
  sortKey: SortKey;
  current: SortKey;
  dir: SortDir;
  onSort: (key: SortKey) => void;
  className?: string;
}) {
  const active = current === sortKey;
  return (
    <button
      onClick={() => onSort(sortKey)}
      className={cn(
        "text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground transition-colors hover:text-foreground",
        active && "text-foreground",
        className,
      )}
    >
      {label}
      {active && <span className="ml-0.5">{dir === "asc" ? "\u2191" : "\u2193"}</span>}
    </button>
  );
}

function DemandByTagRow({
  row,
  controller,
}: {
  row: DemandRow;
  controller: DemandByTagController;
}) {
  const isExpanded = controller.expandedTagId === row.tagId;

  return (
    <div>
      <div className="flex items-center px-4 py-1.5 transition-colors hover:bg-accent/40">
        <div className="w-8">
          <button
            onClick={() => controller.setExpandedTagId(isExpanded ? null : row.tagId)}
            className="text-muted-foreground hover:text-foreground"
          >
            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        </div>
        <div className="min-w-0 flex-1">
          <span className="text-[13px] font-medium text-foreground">{row.tagName}</span>
        </div>
        <div className="w-28">
          <span
            className={cn(
              "inline-flex rounded-md px-1.5 py-0.5 text-[9px] font-semibold uppercase",
              TAG_TYPE_BADGE[row.tagType] ?? "bg-gray-100 text-gray-700",
            )}
          >
            {row.tagType.replace(/_/g, " ")}
          </span>
        </div>
        <div className="w-24 text-right text-[12px] font-medium tabular-nums text-foreground">
          {(row.unitsSold ?? row.totalQtySold ?? 0).toLocaleString()}
        </div>
        <div className="w-32 text-right text-[12px] font-medium tabular-nums text-foreground">
          PHP {fmt(row.revenue ?? row.totalRevenue ?? 0)}
        </div>
        <div className="w-20 text-right text-[12px] tabular-nums text-foreground">{row.productCount}</div>
        <div className="w-24 truncate text-right text-[12px] text-muted-foreground">{row.topBrand ?? "-"}</div>
        <div className="w-20 text-right text-[12px] tabular-nums text-foreground">{(row.stockLeft ?? 0).toLocaleString()}</div>
        <div
          className={cn(
            "w-16 text-right text-[12px] font-medium tabular-nums",
            row.daysOfStock != null && row.daysOfStock <= 14
              ? "text-red-600"
              : row.daysOfStock != null && row.daysOfStock <= 30
                ? "text-amber-600"
                : "text-foreground",
          )}
        >
          {row.daysOfStock != null ? row.daysOfStock : "-"}
        </div>
        <div className="flex w-16 justify-end">
          <button
            onClick={() => controller.setExpandedTagId(isExpanded ? null : row.tagId)}
            className="rounded px-2 py-1 text-[11px] font-medium text-primary hover:bg-primary/[0.06]"
          >
            Detail
          </button>
        </div>
      </div>

      {isExpanded && (
        <TagDemandDetail
          tagId={row.tagId}
          token={controller.token}
          locationId={controller.locationId}
          dateFrom={controller.dateFrom}
          dateTo={controller.dateTo}
        />
      )}
    </div>
  );
}

function DemandByTagEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
        <Tag size={16} className="text-muted-foreground" />
      </div>
      <p className="mt-3 text-[13px] font-medium text-foreground">No demand data</p>
      <p className="mt-1 text-[12px] text-muted-foreground">
        No sales found for tagged products in the selected period
      </p>
    </div>
  );
}
