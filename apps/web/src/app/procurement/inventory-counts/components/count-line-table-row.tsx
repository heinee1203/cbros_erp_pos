import { AlertTriangle, Check, Pencil } from "lucide-react";

import type { CountLineRow } from "@/hooks/use-inventory-counts";
import { useCountLineEditor } from "../lib/use-count-line-editor";

type CountLineTableRowProps = {
  line: CountLineRow;
  odd: boolean;
  editable: boolean;
  onRecord: (lineId: string, qty: number) => void;
};

export function CountLineTableRow({
  line,
  odd,
  editable,
  onRecord,
}: CountLineTableRowProps) {
  const editor = useCountLineEditor({ line, onRecord });
  const isCounted = line.countedQty !== null;
  const hasVariance = line.variance !== null && line.variance !== 0;
  const varianceAbs = line.variance !== null ? Math.abs(line.variance) : 0;
  const isGain = (line.variance ?? 0) > 0;

  return (
    <tr
      className={`border-b border-border/50 transition-colors hover:bg-primary/[0.03] ${odd ? "bg-muted/20" : ""} ${hasVariance ? "bg-amber-50/30 dark:bg-amber-900/5" : ""}`}
    >
      <td className="px-3 py-1.5 align-top">
        <div
          className="max-w-[220px] truncate text-xs font-medium text-foreground"
          title={line.productName}
        >
          {line.productName}
        </div>
        {line.familyName && (
          <div className="text-[10px] text-muted-foreground/60">{line.familyName}</div>
        )}
      </td>

      <td className="whitespace-nowrap px-3 py-1.5 align-top font-mono text-[11px] text-muted-foreground">
        {line.productSku}
      </td>

      <td className="whitespace-nowrap px-3 py-1.5 align-top text-xs text-muted-foreground">
        {line.category.replace(/_/g, " ").replace(/\b\w/g, (c) => c)}
      </td>

      <td className="whitespace-nowrap px-3 py-1.5 text-right align-top font-mono text-xs tabular-nums text-foreground">
        {line.systemQty}
      </td>

      <td className="whitespace-nowrap px-3 py-1.5 text-right align-top">
        {editable ? (
          editor.editing ? (
            <input
              ref={editor.inputRef}
              type="number"
              min={0}
              value={editor.inputVal}
              onChange={(e) => editor.setInputVal(e.target.value)}
              onBlur={editor.submitCount}
              onKeyDown={editor.handleKeyDown}
              className="h-6 w-16 rounded border border-primary bg-background px-1.5 text-right font-mono text-xs tabular-nums text-foreground outline-none"
            />
          ) : (
            <button
              onClick={() => editor.setEditing(true)}
              className={`group/edit inline-flex h-6 min-w-[48px] items-center justify-end gap-1 rounded border px-1.5 text-right font-mono text-xs tabular-nums transition-colors ${
                isCounted
                  ? "border-border bg-background text-foreground hover:border-primary"
                  : "border-dashed border-muted-foreground/30 bg-muted/30 text-muted-foreground/50 hover:border-primary hover:text-foreground"
              }`}
              title="Click to enter count"
            >
              {isCounted ? line.countedQty : "\u2014"}
              <Pencil size={10} className="text-muted-foreground opacity-0 transition-opacity group-hover/edit:opacity-100" />
            </button>
          )
        ) : (
          <span className="font-mono text-xs tabular-nums text-foreground">
            {isCounted ? line.countedQty : "\u2014"}
          </span>
        )}
      </td>

      <td className="whitespace-nowrap px-3 py-1.5 text-right align-top font-mono text-xs tabular-nums">
        {isCounted ? (
          <span
            className={
              hasVariance
                ? isGain
                  ? "font-semibold text-emerald-600"
                  : "font-semibold text-red-600"
                : "text-muted-foreground"
            }
          >
            {hasVariance
              ? `${isGain ? "+" : "\u2212"}${varianceAbs}`
              : "0"}
          </span>
        ) : (
          <span className="text-muted-foreground/30">{"\u2014"}</span>
        )}
      </td>

      <td className="whitespace-nowrap px-3 py-1.5 align-top">
        {!isCounted ? (
          <span className="text-[10px] text-muted-foreground/50">Pending</span>
        ) : hasVariance ? (
          <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-amber-600">
            <AlertTriangle size={10} />
            Variance
          </span>
        ) : (
          <span className="inline-flex items-center gap-0.5 text-[10px] text-emerald-600">
            <Check size={10} />
            Match
          </span>
        )}
      </td>
    </tr>
  );
}
