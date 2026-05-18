import Link from "next/link";
import { AlertTriangle, Loader2, PackageX, ShoppingCart } from "lucide-react";

import type { StockLevelRow } from "@/hooks/use-stock-levels";
import { cn } from "@/lib/utils";
import { timeAgo } from "@/lib/format";
import { STATUS_LABELS, STATUS_STYLES } from "../constants";

type StockRowProps = {
  row: StockLevelRow;
  onReorder: (productId: string, productName: string) => void;
  reorderLoading: string | null;
};

export function StockRow({ row, onReorder, reorderLoading }: StockRowProps) {
  const catLabel = row.category || "Uncategorized";
  const catStyle = "bg-muted text-muted-foreground";
  const statusLabel = STATUS_LABELS[row.status] ?? row.status;
  const statusStyle = STATUS_STYLES[row.status] ?? "bg-muted text-muted-foreground";

  const isLow = row.status === "LOW_STOCK";
  const isOut = row.status === "OUT_OF_STOCK";
  const unitSuffix = row.sellingUnit && row.sellingUnit !== "piece" ? ` ${row.sellingUnit}` : "";
  const daysLeft = row.daysOfStock != null ? Math.round(row.daysOfStock) : null;

  return (
    <tr className="group transition-colors hover:bg-muted/30">
      <td className="min-w-[200px] px-4 py-1.5">
        <div className="flex items-center gap-1.5">
          <Link
            href={`/inventory?search=${encodeURIComponent(row.productSku)}`}
            className="whitespace-normal break-words text-sm font-medium text-foreground hover:underline"
          >
            {row.productName}
          </Link>
          {row.pendingOrderCount > 0 && (
            <span className="shrink-0 rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
              PO
            </span>
          )}
        </div>
        {row.familyName && (
          <div className="text-[10px] text-muted-foreground">{row.familyName}</div>
        )}
      </td>

      <td className="whitespace-nowrap px-4 py-1.5 font-mono text-xs text-muted-foreground">
        {row.productSku}
      </td>

      <td className="whitespace-nowrap px-4 py-1.5">
        <span className={`inline-flex rounded-md px-2 py-0.5 text-[11px] font-medium ${catStyle}`}>
          {catLabel}
        </span>
      </td>

      <td className="whitespace-nowrap px-4 py-1.5 text-sm text-foreground">
        {row.locationName}
      </td>

      <td
        className={`whitespace-nowrap px-4 py-1.5 text-right tabular-nums text-sm ${
          isOut ? "font-semibold text-destructive" : isLow ? "font-medium text-warning" : "text-foreground"
        }`}
      >
        {row.stockLevel.toLocaleString()}
        {unitSuffix}
      </td>

      <td className="whitespace-nowrap px-4 py-1.5 text-right tabular-nums text-sm text-muted-foreground">
        {row.reservedLevel > 0 ? `${row.reservedLevel.toLocaleString()}${unitSuffix}` : "\u2014"}
      </td>

      <td
        className={`whitespace-nowrap px-4 py-1.5 text-right tabular-nums text-sm font-medium ${
          isOut ? "text-destructive" : isLow ? "text-warning" : "text-foreground"
        }`}
      >
        {row.available.toLocaleString()}
        {unitSuffix}
      </td>

      <td className="whitespace-nowrap px-4 py-1.5 text-right tabular-nums text-sm text-muted-foreground">
        {row.reorderPoint.toLocaleString()}
        {unitSuffix}
      </td>

      <td className="whitespace-nowrap px-4 py-1.5 text-right tabular-nums text-sm text-muted-foreground">
        {row.sold1m > 0 ? `${row.sold1m} /mo` : "\u2014"}
      </td>

      <td
        className={cn(
          "whitespace-nowrap px-4 py-1.5 text-right tabular-nums text-sm font-medium",
          daysLeft === null
            ? "text-muted-foreground/50"
            : daysLeft <= 7
              ? "text-destructive"
              : daysLeft <= 14
                ? "text-orange-500"
                : daysLeft <= 30
                  ? "text-amber-500"
                  : "text-emerald-600",
        )}
      >
        {daysLeft === null ? "\u221E" : `${daysLeft}d`}
      </td>

      <td className="whitespace-nowrap px-4 py-1.5 text-right text-xs text-muted-foreground">
        {row.lastSoldAt ? timeAgo(row.lastSoldAt) : "\u2014"}
      </td>

      <td className="whitespace-nowrap px-4 py-1.5">
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${statusStyle}`}>
          {isOut && <PackageX size={11} />}
          {isLow && <AlertTriangle size={11} />}
          {statusLabel}
        </span>
      </td>

      <td className="whitespace-nowrap px-4 py-1.5 text-right">
        {(isLow || isOut) && (
          <button
            onClick={() => onReorder(row.productId, row.productName)}
            disabled={reorderLoading === row.productId}
            className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
          >
            {reorderLoading === row.productId ? (
              <Loader2 size={11} className="animate-spin" />
            ) : (
              <ShoppingCart size={11} />
            )}
            Reorder
          </button>
        )}
      </td>
    </tr>
  );
}
