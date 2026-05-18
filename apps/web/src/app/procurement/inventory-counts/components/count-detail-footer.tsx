import { ChevronsDown, Loader2 } from "lucide-react";

import type { CountDetailController } from "../lib/use-count-detail-controller";

type CountDetailFooterProps = {
  controller: CountDetailController;
};

export function CountDetailFooter({ controller }: CountDetailFooterProps) {
  return (
    <div className="flex items-center justify-between border-t border-border bg-muted/30 px-5 py-1.5">
      <span className="text-[11px] tabular-nums text-muted-foreground">
        {controller.lines.length} line{controller.lines.length !== 1 ? "s" : ""} shown
        {controller.hasNextPage ? " \u00c2\u00b7 more available" : ""}
      </span>
      <div className="flex items-center gap-2">
        {controller.hasNextPage && (
          <button
            onClick={controller.fetchNextPage}
            disabled={controller.isFetchingNextPage}
            className="flex h-6 items-center gap-1 rounded border border-border px-2 text-[11px] font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-50"
          >
            {controller.isFetchingNextPage ? (
              <Loader2 size={10} className="animate-spin" />
            ) : (
              <ChevronsDown size={10} />
            )}
            Load more
          </button>
        )}
        <span className="text-[10px] tabular-nums text-muted-foreground/60">
          GET /inventory/counts/:id
        </span>
      </div>
    </div>
  );
}
