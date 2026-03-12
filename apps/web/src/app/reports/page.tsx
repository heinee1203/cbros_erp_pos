"use client";

import { useState, useMemo } from "react";
import { useAuth } from "@/app/auth-context";
import {
  useDailySalesSummaryQuery,
  useSalesKPIsQuery,
  useLocationsQuery,
  useEmployeesQuery,
  type DashboardFilters,
  type DailySalesRow,
} from "@/hooks/use-sales-reports";
import { cn } from "@/lib/utils";
import {
  BarChart3,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  TrendingDown,
  Loader2,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

/* ═══════════════════════════════════════════════
 * Utilities
 * ═══════════════════════════════════════════════ */

function fmtPHP(value: number): string {
  return `PHP ${value.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtNum(val: string | number): string {
  return parseFloat(String(val)).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function toISO(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(d: Date, n: number): Date {
  const result = new Date(d);
  result.setDate(result.getDate() + n);
  return result;
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function fmtRangeLabel(from: Date, to: Date): string {
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" };
  return `${from.toLocaleDateString("en-PH", opts)} - ${to.toLocaleDateString("en-PH", opts)}`;
}

function getDefaultRange(): { from: Date; to: Date } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return { from: addDays(today, -6), to: today };
}

/* ═══════════════════════════════════════════════
 * Reports Overview — Sales Analytics Dashboard
 * ═══════════════════════════════════════════════ */

export default function ReportsOverviewPage() {
  // ── Auth ──
  const { token, locationId, loading } = useAuth();

  // ── Date range state ──
  const [range, setRange] = useState(getDefaultRange);
  const [preset, setPreset] = useState<string>("7d");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  // ── Filter dropdowns ──
  const [selectedLocation, setSelectedLocation] = useState<string>("");
  const [selectedEmployee, setSelectedEmployee] = useState<string>("");

  // ── Derived filter object ──
  const effectiveLocationId = selectedLocation || locationId;
  const isAllLocations = selectedLocation === "__all__";

  const filters: DashboardFilters = useMemo(
    () => ({
      from: toISO(range.from),
      to: toISO(range.to),
      allLocations: isAllLocations || undefined,
      employeeId: selectedEmployee || undefined,
    }),
    [range.from, range.to, isAllLocations, selectedEmployee],
  );

  // ── Data hooks — ALL called unconditionally ──
  const kpisQuery = useSalesKPIsQuery(
    token,
    isAllLocations ? locationId : effectiveLocationId,
    filters,
  );
  const dailyQuery = useDailySalesSummaryQuery(
    token,
    isAllLocations ? locationId : effectiveLocationId,
    filters,
  );
  const locationsQuery = useLocationsQuery(token);
  const employeesQuery = useEmployeesQuery(token, effectiveLocationId);

  // ── Loading guard — AFTER all hooks ──
  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // ── Derived data ──
  const kpis = kpisQuery.data;
  const days: DailySalesRow[] = dailyQuery.data?.data ?? [];
  const locations = locationsQuery.data?.data ?? [];
  const employees = employeesQuery.data?.data ?? [];

  // ── Chart data ──
  const chartData = days.map((d) => ({
    date: new Date(d.date).toLocaleDateString("en-PH", { month: "short", day: "numeric" }),
    grossSales: parseFloat(d.grossSales),
  }));

  // ── Table totals ──
  const totals = days.reduce(
    (acc, d) => ({
      salesCount: acc.salesCount + d.salesCount,
      grossSales: acc.grossSales + parseFloat(d.grossSales),
      refunds: acc.refunds + parseFloat(d.refunds),
      discounts: acc.discounts + parseFloat(d.discounts),
      netSales: acc.netSales + parseFloat(d.netSales),
      costOfGoods: acc.costOfGoods + parseFloat(d.costOfGoods),
      grossProfit: acc.grossProfit + parseFloat(d.grossProfit),
    }),
    { salesCount: 0, grossSales: 0, refunds: 0, discounts: 0, netSales: 0, costOfGoods: 0, grossProfit: 0 },
  );
  const totalMargin = totals.netSales > 0 ? ((totals.grossProfit / totals.netSales) * 100).toFixed(1) : "0.0";

  // ── Preset handlers ──
  function applyPreset(p: string) {
    setPreset(p);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    switch (p) {
      case "today":
        setRange({ from: today, to: today });
        break;
      case "7d":
        setRange({ from: addDays(today, -6), to: today });
        break;
      case "30d":
        setRange({ from: addDays(today, -29), to: today });
        break;
      case "month":
        setRange({ from: startOfMonth(today), to: today });
        break;
      case "custom":
        setCustomFrom(toISO(range.from));
        setCustomTo(toISO(range.to));
        break;
    }
  }

  function navigateRange(direction: "prev" | "next") {
    const duration = daysBetween(range.from, range.to) + 1;
    const shift = direction === "prev" ? -duration : duration;
    setRange({ from: addDays(range.from, shift), to: addDays(range.to, shift) });
    setPreset("");
  }

  function applyCustomRange() {
    if (customFrom && customTo) {
      setRange({ from: new Date(customFrom), to: new Date(customTo) });
    }
  }

  // ── KPI comparison helper ──
  function kpiCard(
    label: string,
    currentRaw: string | undefined,
    priorRaw: string | undefined,
  ) {
    const current = parseFloat(currentRaw ?? "0");
    const prior = parseFloat(priorRaw ?? "0");
    const diff = current - prior;
    const pctChange = prior > 0 ? ((diff / prior) * 100).toFixed(1) : null;
    const isUp = current >= prior;

    return (
      <div className="rounded-xl border border-border bg-background p-4 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
        <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
          {label}
        </p>
        <p className="mt-1.5 text-[20px] font-semibold leading-tight text-foreground">
          {fmtPHP(current)}
        </p>
        <div className="mt-1.5">
          {kpis && pctChange !== null ? (
            <span
              className={cn(
                "inline-flex items-center gap-1 text-[11px] font-medium",
                isUp ? "text-emerald-600" : "text-red-500",
              )}
            >
              {isUp ? (
                <TrendingUp className="h-3 w-3" />
              ) : (
                <TrendingDown className="h-3 w-3" />
              )}
              {isUp ? "+" : ""}{pctChange}%
              <span className="text-muted-foreground">
                ({isUp ? "+" : ""}{fmtPHP(diff)})
              </span>
            </span>
          ) : kpis ? (
            <span className="text-[11px] text-muted-foreground">No prior data</span>
          ) : null}
        </div>
      </div>
    );
  }

  const isDataLoading = kpisQuery.isLoading || dailyQuery.isLoading;

  return (
    <div className="mx-auto flex h-full max-w-6xl flex-col gap-6 pb-8">
      {/* ═══════════════════════════════════════════
       * Page Header
       * ═══════════════════════════════════════════ */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/[0.06]">
          <BarChart3 className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-foreground">Sales Analytics</h1>
          <p className="text-[13px] text-muted-foreground">
            Revenue performance, daily trends, and period comparisons
          </p>
        </div>
      </div>

      {/* ═══════════════════════════════════════════
       * Date Range Navigation Bar
       * ═══════════════════════════════════════════ */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-background px-4 py-3 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
        {/* Left: Prev / Date label / Next */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => navigateRange("prev")}
            className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
            aria-label="Previous period"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-[200px] text-center text-[13px] font-medium text-foreground">
            {fmtRangeLabel(range.from, range.to)}
          </span>
          <button
            onClick={() => navigateRange("next")}
            className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
            aria-label="Next period"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {/* Divider */}
        <div className="hidden h-5 w-px bg-border sm:block" />

        {/* Center: Preset buttons */}
        <div className="flex items-center gap-1">
          {([
            ["today", "Today"],
            ["7d", "7 Days"],
            ["30d", "30 Days"],
            ["month", "This Month"],
            ["custom", "Custom"],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => applyPreset(key)}
              className={cn(
                "rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors",
                preset === key
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Custom date inputs */}
        {preset === "custom" && (
          <>
            <div className="hidden h-5 w-px bg-border sm:block" />
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="rounded-md border border-border bg-background px-2 py-1 text-[12px]"
              />
              <span className="text-[12px] text-muted-foreground">to</span>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="rounded-md border border-border bg-background px-2 py-1 text-[12px]"
              />
              <button
                onClick={applyCustomRange}
                className="rounded-md bg-primary px-2.5 py-1 text-[12px] font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Apply
              </button>
            </div>
          </>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Right: Store + Employee filters */}
        <div className="flex items-center gap-2">
          <select
            value={selectedLocation || locationId}
            onChange={(e) => setSelectedLocation(e.target.value)}
            className="rounded-md border border-border bg-background px-2.5 py-1.5 text-[12px] text-foreground"
          >
            <option value="__all__">All Stores</option>
            {locations.map((loc) => (
              <option key={loc.id} value={loc.id}>
                {loc.name} ({loc.code})
              </option>
            ))}
          </select>

          <select
            value={selectedEmployee}
            onChange={(e) => setSelectedEmployee(e.target.value)}
            className="rounded-md border border-border bg-background px-2.5 py-1.5 text-[12px] text-foreground"
          >
            <option value="">All Employees</option>
            {employees.map((emp) => (
              <option key={emp.id} value={emp.id}>
                {emp.fullName}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* ═══════════════════════════════════════════
       * KPI Cards Row
       * ═══════════════════════════════════════════ */}
      {isDataLoading ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-[100px] animate-pulse rounded-xl border border-border bg-muted/30" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          {kpiCard("Gross Sales", kpis?.current.grossSales, kpis?.prior.grossSales)}
          {kpiCard("Refunds", kpis?.current.refunds, kpis?.prior.refunds)}
          {kpiCard("Discounts", kpis?.current.discounts, kpis?.prior.discounts)}
          {kpiCard("Net Sales", kpis?.current.netSales, kpis?.prior.netSales)}
          {kpiCard("Gross Profit", kpis?.current.grossProfit, kpis?.prior.grossProfit)}
        </div>
      )}

      {/* ═══════════════════════════════════════════
       * Area Chart — Gross Sales Trend
       * ═══════════════════════════════════════════ */}
      <div className="rounded-xl border border-border bg-background p-5 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
        <h2 className="mb-4 text-[13px] font-semibold text-foreground">Gross Sales</h2>
        {isDataLoading ? (
          <div className="h-[320px] animate-pulse rounded-lg bg-muted/30" />
        ) : chartData.length === 0 ? (
          <div className="flex h-[320px] items-center justify-center text-[13px] text-muted-foreground">
            No sales data for the selected period
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={320}>
            <AreaChart data={chartData} margin={{ top: 4, right: 4, left: 8, bottom: 0 }}>
              <defs>
                <linearGradient id="colorGross" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="hsl(var(--border))"
                vertical={false}
              />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                axisLine={{ stroke: "hsl(var(--border))" }}
                tickLine={false}
                dy={8}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: number) =>
                  v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)
                }
                dx={-4}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--background))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                  fontSize: "12px",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
                }}
                formatter={(value) => [fmtPHP(Number(value)), "Gross Sales"]}
                labelStyle={{ fontSize: "11px", color: "hsl(var(--muted-foreground))", marginBottom: "4px" }}
              />
              <Area
                type="monotone"
                dataKey="grossSales"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                fill="url(#colorGross)"
                dot={false}
                activeDot={{
                  r: 4,
                  stroke: "hsl(var(--primary))",
                  strokeWidth: 2,
                  fill: "hsl(var(--background))",
                }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* ═══════════════════════════════════════════
       * Daily Breakdown Table
       * ═══════════════════════════════════════════ */}
      <div className="rounded-xl border border-border bg-background shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
        <div className="border-b border-border px-5 py-3.5">
          <h2 className="text-[13px] font-semibold text-foreground">Daily Breakdown</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th scope="col" className="px-5 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                  Date
                </th>
                <th scope="col" className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                  Gross Sales
                </th>
                <th scope="col" className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                  Refunds
                </th>
                <th scope="col" className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                  Discounts
                </th>
                <th scope="col" className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                  Net Sales
                </th>
                <th scope="col" className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                  Cost of Goods
                </th>
                <th scope="col" className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                  Gross Profit
                </th>
                <th scope="col" className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                  Margin
                </th>
              </tr>
            </thead>
            <tbody>
              {isDataLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-border last:border-0">
                    {Array.from({ length: 8 }).map((__, j) => (
                      <td key={j} className="px-4 py-2.5">
                        <div className="h-4 animate-pulse rounded bg-muted/40" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : days.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-5 py-10 text-center text-[13px] text-muted-foreground"
                  >
                    No sales data for the selected period
                  </td>
                </tr>
              ) : (
                <>
                  {days.map((day) => {
                    const marginVal = parseFloat(day.margin);
                    return (
                      <tr
                        key={day.date}
                        className="border-b border-border transition-colors last:border-0 hover:bg-muted/20"
                      >
                        <td className="px-5 py-2.5 text-[12px] font-medium text-foreground">
                          {new Date(day.date).toLocaleDateString("en-PH", {
                            weekday: "short",
                            day: "numeric",
                            month: "short",
                          })}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-[12px] text-foreground">
                          {fmtNum(day.grossSales)}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-[12px] text-red-500">
                          {parseFloat(day.refunds) > 0 ? `(${fmtNum(day.refunds)})` : fmtNum(day.refunds)}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-[12px] text-muted-foreground">
                          {fmtNum(day.discounts)}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-[12px] font-medium text-foreground">
                          {fmtNum(day.netSales)}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-[12px] text-muted-foreground">
                          {fmtNum(day.costOfGoods)}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-[12px] font-medium text-foreground">
                          {fmtNum(day.grossProfit)}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-[12px]">
                          <span
                            className={cn(
                              "font-medium",
                              marginVal >= 30
                                ? "text-emerald-600"
                                : marginVal >= 15
                                  ? "text-amber-600"
                                  : "text-red-500",
                            )}
                          >
                            {parseFloat(day.margin).toFixed(1)}%
                          </span>
                        </td>
                      </tr>
                    );
                  })}

                  {/* Footer totals row */}
                  <tr className="border-t-2 border-border bg-muted/30">
                    <td className="px-5 py-2.5 text-[12px] font-semibold text-foreground">
                      Total
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-[12px] font-semibold text-foreground">
                      {fmtNum(totals.grossSales)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-[12px] font-semibold text-red-500">
                      {totals.refunds > 0 ? `(${fmtNum(totals.refunds)})` : fmtNum(totals.refunds)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-[12px] font-semibold text-muted-foreground">
                      {fmtNum(totals.discounts)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-[12px] font-semibold text-foreground">
                      {fmtNum(totals.netSales)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-[12px] font-semibold text-muted-foreground">
                      {fmtNum(totals.costOfGoods)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-[12px] font-semibold text-foreground">
                      {fmtNum(totals.grossProfit)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-[12px]">
                      <span
                        className={cn(
                          "font-semibold",
                          parseFloat(totalMargin) >= 30
                            ? "text-emerald-600"
                            : parseFloat(totalMargin) >= 15
                              ? "text-amber-600"
                              : "text-red-500",
                        )}
                      >
                        {totalMargin}%
                      </span>
                    </td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
