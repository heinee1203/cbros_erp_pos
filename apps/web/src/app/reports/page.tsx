"use client";

import { useState, useMemo } from "react";
import { useAuth } from "@/app/auth-context";
import {
  useDailySalesSummaryQuery,
  useSalesKPIsQuery,
  useLocationsQuery,
  useEmployeesQuery,
  useSalesByItemQuery,
  useSalesByEmployeeQuery,
  type DashboardFilters,
  type DailySalesRow,
  type ReportFilters,
  type SalesByItemRow,
  type SalesByEmployeeRow,
} from "@/hooks/use-sales-reports";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { fmtPeso, fmtPercent } from "@/lib/format";
import { MARGIN_THRESHOLDS } from "@/lib/constants";
import {
  BarChart3,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  TrendingDown,
  Loader2,
} from "lucide-react";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import {
  BarChart as RechartsBarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

/* ═══════════════════════════════════════════════
 * Utilities
 * ═══════════════════════════════════════════════ */

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
  const [topItemsSort, setTopItemsSort] = useState<"revenue" | "units">("revenue");

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

  // Prior period — same duration shifted back
  const priorFilters: DashboardFilters = useMemo(
    () => ({
      from: toISO(addDays(range.from, -(daysBetween(range.from, range.to) + 1))),
      to: toISO(addDays(range.to, -(daysBetween(range.from, range.to) + 1))),
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
  const priorDailyQuery = useDailySalesSummaryQuery(
    token,
    isAllLocations ? locationId : effectiveLocationId,
    priorFilters,
  );
  const locationsQuery = useLocationsQuery(token);
  const employeesQuery = useEmployeesQuery(token, effectiveLocationId);

  const reportFilters: ReportFilters = useMemo(
    () => ({
      from: toISO(range.from),
      to: toISO(range.to),
      allLocations: isAllLocations || undefined,
    }),
    [range.from, range.to, isAllLocations],
  );
  const itemsQuery = useSalesByItemQuery(
    token,
    isAllLocations ? locationId : effectiveLocationId,
    reportFilters,
  );
  const employeesReportQuery = useSalesByEmployeeQuery(
    token,
    isAllLocations ? locationId : effectiveLocationId,
    reportFilters,
  );

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

  const topItems = (itemsQuery.data?.data ?? [])
    .sort((a, b) => topItemsSort === "units"
      ? b.unitsSold - a.unitsSold
      : parseFloat(b.totalRevenue) - parseFloat(a.totalRevenue))
    .slice(0, 5);

  const topEmployees = (employeesReportQuery.data?.data ?? [])
    .sort((a, b) => b.totalSales - a.totalSales)
    .slice(0, 5);

  // ── Chart data ──
  const priorDays: DailySalesRow[] = priorDailyQuery.data?.data ?? [];
  const chartData = days.map((d, i) => ({
    date: new Date(d.date).toLocaleDateString("en-PH", { month: "short", day: "numeric" }),
    grossSales: parseFloat(d.grossSales),
    priorGrossSales: priorDays[i] ? parseFloat(priorDays[i].grossSales) : undefined,
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
          {fmtPeso(current)}
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
                ({isUp ? "+" : ""}{fmtPeso(diff)})
              </span>
            </span>
          ) : kpis ? (
            <span className="text-[11px] text-muted-foreground">
              {kpis?.current.totalTransactions ?? 0} transactions
            </span>
          ) : null}
        </div>
      </div>
    );
  }

  const isDataLoading = kpisQuery.isLoading || dailyQuery.isLoading || priorDailyQuery.isLoading;

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
            <DateRangePicker
              startDate={customFrom}
              endDate={customTo}
              onChange={(start, end) => {
                setCustomFrom(start);
                setCustomTo(end);
                if (start && end) {
                  setRange({ from: new Date(start), to: new Date(end) });
                }
              }}
            />
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
      <div className="rounded-xl border border-border bg-background p-6 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-[15px] font-semibold text-foreground">Gross Sales</h2>
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <span className="inline-block h-3 w-3 rounded-sm bg-emerald-500" />
            Daily Revenue
          </div>
        </div>
        {isDataLoading ? (
          <div className="h-[320px] animate-pulse rounded-lg bg-muted/30" />
        ) : chartData.length === 0 ? (
          <div className="flex h-[320px] flex-col items-center justify-center py-12 text-center">
            <BarChart3 className="mb-3 h-10 w-10 text-muted-foreground/40" />
            <p className="text-[14px] font-medium text-foreground">
              No sales recorded for {fmtRangeLabel(range.from, range.to)}
            </p>
            <p className="mt-2 max-w-sm text-[12px] text-muted-foreground leading-relaxed">
              This could mean no completed transactions in the POS app,
              sales were made at a different location, or the date range
              doesn&apos;t include any business days.
            </p>
            <div className="mt-4 flex items-center gap-3">
              <Link
                href="/sales/shifts"
                className="rounded-md border border-border px-3 py-1.5 text-[12px] font-medium text-foreground transition-colors hover:bg-muted"
              >
                View Shift History
              </Link>
              <button
                onClick={() => setSelectedLocation("__all__")}
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
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="#E5E7EB"
                vertical={false}
              />
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
                tickFormatter={(v: number) =>
                  v >= 1000000
                    ? `\u20B1${(v / 1000000).toFixed(1)}M`
                    : v >= 1000
                      ? `\u20B1${(v / 1000).toFixed(0)}k`
                      : `\u20B1${v}`
                }
                width={65}
              />
              <Tooltip
                cursor={{ fill: "rgba(16, 185, 129, 0.06)" }}
                content={({ active, payload, label }: any) => {
                  if (!active || !payload?.length) return null;
                  return (
                    <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 10, padding: "10px 14px", boxShadow: "0 4px 16px rgba(0,0,0,0.10)" }}>
                      <p style={{ fontSize: 11, color: "#6B7280", marginBottom: 4 }}>{label}</p>
                      <p style={{ fontSize: 16, fontWeight: 700, color: "#111827" }}>
                        {"\u20B1"}{Number(payload[0].value).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                    </div>
                  );
                }}
              />
              <Bar
                dataKey="grossSales"
                fill="url(#barGradient)"
                radius={[6, 6, 0, 0]}
                maxBarSize={48}
              />
            </RechartsBarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* ═══════════════════════════════════════════
       * Ranked Lists — Top Items + Top Employees
       * ═══════════════════════════════════════════ */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <TopItemsTable items={topItems} isLoading={itemsQuery.isLoading} sortBy={topItemsSort} onSortChange={setTopItemsSort} />
        <TopEmployeesTable employees={topEmployees} isLoading={employeesReportQuery.isLoading} />
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
                  <td colSpan={8}>
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                      <BarChart3 className="mb-3 h-10 w-10 text-muted-foreground/40" />
                      <p className="text-[14px] font-medium text-foreground">
                        No sales recorded for {fmtRangeLabel(range.from, range.to)}
                      </p>
                      <p className="mt-2 max-w-sm text-[12px] text-muted-foreground leading-relaxed">
                        This could mean no completed transactions in the POS app,
                        sales were made at a different location, or the date range
                        doesn&apos;t include any business days.
                      </p>
                      <div className="mt-4 flex items-center gap-3">
                        <Link
                          href="/sales/shifts"
                          className="rounded-md border border-border px-3 py-1.5 text-[12px] font-medium text-foreground transition-colors hover:bg-muted"
                        >
                          View Shift History
                        </Link>
                        <button
                          onClick={() => setSelectedLocation("__all__")}
                          className="rounded-md border border-border px-3 py-1.5 text-[12px] font-medium text-foreground transition-colors hover:bg-muted"
                        >
                          Try All Locations
                        </button>
                      </div>
                    </div>
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
                          {fmtPeso(day.grossSales)}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-[12px] text-red-500">
                          {parseFloat(day.refunds) > 0 ? `(${fmtPeso(day.refunds)})` : fmtPeso(day.refunds)}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-[12px] text-muted-foreground">
                          {fmtPeso(day.discounts)}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-[12px] font-medium text-foreground">
                          {fmtPeso(day.netSales)}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-[12px] text-muted-foreground">
                          {fmtPeso(day.costOfGoods)}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-[12px] font-medium text-foreground">
                          {fmtPeso(day.grossProfit)}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-[12px]">
                          <span
                            className={cn(
                              "font-medium",
                              marginVal >= MARGIN_THRESHOLDS.GOOD
                                ? "text-emerald-600"
                                : marginVal >= MARGIN_THRESHOLDS.WARNING
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
                      {fmtPeso(totals.grossSales)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-[12px] font-semibold text-red-500">
                      {totals.refunds > 0 ? `(${fmtPeso(totals.refunds)})` : fmtPeso(totals.refunds)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-[12px] font-semibold text-muted-foreground">
                      {fmtPeso(totals.discounts)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-[12px] font-semibold text-foreground">
                      {fmtPeso(totals.netSales)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-[12px] font-semibold text-muted-foreground">
                      {fmtPeso(totals.costOfGoods)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-[12px] font-semibold text-foreground">
                      {fmtPeso(totals.grossProfit)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-[12px]">
                      <span
                        className={cn(
                          "font-semibold",
                          parseFloat(totalMargin) >= MARGIN_THRESHOLDS.GOOD
                            ? "text-emerald-600"
                            : parseFloat(totalMargin) >= MARGIN_THRESHOLDS.WARNING
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

/* ═══════════════════════════════════════════════
 * Top Selling Items Table
 * ═══════════════════════════════════════════════ */

function TopItemsTable({
  items,
  isLoading,
  sortBy,
  onSortChange,
}: {
  items: SalesByItemRow[];
  isLoading: boolean;
  sortBy: "revenue" | "units";
  onSortChange: (v: "revenue" | "units") => void;
}) {
  return (
    <div className="rounded-xl border border-border bg-background shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
      <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
        <div className="flex items-center gap-3">
          <h2 className="text-[13px] font-semibold text-foreground">Top Selling Items</h2>
          <div className="flex rounded-md border border-border text-[10px] font-medium">
            <button
              onClick={() => onSortChange("revenue")}
              className={`px-2 py-0.5 rounded-l-md transition-colors ${sortBy === "revenue" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
            >
              Revenue
            </button>
            <button
              onClick={() => onSortChange("units")}
              className={`px-2 py-0.5 rounded-r-md transition-colors ${sortBy === "units" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
            >
              Units
            </button>
          </div>
        </div>
        <Link
          href="/reports/sales-by-item"
          className="text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          View all &rarr;
        </Link>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              <th scope="col" className="px-5 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground w-8">
                #
              </th>
              <th scope="col" className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                Item
              </th>
              <th scope="col" className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                Units
              </th>
              <th scope="col" className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                Revenue
              </th>
              <th scope="col" className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                Margin
              </th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b border-border last:border-0">
                  {Array.from({ length: 5 }).map((__, j) => (
                    <td key={j} className="px-4 py-2.5">
                      <div className="h-4 animate-pulse rounded bg-muted/40" />
                    </td>
                  ))}
                </tr>
              ))
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-5 py-8 text-center text-[13px] text-muted-foreground">
                  No item sales data for this period
                </td>
              </tr>
            ) : (
              items.map((item, i) => {
                const margin = parseFloat(item.marginPct);
                return (
                  <tr
                    key={item.productId}
                    className="border-b border-border transition-colors last:border-0 hover:bg-muted/20"
                  >
                    <td className="px-5 py-2.5 text-[12px] font-medium text-muted-foreground">
                      {i + 1}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="text-[12px] font-medium text-foreground">{item.productName}</div>
                      <div className="mt-px font-mono text-[10px] text-muted-foreground">{item.sku}</div>
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-[12px] tabular-nums text-foreground">
                      {item.unitsSold.toLocaleString("en-PH")}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-[12px] tabular-nums text-foreground">
                      {fmtPeso(item.totalRevenue)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-[12px] tabular-nums">
                      <span
                        className={cn(
                          "font-medium",
                          margin >= MARGIN_THRESHOLDS.GOOD
                            ? "text-emerald-600"
                            : margin >= MARGIN_THRESHOLDS.WARNING
                              ? "text-amber-600"
                              : "text-red-500",
                        )}
                      >
                        {margin.toFixed(1)}%
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
 * Top Employees Table
 * ═══════════════════════════════════════════════ */

function TopEmployeesTable({
  employees,
  isLoading,
}: {
  employees: SalesByEmployeeRow[];
  isLoading: boolean;
}) {
  return (
    <div className="rounded-xl border border-border bg-background shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
      <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
        <h2 className="text-[13px] font-semibold text-foreground">Top Employees</h2>
        <Link
          href="/reports/sales-by-employee"
          className="text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          View all &rarr;
        </Link>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              <th scope="col" className="px-5 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground w-8">
                #
              </th>
              <th scope="col" className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                Employee
              </th>
              <th scope="col" className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                Sales
              </th>
              <th scope="col" className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                Revenue
              </th>
              <th scope="col" className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                Avg Ticket
              </th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <tr key={i} className="border-b border-border last:border-0">
                  {Array.from({ length: 5 }).map((__, j) => (
                    <td key={j} className="px-4 py-2.5">
                      <div className="h-4 animate-pulse rounded bg-muted/40" />
                    </td>
                  ))}
                </tr>
              ))
            ) : employees.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-5 py-8 text-center text-[13px] text-muted-foreground">
                  No employee sales data for this period
                </td>
              </tr>
            ) : (
              employees.map((emp, i) => (
                <tr
                  key={emp.employeeId || emp.employeeName || i}
                  className="border-b border-border transition-colors last:border-0 hover:bg-muted/20"
                >
                  <td className="px-5 py-2.5 text-[12px] font-medium text-muted-foreground">
                    {i + 1}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="text-[12px] font-medium text-foreground">{emp.employeeName}</div>
                    <div className="mt-px text-[10px] text-muted-foreground">{emp.employeeRole}</div>
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-[12px] tabular-nums text-foreground">
                    {emp.totalSales.toLocaleString("en-PH")}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-[12px] tabular-nums text-foreground">
                    {fmtPeso(emp.totalRevenue)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-[12px] tabular-nums text-foreground">
                    {fmtPeso(emp.avgSaleValue)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
