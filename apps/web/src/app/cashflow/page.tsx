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
      <div className="mb-4 rounded-xl border border-border bg-background p-6 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
        <div className="mb-5 flex items-center justify-between">
          <h3 className="text-[15px] font-semibold text-foreground">Weekly Cash Flow</h3>
          <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-sm bg-emerald-500" />Inflows</span>
            <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-sm bg-rose-500" />Outflows</span>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={weeklyBuckets} margin={{ top: 8, right: 8, left: 4, bottom: 4 }}>
            <defs>
              <linearGradient id="inflowGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10B981" />
                <stop offset="100%" stopColor="#059669" />
              </linearGradient>
              <linearGradient id="outflowGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#F43F5E" />
                <stop offset="100%" stopColor="#E11D48" />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
            <XAxis dataKey="week" tick={{ fontSize: 12, fill: "#6B7280" }} axisLine={false} tickLine={false} dy={8} />
            <YAxis tick={{ fontSize: 11, fill: "#9CA3AF" }} axisLine={false} tickLine={false} tickFormatter={(v) => fmtPeso(v)} width={65} />
            <Tooltip
              cursor={{ fill: "rgba(0,0,0,0.03)" }}
              content={({ active, payload, label }: any) => {
                if (!active || !payload?.length) return null;
                return (
                  <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 10, padding: "10px 14px", boxShadow: "0 4px 16px rgba(0,0,0,0.10)" }}>
                    <p style={{ fontSize: 11, color: "#6B7280", marginBottom: 6 }}>{label}</p>
                    {payload.map((p: any) => (
                      <p key={p.name} style={{ fontSize: 14, fontWeight: 600, color: p.name === "Inflows" ? "#059669" : "#E11D48", marginBottom: 2 }}>
                        {p.name}: {fmtPesoFull(Number(p.value))}
                      </p>
                    ))}
                  </div>
                );
              }}
            />
            <ReferenceLine y={0} stroke="#D1D5DB" strokeDasharray="3 3" />
            <Bar dataKey="inflows" name="Inflows" fill="url(#inflowGrad)" radius={[6, 6, 0, 0]} maxBarSize={48} />
            <Bar dataKey="outflows" name="Outflows" fill="url(#outflowGrad)" radius={[6, 6, 0, 0]} maxBarSize={48} />
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
