"use client";

import { ChevronDown, ChevronsUpDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SortDir, SortField } from "@/hooks/use-products";

type SortableHeaderProps = {
  label: string;
  field: SortField;
  activeField: SortField;
  activeDir: SortDir;
  onSort: (field: SortField) => void;
  align?: "left" | "right";
};

export function SortableHeader({
  label,
  field,
  activeField,
  activeDir,
  onSort,
  align = "left",
}: SortableHeaderProps) {
  const isActive = field === activeField;

  return (
    <button
      onClick={() => onSort(field)}
      className={cn(
        "group inline-flex items-center gap-0.5 text-[10px] font-semibold uppercase tracking-wider transition-colors select-none",
        isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground",
        align === "right" && "flex-row-reverse",
      )}
    >
      {label}
      <span className="inline-flex w-3 justify-center">
        {isActive ? (
          activeDir === "asc" ? (
            <ChevronUp size={11} className="text-primary" strokeWidth={2.5} />
          ) : (
            <ChevronDown size={11} className="text-primary" strokeWidth={2.5} />
          )
        ) : (
          <ChevronsUpDown
            size={11}
            className="text-muted-foreground/30 group-hover:text-muted-foreground/60"
          />
        )}
      </span>
    </button>
  );
}
