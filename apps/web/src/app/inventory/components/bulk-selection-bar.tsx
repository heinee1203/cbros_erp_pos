"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowUpDown, Download, Trash2 } from "lucide-react";

interface BulkOption {
  id: string;
  name: string;
  categoryId?: string | null;
}

interface BulkDropdownProps {
  label: string;
  options: BulkOption[];
  onSelect: (id: string) => void;
}

function BulkDropdown({ label, options, onSelect }: BulkDropdownProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState({ left: 0, bottom: 0 });

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node) && !(btnRef.current && btnRef.current.contains(e.target as Node))) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setPos({ left: rect.left, bottom: window.innerHeight - rect.top + 4 });
    }
  }, [open]);

  const filtered = options.filter((option) =>
    option.name.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <>
      <button
        ref={btnRef}
        onClick={() => setOpen(!open)}
        className="shrink-0 rounded-md border border-border bg-background px-2 py-0.5 text-[11px] font-medium text-foreground transition-colors hover:bg-muted"
      >
        {label}
      </button>
      {open && typeof document !== "undefined" && createPortal(
        <div
          ref={ref}
          style={{ position: "fixed", left: pos.left, bottom: pos.bottom, zIndex: 100000 }}
          className="w-56 rounded-lg border border-border bg-background shadow-xl"
        >
          <div className="p-2">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`Search ${label.toLowerCase()}...`}
              className="w-full rounded border border-border bg-background px-2 py-1.5 text-xs text-foreground"
              autoFocus
            />
          </div>
          <div className="max-h-48 overflow-y-auto">
            {filtered.length === 0 && (
              <div className="px-3 py-2 text-xs text-muted-foreground">No results</div>
            )}
            {filtered.map((option) => (
              <button
                key={option.id}
                onClick={() => { onSelect(option.id); setOpen(false); setSearch(""); }}
                className="w-full px-3 py-1.5 text-left text-xs transition-colors hover:bg-accent"
              >
                {option.name}
              </button>
            ))}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

interface BulkSelectionBarProps {
  selectedCount: number;
  isCollapsed: boolean;
  deletePending: boolean;
  categoryOptions: BulkOption[];
  brandOptions: BulkOption[];
  familyOptions: BulkOption[];
  subcategoryOptions: BulkOption[];
  onDelete: () => void;
  onExportSelected: () => void;
  onBulkUpdate: (updates: Record<string, string | boolean>) => void;
  onOpenAvailability: () => void;
  onOpenSerialTracking: () => void;
  onOpenFindReplace: () => void;
  onClearSelection: () => void;
}

export function BulkSelectionBar({
  selectedCount,
  isCollapsed,
  deletePending,
  categoryOptions,
  brandOptions,
  familyOptions,
  subcategoryOptions,
  onDelete,
  onExportSelected,
  onBulkUpdate,
  onOpenAvailability,
  onOpenSerialTracking,
  onOpenFindReplace,
  onClearSelection,
}: BulkSelectionBarProps) {
  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 99999,
        transform: selectedCount > 0 ? "translateY(0)" : "translateY(100%)",
        transition: "transform 200ms ease-out",
        background: "#ffffff",
        borderTop: "2px solid hsl(var(--primary))",
        boxShadow: "0 -6px 24px rgba(0,0,0,0.18)",
      }}
    >
      <div className="flex items-center gap-2.5 overflow-x-auto px-5 py-3" style={{ marginLeft: isCollapsed ? 64 : 252 }}>
        <span className="shrink-0 rounded-md bg-primary px-2.5 py-0.5 text-[12px] font-bold tabular-nums text-primary-foreground">
          {selectedCount}
        </span>
        <span className="shrink-0 text-[12px] font-medium text-foreground">selected</span>
        <div className="h-4 w-px shrink-0 bg-border" />
        <button
          onClick={onDelete}
          disabled={deletePending}
          className="flex shrink-0 items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
        >
          <Trash2 size={12} />
          {deletePending ? "Deleting..." : "Delete"}
        </button>
        <button onClick={onExportSelected} className="flex shrink-0 items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-medium text-foreground transition-colors hover:bg-muted">
          <Download size={12} />
          Export
        </button>
        <button className="flex shrink-0 items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-medium text-foreground transition-colors hover:bg-muted">
          <ArrowUpDown size={12} />
          Adjust
        </button>
        <div className="h-4 w-px shrink-0 bg-border" />
        <BulkDropdown label="Category" options={categoryOptions} onSelect={(id) => onBulkUpdate({ categoryId: id })} />
        <BulkDropdown label="Brand" options={brandOptions} onSelect={(id) => onBulkUpdate({ brandId: id })} />
        <BulkDropdown label="Family" options={familyOptions} onSelect={(id) => onBulkUpdate({ familyId: id })} />
        <BulkDropdown
          label="Subcategory"
          options={subcategoryOptions}
          onSelect={(id) => {
            const subcategory = subcategoryOptions.find((option) => option.id === id);
            if (subcategory?.categoryId) {
              onBulkUpdate({ subcategoryId: id, categoryId: subcategory.categoryId });
            } else {
              onBulkUpdate({ subcategoryId: id });
            }
          }}
        />
        <button
          onClick={onOpenAvailability}
          className="shrink-0 whitespace-nowrap rounded bg-muted px-2.5 py-1 text-[11px] font-medium text-foreground transition-colors hover:bg-muted/80"
        >
          Available for Sale
        </button>
        <select
          onChange={(e) => {
            if (!e.target.value) return;
            onBulkUpdate({ specialOrder: e.target.value === "mark" });
            e.target.value = "";
          }}
          className="shrink-0 rounded bg-muted px-2.5 py-1 text-[11px] font-medium text-foreground transition-colors hover:bg-muted/80"
          value=""
        >
          <option value="">Special Order</option>
          <option value="mark">Mark as Special Order</option>
          <option value="unmark">Remove Special Order</option>
        </select>
        <select
          onChange={(e) => {
            if (!e.target.value) return;
            onBulkUpdate({ discontinued: e.target.value === "mark" });
            e.target.value = "";
          }}
          className="shrink-0 rounded bg-muted px-2.5 py-1 text-[11px] font-medium text-foreground transition-colors hover:bg-muted/80"
          value=""
        >
          <option value="">Discontinued</option>
          <option value="mark">Mark as Discontinued</option>
          <option value="unmark">Remove Discontinued</option>
        </select>
        <button
          onClick={onOpenSerialTracking}
          className="shrink-0 whitespace-nowrap rounded bg-muted px-2.5 py-1 text-[11px] font-medium text-foreground transition-colors hover:bg-muted/80"
        >
          Item Tracking
        </button>
        <button
          onClick={onOpenFindReplace}
          className="shrink-0 rounded bg-muted px-2.5 py-1 text-[11px] font-medium text-foreground transition-colors hover:bg-muted/80"
        >
          Find & Replace
        </button>
        <div className="flex-1" />
        <button
          onClick={onClearSelection}
          className="shrink-0 rounded-md border border-border px-3 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          Clear
        </button>
      </div>
    </div>,
    document.body,
  );
}
