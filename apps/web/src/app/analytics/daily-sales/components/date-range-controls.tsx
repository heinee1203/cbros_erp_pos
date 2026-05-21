"use client";

import type { ChangeEvent } from "react";
import { Calendar } from "lucide-react";

import { cn } from "@/lib/utils";

import { PRESETS } from "../constants";
import type { GroupBy, Preset } from "../types";

type DateRangeControlsProps = {
  dateRange: { from: string; to: string };
  activePreset: string | null;
  groupBy: GroupBy;
  onCustomDate: (
    key: "from" | "to",
  ) => (event: ChangeEvent<HTMLInputElement>) => void;
  onPreset: (preset: Preset) => void;
  onGroupByChange: (groupBy: GroupBy) => void;
};

export function DateRangeControls({
  dateRange,
  activePreset,
  groupBy,
  onCustomDate,
  onPreset,
  onGroupByChange,
}: DateRangeControlsProps) {
  return (
    <div className="mb-4 rounded-xl border border-border bg-background p-3 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
      <div className="flex flex-wrap items-center gap-2">
        <Calendar size={14} className="text-muted-foreground" />
        <input
          type="date"
          value={dateRange.from}
          onChange={onCustomDate("from")}
          className="h-8 rounded-lg border border-border bg-background px-2 text-[12px] text-foreground outline-none focus:border-primary/40"
        />
        <span className="text-[12px] text-muted-foreground">&rarr;</span>
        <input
          type="date"
          value={dateRange.to}
          onChange={onCustomDate("to")}
          className="h-8 rounded-lg border border-border bg-background px-2 text-[12px] text-foreground outline-none focus:border-primary/40"
        />
        <div className="mx-2 h-5 w-px bg-border" />
        <div className="flex flex-wrap items-center gap-1">
          {PRESETS.map((preset) => (
            <button
              key={preset.label}
              onClick={() => onPreset(preset)}
              className={cn(
                "rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors",
                activePreset === preset.label
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/70",
              )}
            >
              {preset.label}
            </button>
          ))}
        </div>
        <div className="mx-2 h-5 w-px bg-border" />
        <label className="text-[11px] text-muted-foreground">Group:</label>
        <select
          value={groupBy}
          onChange={(event) => onGroupByChange(event.target.value as GroupBy)}
          className="h-8 rounded-lg border border-border bg-background px-2 text-[12px] outline-none"
        >
          <option value="day">Day</option>
          <option value="week">Week</option>
          <option value="month">Month</option>
          <option value="quarter">Quarter</option>
          <option value="year">Year</option>
        </select>
      </div>
    </div>
  );
}
