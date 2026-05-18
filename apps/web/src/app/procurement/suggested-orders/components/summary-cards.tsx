import { AlertTriangle, Clock, DollarSign, ShieldAlert, type LucideIcon } from "lucide-react";

import type { ReorderSummary } from "@/hooks/use-reorder";
import { cn } from "@/lib/utils";

type SummaryCardsProps = {
  summary: ReorderSummary;
  activePriority: string;
  onPriorityClick: (priority: string) => void;
};

type SummaryCard = {
  key: string;
  label: string;
  value: number | string;
  icon: LucideIcon;
  color: string;
  bg: string;
  ring: string;
  isValue?: boolean;
};

export function SummaryCards({
  summary,
  activePriority,
  onPriorityClick,
}: SummaryCardsProps) {
  const cards: SummaryCard[] = [
    {
      key: "CRITICAL",
      label: "Critical",
      value: summary.critical,
      icon: ShieldAlert,
      color: "text-red-700",
      bg: "bg-red-50",
      ring: "ring-red-200",
    },
    {
      key: "URGENT",
      label: "Urgent",
      value: summary.urgent,
      icon: AlertTriangle,
      color: "text-orange-700",
      bg: "bg-orange-50",
      ring: "ring-orange-200",
    },
    {
      key: "NORMAL",
      label: "Normal",
      value: summary.normal,
      icon: Clock,
      color: "text-yellow-700",
      bg: "bg-yellow-50",
      ring: "ring-yellow-200",
    },
    {
      key: "TOTAL_VALUE",
      label: "Total Value",
      value: `₱${summary.totalValue.toLocaleString()}`,
      icon: DollarSign,
      color: "text-foreground",
      bg: "bg-muted",
      ring: "ring-border",
      isValue: true,
    },
  ];

  return (
    <div className="border-b border-border bg-background px-6 py-3">
      <div className="flex items-center gap-3">
        {cards.map((card) => {
          const Icon = card.icon;

          return (
            <button
              key={card.key}
              onClick={() => !card.isValue && onPriorityClick(card.key)}
              className={cn(
                "flex items-center gap-2 rounded-lg border px-3 py-2 text-left transition-all hover:shadow-sm",
                !card.isValue && activePriority === card.key
                  ? `${card.bg} border-transparent ring-2 ${card.ring}`
                  : "border-border bg-background hover:bg-muted/30",
                card.isValue && "cursor-default",
              )}
            >
              <Icon size={14} className={card.color} />
              <div>
                <div className={cn("text-sm font-semibold tabular-nums", card.color)}>
                  {typeof card.value === "number" ? card.value.toLocaleString() : card.value}
                </div>
                <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  {card.label}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
