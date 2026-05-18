import type { ReactNode } from "react";
import { AlertTriangle, Archive, Package, PackageX, ShieldAlert, TrendingUp } from "lucide-react";

import type { StockMonitorSummary } from "@/hooks/use-stock-monitor";
import { cn } from "@/lib/utils";

type SummaryCardConfig = {
  key: string;
  label: string;
  value: number;
  icon: ReactNode;
  color: string;
  bg: string;
  ring: string;
};

type SummaryCardsProps = {
  summary: StockMonitorSummary;
  activeStatus: string;
  onStatusClick: (status: string) => void;
};

export function SummaryCards({ summary, activeStatus, onStatusClick }: SummaryCardsProps) {
  const cards: SummaryCardConfig[] = [
    { key: "CRITICAL", label: "Critical", value: summary.critical, icon: <ShieldAlert size={14} />, color: "text-red-700", bg: "bg-red-50", ring: "ring-red-200" },
    { key: "LOW", label: "Low", value: summary.low, icon: <AlertTriangle size={14} />, color: "text-amber-700", bg: "bg-amber-50", ring: "ring-amber-200" },
    { key: "HEALTHY", label: "Healthy", value: summary.healthy, icon: <TrendingUp size={14} />, color: "text-green-700", bg: "bg-green-50", ring: "ring-green-200" },
    { key: "OVERSTOCK", label: "Overstock", value: summary.overstock, icon: <Package size={14} />, color: "text-blue-700", bg: "bg-blue-50", ring: "ring-blue-200" },
    { key: "DEAD_STOCK", label: "Dead Stock", value: summary.deadStock, icon: <Archive size={14} />, color: "text-gray-600", bg: "bg-gray-50", ring: "ring-gray-200" },
    { key: "OUT_OF_STOCK", label: "Out of Stock", value: summary.outOfStock, icon: <PackageX size={14} />, color: "text-slate-800", bg: "bg-slate-100", ring: "ring-slate-300" },
  ];

  return (
    <div className="border-b border-border bg-background px-6 py-3">
      <div className="flex items-center gap-3">
        {cards.map((card) => (
          <button
            key={card.key}
            onClick={() => onStatusClick(card.key)}
            className={cn(
              "flex items-center gap-2 rounded-lg border px-3 py-2 text-left transition-all hover:shadow-sm",
              activeStatus === card.key
                ? `${card.bg} border-transparent ring-2 ${card.ring}`
                : "border-border bg-background hover:bg-muted/30",
            )}
          >
            <span className={card.color}>{card.icon}</span>
            <div>
              <div className={cn("text-sm font-semibold tabular-nums", card.color)}>
                {card.value.toLocaleString()}
              </div>
              <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                {card.label}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
