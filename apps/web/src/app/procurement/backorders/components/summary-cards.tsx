"use client";

import { CalendarClock, ClipboardList, Clock, Users } from "lucide-react";

import { cn } from "@/lib/utils";

import type { BackorderSummary } from "../types";

export function SummaryCards({ summary }: { summary: BackorderSummary }) {
  const cards = [
    {
      label: "Pending Backorders",
      value: summary.pendingTotal,
      icon: <ClipboardList size={16} />,
      color: "text-amber-700",
    },
    {
      label: "Suppliers with Pending",
      value: summary.suppliersWithPending,
      icon: <Users size={16} />,
      color: "text-blue-700",
    },
    {
      label: "Oldest Pending",
      value: summary.oldestPendingDays > 0 ? `${summary.oldestPendingDays}d` : "--",
      icon: <Clock size={16} />,
      color: summary.oldestPendingDays > 14 ? "text-red-700" : "text-gray-700",
    },
    {
      label: "Needed This Week",
      value: summary.neededThisWeek,
      icon: <CalendarClock size={16} />,
      color: summary.neededThisWeek > 0 ? "text-orange-700" : "text-gray-700",
    },
  ];

  return (
    <div className="border-b border-border bg-background px-6 py-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {cards.map((card) => (
          <div
            key={card.label}
            className="bg-white rounded-xl border shadow-sm p-5 flex items-start gap-3"
          >
            <div className={cn("mt-0.5", card.color)}>{card.icon}</div>
            <div>
              <div className={cn("text-xl font-bold tabular-nums", card.color)}>
                {typeof card.value === "number" ? card.value.toLocaleString() : card.value}
              </div>
              <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mt-0.5">
                {card.label}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
