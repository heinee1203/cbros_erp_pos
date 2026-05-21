import { Camera, Check, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

import { MIN_MONTH } from "../constants";
import { fmtMonthLong } from "../formatters";
import type { MonthlyCompareMode } from "../types";

type CopyState = "idle" | "copying" | "copied" | "downloaded" | "failed";

export function MonthlySalesToolbar({
  month,
  nowMonth,
  compareMode,
  copyState,
  hasData,
  canStepBack,
  canStepForward,
  onStepMonth,
  onMonthChange,
  onCompareModeChange,
  onCopy,
}: {
  month: string;
  nowMonth: string;
  compareMode: MonthlyCompareMode;
  copyState: CopyState;
  hasData: boolean;
  canStepBack: boolean;
  canStepForward: boolean;
  onStepMonth: (delta: number) => void;
  onMonthChange: (month: string) => void;
  onCompareModeChange: (mode: MonthlyCompareMode) => void;
  onCopy: () => void;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-muted/20 px-4 py-1.5">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onStepMonth(-1)}
          disabled={!canStepBack}
          className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
          title="Previous month (\u2190)"
        >
          <ChevronLeft size={14} />
        </button>
        <input
          type="month"
          value={month}
          onChange={(e) => {
            const v = e.target.value;
            if (v && v >= MIN_MONTH && v <= nowMonth) onMonthChange(v);
          }}
          min={MIN_MONTH}
          max={nowMonth}
          className="h-8 rounded-md border border-border bg-background px-2 text-[12px] font-medium outline-none focus:border-primary/40"
        />
        <button
          type="button"
          onClick={() => onStepMonth(1)}
          disabled={!canStepForward}
          className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
          title="Next month (\u2192)"
        >
          <ChevronRight size={14} />
        </button>
        <div className="ml-2 hidden flex-col leading-tight sm:flex">
          <span className="text-[13px] font-bold text-foreground">{fmtMonthLong(month)}</span>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            \u2190 \u2192 arrow keys
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-2 text-[11px] font-medium text-muted-foreground">
          Compare:
          <select
            value={compareMode}
            onChange={(e) => onCompareModeChange(e.target.value as MonthlyCompareMode)}
            className="h-8 rounded-md border border-border bg-background px-2 text-[11px] font-medium outline-none focus:border-primary/40"
          >
            <option value="none">None</option>
            <option value="mom">Previous Month (MoM)</option>
            <option value="yoy">Same Month Last Year (YoY)</option>
            <option value="both">Both</option>
          </select>
        </label>
        {hasData && (
          <button
            type="button"
            onClick={onCopy}
            disabled={copyState === "copying"}
            className={cn(
              "flex h-8 items-center gap-1.5 rounded-md border px-3 text-[11px] font-medium transition-colors",
              copyState === "copied" || copyState === "downloaded"
                ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                : copyState === "failed"
                  ? "border-red-500 bg-red-50 text-red-700"
                  : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
              copyState === "copying" && "cursor-wait opacity-70",
            )}
            title="Copy as image \u2014 paste directly into Viber/Messenger"
          >
            {copyState === "copying" ? (
              <Loader2 size={12} className="animate-spin" />
            ) : copyState === "copied" || copyState === "downloaded" ? (
              <Check size={12} />
            ) : (
              <Camera size={12} />
            )}
            {copyState === "copying"
              ? "Copying\u2026"
              : copyState === "copied"
                ? "Copied!"
                : copyState === "downloaded"
                  ? "Downloaded"
                  : copyState === "failed"
                    ? "Failed"
                    : "Copy"}
          </button>
        )}
      </div>
    </div>
  );
}
