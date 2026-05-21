"use client";

import { useCallback, useState } from "react";
import { DollarSign } from "lucide-react";
import { cn } from "@/lib/utils";
import { TABS, type TabId } from "./constants";
import { BulkUpdateTab } from "./components/bulk-update-tab";
import { DeadStockTab } from "./components/dead-stock-tab";
import { MarginAlertsTab } from "./components/margin-alerts-tab";
import { PriceHistoryTab } from "./components/price-history-tab";

/* ═══════════════════════════════════════════════════════
 * HELPERS
 * ═══════════════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════════════
 * PAGE
 * ═══════════════════════════════════════════════════════ */

export default function PriceManagementPage() {
  const [activeTab, setActiveTab] = useState<TabId>(() => {
    if (typeof window === "undefined") return "bulk";
    const params = new URLSearchParams(window.location.search);
    const tab = params.get("tab");
    if (tab && TABS.some((t) => t.id === tab)) return tab as TabId;
    return "bulk";
  });

  const handleTabChange = useCallback((tab: TabId) => {
    setActiveTab(tab);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", tab);
    window.history.replaceState({}, "", url.toString());
  }, []);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border bg-background px-6 py-5">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
            <DollarSign size={18} className="text-muted-foreground" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-foreground">Price Management</h1>
            <p className="text-xs text-muted-foreground">
              Bulk pricing, margin monitoring, and clearance management
            </p>
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-border px-6">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => handleTabChange(tab.id)}
            className={cn(
              "px-4 py-1.5 text-sm font-medium border-b-2 -mb-px transition-colors",
              activeTab === tab.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-auto">
        {activeTab === "bulk" && <BulkUpdateTab />}
        {activeTab === "margins" && <MarginAlertsTab />}
        {activeTab === "dead-stock" && <DeadStockTab />}
        {activeTab === "history" && <PriceHistoryTab />}
      </div>
    </div>
  );
}
