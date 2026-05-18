import { ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";

import { cn } from "@/lib/utils";
import type { SortDir, SortField } from "@/hooks/use-stock-levels";

type SortHeaderProps = {
  label: string;
  field: SortField;
  currentSort: SortField;
  currentDir: SortDir;
  onSort: (field: SortField) => void;
  align?: "left" | "right";
};

export function SortHeader({
  label,
  field,
  currentSort,
  currentDir,
  onSort,
  align = "left",
}: SortHeaderProps) {
  const isActive = currentSort === field;

  return (
    <th
      scope="col"
      className={cn(
        "cursor-pointer select-none whitespace-nowrap px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground",
        align === "right" && "text-right",
        isActive && "text-foreground",
      )}
      onClick={() => onSort(field)}
    >
      <span className={cn("inline-flex items-center gap-1", align === "right" && "justify-end")}>
        {label}
        {isActive ? (
          currentDir === "asc" ? <ChevronUp size={12} /> : <ChevronDown size={12} />
        ) : (
          <ChevronsUpDown size={12} className="opacity-30" />
        )}
      </span>
    </th>
  );
}
