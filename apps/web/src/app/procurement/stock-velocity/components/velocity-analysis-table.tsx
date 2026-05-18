"use client";

import { useMemo, type ReactNode } from "react";

import type { StockMonitorRow } from "@/hooks/use-stock-monitor";
import { cn } from "@/lib/utils";

type HeatmapStyle = {
  bg: string;
  fg: string;
};

type UrgencyLevel = "" | "critical" | "warning" | "ok" | "nosales";

type LeftFilters = {
  all: string;
  m12: string;
  m6: string;
  m3: string;
  m1: string;
};

type VelocityAnalysisTableProps = {
  rows: StockMonitorRow[];
  sortBy?: string;
  sortDir?: string;
  onSort?: (field: string) => void;
  leftFilters?: LeftFilters;
  onLeftFilterChange?: (window: string, value: string) => void;
  onClearLeftFilters?: () => void;
  totalCount?: number;
};

const TREND_CONFIG: Record<string, { icon: string; color: string; label: string }> = {
  ACCELERATING: { icon: "↑", color: "text-green-600", label: "Accel" },
  STABLE: { icon: "→", color: "text-muted-foreground", label: "Stable" },
  DECELERATING: { icon: "↓", color: "text-red-600", label: "Decel" },
  STALLED: { icon: "⏸", color: "text-muted-foreground/50", label: "Stalled" },
};

function getBlueHeatmap(value: number, max: number): HeatmapStyle {
  if (max === 0 || value === 0) return { bg: "transparent", fg: "inherit" };
  const intensity = Math.min(value / max, 1);
  const alpha = 0.1 + intensity * 0.75;
  return {
    bg: `rgba(66, 133, 244, ${alpha.toFixed(2)})`,
    fg: intensity > 0.5 ? "#ffffff" : "inherit",
  };
}

function formatRelativeDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  if (diffDays < 180) return `${Math.floor(diffDays / 30)}mo ago`;
  return d.toLocaleDateString("en-PH", { month: "short", year: "numeric" });
}

function getMonthsLeftColor(value: number | null): HeatmapStyle {
  if (value === null) return { bg: "transparent", fg: "inherit" };
  if (value > 3) return { bg: "transparent", fg: "inherit" };

  if (value <= 0.5) {
    const intensity = 0.5 + (1 - value / 0.5) * 0.4;
    return { bg: `rgba(181, 101, 29, ${intensity.toFixed(2)})`, fg: "#ffffff" };
  }

  if (value <= 1.5) {
    const intensity = 0.3 + (1 - (value - 0.5) / 1.0) * 0.4;
    return { bg: `rgba(212, 160, 23, ${intensity.toFixed(2)})`, fg: "#000000" };
  }

  const intensity = 0.2 + (1 - (value - 1.5) / 1.5) * 0.3;
  return { bg: `rgba(198, 142, 23, ${intensity.toFixed(2)})`, fg: "#000000" };
}

function renderMonthsLeft(stock: number, monthsLeft: number | null): ReactNode {
  if (stock === 0) {
    return (
      <span className="inline-flex rounded bg-red-100 px-1 py-px text-[9px] font-bold text-red-700">
        OUT
      </span>
    );
  }
  if (monthsLeft === null) return "∞";
  if (monthsLeft === 0) {
    return (
      <span className="inline-flex rounded bg-gray-100 px-1 py-px text-[9px] font-semibold text-gray-600">
        NO DEMAND
      </span>
    );
  }
  return monthsLeft.toFixed(1);
}

function UrgencySelect({
  value,
  onChange,
  label,
}: {
  value: UrgencyLevel;
  onChange: (value: UrgencyLevel) => void;
  label: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as UrgencyLevel)}
      className={cn(
        "h-5 w-full rounded border text-[9px] outline-none px-0.5",
        value ? "border-amber-400 bg-amber-50 font-medium" : "border-transparent bg-transparent",
      )}
      title={`Filter ${label}`}
    >
      <option value="">All</option>
      <option value="critical">🔴 Crit</option>
      <option value="warning">🟡 Warn</option>
      <option value="ok">🟢 OK</option>
      <option value="nosales">⚪ None</option>
    </select>
  );
}

