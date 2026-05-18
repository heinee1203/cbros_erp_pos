import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { STATUS_TABS } from "../constants";
import type { BackordersPageController } from "../lib/use-backorders-page-controller";

type BackordersToolbarProps = {
  controller: BackordersPageController;
};

export function BackordersToolbar({ controller }: BackordersToolbarProps) {
  return (
    <div className="border-b border-border bg-background/50 px-6 py-3">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-1">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => controller.setActiveTab(tab.key)}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                controller.activeTab === tab.key
                  ? "bg-blue-600 text-white"
                  : "border border-gray-300 text-gray-700 hover:bg-gray-50",
              )}
            >
              {tab.label}
              {tab.key === "PENDING" && controller.summary ? (
                <span className="ml-1.5 rounded-full bg-white/20 px-1.5 py-0.5 text-[10px]">
                  {controller.summary.pendingTotal}
                </span>
              ) : null}
            </button>
          ))}
        </div>

        <div className="relative">
          <Search
            size={14}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            type="text"
            value={controller.searchQuery}
            onChange={(event) => controller.setSearchQuery(event.target.value)}
            placeholder="Search product, SKU, PO..."
            className="h-8 w-64 rounded-md border border-border bg-background pl-8 pr-3 text-xs text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-primary focus:ring-1 focus:ring-primary/20"
          />
          {controller.searchQuery && (
            <button
              onClick={() => controller.setSearchQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X size={12} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
