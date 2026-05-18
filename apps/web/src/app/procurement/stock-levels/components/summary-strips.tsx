import { AlertTriangle, Archive, Package, PackageX, ShieldAlert, ShoppingCart } from "lucide-react";
import type { ReactNode } from "react";

import type { ProductStockSummary, StockLevelsSummary } from "@/hooks/use-stock-levels";
import { MetricCard } from "@/components/ui/workbench";

export function ProductSummaryStrip({ summary }: { summary: ProductStockSummary }) {
  const margin = summary.totalSellValue - summary.totalCostValue;

  return (
    <section className="surface-card overflow-hidden rounded-2xl">
      <div className="grid gap-px bg-border/70 sm:grid-cols-2 lg:grid-cols-5">
        {([
          { label: "Products", value: summary.totalProducts.toLocaleString() },
          { label: "In Stock", value: summary.inStock.toLocaleString(), color: "text-success" },
          {
            label: "Low Stock",
            value: summary.lowStock.toLocaleString(),
            color: "text-warning",
            highlight: summary.lowStock > 0,
          },
          {
            label: "Out of Stock",
            value: summary.outOfStock.toLocaleString(),
            color: "text-destructive",
            highlight: summary.outOfStock > 0,
          },
          {
            label: "Below Reorder",
            value: summary.belowReorder.toLocaleString(),
            color: "text-orange-500",
            highlight: summary.belowReorder > 0,
          },
        ]).map((card) => (
          <MetricCard key={card.label} {...card} />
        ))}
      </div>
      {summary.totalCostValue > 0 && (
        <div className="grid gap-px border-t border-border/70 bg-border/70 sm:grid-cols-3">
          <MetricCard
            label="Total Cost Value"
            value={`₱${summary.totalCostValue.toLocaleString("en-PH", { maximumFractionDigits: 0 })}`}
          />
          <MetricCard
            label="Total Sell Value"
            value={`₱${summary.totalSellValue.toLocaleString("en-PH", { maximumFractionDigits: 0 })}`}
            color="text-primary"
          />
          <MetricCard
            label="Potential Margin"
            value={`₱${margin.toLocaleString("en-PH", { maximumFractionDigits: 0 })}`}
            color="text-success"
          />
        </div>
      )}
    </section>
  );
}

export function SummaryStrip({ summary }: { summary: StockLevelsSummary }) {
  return (
    <section className="surface-card overflow-hidden rounded-2xl px-4 py-3">
      <div className="flex flex-wrap items-center gap-3 md:gap-5">
        <SummaryChip
          icon={<Package size={13} />}
          label="Total Items"
          value={summary.totalSkus.toLocaleString()}
          color="text-foreground"
        />
        <div className="h-5 w-px bg-border" />
        <SummaryChip
          icon={<Archive size={13} />}
          label="In Stock"
          value={summary.inStock.toLocaleString()}
          color="text-success"
        />
        <SummaryChip
          icon={<AlertTriangle size={13} />}
          label="Low Stock"
          value={summary.lowStock.toLocaleString()}
          color="text-warning"
          highlight={summary.lowStock > 0}
        />
        <SummaryChip
          icon={<PackageX size={13} />}
          label="Out of Stock"
          value={summary.outOfStock.toLocaleString()}
          color="text-destructive"
          highlight={summary.outOfStock > 0}
        />
        <div className="h-5 w-px bg-border" />
        <SummaryChip
          icon={<ShieldAlert size={13} />}
          label="Below Reorder"
          value={summary.belowReorder.toLocaleString()}
          color="text-warning"
          highlight={summary.belowReorder > 0}
        />
        <SummaryChip
          icon={<Package size={13} />}
          label="Reserved"
          value={summary.totalReserved.toLocaleString()}
          color="text-muted-foreground"
        />
        {summary.totalCostValue > 0 && (
          <>
            <div className="h-5 w-px bg-border" />
            <SummaryChip
              icon={<ShoppingCart size={13} />}
              label="Cost Value"
              value={`₱${summary.totalCostValue.toLocaleString("en-PH", {
                minimumFractionDigits: 0,
                maximumFractionDigits: 0,
              })}`}
              color="text-foreground"
            />
            <SummaryChip
              icon={<ShoppingCart size={13} />}
              label="Sell Value"
              value={`₱${summary.totalSellValue.toLocaleString("en-PH", {
                minimumFractionDigits: 0,
                maximumFractionDigits: 0,
              })}`}
              color="text-primary"
            />
            <SummaryChip
              icon={<ShoppingCart size={13} />}
              label="Potential Margin"
              value={`₱${(summary.totalSellValue - summary.totalCostValue).toLocaleString("en-PH", {
                minimumFractionDigits: 0,
                maximumFractionDigits: 0,
              })}`}
              color="text-success"
            />
          </>
        )}
      </div>
    </section>
  );
}

function SummaryChip({
  icon,
  label,
  value,
  color,
  highlight,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  color: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className={color}>{icon}</span>
      <div className="flex items-baseline gap-1.5">
        <span
          className={`text-sm font-semibold tabular-nums ${color} ${
            highlight ? "animate-pulse" : ""
          }`}
        >
          {value}
        </span>
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
      </div>
    </div>
  );
}
