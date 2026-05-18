import type { StockMonitorRow } from "@/hooks/use-stock-monitor";
import { cn } from "@/lib/utils";
import { VELOCITY_CLASSES } from "../constants";

type VelocityRowProps = {
  row: StockMonitorRow;
};

export function VelocityRow({ row }: VelocityRowProps) {
  const isUntracked = row.velocityClass === "UNTRACKED";
  const velocityClass =
    VELOCITY_CLASSES.find((entry) => entry.key === row.velocityClass) ??
    VELOCITY_CLASSES[4];
  const avgSales = parseFloat(row.avgDailySales30d || "0");
  const dos = row.daysOfStock ? parseFloat(row.daysOfStock) : null;

  return (
    <tr
      className={cn(
        "border-b border-border/40 transition-colors hover:bg-muted/30",
        isUntracked && "bg-muted/10 text-muted-foreground",
      )}
    >
      <td className="whitespace-nowrap px-3 py-2">
        {isUntracked ? (
          <span
            className="inline-flex items-center rounded border border-dashed border-muted-foreground/40 bg-muted/40 px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground"
            title="Dormant SKU — no stock and no sales in the last 90 days"
          >
            UNTRACKED
          </span>
        ) : (
          <span
            className={cn(
              "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold",
              velocityClass.badge,
            )}
          >
            {velocityClass.label}
          </span>
        )}
      </td>
      <td className="max-w-[280px] px-3 py-2">
        <div className="flex items-center gap-1.5">
          <span className="truncate font-medium text-foreground" title={row.productName}>
            {row.productName}
          </span>
          {row.specialOrder && (
            <span className="shrink-0 rounded bg-blue-100 px-1.5 py-px text-[9px] font-medium text-blue-700">
              SO
            </span>
          )}
          {row.discontinued && (
            <span className="shrink-0 rounded bg-gray-200 px-1.5 py-px text-[9px] font-medium text-gray-600">
              DC
            </span>
          )}
        </div>
        <div className="text-[10px] font-mono text-muted-foreground">{row.productSku}</div>
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums font-medium">
        {row.totalStock}
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-muted-foreground">
        {row.avgSellingPrice
          ? `₱${parseFloat(row.avgSellingPrice).toLocaleString("en-PH", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}`
          : "—"}
      </td>
      <td
        className={cn(
          "whitespace-nowrap px-3 py-2 text-right tabular-nums font-medium",
          row.suggestedSellPrice &&
            row.avgSellingPrice &&
            parseFloat(row.suggestedSellPrice) > parseFloat(row.avgSellingPrice) * 1.5
            ? "text-green-600"
            : row.suggestedSellPrice &&
                row.avgSellingPrice &&
                parseFloat(row.suggestedSellPrice) < parseFloat(row.avgSellingPrice)
              ? "text-red-600"
              : "text-muted-foreground",
        )}
        title={
          row.suggestedSellPrice && row.inflationAdjustedCost && row.appliedMarkupPct
            ? `Cost: ₱${parseFloat(row.costPrice || "0").toLocaleString("en-PH", {
                minimumFractionDigits: 2,
              })} → Inflation adj: ₱${parseFloat(row.inflationAdjustedCost).toLocaleString(
                "en-PH",
                { minimumFractionDigits: 2 },
              )} → Markup: ${row.appliedMarkupPct}% → Age: ${
                row.stockAgeMonths ?? 0
              } months`
            : undefined
        }
      >
        {row.suggestedSellPrice
          ? `₱${parseFloat(row.suggestedSellPrice).toLocaleString("en-PH", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}`
          : "—"}
      </td>
      <td
        className="whitespace-nowrap px-3 py-2 text-right tabular-nums"
        title={`${avgSales.toFixed(2)} avg/day (30d basis)`}
      >
        {avgSales > 0 ? `${(avgSales * 30).toFixed(1)} /mo` : "—"}
      </td>
      <td
        className={cn(
          "whitespace-nowrap px-3 py-2 text-right tabular-nums font-medium",
          row.totalStock === 0
            ? ""
            : dos !== null && dos <= 15
              ? "text-red-600"
              : dos !== null && dos <= 60
                ? "text-amber-600"
                : dos !== null && dos <= 180
                  ? "text-green-600"
                  : dos !== null && dos > 180
                    ? "text-blue-600"
                    : "text-muted-foreground",
        )}
      >
        {row.totalStock === 0 ? (
          <span className="inline-flex rounded bg-red-100 px-1.5 py-0.5 text-[9px] font-bold text-red-700">
            OUT
          </span>
        ) : dos !== null ? (
          Math.round(dos).toLocaleString()
        ) : (
          "∞"
        )}
      </td>
      <td
        className="whitespace-nowrap px-3 py-2 text-right"
        title={`${row.saleDaysCount} days with sales out of 180-day window`}
      >
        <span className="tabular-nums text-muted-foreground">{row.saleDaysCount}</span>
        <span
          className={cn(
            "ml-1 inline-flex rounded px-1 py-px text-[8px] font-semibold",
            row.saleDaysCount >= 120
              ? "bg-green-100 text-green-700"
              : row.saleDaysCount >= 60
                ? "bg-blue-100 text-blue-700"
                : row.saleDaysCount >= 10
                  ? "bg-amber-100 text-amber-700"
                  : "bg-gray-100 text-gray-500",
          )}
        >
          {row.saleDaysCount >= 120
            ? "Consistent"
            : row.saleDaysCount >= 60
              ? "Steady"
              : row.saleDaysCount >= 10
                ? "Regular"
                : "Sporadic"}
        </span>
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
        {row.totalQtySold.toLocaleString()}
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-muted-foreground">
        {row.daysSinceLastSale !== null
          ? row.daysSinceLastSale === 0
            ? "Today"
            : row.daysSinceLastSale === 1
              ? "Yesterday"
              : row.daysSinceLastSale < 30
                ? `${row.daysSinceLastSale}d ago`
                : row.daysSinceLastSale < 365
                  ? `${Math.floor(row.daysSinceLastSale / 30)}mo ago`
                  : `${Math.floor(row.daysSinceLastSale / 365)}yr ago`
          : "Never"}
      </td>
    </tr>
  );
}
