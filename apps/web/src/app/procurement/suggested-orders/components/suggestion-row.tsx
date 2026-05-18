import { Sparkles, XCircle } from "lucide-react";

import type { ReorderSuggestionRow } from "@/hooks/use-reorder";
import { cn } from "@/lib/utils";
import { ABC_CONFIG, PRIORITY_CONFIG } from "../constants";

type SuggestionRowProps = {
  row: ReorderSuggestionRow;
  isSelected: boolean;
  onToggle: () => void;
  editingQty: number | undefined;
  onQtyChange: (value: number) => void;
  onQtyBlur: (value: number) => void;
  onDismiss: () => void;
  onClick: () => void;
  onAskAi: () => void;
};

export function SuggestionRow({
  row,
  isSelected,
  onToggle,
  editingQty,
  onQtyChange,
  onQtyBlur,
  onDismiss,
  onClick,
  onAskAi,
}: SuggestionRowProps) {
  const priorityCfg =
    PRIORITY_CONFIG[row.priority] ?? {
      label: row.priority,
      badge: "bg-muted text-muted-foreground",
    };
  const abcCfg = ABC_CONFIG[row.abcClass] ?? { badge: "bg-gray-100 text-gray-600" };
  const avgDemand = parseFloat(row.avgDailyDemand);
  const rop = parseFloat(row.reorderPoint);

  return (
    <tr className="group transition-colors hover:bg-muted/30">
      <td className="px-4 py-1.5" onClick={(event) => event.stopPropagation()}>
        <input
          type="checkbox"
          checked={isSelected}
          onChange={onToggle}
          className="h-3.5 w-3.5 rounded border-border"
        />
      </td>

      <td className="whitespace-nowrap px-4 py-1.5 cursor-pointer" onClick={onClick}>
        <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium", priorityCfg.badge)}>
          {priorityCfg.label}
        </span>
      </td>

      <td className="whitespace-nowrap px-4 py-1.5 cursor-pointer" onClick={onClick}>
        <span className={cn("inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-semibold", abcCfg.badge)}>
          {row.abcClass}
        </span>
      </td>

      <td className="max-w-[260px] px-4 py-1.5 cursor-pointer" onClick={onClick}>
        <div className="truncate text-sm font-medium text-foreground" title={row.productName}>
          {row.productName}
        </div>
        <div className="truncate font-mono text-[10px] text-muted-foreground">{row.sku}</div>
      </td>

      <td
        className="max-w-[140px] whitespace-nowrap px-4 py-1.5 text-sm text-foreground cursor-pointer"
        onClick={onClick}
      >
        <span className="truncate block" title={row.supplierName ?? undefined}>
          {row.supplierName ?? "\u2014"}
        </span>
      </td>

      <td className="whitespace-nowrap px-4 py-1.5 text-right tabular-nums text-sm text-foreground cursor-pointer" onClick={onClick}>
        {row.currentStock.toLocaleString()}
      </td>

      <td className="whitespace-nowrap px-4 py-1.5 text-right tabular-nums text-sm text-muted-foreground cursor-pointer" onClick={onClick}>
        {row.pendingInbound.toLocaleString()}
      </td>

      <td className="whitespace-nowrap px-4 py-1.5 text-right tabular-nums text-sm text-muted-foreground cursor-pointer" onClick={onClick}>
        {avgDemand.toFixed(1)}
      </td>

      <td className="whitespace-nowrap px-4 py-1.5 text-right tabular-nums text-sm text-muted-foreground cursor-pointer" onClick={onClick}>
        {rop.toFixed(1)}
      </td>

      <td className="whitespace-nowrap px-4 py-1.5 text-right" onClick={(event) => event.stopPropagation()}>
        <input
          type="number"
          min={1}
          value={editingQty ?? row.suggestedQty}
          onChange={(event) => onQtyChange(parseInt(event.target.value, 10) || 0)}
          onFocus={() => onQtyChange(row.suggestedQty)}
          onBlur={(event) => onQtyBlur(parseInt(event.target.value, 10) || row.suggestedQty)}
          className="w-20 rounded-md border border-border bg-background px-2 py-1 text-right text-xs tabular-nums text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
        />
      </td>

      <td className="whitespace-nowrap px-4 py-1.5 text-right tabular-nums text-sm text-muted-foreground cursor-pointer" onClick={onClick}>
        {"\u2014"}
      </td>

      <td className="whitespace-nowrap px-4 py-1.5 text-center" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-center gap-1">
          <button
            className="flex h-6 items-center gap-1 rounded border border-primary/30 bg-primary/5 px-2 text-[10px] font-medium text-primary transition-colors hover:bg-primary/10"
            title="Create PO for this item"
          >
            Order
          </button>
          <button
            onClick={onDismiss}
            className="flex h-6 items-center gap-1 rounded border border-border px-2 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            title="Dismiss suggestion"
          >
            <XCircle size={10} />
          </button>
          <button
            onClick={(event) => {
              event.stopPropagation();
              onAskAi();
            }}
            className="rounded p-1 text-amber-500 hover:bg-amber-50"
            title="Ask AI"
          >
            <Sparkles size={13} />
          </button>
        </div>
      </td>
    </tr>
  );
}
