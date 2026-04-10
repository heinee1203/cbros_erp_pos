"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { ChevronLeft, ChevronRight, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";

/* ─── Types ─── */

interface DateRangePickerProps {
  startDate: string;       // ISO date string "YYYY-MM-DD" or ""
  endDate: string;         // ISO date string "YYYY-MM-DD" or ""
  onChange: (start: string, end: string) => void;
  className?: string;
}

/* ─── Helpers ─── */

function toLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function parseLocal(s: string): Date | null {
  if (!s) return null;
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function fmtDisplay(s: string): string {
  const d = parseLocal(s);
  if (!d) return "";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function startOfWeekMon(d: Date): Date {
  const day = d.getDay();
  const diff = (day === 0 ? 6 : day - 1);
  const r = new Date(d);
  r.setDate(r.getDate() - diff);
  return r;
}

function endOfWeekSun(d: Date): Date {
  const day = d.getDay();
  const diff = day === 0 ? 0 : 7 - day;
  const r = new Date(d);
  r.setDate(r.getDate() + diff);
  return r;
}

function lastDayOfMonth(y: number, m: number): number {
  return new Date(y, m + 1, 0).getDate();
}

/* ─── Presets ─── */

type PresetKey = "today" | "yesterday" | "thisWeek" | "lastWeek" | "thisMonth" | "lastMonth" | "last7" | "last30";

const PRESETS: { key: PresetKey; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "thisWeek", label: "This week" },
  { key: "lastWeek", label: "Last week" },
  { key: "thisMonth", label: "This month" },
  { key: "lastMonth", label: "Last month" },
  { key: "last7", label: "Last 7 days" },
  { key: "last30", label: "Last 30 days" },
];

function computePreset(key: PresetKey): { start: Date; end: Date } {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  switch (key) {
    case "today":
      return { start: today, end: today };
    case "yesterday": {
      const y = new Date(today);
      y.setDate(y.getDate() - 1);
      return { start: y, end: y };
    }
    case "thisWeek":
      return { start: startOfWeekMon(today), end: today };
    case "lastWeek": {
      const prevWeek = new Date(today);
      prevWeek.setDate(prevWeek.getDate() - 7);
      return { start: startOfWeekMon(prevWeek), end: endOfWeekSun(prevWeek) };
    }
    case "thisMonth":
      return { start: new Date(today.getFullYear(), today.getMonth(), 1), end: today };
    case "lastMonth": {
      const lm = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      return { start: lm, end: new Date(lm.getFullYear(), lm.getMonth(), lastDayOfMonth(lm.getFullYear(), lm.getMonth())) };
    }
    case "last7": {
      const s = new Date(today);
      s.setDate(s.getDate() - 6);
      return { start: s, end: today };
    }
    case "last30": {
      const s = new Date(today);
      s.setDate(s.getDate() - 29);
      return { start: s, end: today };
    }
  }
}

/* ─── Calendar Grid ─── */

function getCalendarDays(year: number, month: number): Date[] {
  const first = new Date(year, month, 1);
  const startDay = first.getDay();
  // Monday-based: 0=Mon..6=Sun
  const offset = startDay === 0 ? 6 : startDay - 1;
  const start = new Date(year, month, 1 - offset);
  const days: Date[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    days.push(d);
  }
  return days;
}

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAY_HEADERS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

/* ─── Component ─── */

export function DateRangePicker({ startDate, endDate, onChange, className }: DateRangePickerProps) {
  const [open, setOpen] = useState(false);
  const [tempStart, setTempStart] = useState<Date | null>(null);
  const [tempEnd, setTempEnd] = useState<Date | null>(null);
  const [viewYear, setViewYear] = useState(new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(new Date().getMonth());
  const [activePreset, setActivePreset] = useState<PresetKey | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [above, setAbove] = useState(false);
  const [alignRight, setAlignRight] = useState(false);

  // Sync temp state from props when opening
  const handleOpen = useCallback(() => {
    const s = parseLocal(startDate);
    const e = parseLocal(endDate);
    setTempStart(s);
    setTempEnd(e);
    if (s) { setViewYear(s.getFullYear()); setViewMonth(s.getMonth()); }
    setActivePreset(null);
    // Check if popup should open above or align right
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setAbove(rect.bottom + 420 > window.innerHeight && rect.top > 420);
      setAlignRight(rect.right > window.innerWidth / 2);
    }
    setOpen(true);
  }, [startDate, endDate]);

  // Click outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Escape key
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  const handleDayClick = (d: Date) => {
    if (!tempStart || (tempStart && tempEnd)) {
      // Start new selection
      setTempStart(d);
      setTempEnd(null);
      setActivePreset(null);
    } else {
      // Set end
      if (d < tempStart) {
        setTempEnd(tempStart);
        setTempStart(d);
      } else {
        setTempEnd(d);
      }
      setActivePreset(null);
    }
  };

  const handlePreset = (key: PresetKey) => {
    const { start, end } = computePreset(key);
    setTempStart(start);
    setTempEnd(end);
    setViewYear(start.getFullYear());
    setViewMonth(start.getMonth());
    setActivePreset(key);
  };

  const handleDone = () => {
    if (tempStart && tempEnd) {
      onChange(toLocal(tempStart), toLocal(tempEnd));
    } else if (tempStart) {
      onChange(toLocal(tempStart), toLocal(tempStart));
    }
    setOpen(false);
  };

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(viewYear - 1); }
    else setViewMonth(viewMonth - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(viewYear + 1); }
    else setViewMonth(viewMonth + 1);
  };

  const days = getCalendarDays(viewYear, viewMonth);
  const today = new Date();

  const displayText = startDate && endDate
    ? `${fmtDisplay(startDate)} \u2013 ${fmtDisplay(endDate)}`
    : startDate
      ? fmtDisplay(startDate)
      : "Select date range";

  return (
    <div ref={ref} className={cn("relative", className)}>
      {/* Trigger */}
      <button
        ref={triggerRef}
        onClick={() => open ? setOpen(false) : handleOpen()}
        className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-1.5 text-[12px] font-medium text-foreground shadow-sm hover:bg-muted/50 transition-colors whitespace-nowrap"
      >
        <Calendar size={13} className="text-muted-foreground" />
        <span>{displayText}</span>
      </button>

      {/* Popup */}
      {open && (
        <div
          className={cn(
            "absolute z-50 mt-1 rounded-xl border border-border bg-background shadow-xl flex",
            above ? "bottom-full mb-1" : "top-full",
            alignRight ? "right-0" : "left-0",
          )}
          style={{ minWidth: 480 }}
        >
          {/* Calendar */}
          <div className="p-3 flex-1" style={{ minWidth: 300 }}>
            {/* Month nav */}
            <div className="flex items-center justify-between mb-2">
              <button onClick={prevMonth} className="rounded p-1 hover:bg-muted transition-colors"><ChevronLeft size={16} /></button>
              <span className="text-sm font-semibold">{MONTH_NAMES[viewMonth]} {viewYear}</span>
              <button onClick={nextMonth} className="rounded p-1 hover:bg-muted transition-colors"><ChevronRight size={16} /></button>
            </div>

            {/* Day headers */}
            <div className="grid grid-cols-7 mb-1">
              {DAY_HEADERS.map((d) => (
                <div key={d} className="text-center text-[10px] font-semibold text-muted-foreground py-1">{d}</div>
              ))}
            </div>

            {/* Days */}
            <div className="grid grid-cols-7">
              {days.map((d, i) => {
                const isCurrentMonth = d.getMonth() === viewMonth;
                const isToday = isSameDay(d, today);
                const isStart = tempStart && isSameDay(d, tempStart);
                const isEnd = tempEnd && isSameDay(d, tempEnd);
                const inRange = tempStart && tempEnd && d > tempStart && d < tempEnd;

                return (
                  <button
                    key={i}
                    onClick={() => handleDayClick(d)}
                    className={cn(
                      "h-8 text-[11px] font-medium transition-colors relative",
                      !isCurrentMonth && "text-muted-foreground/40",
                      isCurrentMonth && !isStart && !isEnd && !inRange && "text-foreground hover:bg-muted",
                      inRange && "bg-primary/10 text-foreground",
                      (isStart || isEnd) && "bg-primary text-primary-foreground rounded-md font-bold",
                      isToday && !isStart && !isEnd && "ring-1 ring-primary/30 rounded-md",
                    )}
                  >
                    {d.getDate()}
                  </button>
                );
              })}
            </div>

            {/* Selected dates display */}
            <div className="flex gap-4 mt-3 pt-2 border-t border-border">
              <div className="flex-1">
                <div className="text-[10px] font-medium text-muted-foreground uppercase">Start date</div>
                <div className="text-xs font-mono mt-0.5">{tempStart ? toLocal(tempStart) : "\u2014"}</div>
              </div>
              <div className="flex-1">
                <div className="text-[10px] font-medium text-muted-foreground uppercase">End date</div>
                <div className="text-xs font-mono mt-0.5">{tempEnd ? toLocal(tempEnd) : "\u2014"}</div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2 mt-3">
              <button onClick={() => setOpen(false)} className="rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted transition-colors">
                Cancel
              </button>
              <button onClick={handleDone} className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-colors">
                Done
              </button>
            </div>
          </div>

          {/* Presets */}
          <div className="border-l border-border py-3 px-2" style={{ minWidth: 130 }}>
            {PRESETS.map((p) => (
              <button
                key={p.key}
                onClick={() => handlePreset(p.key)}
                className={cn(
                  "block w-full rounded-md px-3 py-1.5 text-left text-[11px] font-medium transition-colors",
                  activePreset === p.key
                    ? "bg-primary/10 text-primary font-semibold"
                    : "text-foreground hover:bg-muted",
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
