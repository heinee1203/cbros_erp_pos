import type { CountDetailController } from "../lib/use-count-detail-controller";
import { SummaryChip } from "./summary-chip";

type CountDetailSummaryProps = {
  controller: CountDetailController;
};

export function CountDetailSummary({ controller }: CountDetailSummaryProps) {
  const session = controller.session;
  if (!session) return null;

  return (
    <div className="flex items-center gap-4 border-b border-border bg-muted/20 px-5 py-1.5">
      <SummaryChip label="Total Items" value={session.totalLines.toLocaleString()} />
      <SummaryChip
        label="Counted"
        value={`${session.countedLines.toLocaleString()} (${controller.progress}%)`}
        color="text-blue-600"
      />
      <SummaryChip
        label="Variances"
        value={String(session.varianceLines)}
        color={session.varianceLines > 0 ? "text-amber-600" : undefined}
      />
      <SummaryChip
        label="Remaining"
        value={String(session.totalLines - session.countedLines)}
        color={
          session.totalLines - session.countedLines > 0
            ? "text-muted-foreground"
            : "text-emerald-600"
        }
      />
      <div className="ml-auto flex items-center gap-2">
        <div className="h-1.5 w-32 rounded-full bg-muted">
          <div
            className="h-1.5 rounded-full bg-primary transition-all"
            style={{ width: `${controller.progress}%` }}
          />
        </div>
        <span className="text-[10px] font-medium tabular-nums text-muted-foreground">
          {controller.progress}%
        </span>
      </div>
    </div>
  );
}
