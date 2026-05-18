import { ClipboardCheck, Loader2 } from "lucide-react";

import type { CountListController } from "../lib/use-count-list-controller";
import { CountSessionListRow } from "./count-session-list-row";

type CountListContentProps = {
  controller: CountListController;
  onSelectCount: (id: string) => void;
};

export function CountListContent({
  controller,
  onSelectCount,
}: CountListContentProps) {
  return (
    <div className="flex-1 overflow-auto">
      {controller.isLoading ? (
        <div className="flex h-48 items-center justify-center">
          <Loader2 size={18} className="animate-spin text-muted-foreground" />
        </div>
      ) : controller.isError ? (
        <div className="flex h-48 flex-col items-center justify-center gap-1 text-center">
          <p className="text-xs font-medium text-destructive">Failed to load counts</p>
          <p className="text-[11px] text-muted-foreground">
            {(controller.error as any)?.message ?? "Check API connection"}
          </p>
        </div>
      ) : controller.sessions.length === 0 ? (
        <CountListEmptyState hasFilters={controller.hasFilters} />
      ) : (
        <CountSessionsTable
          controller={controller}
          onSelectCount={onSelectCount}
        />
      )}
    </div>
  );
}

function CountListEmptyState({ hasFilters }: { hasFilters: boolean }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 py-16 text-center">
      <ClipboardCheck size={20} className="text-muted-foreground/40" />
      <p className="text-xs font-medium text-muted-foreground">
        {hasFilters ? "No counts match filters" : "No count sessions yet"}
      </p>
      <p className="text-[11px] text-muted-foreground/60">
        {hasFilters
          ? "Broaden criteria or clear filters."
          : "Create a new count session to begin."}
      </p>
    </div>
  );
}

function CountSessionsTable({
  controller,
  onSelectCount,
}: CountListContentProps) {
  return (
    <table className="w-full border-collapse text-left">
      <thead className="sticky top-0 z-10 border-b border-border bg-muted/60">
        <tr className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          <th scope="col" className="whitespace-nowrap px-3 py-2">
            Count
          </th>
          <th scope="col" className="whitespace-nowrap px-3 py-2">
            Location
          </th>
          <th scope="col" className="whitespace-nowrap px-3 py-2">
            Scope
          </th>
          <th scope="col" className="whitespace-nowrap px-3 py-2">
            Status
          </th>
          <th scope="col" className="whitespace-nowrap px-3 py-2 text-right">
            Items
          </th>
          <th scope="col" className="whitespace-nowrap px-3 py-2 text-right">
            Counted
          </th>
          <th scope="col" className="whitespace-nowrap px-3 py-2 text-right">
            Variances
          </th>
          <th scope="col" className="whitespace-nowrap px-3 py-2">
            Created By
          </th>
          <th scope="col" className="whitespace-nowrap px-3 py-2">
            Created
          </th>
          <th scope="col" className="whitespace-nowrap px-3 py-2 text-center">
            Action
          </th>
        </tr>
      </thead>
      <tbody>
        {controller.sessions.map((session, index) => (
          <CountSessionListRow
            key={session.id}
            session={session}
            odd={index % 2 === 1}
            onOpen={() => onSelectCount(session.id)}
          />
        ))}
      </tbody>
    </table>
  );
}
