import { Eye } from "lucide-react";

import type { CountSessionRow } from "@/hooks/use-inventory-counts";
import { SCOPE_LABELS, STATUS_COLORS, STATUS_LABELS } from "../constants";

type CountSessionListRowProps = {
  session: CountSessionRow;
  odd: boolean;
  onOpen: () => void;
};

export function CountSessionListRow({
  session: s,
  odd,
  onOpen,
}: CountSessionListRowProps) {
  const d = new Date(s.createdAt);
  const date = d.toLocaleDateString("en-PH", { day: "2-digit", month: "short" });
  const time = d.toLocaleTimeString("en-PH", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const progress =
    s.totalLines > 0
      ? Math.round((s.countedLines / s.totalLines) * 100)
      : 0;

  return (
    <tr
      className={`cursor-pointer border-b border-border/50 transition-colors hover:bg-primary/[0.03] ${odd ? "bg-muted/20" : ""}`}
      onClick={onOpen}
    >
      <td className="px-3 py-1.5 align-top">
        <div className="max-w-[260px] truncate text-xs font-medium text-foreground" title={s.label}>
          {s.label}
        </div>
        <div className="font-mono text-[10px] text-muted-foreground/60">{s.id.slice(0, 8)}</div>
      </td>
      <td className="whitespace-nowrap px-3 py-1.5 align-top text-xs text-muted-foreground">
        {s.locationName}
      </td>
      <td className="whitespace-nowrap px-3 py-1.5 align-top">
        <span className="text-xs text-foreground">{SCOPE_LABELS[s.scope] ?? s.scope}</span>
        {s.scopeFilter && (
          <div className="text-[10px] text-muted-foreground/70">{s.scopeFilter}</div>
        )}
      </td>
      <td className="whitespace-nowrap px-3 py-1.5 align-top">
        <span
          className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold ${STATUS_COLORS[s.status] ?? ""}`}
        >
          {STATUS_LABELS[s.status] ?? s.status}
        </span>
      </td>
      <td className="whitespace-nowrap px-3 py-1.5 text-right align-top font-mono text-xs tabular-nums text-foreground">
        {s.totalLines.toLocaleString()}
      </td>
      <td className="whitespace-nowrap px-3 py-1.5 text-right align-top">
        <span className="font-mono text-xs tabular-nums text-foreground">
          {s.countedLines.toLocaleString()}
        </span>
        {s.totalLines > 0 && (
          <span className="ml-1 text-[10px] text-muted-foreground">({progress}%)</span>
        )}
      </td>
      <td className="whitespace-nowrap px-3 py-1.5 text-right align-top font-mono text-xs tabular-nums">
        <span className={s.varianceLines > 0 ? "text-amber-600" : "text-muted-foreground"}>
          {s.varianceLines}
        </span>
      </td>
      <td className="whitespace-nowrap px-3 py-1.5 align-top text-xs text-muted-foreground">
        {s.createdByName ?? "\u2014"}
      </td>
      <td className="whitespace-nowrap px-3 py-1.5 align-top">
        <span className="text-xs text-foreground">{date}</span>
        <span className="ml-1 text-[10px] tabular-nums text-muted-foreground">{time}</span>
      </td>
      <td className="whitespace-nowrap px-3 py-1.5 text-center align-top">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onOpen();
          }}
          className="inline-flex h-6 items-center gap-1 rounded border border-border px-2 text-[10px] font-medium text-foreground transition-colors hover:bg-accent"
        >
          <Eye size={10} />
          Open
        </button>
      </td>
    </tr>
  );
}
