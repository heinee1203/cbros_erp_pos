import { Sparkles } from "lucide-react";

import type { StockMonitorRow } from "@/hooks/use-stock-monitor";
import { cn } from "@/lib/utils";
import { STATUS_CONFIG } from "../constants";
import { formatRelativeDate } from "../utils";

type StockMonitorTableRowProps = {
  row: StockMonitorRow;
  visibleCols: Set<string>;
  velocity: number;
  onClick: () => void;
  onAskAi: () => void;
};

export function StockMonitorTableRow({
  row,
  visibleCols,
  velocity,
  onClick,
  onAskAi,
}: StockMonitorTableRowProps) {
  const isCol = (key: string) => visibleCols.has(key);
  const cfg = STATUS_CONFIG[row.status] ?? {
    label: row.status,
    badge: "bg-muted text-muted-foreground",
    text: "text-muted-foreground",
  };
  const avgSales = velocity;
  const daysOfStock = avgSales > 0.01 ? row.totalStock / avgSales : null;
  const trendIcon = row.trend === "up" ? "\u2191" : row.trend === "down" ? "\u2193" : "\u2192";
  const trendColor = row.trend === "up" ? "text-green-600" : row.trend === "down" ? "text-red-500" : "text-muted-foreground/50";
  const trendTooltip = `${row.trend === "up" ? "Trending up" : row.trend === "down" ? "Trending down" : "Stable"}: ${parseFloat(row.trendRecent).toFixed(1)}/day (last 3mo) vs ${parseFloat(row.trendPrior).toFixed(1)}/day (prior 3mo)`;

  return (
    <tr
      onClick={onClick}
      className="group cursor-pointer transition-colors hover:bg-muted/30"
    >
      {isCol("status") && (
        <td className="whitespace-nowrap px-4 py-1.5">
          <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium", cfg.badge)}>
            {cfg.label}
          </span>
        </td>
      )}

      {isCol("product") && (
        <td className="max-w-[260px] px-4 py-1.5">
          <div className="truncate text-sm font-medium text-foreground" title={row.productName}>
            {row.productName}
          </div>
          <div className="truncate font-mono text-[10px] text-muted-foreground">{row.productSku}</div>
        </td>
      )}

      {isCol("brand") && (
        <td className="whitespace-nowrap px-4 py-1.5 text-sm text-foreground">
          {row.brandName ?? "\u2014"}
        </td>
      )}

      {isCol("category") && (
        <td className="whitespace-nowrap px-4 py-1.5 text-sm text-foreground">
          {row.categoryName ?? "\u2014"}
        </td>
      )}

      {isCol("subcategory") && (
        <td className="whitespace-nowrap px-4 py-1.5 text-sm text-muted-foreground">
          {row.subcategoryName ?? "\u2014"}
        </td>
      )}

      {isCol("totalStock") && (
        <td className="whitespace-nowrap px-4 py-1.5 text-right tabular-nums text-sm text-foreground">
          {row.totalStock.toLocaleString()}
          {row.sellingUnit && row.sellingUnit !== "piece" ? ` ${row.sellingUnit}` : ""}
        </td>
      )}

      {isCol("avgSales") && (
        <td className="whitespace-nowrap px-4 py-1.5 text-right tabular-nums text-sm text-muted-foreground">
          {avgSales.toFixed(1)}
          <span className={cn("ml-1 text-[10px]", trendColor)} title={trendTooltip}>
            {trendIcon}
          </span>
        </td>
      )}

      {isCol("daysOfStock") && (
        <td className={cn("whitespace-nowrap px-4 py-1.5 text-right tabular-nums text-sm font-medium", cfg.text)}>
          {daysOfStock != null ? Math.round(daysOfStock).toLocaleString() : "\u2014"}
        </td>
      )}

      {isCol("lastSold") && (
        <td className="whitespace-nowrap px-4 py-1.5 text-sm text-muted-foreground">
          {row.lastSaleDate ? formatRelativeDate(row.lastSaleDate) : "\u2014"}
        </td>
      )}

      {isCol("stockoutDays") && (
        <td
          className={cn(
            "whitespace-nowrap px-4 py-1.5 text-right tabular-nums text-sm",
            row.stockoutDays90d > 0 ? "font-medium text-red-600" : "text-muted-foreground",
          )}
        >
          {row.stockoutDays90d}
        </td>
      )}

      {isCol("lastPo") && (
        <td className="max-w-[140px] px-4 py-1.5">
          {row.lastPoDate ? (
            <div>
              <div className="text-xs text-foreground">
                {new Date(row.lastPoDate).toLocaleDateString()}
              </div>
              {row.lastPoSupplierName && (
                <div className="truncate text-[10px] text-muted-foreground" title={row.lastPoSupplierName}>
                  {row.lastPoSupplierName}
                </div>
              )}
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">{"\u2014"}</span>
          )}
        </td>
      )}

      {isCol("leadTime") && (
        <td className="whitespace-nowrap px-4 py-1.5 text-right tabular-nums text-sm text-muted-foreground">
          {row.lastLeadTimeDays != null ? `${row.lastLeadTimeDays}d` : "\u2014"}
        </td>
      )}

      {isCol("ai") && (
        <td className="whitespace-nowrap px-4 py-1.5 text-center" onClick={(event) => event.stopPropagation()}>
          <button
            onClick={onAskAi}
            className="rounded p-1 text-amber-500 hover:bg-amber-50"
            title="Ask AI"
          >
            <Sparkles size={13} />
          </button>
        </td>
      )}
    </tr>
  );
}
