import {
  Ban,
  Check,
  ChevronLeft,
  FileText,
  Send,
} from "lucide-react";

import type { CountDetailController } from "../lib/use-count-detail-controller";
import { SCOPE_LABELS, STATUS_COLORS, STATUS_LABELS } from "../constants";

type CountDetailHeaderProps = {
  controller: CountDetailController;
  onBack: () => void;
};

export function CountDetailHeader({
  controller,
  onBack,
}: CountDetailHeaderProps) {
  const session = controller.session;
  if (!session) return null;

  return (
    <div className="flex items-center justify-between border-b border-border bg-background px-5 py-1.5">
      <div className="flex items-center gap-2.5">
        <button
          onClick={onBack}
          className="flex h-6 w-6 items-center justify-center rounded hover:bg-accent"
          title="Back to list"
        >
          <ChevronLeft size={14} className="text-muted-foreground" />
        </button>
        <div>
          <h1 className="text-sm font-semibold text-foreground">
            {session.label}
          </h1>
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
            <span>{session.locationName}</span>
            <span>{"\u00c2\u00b7"}</span>
            <span>{SCOPE_LABELS[session.scope] ?? session.scope}</span>
            {session.scopeFilter && (
              <>
                <span>{"\u00c2\u00b7"}</span>
                <span>{session.scopeFilter}</span>
              </>
            )}
          </div>
        </div>
      </div>
      <CountDetailActions controller={controller} />
    </div>
  );
}

function CountDetailActions({ controller }: { controller: CountDetailController }) {
  const session = controller.session;
  if (!session) return null;

  return (
    <div className="flex items-center gap-2">
      <span
        className={`rounded px-2 py-0.5 text-[10px] font-semibold ${STATUS_COLORS[session.status] ?? ""}`}
      >
        {STATUS_LABELS[session.status] ?? session.status}
      </span>
      {session.status === "IN_PROGRESS" && (
        <button
          onClick={controller.completeCount}
          disabled={controller.transitionPending}
          className="flex h-7 items-center gap-1 rounded border border-border px-2.5 text-[11px] font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-50"
        >
          <Check size={12} />
          Finish Counting
        </button>
      )}
      {session.status === "COMPLETED" && (
        <button
          onClick={controller.reviewCount}
          disabled={controller.transitionPending}
          className="flex h-7 items-center gap-1 rounded border border-violet-300 bg-violet-50 px-2.5 text-[11px] font-medium text-violet-700 transition-colors hover:bg-violet-100 disabled:opacity-50 dark:border-violet-700 dark:bg-violet-900/30 dark:text-violet-400"
        >
          <FileText size={12} />
          Mark Reviewed
        </button>
      )}
      {session.status === "REVIEWED" && (
        <button
          onClick={controller.postCount}
          disabled={controller.transitionPending}
          className="flex h-7 items-center gap-1 rounded border border-emerald-300 bg-emerald-50 px-2.5 text-[11px] font-medium text-emerald-700 transition-colors hover:bg-emerald-100 disabled:opacity-50 dark:border-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
        >
          <Send size={12} />
          Post Variances
        </button>
      )}
      {controller.isEditable && (
        <button
          onClick={controller.cancelCount}
          disabled={controller.transitionPending}
          className="flex h-7 items-center gap-1 rounded border border-border px-2 text-[11px] text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:hover:bg-red-900/20"
        >
          <Ban size={12} />
          Cancel
        </button>
      )}
    </div>
  );
}
