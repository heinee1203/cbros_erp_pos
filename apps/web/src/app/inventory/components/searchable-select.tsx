"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { Search, X, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = "Select\u2026",
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [highlightIdx, setHighlightIdx] = useState(0);

  const selectedLabel = options.find((o) => o.value === value)?.label ?? "";

  const filtered = useMemo(() => {
    if (!query.trim()) return options;
    const q = query.toLowerCase();
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  // Reset highlight when filtered list changes
  useEffect(() => { setHighlightIdx(0); }, [filtered.length]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Scroll highlighted item into view
  useEffect(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current.children[highlightIdx] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [highlightIdx, open]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "Enter") { setOpen(true); e.preventDefault(); }
      return;
    }
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setHighlightIdx((i) => Math.min(i + 1, filtered.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlightIdx((i) => Math.max(i - 1, 0));
        break;
      case "Enter":
        e.preventDefault();
        if (filtered[highlightIdx]) {
          onChange(filtered[highlightIdx].value);
          setOpen(false);
          setQuery("");
        }
        break;
      case "Escape":
        e.preventDefault();
        setOpen(false);
        setQuery("");
        break;
    }
  };

  const handleSelect = (val: string) => {
    onChange(val);
    setOpen(false);
    setQuery("");
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          if (!open) setTimeout(() => inputRef.current?.focus(), 0);
        }}
        className={cn(
          "flex h-8 items-center gap-1 rounded-lg border bg-background px-2.5 text-[12px] shadow-[0_1px_2px_0_rgba(0,0,0,0.04)] outline-none transition-colors",
          open
            ? "border-primary/40 ring-2 ring-primary/[0.08]"
            : "border-border hover:border-border/80",
          value ? "text-foreground" : "text-muted-foreground",
        )}
      >
        <span className="max-w-[150px] truncate">
          {value ? selectedLabel : placeholder}
        </span>
        {value ? (
          <span
            role="button"
            onClick={(e) => { e.stopPropagation(); onChange(""); }}
            className="ml-0.5 rounded p-0.5 text-muted-foreground hover:text-foreground"
          >
            <X size={10} />
          </span>
        ) : (
          <ChevronsUpDown size={11} className="shrink-0 text-muted-foreground/50" />
        )}
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-[260px] rounded-lg border border-border bg-background shadow-lg animate-in fade-in slide-in-from-top-1 duration-100">
          <div className="border-b border-border px-2 py-1.5">
            <div className="relative">
              <Search size={12} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Search sub-categories\u2026"
                className="h-7 w-full rounded-md bg-muted/50 pl-7 pr-2 text-[12px] text-foreground outline-none placeholder:text-muted-foreground/50"
                autoComplete="off"
              />
            </div>
          </div>
          <div ref={listRef} className="max-h-[240px] overflow-y-auto py-1" role="listbox">
            {/* "All" option */}
            <div
              role="option"
              aria-selected={value === ""}
              onClick={() => handleSelect("")}
              className={cn(
                "flex cursor-pointer items-center px-3 py-1.5 text-[12px] transition-colors",
                !value ? "bg-primary/[0.06] font-medium text-foreground" : "text-muted-foreground hover:bg-accent/60",
                highlightIdx === 0 && !query.trim() && "bg-accent/60",
              )}
            >
              {placeholder}
            </div>

            {filtered.length === 0 ? (
              <div className="px-3 py-4 text-center text-[11px] text-muted-foreground">
                No sub-categories match &ldquo;{query}&rdquo;
              </div>
            ) : (
              filtered.map((opt, idx) => (
                <div
                  key={opt.value}
                  role="option"
                  aria-selected={opt.value === value}
                  onClick={() => handleSelect(opt.value)}
                  className={cn(
                    "flex cursor-pointer items-center px-3 py-1.5 text-[12px] transition-colors",
                    opt.value === value
                      ? "bg-primary/[0.06] font-medium text-foreground"
                      : "text-foreground hover:bg-accent/60",
                    idx === highlightIdx && "bg-accent/60",
                  )}
                >
                  <span className="truncate">{opt.label}</span>
                </div>
              ))
            )}
          </div>
          <div className="border-t border-border px-3 py-1 text-[10px] text-muted-foreground/60 tabular-nums">
            {filtered.length} of {options.length} sub-categories
          </div>
        </div>
      )}
    </div>
  );
}
