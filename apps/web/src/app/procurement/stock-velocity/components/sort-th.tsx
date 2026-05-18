import { cn } from "@/lib/utils";
import type { SortDir, SortField } from "../types";

type SortThProps = {
  label: string;
  field?: SortField;
  current?: SortField;
  dir?: SortDir;
  onSort?: (field: SortField) => void;
  align?: "right";
  tooltip?: string;
};

export function SortTh({
  label,
  field,
  current,
  dir,
  onSort,
  align,
  tooltip,
}: SortThProps) {
  const isSorted = field && current === field;

  return (
    <th
      className={cn(
        "whitespace-nowrap px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground",
        field && "cursor-pointer hover:text-foreground select-none",
        align === "right" && "text-right",
      )}
      onClick={field && onSort ? () => onSort(field) : undefined}
      title={tooltip}
    >
      {label}
      {isSorted && <span className="ml-0.5">{dir === "asc" ? "↑" : "↓"}</span>}
    </th>
  );
}