export function VelocityAnalysisTable({
  rows,
  sortBy,
  sortDir,
  onSort,
  leftFilters,
  onLeftFilterChange,
  onClearLeftFilters,
  totalCount,
}: VelocityAnalysisTableProps) {
  const filterAll = (leftFilters?.all || "") as UrgencyLevel;
  const filter12m = (leftFilters?.m12 || "") as UrgencyLevel;
  const filter6m = (leftFilters?.m6 || "") as UrgencyLevel;
  const filter3m = (leftFilters?.m3 || "") as UrgencyLevel;
  const filter1m = (leftFilters?.m1 || "") as UrgencyLevel;
  const hasWindowFilters = filterAll || filter12m || filter6m || filter3m || filter1m;

  const filteredRows = rows;
  const maxSoldAll = useMemo(
    () => Math.max(...filteredRows.map((row) => row.totalQtySold || 0), 1),
    [filteredRows],
  );
  const maxSold12m = useMemo(
    () => Math.max(...filteredRows.map((row) => row.sold12m || 0), 1),
    [filteredRows],
  );
  const maxSold6m = useMemo(
    () => Math.max(...filteredRows.map((row) => row.sold6m || 0), 1),
    [filteredRows],
  );
  const maxSold3m = useMemo(
    () => Math.max(...filteredRows.map((row) => row.sold3m || 0), 1),
    [filteredRows],
  );
  const maxSold1m = useMemo(
    () => Math.max(...filteredRows.map((row) => row.sold1m || 0), 1),
    [filteredRows],
  );

  if (rows.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center rounded-lg border border-border py-12 text-muted-foreground text-sm">
        No velocity data — click Recompute
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto rounded-lg border border-border">
      <table className="w-full text-xs">
        <thead className="sticky top-0 z-10 bg-muted/80 backdrop-blur">
          <tr>
            <th
              className="whitespace-nowrap px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground cursor-pointer hover:text-foreground select-none"
              onClick={() => onSort?.("productName")}
            >
              Product {sortBy === "productName" ? (sortDir === "asc" ? "↑" : "↓") : ""}
            </th>
            <th className="whitespace-nowrap px-2 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Stock</th>
            <th className="whitespace-nowrap px-2 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground" title="Average selling price per unit">Avg Price</th>
            <th className="whitespace-nowrap px-2 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-emerald-600" title="Suggested sell price (age + inflation adjusted)">Sugg. Price</th>
            <th className="whitespace-nowrap px-2 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-blue-600" title="Units sold all time">ALL</th>
            <th className="whitespace-nowrap px-2 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-blue-600" title="Units sold in last 12 months">12M</th>
            <th className="whitespace-nowrap px-2 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-blue-600" title="Units sold in last 6 months">6M</th>
            <th className="whitespace-nowrap px-2 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-blue-600" title="Units sold in last 3 months">3M</th>
            <th className="whitespace-nowrap px-2 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-blue-600" title="Units sold in last 1 month">1M</th>
            <th className="whitespace-nowrap px-2 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground" title="Average units sold per month over the selected window (30/90/180/365d). Computed from stock_metrics.avg_daily_sales_Xd × 30.">DEMAND</th>
            <th className="whitespace-nowrap px-2 py-1 text-right text-[10px] font-semibold uppercase tracking-wider text-amber-600" title="Months of stock left at all-time rate">
              <div>Left ALL</div>
              <UrgencySelect value={filterAll} onChange={(value) => onLeftFilterChange?.("all", value)} label="Left ALL" />
            </th>
            <th className="whitespace-nowrap px-2 py-1 text-right text-[10px] font-semibold uppercase tracking-wider text-amber-600" title="Months of stock left at 12-month rate">
              <div>Left 12M</div>
              <UrgencySelect value={filter12m} onChange={(value) => onLeftFilterChange?.("12m", value)} label="Left 12M" />
            </th>
            <th className="whitespace-nowrap px-2 py-1 text-right text-[10px] font-semibold uppercase tracking-wider text-amber-600" title="Months of stock left at 6-month rate">
              <div>Left 6M</div>
              <UrgencySelect value={filter6m} onChange={(value) => onLeftFilterChange?.("6m", value)} label="Left 6M" />
            </th>
            <th className="whitespace-nowrap px-2 py-1 text-right text-[10px] font-semibold uppercase tracking-wider text-amber-600" title="Months of stock left at 3-month rate">
              <div>Left 3M</div>
              <UrgencySelect value={filter3m} onChange={(value) => onLeftFilterChange?.("3m", value)} label="Left 3M" />
            </th>
            <th className="whitespace-nowrap px-2 py-1 text-right text-[10px] font-semibold uppercase tracking-wider text-amber-600" title="Months of stock left at 1-month rate">
              <div>Left 1M</div>
              <UrgencySelect value={filter1m} onChange={(value) => onLeftFilterChange?.("1m", value)} label="Left 1M" />
            </th>
            <th className="whitespace-nowrap px-2 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Trend</th>
            <th className="whitespace-nowrap px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Last Sold</th>
          </tr>
          {hasWindowFilters && (
            <tr className="bg-amber-50/50">
              <td colSpan={4} className="px-3 py-1 text-[10px] text-amber-700">
                LEFT column filters active — showing {filteredRows.length} items{totalCount ? ` of ${totalCount.toLocaleString()}` : ""}
              </td>
              <td colSpan={14} className="px-3 py-1 text-right">
                <button onClick={() => onClearLeftFilters?.()} className="text-[10px] text-amber-700 hover:underline">Clear filters</button>
              </td>
            </tr>
          )}
        </thead>
        <tbody>
          {filteredRows.map((row, index) => {
            const sAll = getBlueHeatmap(row.totalQtySold || 0, maxSoldAll);
            const s12 = getBlueHeatmap(row.sold12m || 0, maxSold12m);
            const s6 = getBlueHeatmap(row.sold6m || 0, maxSold6m);
            const s3 = getBlueHeatmap(row.sold3m || 0, maxSold3m);
            const s1 = getBlueHeatmap(row.sold1m || 0, maxSold1m);

            const avgMonthAll = parseFloat(row.avgDailySalesAll || "0") * 30;
            const mlAll = avgMonthAll > 0 ? row.totalStock / avgMonthAll : null;
            const ml12 = row.monthsLeft12m ? parseFloat(row.monthsLeft12m) : null;
            const ml6 = row.monthsLeft6m ? parseFloat(row.monthsLeft6m) : null;
            const ml3 = row.monthsLeft3m ? parseFloat(row.monthsLeft3m) : null;
            const ml1 = row.monthsLeft1m ? parseFloat(row.monthsLeft1m) : null;

            const cAll = getMonthsLeftColor(mlAll);
            const c12 = getMonthsLeftColor(ml12);
            const c6 = getMonthsLeftColor(ml6);
            const c3 = getMonthsLeftColor(ml3);
            const c1 = getMonthsLeftColor(ml1);

            const trend = TREND_CONFIG[row.velocityTrend || ""] ?? TREND_CONFIG.STABLE;

            return (
              <tr key={`${row.id}-${index}`} className="border-b border-border/40 transition-colors hover:bg-muted/30">
                <td className="max-w-[220px] px-3 py-1.5">
                  <div className="flex items-center gap-1">
                    <span className="truncate font-medium text-foreground text-[11px]" title={row.productName}>{row.productName}</span>
                    {row.specialOrder && <span className="shrink-0 rounded bg-blue-100 px-1 py-px text-[8px] font-medium text-blue-700">SO</span>}
                    {row.discontinued && <span className="shrink-0 rounded bg-gray-200 px-1 py-px text-[8px] font-medium text-gray-600">DC</span>}
                  </div>
                  <div className="text-[9px] font-mono text-muted-foreground">{row.productSku}</div>
                </td>
                <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums font-semibold">{row.totalStock}</td>
                <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                  {row.avgSellingPrice ? `₱${parseFloat(row.avgSellingPrice).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}
                </td>
                <td
                  className={cn(
                    "whitespace-nowrap px-2 py-1.5 text-right tabular-nums font-medium",
                    row.suggestedSellPrice && row.avgSellingPrice && parseFloat(row.suggestedSellPrice) > parseFloat(row.avgSellingPrice) * 1.5
                      ? "text-green-600"
                      : row.suggestedSellPrice && row.avgSellingPrice && parseFloat(row.suggestedSellPrice) < parseFloat(row.avgSellingPrice)
                        ? "text-red-600"
                        : "text-emerald-600",
                  )}
                  title={
                    row.suggestedSellPrice && row.inflationAdjustedCost
                      ? `Age: ${row.stockAgeMonths ?? 0}mo · Adj cost: ₱${parseFloat(row.inflationAdjustedCost).toLocaleString("en-PH", { minimumFractionDigits: 2 })} · Markup: ${row.appliedMarkupPct}%`
                      : undefined
                  }
                >
                  {row.suggestedSellPrice ? `₱${parseFloat(row.suggestedSellPrice).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}
                </td>
                <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums" style={{ backgroundColor: sAll.bg, color: sAll.fg }}>{row.totalQtySold || 0}</td>
                <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums" style={{ backgroundColor: s12.bg, color: s12.fg }}>{row.sold12m || 0}</td>
                <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums" style={{ backgroundColor: s6.bg, color: s6.fg }}>{row.sold6m || 0}</td>
                <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums" style={{ backgroundColor: s3.bg, color: s3.fg }}>{row.sold3m || 0}</td>
                <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums" style={{ backgroundColor: s1.bg, color: s1.fg }}>{row.sold1m || 0}</td>
                <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums text-muted-foreground">{parseFloat(row.avgMonth12m || "0").toFixed(1)}</td>
                <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums" style={{ backgroundColor: cAll.bg, color: cAll.fg }}>{renderMonthsLeft(row.totalStock, mlAll)}</td>
                <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums" style={{ backgroundColor: c12.bg, color: c12.fg }}>{renderMonthsLeft(row.totalStock, ml12)}</td>
                <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums" style={{ backgroundColor: c6.bg, color: c6.fg }}>{renderMonthsLeft(row.totalStock, ml6)}</td>
                <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums" style={{ backgroundColor: c3.bg, color: c3.fg }}>{renderMonthsLeft(row.totalStock, ml3)}</td>
                <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums" style={{ backgroundColor: c1.bg, color: c1.fg }}>{renderMonthsLeft(row.totalStock, ml1)}</td>
                <td className="whitespace-nowrap px-2 py-1.5 text-center">
                  <span
                    className={cn("text-[11px] font-medium", trend.color)}
                    title={`${row.velocityTrend}: ${parseFloat(row.avgMonth3m || "0").toFixed(1)}/mo (3m) vs ${parseFloat(row.avgMonth12m || "0").toFixed(1)}/mo (12m)`}
                  >
                    {trend.icon} {trend.label}
                  </span>
                </td>
                <td
                  className={cn(
                    "whitespace-nowrap px-2 py-1.5 text-[11px]",
                    row.daysSinceLastSale !== null && row.daysSinceLastSale > 180
                      ? "text-muted-foreground/50"
                      : "text-muted-foreground",
                  )}
                >
                  {row.lastSaleDate ? formatRelativeDate(row.lastSaleDate) : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
