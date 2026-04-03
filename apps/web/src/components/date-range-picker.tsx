"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Calendar, ChevronLeft, ChevronRight, Check } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ──

export interface DatePreset {
  label: string;
  getRange: () => [string, string]; // [startDate, endDate] as YYYY-MM-DD
}

interface Props {
  startDate: string; // YYYY-MM-DD
  endDate: string;
  onChange: (start: string, end: string) => void;
  presets?: DatePreset[];
  className?: string;
}

// ── Default Presets ──

function fmt(d: Date): string {
  // Use local date components to avoid UTC timezone shift (critical for UTC+8 Philippines)
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export const DEFAULT_PRESETS: DatePreset[] = [
  { label: "Today", getRange: () => { const t = fmt(new Date()); return [t, t]; } },
  { label: "Yesterday", getRange: () => { const d = new Date(); d.setDate(d.getDate() - 1); const y = fmt(d); return [y, y]; } },
  { label: "This week", getRange: () => {
    const d = new Date(); const day = d.getDay(); const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const mon = new Date(d); mon.setDate(diff); return [fmt(mon), fmt(d)];
  }},
  { label: "Last week", getRange: () => {
    const d = new Date(); const day = d.getDay(); const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const mon = new Date(d); mon.setDate(diff - 7); const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
    return [fmt(mon), fmt(sun)];
  }},
  { label: "This month", getRange: () => {
    const d = new Date(); return [fmt(new Date(d.getFullYear(), d.getMonth(), 1)), fmt(d)];
  }},
  { label: "Last month", getRange: () => {
    const d = new Date(); const first = new Date(d.getFullYear(), d.getMonth() - 1, 1);
    const last = new Date(d.getFullYear(), d.getMonth(), 0); return [fmt(first), fmt(last)];
  }},
  { label: "Last 7 days", getRange: () => { const d = new Date(); const s = new Date(d); s.setDate(s.getDate() - 6); return [fmt(s), fmt(d)]; } },
  { label: "Last 30 days", getRange: () => { const d = new Date(); const s = new Date(d); s.setDate(s.getDate() - 29); return [fmt(s), fmt(d)]; } },
  { label: "Last 3 months", getRange: () => { const d = new Date(); const s = new Date(d); s.setMonth(s.getMonth() - 3); return [fmt(s), fmt(d)]; } },
  { label: "Last 6 months", getRange: () => { const d = new Date(); const s = new Date(d); s.setMonth(s.getMonth() - 6); return [fmt(s), fmt(d)]; } },
  { label: "Last year", getRange: () => { const d = new Date(); const s = new Date(d); s.setFullYear(s.getFullYear() - 1); return [fmt(s), fmt(d)]; } },
  { label: "All time", getRange: () => ["2022-01-01", fmt(new Date())] },
];

// ── Calendar Helpers ──

const DAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

function getDaysInMonth(year: number, month: number): Date[] {
  const days: Date[] = [];
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);

  // Fill in days from previous month to align to Monday
  const startDay = first.getDay() === 0 ? 6 : first.getDay() - 1; // Monday = 0
  for (let i = startDay - 1; i >= 0; i--) {
    const d = new Date(year, month, -i);
    days.push(d);
  }

  // Days of current month
  for (let i = 1; i <= last.getDate(); i++) {
    days.push(new Date(year, month, i));
  }

  // Fill remaining to complete 6 weeks (42 days)
  while (days.length < 42) {
    days.push(new Date(year, month + 1, days.length - last.getDate() - startDay + 1));
  }

  return days;
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function isInRange(d: Date, start: Date, end: Date): boolean {
  return d >= start && d <= end;
}

// ── Component ──

export function DateRangePicker({ startDate, endDate, onChange, presets = DEFAULT_PRESETS, className }: Props) {
  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState(() => {
    const d = endDate ? new Date(endDate) : new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });
  const [draftStart, setDraftStart] = useState(startDate);
  const [draftEnd, setDraftEnd] = useState(endDate);
  const [selecting, setSelecting] = useState<"start" | "end" | "done">("done");
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Sync draft when props change
  useEffect(() => {
    if (!open) {
      setDraftStart(startDate);
      setDraftEnd(endDate);
    }
  }, [startDate, endDate, open]);

  const handleOpen = useCallback(() => {
    setDraftStart(startDate);
    setDraftEnd(endDate);
    setSelecting("done");
    const d = endDate ? new Date(endDate) : new Date();
    setViewMonth({ year: d.getFullYear(), month: d.getMonth() });
    setOpen(true);
  }, [startDate, endDate]);

  const handleDone = useCallback(() => {
    onChange(draftStart, draftEnd);
    setOpen(false);
  }, [draftStart, draftEnd, onChange]);

  const handleCancel = useCallback(() => {
    setOpen(false);
  }, []);

  const handleDayClick = useCallback((d: Date) => {
    const ds = fmt(d);
    if (selecting === "done" || selecting === "end") {
      // Start a new selection
      setDraftStart(ds);
      setDraftEnd(ds);
      setSelecting("end");
      setActivePreset(null);
    } else if (selecting === "end") {
      // Set end date
      if (ds < draftStart) {
        setDraftEnd(draftStart);
        setDraftStart(ds);
      } else {
        setDraftEnd(ds);
      }
      setSelecting("done");
      setActivePreset(null);
    }
  }, [selecting, draftStart]);

  // Actually: simpler — first click = start, second click = end
  const handleDayClickSimple = useCallback((d: Date) => {
    const ds = fmt(d);
    setActivePreset(null);
    if (selecting === "start" || selecting === "done") {
      setDraftStart(ds);
      setDraftEnd(ds);
      setSelecting("end");
    } else {
      if (ds < draftStart) {
        setDraftEnd(draftStart);
        setDraftStart(ds);
      } else {
        setDraftEnd(ds);
      }
      setSelecting("done");
    }
  }, [selecting, draftStart]);

  const handlePreset = useCallback((preset: DatePreset) => {
    const [s, e] = preset.getRange();
    setDraftStart(s);
    setDraftEnd(e);
    setActivePreset(preset.label);
    setSelecting("done");
    // Navigate calendar to the end date's month
    const d = new Date(e);
    setViewMonth({ year: d.getFullYear(), month: d.getMonth() });
  }, []);

  const days = useMemo(() => getDaysInMonth(viewMonth.year, viewMonth.month), [viewMonth]);
  const draftStartDate = useMemo(() => new Date(draftStart), [draftStart]);
  const draftEndDate = useMemo(() => new Date(draftEnd), [draftEnd]);
  const today = useMemo(() => new Date(), []);

  const monthLabel = new Date(viewMonth.year, viewMonth.month).toLocaleDateString("en-US", { month: "long", year: "numeric" });

  // Display label
  const displayLabel = useMemo(() => {
    if (activePreset) return activePreset;
    if (!startDate || !endDate) return "Select dates";
    const s = new Date(startDate);
    const e = new Date(endDate);
    const fmtShort = (d: Date) => d.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
    if (startDate === endDate) return fmtShort(s);
    return `${fmtShort(s)} – ${fmtShort(e)}`;
  }, [startDate, endDate, activePreset]);

  // Check which preset matches current selection
  const matchedPreset = useMemo(() => {
    for (const p of presets) {
      const [s, e] = p.getRange();
      if (s === startDate && e === endDate) return p.label;
    }
    return null;
  }, [startDate, endDate, presets]);

  return (
    <div ref={ref} className={cn("relative inline-block", className)}>
      {/* Trigger */}
      <button
        onClick={handleOpen}
        className="flex items-center gap-1.5 h-8 rounded-lg border border-border bg-background px-3 text-[12px] text-foreground shadow-[0_1px_2px_0_rgba(0,0,0,0.04)] hover:bg-muted transition-colors"
      >
        <Calendar size={13} className="text-muted-foreground" />
        <span>{matchedPreset || displayLabel}</span>
      </button>

      {/* Dropdown Panel */}
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 flex rounded-xl border border-border bg-background shadow-xl animate-in fade-in-0 zoom-in-95 duration-150">
          {/* Calendar */}
          <div className="p-3 w-[280px]">
            {/* Month nav */}
            <div className="flex items-center justify-between mb-2">
              <button
                onClick={() => setViewMonth(v => {
                  const d = new Date(v.year, v.month - 1);
                  return { year: d.getFullYear(), month: d.getMonth() };
                })}
                className="p-1 rounded hover:bg-muted transition-colors"
              >
                <ChevronLeft size={14} />
              </button>
              <span className="text-[13px] font-semibold">{monthLabel}</span>
              <button
                onClick={() => setViewMonth(v => {
                  const d = new Date(v.year, v.month + 1);
                  return { year: d.getFullYear(), month: d.getMonth() };
                })}
                className="p-1 rounded hover:bg-muted transition-colors"
              >
                <ChevronRight size={14} />
              </button>
            </div>

            {/* Day headers */}
            <div className="grid grid-cols-7 mb-1">
              {DAYS.map(d => (
                <div key={d} className="text-center text-[10px] font-medium text-muted-foreground py-1">{d}</div>
              ))}
            </div>

            {/* Day grid */}
            <div className="grid grid-cols-7">
              {days.map((d, i) => {
                const isCurrentMonth = d.getMonth() === viewMonth.month;
                const isToday = isSameDay(d, today);
                const isStart = isSameDay(d, draftStartDate);
                const isEnd = isSameDay(d, draftEndDate);
                const inRange = draftStart !== draftEnd && isInRange(d, draftStartDate, draftEndDate);

                return (
                  <button
                    key={i}
                    onClick={() => handleDayClickSimple(d)}
                    className={cn(
                      "h-8 w-full text-[12px] rounded-md transition-colors relative",
                      !isCurrentMonth && "text-muted-foreground/40",
                      isCurrentMonth && !isStart && !isEnd && !inRange && "text-foreground hover:bg-muted",
                      inRange && !isStart && !isEnd && "bg-primary/10",
                      (isStart || isEnd) && "bg-primary text-primary-foreground font-semibold",
                      isToday && !isStart && !isEnd && "ring-1 ring-primary/30",
                    )}
                  >
                    {d.getDate()}
                  </button>
                );
              })}
            </div>

            {/* Date display */}
            <div className="flex items-center gap-2 mt-3 pt-2 border-t border-border text-[11px]">
              <div className="flex-1">
                <div className="text-muted-foreground text-[9px] uppercase tracking-wider">Start</div>
                <div className="font-medium">{draftStart ? new Date(draftStart).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" }) : "—"}</div>
              </div>
              <div className="text-muted-foreground">→</div>
              <div className="flex-1 text-right">
                <div className="text-muted-foreground text-[9px] uppercase tracking-wider">End</div>
                <div className="font-medium">{draftEnd ? new Date(draftEnd).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" }) : "—"}</div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2 mt-3">
              <button onClick={handleCancel} className="px-3 py-1.5 text-[11px] rounded-md text-muted-foreground hover:bg-muted transition-colors">
                Cancel
              </button>
              <button onClick={handleDone} className="px-3 py-1.5 text-[11px] rounded-md bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors">
                Done
              </button>
            </div>
          </div>

          {/* Presets */}
          <div className="w-[150px] border-l border-border py-2 max-h-[380px] overflow-y-auto">
            {presets.map(p => {
              const isActive = activePreset === p.label || (!activePreset && matchedPreset === p.label);
              return (
                <button
                  key={p.label}
                  onClick={() => handlePreset(p)}
                  className={cn(
                    "w-full text-left px-3 py-1.5 text-[11px] transition-colors flex items-center gap-1.5",
                    isActive ? "text-primary font-semibold bg-primary/5" : "text-foreground hover:bg-muted",
                  )}
                >
                  {isActive && <Check size={10} className="shrink-0" />}
                  <span>{p.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
