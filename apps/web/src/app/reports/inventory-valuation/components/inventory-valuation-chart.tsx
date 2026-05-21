import {
  Bar,
  BarChart as RechartsBarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { GroupByOption, ValuationTotals } from "@/hooks/use-inventory-valuation";
import { CHART_COLORS, fmtCompact, fmtCurrency } from "../utils";
import type { ValuationChartSlice } from "../types";

type InventoryValuationChartProps = {
  chartData: ValuationChartSlice[];
  totals: ValuationTotals | undefined;
  groupBy: GroupByOption;
  isLoading: boolean;
};

export function InventoryValuationChart({
  chartData,
  totals,
  groupBy,
  isLoading,
}: InventoryValuationChartProps) {
  if (isLoading || chartData.length === 0) return null;

  return (
    <div className="mb-4 rounded-xl border border-border bg-background p-4 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
      {groupBy === "location" ? (
        <ResponsiveContainer width="100%" height={Math.max(200, chartData.length * 48)}>
          <RechartsBarChart data={chartData} layout="vertical" margin={{ left: 10, right: 30, top: 5, bottom: 5 }}>
            <XAxis type="number" tickFormatter={(value) => fmtCompact(value)} tick={{ fontSize: 11 }} />
            <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 11 }} />
            <Tooltip content={<ChartTooltip />} />
            <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={28}>
              {chartData.map((_, index) => (
                <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />
              ))}
            </Bar>
          </RechartsBarChart>
        </ResponsiveContainer>
      ) : (
        <div className="flex items-center gap-6">
          <div className="relative flex-shrink-0">
            <ResponsiveContainer width={220} height={220}>
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={2}
                  dataKey="value"
                  stroke="none"
                >
                  {chartData.map((entry, index) => (
                    <Cell key={index} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-[10px] text-muted-foreground">Cost Value</span>
              <span className="text-[16px] font-bold text-foreground">{fmtCompact(totals?.costValue ?? 0)}</span>
            </div>
          </div>
          <div className="flex-1 space-y-2">
            {chartData.map((slice, index) => (
              <div key={index} className="flex items-center gap-2 text-[12px]">
                <span className="h-3 w-3 flex-shrink-0 rounded-sm" style={{ background: slice.fill }} />
                <span className="flex-1 truncate font-medium text-foreground">{slice.name}</span>
                <span className="tabular-nums text-muted-foreground">{fmtCompact(slice.value)}</span>
                <span className="w-12 text-right tabular-nums text-muted-foreground">{slice.pctOfTotal}%</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

type ChartTooltipProps = {
  active?: boolean;
  payload?: Array<{
    payload: {
      groupName?: string;
      name?: string;
      costValue?: number;
      value: number;
      pctOfTotal?: number;
    };
  }>;
};

function ChartTooltip({ active, payload }: ChartTooltipProps) {
  if (!active || !payload?.[0]) return null;
  const datum = payload[0].payload;
  return (
    <div className="rounded-lg border border-border bg-background px-3 py-2 text-[12px] shadow-lg">
      <p className="mb-1 font-semibold text-foreground">{datum.groupName || datum.name}</p>
      <p className="text-muted-foreground">
        Cost: <span className="font-medium text-foreground">{fmtCurrency(datum.costValue || datum.value)}</span>
      </p>
      {datum.pctOfTotal != null && <p className="text-muted-foreground">{datum.pctOfTotal}% of total</p>}
    </div>
  );
}
