import { ClipboardList, Plus } from "lucide-react";
import type { BackordersPageController } from "../lib/use-backorders-page-controller";

type BackordersPageHeaderProps = {
  controller: BackordersPageController;
};

export function BackordersPageHeader({ controller }: BackordersPageHeaderProps) {
  return (
    <div className="border-b border-border bg-background px-6 py-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
            <ClipboardList size={18} className="text-muted-foreground" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-foreground">Backorders</h1>
            <p className="text-xs text-muted-foreground">
              Track and manage items on backorder from suppliers
            </p>
          </div>
        </div>
        <button
          onClick={() => controller.setNewModal(true)}
          className="flex h-8 items-center gap-1.5 rounded-md bg-blue-600 px-3 text-xs font-medium text-white transition-colors hover:bg-blue-700"
        >
          <Plus size={12} />
          New Backorder
        </button>
      </div>
    </div>
  );
}
