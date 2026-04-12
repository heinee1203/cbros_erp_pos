"use client";

/**
 * Sales Report — unified page that wraps the Daily and Monthly sales views
 * behind a simple tab switcher. The two views are large standalone
 * components (each with their own state, fetching, compare modes, and
 * copy-as-image pipelines) — this page is just a shell.
 *
 * Active tab is synced to the URL via `?view=daily|monthly` so the tab
 * selection is bookmarkable and shareable. Default is "daily".
 */

import { useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { DailySalesView } from "../daily-sales/view";
import { MonthlySalesView } from "../monthly-sales/view";

type SalesReportTab = "daily" | "monthly";

function parseTab(raw: string | null): SalesReportTab {
  return raw === "monthly" ? "monthly" : "daily";
}

export default function SalesReportPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeTab = useMemo(
    () => parseTab(searchParams?.get("view") ?? null),
    [searchParams],
  );

  const setTab = useCallback(
    (next: SalesReportTab) => {
      if (next === activeTab) return;
      const params = new URLSearchParams(searchParams?.toString() ?? "");
      params.set("view", next);
      // Strip the other view's params so switching tabs doesn't leave
      // stale state in the URL (the daily view has none of its own today,
      // but the monthly view persists `?month=YYYY-MM`).
      if (next === "daily") params.delete("month");
      router.replace(`?${params.toString()}`, { scroll: false });
    },
    [activeTab, router, searchParams],
  );

  return (
    <div className="flex h-full flex-col">
      {/* Tab switcher — underline pill style, matches the rest of the ERP */}
      <div className="mb-4 flex items-center gap-1 border-b border-border">
        <TabButton
          label="Daily"
          active={activeTab === "daily"}
          onClick={() => setTab("daily")}
        />
        <TabButton
          label="Monthly"
          active={activeTab === "monthly"}
          onClick={() => setTab("monthly")}
        />
      </div>

      <div className="flex-1">
        {activeTab === "daily" ? <DailySalesView /> : <MonthlySalesView />}
      </div>
    </div>
  );
}

function TabButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative -mb-px px-4 py-2 text-[13px] font-semibold transition-colors",
        active
          ? "border-b-2 border-primary text-foreground"
          : "border-b-2 border-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}
