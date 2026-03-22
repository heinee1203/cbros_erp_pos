"use client";

import { useState } from "react";
import Link from "next/link";
import { TrendingUp, TrendingDown, AlertTriangle, DollarSign } from "lucide-react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine,
} from "recharts";
import { useAuth } from "@/app/auth-context";
import { useCashFlowForecast, type WeeklyBucket } from "@/hooks/use-cashflow";

function fmtPeso(v: number): string {
  if (Math.abs(v) >= 1_000_000) return `₱${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `₱${(v / 1_000).toFixed(0)}K`;
  return `₱${v.toLocaleString("en-PH", { minimumFractionDigits: 0 })}`;
}

function fmtPesoFull(v: number): string {
  return `₱${v.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const PERIOD_OPTIONS = [
  { label: "30 days", value: 30 },
  { label: "60 days", value: 60 },
  { label: "90 days", value: 90 },
  { label: "180 days", value: 180 },
];

export default function CashFlowForecastPage() {
  const { token, locationId, loading: authLoading } = useAuth();
  const [days, setDays] = useState(90);
  const [view, setView] = useState<"weekly" | "daily">("weekly");

  const { data, isLoading } = useCashFlowForecast(token, locationId, days);

  if (authLoading || isLoading) {
    return <div className="flex items-center justify-center py-20 text-sm text-muted-foreground">Loading forecast…</div>;
  }

  const summary = data?.summary;
  const weeklyBuckets = data?.weeklyBuckets ?? [];
  const forecast = data?.forecast ?? [];

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Cash Flow Forecast</h2>
          <p className="text-sm text-muted-foreground">Projected inflows vs outflows over the next {days} days</p>
        </div>
        <div className="flex items-center gap-2">
          {PERIOD_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setDays(opt.value)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                days === opt.value ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/80"
              }`}
            >
              {opt.label}
            </button>
          ))}
          <Link
            href="/cashflow/expenses"
            className="ml-2 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
          >
            Manage Expenses
          </Link>
        </div>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="mb-4 grid grid-cols-4 gap-3">
          <SummaryCard
            icon={TrendingUp}
            label="Total Inflows"
            value={fmtPeso(summary.totalInflows)}
            sub={`${days} days`}
            color="text-success"
          />
          <SummaryCard
            icon={TrendingDown}
            label="Total Outflows"
            value={fmtPeso(summary.totalOutflows)}
            sub={`${days} days`}
            color="text-destructive"
          />
          <SummaryCard
            icon={DollarSign}
            label="Net Flow"
            value={fmtPeso(summary.netFlow)}
            sub={summary.netFlow >= 0 ? "Positive" : "Negative"}
            color={summary.netFlow >= 0 ? "text-success" : "text-destructive"}
          />
          <SummaryCard
            icon={AlertTriangle}
            label="Danger Days"
            value={String(summary.dangerDays)}
            sub="Large outflow days"
            color={summary.dangerDays > 0 ? "text-warning" : "text-success"}
          />
        </div>
      )}

      {/* Chart */}
      <div className="mb-4 rounded-lg border border-border bg-card p-4">
        <h3 className="mb-3 text-sm font-semibold">Weekly Cash Flow</h3>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={weeklyBuckets} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
            <XAxis dataKey="week" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => fmtPeso(v)} />
            <Tooltip
              formatter={(value: number, name: string) => [fmtPesoFull(value), name]}
              labelStyle={{ fontSize: 12, fontWeight: 600 }}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <ReferenceLine y={0} stroke="#888" strokeDasharray="3 3" />
            <Bar dataKey="inflows" name="Inflows" fill="#22c55e" radius={[4, 4, 0, 0]} />
            <Bar dataKey="outflows" name="Outflows" fill="#ef4444" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Detail Table Toggle */}
      <div className="mb-2 flex gap-2">
        <button
          onClick={() => setView("weekly")}
          className={`rounded-md px-3 py-1 text-xs font-medium ${view === "weekly" ? "bg-primary text-primary-foreground" : "bg-muted"}`}
        >
          Weekly View
        </button>
        <button
          onClick={() => setView("daily")}
          className={`rounded-md px-3 py-1 text-xs font-medium ${view === "daily" ? "bg-primary text-primary-foreground" : "bg-muted"}`}
        >
          Daily View
        </button>
      </div>

      {/* Detail Table */}
      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {view === "weekly" ? "Week" : "Date"}
              </th>
              <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Inflows</th>
              <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Outflows</th>
              <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Net</th>
              <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Running Net</th>
            </tr>
          </thead>
          <tbody>
            {view === "weekly"
              ? weeklyBuckets.map((w, i) => (
                  <tr key={i} className={`border-b border-border ${i % 2 === 0 ? "bg-background" : "bg-muted/20"}`}>
                    <td className="px-3 py-2 text-xs font-medium">{w.week}</td>
                    <td className="px-3 py-2 text-right text-xs tabular-nums text-success">{fmtPesoFull(w.inflows)}</td>
                    <td className="px-3 py-2 text-right text-xs tabular-nums text-destructive">{fmtPesoFull(w.outflows)}</td>
                    <td className={`px-3 py-2 text-right text-xs tabular-nums font-medium ${w.net >= 0 ? "text-success" : "text-destructive"}`}>
                      {w.net >= 0 ? "+" : ""}{fmtPesoFull(w.net)}
                    </td>
                    <td className="px-3 py-2 text-right text-xs tabular-nums text-muted-foreground">—</td>
                  </tr>
                ))
              : forecast.map((d, i) => {
                  const hasAlerts = d.alerts.length > 0;
                  return (
                    <tr
                      key={d.date}
                      className={`border-b border-border ${hasAlerts ? "bg-warning/5" : i % 2 === 0 ? "bg-background" : "bg-muted/20"}`}
                    >
                      <td className="px-3 py-1.5 text-xs font-medium">
                        {new Date(d.date).toLocaleDateString("en-PH", { weekday: "short", month: "short", day: "numeric" })}
                        {hasAlerts && <span className="ml-1 text-warning">⚠️</span>}
                      </td>
                      <td className="px-3 py-1.5 text-right text-xs tabular-nums text-success">{fmtPesoFull(d.inflows.total)}</td>
                      <td className="px-3 py-1.5 text-right text-xs tabular-nums text-destructive">
                        {d.outflows.total > 0 ? fmtPesoFull(d.outflows.total) : "—"}
                      </td>
                      <td className={`px-3 py-1.5 text-right text-xs tabular-nums font-medium ${d.netFlow >= 0 ? "text-success" : "text-destructive"}`}>
                        {d.netFlow >= 0 ? "+" : ""}{fmtPesoFull(d.netFlow)}
                      </td>
                      <td className={`px-3 py-1.5 text-right text-xs tabular-nums ${d.runningNet >= 0 ? "text-foreground" : "text-destructive font-medium"}`}>
                        {fmtPesoFull(d.runningNet)}
                      </td>
                    </tr>
                  );
                })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SummaryCard({ icon: Icon, label, value, sub, color }: {
  icon: any; label: string; value: string; sub: string; color: string;
}) {
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="flex items-center gap-1.5">
        <Icon className={`h-3.5 w-3.5 ${color}`} />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
      </div>
      <div className={`mt-1 text-xl font-bold tabular-nums ${color}`}>{value}</div>
      <div className="text-[10px] text-muted-foreground">{sub}</div>
    </div>
  );
}
