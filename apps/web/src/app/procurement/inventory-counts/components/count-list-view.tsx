"use client";

import { useCountListController } from "../lib/use-count-list-controller";
import { CountListContent } from "./count-list-content";
import { CountListFooter } from "./count-list-footer";
import { CountListHeader } from "./count-list-header";
import { CountListToolbar } from "./count-list-toolbar";

type CountListViewProps = {
  token: string;
  locationId: string;
  onSelectCount: (id: string) => void;
  onCreateNew: () => void;
};

export function CountListView({
  token,
  locationId,
  onSelectCount,
  onCreateNew,
}: CountListViewProps) {
  const controller = useCountListController({ locationId, token });

  return (
    <div className="flex h-full flex-col">
      <CountListHeader onCreateNew={onCreateNew} />
      <CountListToolbar controller={controller} />
      <CountListContent
        controller={controller}
        onSelectCount={onSelectCount}
      />
      <CountListFooter controller={controller} />
    </div>
  );
}
