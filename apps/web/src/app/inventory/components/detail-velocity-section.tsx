"use client";

import { useQuery } from "@tanstack/react-query";
import { TrendingUp } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";

const VELOCITY_BADGE: Record<string, { bg: string; text: string }> = {
  FAST_MOVER: { bg: "bg-emerald-500/10", text: "text-emerald-600" },
  STRATEGIC_STOCK: { bg: "bg-blue-500/10", text: "text-blue-600" },
  WATCH_LIST: { bg: "bg-amber-500/10", text: "text-amber-600" },
  DEAD_STOCK: { bg: "bg-red-500/10", text: "text-red-600" },
  NEW_ITEM: { bg: "bg-violet-500/10", text: "text-violet-600" },
  UNCATEGORIZED: { bg: "bg-muted", text: "text-muted-foreground" },
};

const VELOCITY_LABELS: Record<string, string> = {
  FAST_MOVER: "Fast Mover",
  STRATEGIC_STOCK: "Strategic Stock",
  WATCH_LIST: "Watch List",
  DEAD_STOCK: "Dead Stock",
  NEW_ITEM: "New Item",
  UNCATEGORIZED: "Uncategorized",
};

interface DetailVelocitySectionProps {
  locationId: string;
  productId: string;
  token: string;
}

export function DetailVelocitySection({
  locationId,
  productId,
  token,
}: DetailVelocitySectionProps) {
  const { data, isLoading } = useQuery<{ data: any[] }>({
    queryKey: ["item-velocity", productId],
    queryFn: () =>
      apiFetch<{ data: any[] }>(
        `/inventory/stock-monitor?productId=${productId}&limit=1`,
        { token, locationId },
      ),
    enabled: !!productId && !!token,
    staleTime: 30_000,
  });

  const velocity = data?.data?.[0] ?? null;

  return (
    <section className="mb-5">
      <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        <TrendingUp size={10} className="mb-px mr-1 inline" />
        Stock Velocity
      </h4>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((item) => (
            <div key={item} className="h-6 animate-pulse rounded-md bg-muted/30" />
          ))}
        </div>
      ) : !velocity ? (
        <p className="py-2 text-xs text-muted-foreground">No velocity data available.</p>
      ) : (
        <div className="space-y-1.5">
          <VelocityRow label="Classification">
            <span className={cn(
              "inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold",
              VELOCITY_BADGE[velocity.velocityClass]?.bg ?? "bg-muted",
              VELOCITY_BADGE[velocity.velocityClass]?.text ?? "text-muted-foreground",
            )}>
              {VELOCITY_LABELS[velocity.velocityClass] ?? velocity.velocityClass}
            </span>
          </VelocityRow>
          <VelocityRow label="Avg Daily Sales">
            <span className="text-xs font-medium tabular-nums">
              {parseFloat(velocity.avgDailySales30d ?? "0").toFixed(1)} units/day
            </span>
          </VelocityRow>
          <VelocityRow label="Days of Stock">
            <span className={cn(
              "text-xs font-medium tabular-nums",
              velocity.daysOfStock && parseFloat(velocity.daysOfStock) < 14 ? "text-red-500" : "",
            )}>
              {velocity.daysOfStock ? `${Math.round(parseFloat(velocity.daysOfStock))} days` : "\u2014"}
            </span>
          </VelocityRow>
          <VelocityRow label="Last Sold">
            <span className="text-xs font-medium">
              {velocity.lastSaleDate ? timeAgo(velocity.lastSaleDate) : "Never"}
            </span>
          </VelocityRow>
          <VelocityRow label="Sold (30d / 90d)">
            <span className="text-xs font-medium tabular-nums">
              {velocity.sold1m ?? 0} / {velocity.sold3m ?? 0} units
            </span>
          </VelocityRow>
          {velocity.avgSellingPrice && parseFloat(velocity.avgSellingPrice) > 0 && (
            <VelocityRow label="Avg Sell Price">
              <span className="text-xs font-medium tabular-nums">
                {"\u20B1"}{parseFloat(velocity.avgSellingPrice).toLocaleString("en-PH", { minimumFractionDigits: 2 })}
              </span>
            </VelocityRow>
          )}
        </div>
      )}
    </section>
  );
}

function VelocityRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-1">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}
