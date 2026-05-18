"use client";

import { Loader2 } from "lucide-react";

import { useCountDetailController } from "../lib/use-count-detail-controller";
import { CountDetailFilters } from "./count-detail-filters";
import { CountDetailFooter } from "./count-detail-footer";
import { CountDetailHeader } from "./count-detail-header";
import { CountDetailSummary } from "./count-detail-summary";
import { CountLinesTable } from "./count-lines-table";

type CountDetailViewProps = {
  token: string;
  locationId: string;
  countId: string;
  onBack: () => void;
};

export function CountDetailView({
  token,
  locationId,
  countId,
  onBack,
}: CountDetailViewProps) {
  const controller = useCountDetailController({ countId, locationId, token });

  if (controller.isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 size={20} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (controller.isError || !controller.session) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2">
        <p className="text-xs font-medium text-destructive">Failed to load count</p>
        <p className="text-[11px] text-muted-foreground">
          {(controller.error as any)?.message ?? "Count session not found"}
        </p>
        <button onClick={onBack} className="mt-2 text-xs text-primary underline">
          Back to list
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <CountDetailHeader controller={controller} onBack={onBack} />
      <CountDetailSummary controller={controller} />
      <CountDetailFilters controller={controller} />
      <CountLinesTable controller={controller} />
      <CountDetailFooter controller={controller} />
    </div>
  );
}
