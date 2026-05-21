import Link from "next/link";
import { BarChart3 } from "lucide-react";
import {
  Bar,
  BarChart as RechartsBarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { GrossSalesChartPoint, ReportsDateRange } from "../types";
import { fmtRangeLabel } from "../utils";

type GrossSalesChartProps = {
  chartData: GrossSalesChartPoint[];
  range: ReportsDateRange;
  isLoading: boolean;
  onTryAllLocations: () => void;
};

export function GrossSalesChart({
  chartData,
  range,
  isLoading,
  onTryAllLocations,
}: GrossSalesChartProps) {
  return (
    <div className="rounded-xl border border-border bg-background p-6 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-[15px] font-semibold text-foreground">Gross Sales</h2>
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <span className="inline-block h-3 w-3 rounded-sm bg-emerald-500" />
          Daily Revenue
        </div>
      </div>
      {isLoading ? (
        <div className="h-[320px] animate-pulse rounded-lg bg-muted/30" />
      ) : chartData.length === 0 ? (
        <div className="flex h-[320px] flex-col items-center justify-center py-12 text-center">
          <BarChart3 className="mb-3 h-10 w-10 text-muted-foreground/40" />
          <p className="text-[14px] font-medium text-foreground">
            No sales recorded for {fmtRangeLabel(range.from, range.to)}
          </p>
          <p className="mt-2 max-w-sm text-[12px] leading-relaxed text-muted-foreground">
            This could mean no completed transactions in the POS app, sales were made at a different
            location, or the date range doesn&apos;t include any business days.
          </p>
          <div className="mt-4 flex items-center gap-3">
            <Link
              href="/sales/shifts"
              className="rounded-md border border-border px-3 py-1.5 text-[12px] font-medium text-foreground transition-colors hover:bg-muted"
            >
              View Shift History
            </Link>
            <button
              onClick={onTryAllLocations}
              className="rounded-md border border-border px-3 py-1.5 text-[12px] font-medium text-foreground transition-colors hover:bg-muted"
            >
              Try All Locations
            </button>
          </div>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={320}>
          <RechartsBarChart data={chartData} margin={{ top: 8, right: 8, left: 4, bottom: 4 }}>
            <defs>
              <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10B981" />
                <stop offset="100%" stopColor="#059669" />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 12, fill: "#6B7280" }}
              axisLine={false}
              tickLine={false}
              dy={8}
              interval={0}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "#9CA3AF" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(value: number) =>
                value >= 1000000
                  ? `\u20B1${(value / 1000000).toFixed(1)}M`
                  : value >= 1000
                    ? `\u20B1${(value / 1000).toFixed(0)}k`
                    : `\u20B1${value}`
              }
              width={65}
            />
            <Tooltip
              cursor={{ fill: "rgba(16, 185, 129, 0.06)" }}
              content={({ active, payload, label }: any) => {
                if (!active || !payload?.length) return null;
                return (
                  <div
                    style={{
                      background: "#fff",
                      border: "1px solid #E5E7EB",
                      borderRadius: 10,
                      boxShadow: "0 4px 16px rgba(0,0,0,0.10)",
                      padding: "10px 14px",
                    }}
                  >
                    <p style={{ color: "#6B7280", fontSize: 11, marginBottom: 4 }}>{label}</p>
                    <p style={{ color: "#111827", fontSize: 16, fontWeight: 700 }}>
                      {"\u20B1"}
                      {Number(payload[0].value).toLocaleString("en-PH", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </p>
                  </div>
                );
              }}
            />
            <Bar dataKey="grossSales" fill="url(#barGradient)" radius={[6, 6, 0, 0]} maxBarSize={48} />
          </RechartsBarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
