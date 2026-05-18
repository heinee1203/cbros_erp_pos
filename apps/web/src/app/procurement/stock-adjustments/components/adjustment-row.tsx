import { ArrowDownCircle, ArrowUpCircle, ExternalLink } from "lucide-react";

import type { JournalEntry } from "@/hooks/use-stock-journal";
import { REASON_CODE_LABELS } from "../constants";

type AdjustmentRowProps = {
  entry: JournalEntry;
};

export function AdjustmentRow({ entry }: AdjustmentRowProps) {
  const dateObj = new Date(entry.effectiveAt);
  const dateStr = dateObj.toLocaleDateString("en-PH", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  const timeStr = dateObj.toLocaleTimeString("en-PH", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const isDeduction = entry.changeQuantity < 0;
  const refShort = entry.referenceId.slice(0, 8);

  return (
    <tr className="group transition-colors hover:bg-muted/30">
      <td className="whitespace-nowrap px-4 py-1.5">
        <div className="text-sm text-foreground">{dateStr}</div>
        <div className="text-[11px] text-muted-foreground">{timeStr}</div>
      </td>

      <td
        className="max-w-[200px] truncate px-4 py-1.5 text-sm text-foreground"
        title={entry.productName}
      >
        {entry.productName}
      </td>

      <td className="whitespace-nowrap px-4 py-1.5 font-mono text-xs text-muted-foreground">
        {entry.productSku}
      </td>

      <td className="whitespace-nowrap px-4 py-1.5 text-sm text-foreground">
        {entry.locationName}
      </td>

      <td className="whitespace-nowrap px-4 py-1.5">
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
            isDeduction
              ? "bg-destructive/10 text-destructive"
              : "bg-success/10 text-success"
          }`}
        >
          {isDeduction ? (
            <ArrowDownCircle size={11} />
          ) : (
            <ArrowUpCircle size={11} />
          )}
          {isDeduction ? "Remove" : "Add"}
        </span>
      </td>

      <td className="whitespace-nowrap px-4 py-1.5 text-right tabular-nums">
        <span
          className={`text-sm font-medium ${
            isDeduction ? "text-destructive" : "text-success"
          }`}
        >
          {isDeduction ? "\u2212" : "+"}
          {Math.abs(entry.changeQuantity)}
        </span>
      </td>

      <td className="whitespace-nowrap px-4 py-1.5">
        <span className="inline-flex rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
          {entry.reasonCode
            ? (REASON_CODE_LABELS[entry.reasonCode] ?? entry.reasonCode)
            : "\u2014"}
        </span>
      </td>

      <td
        className="max-w-[180px] truncate px-4 py-1.5 text-xs text-muted-foreground"
        title={entry.notes ?? ""}
      >
        {entry.notes ?? "\u2014"}
      </td>

      <td className="whitespace-nowrap px-4 py-1.5 text-sm text-foreground">
        {entry.actorName ?? entry.actorType}
      </td>

      <td className="whitespace-nowrap px-4 py-1.5">
        <span
          className="inline-flex items-center gap-1 font-mono text-[11px] text-muted-foreground"
          title={entry.referenceId}
        >
          {refShort}
          {"\u2026"}
          <ExternalLink size={10} className="opacity-0 transition-opacity group-hover:opacity-60" />
        </span>
      </td>

      <td className="whitespace-nowrap px-4 py-1.5 text-right tabular-nums text-sm text-foreground">
        {entry.balanceAfter}
      </td>
    </tr>
  );
}
