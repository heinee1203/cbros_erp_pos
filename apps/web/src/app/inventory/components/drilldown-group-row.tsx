import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

type DrilldownGroupRowProps = {
  colCount: number;
  icon?: ReactNode;
  indentPx: number;
  isExpanded: boolean;
  meta: string;
  name: string;
  onToggle: () => void;
  rowClassName?: string;
  titleClassName?: string;
};

export function DrilldownGroupRow({
  colCount,
  icon,
  indentPx,
  isExpanded,
  meta,
  name,
  onToggle,
  rowClassName,
  titleClassName,
}: DrilldownGroupRowProps) {
  return (
    <tr
      onClick={onToggle}
      className={cn("cursor-pointer transition-colors duration-75", rowClassName)}
    >
      <td className="w-9 px-2 py-[6px]" />
      <td colSpan={colCount - 1} className="px-3 py-[6px]">
        <div className="flex items-center gap-2" style={{ paddingLeft: `${indentPx}px` }}>
          <ChevronRight
            size={13}
            className={cn(
              "shrink-0 text-muted-foreground transition-transform duration-150",
              isExpanded && "rotate-90",
            )}
          />
          {icon}
          <span className={titleClassName}>{name}</span>
          <span className="ml-auto text-[11px] text-muted-foreground tabular-nums">
            {meta}
          </span>
        </div>
      </td>
    </tr>
  );
}
