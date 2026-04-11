"use client";

/**
 * Daily Sales Analytics Dashboard — admin-only.
 *
 * Hydrated from /analytics/daily-sales/* which aggregates the
 * daily_sales_summary table. Every API call is gated on the user having
 * the ADMIN role; non-admin users see an access-denied screen without
 * ever firing a request.
 *
 * Layout (top→bottom):
 *   1. Header + admin badge + date range selector w/ presets
 *   2. Summary KPI cards
 *   3. Revenue Trend line chart
 *   4. Division Breakdown + Cash vs Credit (side by side)
 *   5. YoY multi-line + Day-of-Week heatmap (side by side)
 *   6. Detailed daily data table with sort/filter/CSV export
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
} from "react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import {
  BarChart3,
  Calendar,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Award,
  Download,
  Lock,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  ChevronLeft,
  ChevronRight,
  Printer,
  ArrowUpRight,
  ArrowDownRight,
  Loader2,
  Pencil,
  Plus,
  X,
  Save,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/app/auth-context";
import { apiFetch } from "@/lib/api";

/* ─── Types (mirror the /analytics/daily-sales/* responses) ─── */

type GroupBy = "day" | "week" | "month" | "quarter" | "year";

interface SummaryResponse {
  from: string;
  to: string;
  dayCount: number;
  totalSales: number;
  cashSales: number;
  creditSales: number;
  totalPayments: number;
  avgDailySales: number;
  cashShare: number | null;
  creditShare: number | null;
  bestDay: { date: string; amount: number } | null;
  worstDay: { date: string; amount: number } | null;
  prevFrom: string;
  prevTo: string;
  prevTotalSales: number;
  yoyGrowthPct: number | null;
}

interface SeriesBucket {
  bucket: string;
  dayCount: number;
  apOldSales: number;
  apNewSales: number;
  apOnAccount: number;
  acSales: number;
  acOnAccount: number;
  serviceSales: number;
  serviceOnAccount: number;
  paintingSales: number;
  paintingOnAccount: number;
  juniorSales: number;
  payments: number;
  autoParts: number;
  accessories: number;
  service: number;
  painting: number;
  junior: number;
  total: number;
}

interface DivisionRow {
  key: string;
  label: string;
  cash: number;
  credit: number;
  total: number;
  share: number | null;
}

interface DivisionResponse {
  from: string;
  to: string;
  divisions: DivisionRow[];
  totalCash: number;
  totalCredit: number;
  grandTotal: number;
}

interface YoYRow {
  year: number;
  month: number;
  total: number;
}

interface DayOfWeekRow {
  dow: number;
  dayCount: number;
  total: number;
  avg: number;
}

interface DailyRow {
  date: string;
  apOldSales: number;
  apNewSales: number;
  apOnAccount: number;
  acSales: number;
  acOnAccount: number;
  serviceSales: number;
  serviceOnAccount: number;
  paintingSales: number;
  paintingOnAccount: number;
  juniorSales: number;
  payments: number;
}

/** /analytics/daily-sales/single-day response shape */
interface SingleDayResponse {
  date: string;
  dayOfWeek: string;
  hasData: boolean;
  ap: { old: number; new: number; total: number; onAccount: number; oldRatio: number | null; newRatio: number | null };
  ac: { cash: number; onAccount: number; total: number };
  service: { cash: number; onAccount: number; total: number };
  painting: { cash: number; onAccount: number; total: number };
  junior: { cash: number; total: number };
  totals: { cash: number; onAccount: number; grandTotal: number; payments: number };
  percentages: { ap: number; ac: number; service: number; painting: number; junior: number };
}

/* ─── Formatters ─── */

function fmtPeso(v: number): string {
  if (Math.abs(v) >= 1_000_000_000) return `\u20B1${(v / 1_000_000_000).toFixed(2)}B`;
  if (Math.abs(v) >= 1_000_000) return `\u20B1${(v / 1_000_000).toFixed(2)}M`;
  if (Math.abs(v) >= 1_000) return `\u20B1${(v / 1_000).toFixed(1)}K`;
  return `\u20B1${v.toLocaleString("en-PH", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function fmtPesoFull(v: number): string {
  return `\u20B1${v.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtPct(v: number | null): string {
  if (v == null) return "—";
  return `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// Recharts Tooltip formatter signature is
// `(value, name, item, index, payload) => ReactNode | [string, string]`.
// Our helpers only care about the value, but TypeScript is strict — we
// wrap in a 5-arg function so it satisfies the signature.
const pesoTooltipFormatter: (value: any) => string = (v) =>
  fmtPesoFull(Number(v));
const pesoTooltipLabelFormatter = (v: any) => fmtDate(String(v));

function toIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/* ─── Date range presets ─── */

interface Preset {
  label: string;
  compute: () => { from: string; to: string };
}

const PRESETS: Preset[] = [
  {
    label: "This Month",
    compute: () => {
      const now = new Date();
      const first = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: toIso(first), to: toIso(now) };
    },
  },
  {
    label: "Last Month",
    compute: () => {
      const now = new Date();
      const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const last = new Date(now.getFullYear(), now.getMonth(), 0);
      return { from: toIso(first), to: toIso(last) };
    },
  },
  {
    label: "This Quarter",
    compute: () => {
      const now = new Date();
      const q = Math.floor(now.getMonth() / 3);
      const first = new Date(now.getFullYear(), q * 3, 1);
      return { from: toIso(first), to: toIso(now) };
    },
  },
  {
    label: "Last Quarter",
    compute: () => {
      const now = new Date();
      const q = Math.floor(now.getMonth() / 3) - 1;
      const year = q < 0 ? now.getFullYear() - 1 : now.getFullYear();
      const quarter = (q + 4) % 4;
      const first = new Date(year, quarter * 3, 1);
      const last = new Date(year, (quarter + 1) * 3, 0);
      return { from: toIso(first), to: toIso(last) };
    },
  },
  {
    label: "This Year",
    compute: () => {
      const now = new Date();
      return { from: `${now.getFullYear()}-01-01`, to: toIso(now) };
    },
  },
  {
    label: "Last Year",
    compute: () => {
      const y = new Date().getFullYear() - 1;
      return { from: `${y}-01-01`, to: `${y}-12-31` };
    },
  },
  {
    label: "All Time",
    compute: () => ({ from: "2019-06-01", to: toIso(new Date()) }),
  },
];

/* ─── Palette ─── */

const DIVISION_COLORS: Record<string, string> = {
  auto_parts: "#3b82f6", // blue
  accessories: "#10b981", // emerald
  service: "#f59e0b", // amber
  painting: "#8b5cf6", // violet
  junior: "#ef4444", // red
};

const YOY_COLORS = [
  "#94a3b8", "#64748b", "#475569",
  "#3b82f6", "#10b981", "#f59e0b",
  "#8b5cf6", "#ef4444",
];

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DOW_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/* ═════════════════════════════════════════════════════════════
 *  Page
 * ═════════════════════════════════════════════════════════════ */
export default function DailySalesDashboardPage() {
  const { user, token, locationId, loading: authLoading } = useAuth();
  const isAdmin = user?.role === "ADMIN";

  // Default to "This Year" on first load — covers a meaningful window.
  const [dateRange, setDateRange] = useState<{ from: string; to: string }>(() =>
    PRESETS.find((p) => p.label === "This Year")!.compute(),
  );
  const [activePreset, setActivePreset] = useState<string | null>("This Year");

  const [groupBy, setGroupBy] = useState<GroupBy>("day");
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [series, setSeries] = useState<SeriesBucket[]>([]);
  const [divisions, setDivisions] = useState<DivisionResponse | null>(null);
  const [yoy, setYoy] = useState<YoYRow[]>([]);
  const [dow, setDow] = useState<DayOfWeekRow[]>([]);
  const [rows, setRows] = useState<DailyRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Section 1 (Daily Sales Report card) ──
  // Defaults to today; gets nudged back to the most recent date with data
  // once `rows` arrives so first render isn't a "no data" empty state.
  const [selectedDate, setSelectedDate] = useState<string>(() => toIso(new Date()));
  const [singleDay, setSingleDay] = useState<SingleDayResponse | null>(null);
  const [singleDayPrev, setSingleDayPrev] = useState<SingleDayResponse | null>(null);
  const [singleDayLoading, setSingleDayLoading] = useState(false);
  const [compareYesterday, setCompareYesterday] = useState(false);
  const [autoSnappedToLatest, setAutoSnappedToLatest] = useState(false);

  // ── Manual entry modal (Step 7) ──
  // Mode 'create' opens an empty form for a no-data date.
  // Mode 'edit'   prefills the form from the current singleDay snapshot.
  const [entryModalOpen, setEntryModalOpen] = useState(false);
  const [entryModalMode, setEntryModalMode] = useState<"create" | "edit">("create");

  // Auto-pick a sensible groupBy when the window changes — day for <=60d,
  // week for <=1y, month for everything longer.
  useEffect(() => {
    const from = new Date(dateRange.from);
    const to = new Date(dateRange.to);
    const days = Math.round((to.getTime() - from.getTime()) / 86_400_000);
    if (days <= 62) setGroupBy("day");
    else if (days <= 365) setGroupBy("week");
    else setGroupBy("month");
  }, [dateRange.from, dateRange.to]);

  const fetchAll = useCallback(async () => {
    if (!isAdmin || !token || !locationId) return;
    setLoading(true);
    setError(null);
    try {
      const qs = `from=${dateRange.from}&to=${dateRange.to}`;
      const [summaryRes, seriesRes, divisionsRes, yoyRes, dowRes, rowsRes] = await Promise.all([
        apiFetch<SummaryResponse>(`/analytics/daily-sales/summary?${qs}`, { token, locationId }),
        apiFetch<{ data: SeriesBucket[] }>(`/analytics/daily-sales?${qs}&groupBy=${groupBy}`, { token, locationId }),
        apiFetch<DivisionResponse>(`/analytics/daily-sales/divisions?${qs}`, { token, locationId }),
        apiFetch<{ data: YoYRow[] }>(`/analytics/daily-sales/yoy`, { token, locationId }),
        apiFetch<{ data: DayOfWeekRow[] }>(`/analytics/daily-sales/day-of-week?${qs}`, { token, locationId }),
        apiFetch<{ data: DailyRow[] }>(`/analytics/daily-sales/rows?${qs}`, { token, locationId }),
      ]);
      setSummary(summaryRes);
      setSeries(seriesRes.data || []);
      setDivisions(divisionsRes);
      setYoy(yoyRes.data || []);
      setDow(dowRes.data || []);
      setRows(rowsRes.data || []);
    } catch (err: any) {
      setError(err?.message || "Failed to load analytics");
    } finally {
      setLoading(false);
    }
  }, [isAdmin, token, locationId, dateRange.from, dateRange.to, groupBy]);

  useEffect(() => {
    if (!authLoading) fetchAll();
  }, [authLoading, fetchAll]);

  // ── Auto-snap selectedDate to latest available row ──
  // First time rows arrive (and only once), advance from "today" → most
  // recent date that actually has data. The user can still navigate
  // forward/back from there with arrows or the date picker.
  useEffect(() => {
    if (autoSnappedToLatest || rows.length === 0) return;
    // The /rows endpoint returns ASCENDING by date, so newest is at the end.
    const latest = rows[rows.length - 1].date;
    if (latest && latest !== selectedDate) {
      setSelectedDate(latest);
    }
    setAutoSnappedToLatest(true);
  }, [rows, autoSnappedToLatest, selectedDate]);

  // ── Fetch single-day whenever selectedDate or compareYesterday changes ──
  useEffect(() => {
    if (!isAdmin || !token || !locationId) return;
    let cancelled = false;
    setSingleDayLoading(true);

    const yest = new Date(selectedDate + "T12:00:00Z");
    yest.setUTCDate(yest.getUTCDate() - 1);
    const yestIso = yest.toISOString().slice(0, 10);

    const fetches: Promise<any>[] = [
      apiFetch<SingleDayResponse>(`/analytics/daily-sales/single-day?date=${selectedDate}`, { token, locationId }),
    ];
    if (compareYesterday) {
      fetches.push(
        apiFetch<SingleDayResponse>(`/analytics/daily-sales/single-day?date=${yestIso}`, { token, locationId }),
      );
    }

    Promise.all(fetches)
      .then(([today, prev]) => {
        if (cancelled) return;
        setSingleDay(today as SingleDayResponse);
        setSingleDayPrev(compareYesterday ? (prev as SingleDayResponse) : null);
      })
      .catch(() => {
        if (cancelled) return;
        setSingleDay(null);
        setSingleDayPrev(null);
      })
      .finally(() => {
        if (!cancelled) setSingleDayLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isAdmin, token, locationId, selectedDate, compareYesterday]);

  // ── Manual entry handlers ──
  const openCreateModal = useCallback(() => {
    setEntryModalMode("create");
    setEntryModalOpen(true);
  }, []);
  const openEditModal = useCallback(() => {
    setEntryModalMode("edit");
    setEntryModalOpen(true);
  }, []);
  const closeEntryModal = useCallback(() => setEntryModalOpen(false), []);

  // After a successful upsert, replace the single-day state with the
  // server's response and refresh the row-level data so Section 3's
  // data table reflects the change too.
  const handleEntrySaved = useCallback(
    (saved: SingleDayResponse) => {
      setSingleDay(saved);
      setEntryModalOpen(false);
      // Refetch the broader rows + summary so charts/table stay in sync.
      // We don't await this — the modal close shouldn't block on it.
      fetchAll();
    },
    [fetchAll],
  );

  // ── Date navigation (arrows + ◄ ► buttons) ──
  const stepDate = useCallback((deltaDays: number) => {
    setSelectedDate((cur) => {
      const d = new Date(cur + "T12:00:00Z");
      d.setUTCDate(d.getUTCDate() + deltaDays);
      // Don't allow stepping past today
      const tomorrow = new Date();
      tomorrow.setHours(0, 0, 0, 0);
      tomorrow.setDate(tomorrow.getDate() + 1);
      if (d.getTime() >= tomorrow.getTime()) return cur;
      return d.toISOString().slice(0, 10);
    });
  }, []);

  // Keyboard shortcuts: Left/Right arrows step ±1 day. We attach on the
  // window so the user can navigate without focusing a specific element,
  // but we ignore the event when an input/textarea/select is focused so
  // typing into the date range pickers below isn't hijacked.
  useEffect(() => {
    if (!isAdmin) return;
    const handler = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
        if (target.isContentEditable) return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        stepDate(-1);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        stepDate(1);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isAdmin, stepDate]);

  // ── RBAC gate ──
  if (authLoading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }
  if (!isAdmin) {
    return (
      <div className="mx-auto flex h-full max-w-md flex-col items-center justify-center text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-50">
          <Lock size={20} className="text-red-600" />
        </div>
        <h2 className="mt-4 text-lg font-semibold text-foreground">Admin access required</h2>
        <p className="mt-1 text-[13px] text-muted-foreground">
          The Daily Sales dashboard is restricted to ADMIN users. Your current role
          is <span className="font-mono font-semibold">{user?.role || "guest"}</span>.
        </p>
      </div>
    );
  }

  const handlePreset = (p: Preset) => {
    const range = p.compute();
    setDateRange(range);
    setActivePreset(p.label);
  };

  const handleCustomDate = (key: "from" | "to") => (e: ChangeEvent<HTMLInputElement>) => {
    setDateRange((prev) => ({ ...prev, [key]: e.target.value }));
    setActivePreset(null);
  };

  return (
    <div className="mx-auto flex h-full max-w-7xl flex-col">
      {/* ── Header ── */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/[0.06]">
            <TrendingUp size={16} className="text-primary" />
          </div>
          <div>
            <h1 className="text-[18px] font-semibold tracking-tight text-foreground">
              Daily Sales Dashboard
            </h1>
            <p className="text-[13px] text-muted-foreground">
              Historical sales analytics across all divisions
            </p>
          </div>
          <span className="ml-2 inline-flex items-center gap-1 rounded-md bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
            <Lock size={10} /> ADMIN
          </span>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════
       *  SECTION 1 — Daily Sales Report (matches the legacy Excel template)
       *  This is the PRIMARY view. Sections 2 & 3 (charts + data table)
       *  live below it for trend analysis.
       * ═══════════════════════════════════════════════════════════ */}
      <DailyReportCard
        date={selectedDate}
        data={singleDay}
        previous={compareYesterday ? singleDayPrev : null}
        loading={singleDayLoading}
        compareEnabled={compareYesterday}
        onSetDate={(d) => setSelectedDate(d)}
        onStepDate={stepDate}
        onToggleCompare={() => setCompareYesterday((v) => !v)}
        onCreateEntry={openCreateModal}
        onEditEntry={openEditModal}
      />

      {/* Manual entry modal — opened from the no-data CTA or the Edit pencil */}
      {entryModalOpen && token && locationId && (
        <ManualEntryModal
          mode={entryModalMode}
          date={selectedDate}
          existing={entryModalMode === "edit" ? singleDay : null}
          token={token}
          locationId={locationId}
          onClose={closeEntryModal}
          onSaved={handleEntrySaved}
        />
      )}

      <div className="mb-4 mt-2 flex items-center gap-2 px-1">
        <div className="h-px flex-1 bg-border" />
        <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
          Trends &amp; Historical Analysis
        </span>
        <div className="h-px flex-1 bg-border" />
      </div>

      {/* ── Date range selector + presets ── */}
      <div className="mb-4 rounded-xl border border-border bg-background p-3 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
        <div className="flex flex-wrap items-center gap-2">
          <Calendar size={14} className="text-muted-foreground" />
          <input
            type="date"
            value={dateRange.from}
            onChange={handleCustomDate("from")}
            className="h-8 rounded-lg border border-border bg-background px-2 text-[12px] text-foreground outline-none focus:border-primary/40"
          />
          <span className="text-[12px] text-muted-foreground">&rarr;</span>
          <input
            type="date"
            value={dateRange.to}
            onChange={handleCustomDate("to")}
            className="h-8 rounded-lg border border-border bg-background px-2 text-[12px] text-foreground outline-none focus:border-primary/40"
          />
          <div className="mx-2 h-5 w-px bg-border" />
          <div className="flex flex-wrap items-center gap-1">
            {PRESETS.map((p) => (
              <button
                key={p.label}
                onClick={() => handlePreset(p)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors",
                  activePreset === p.label
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/70",
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="mx-2 h-5 w-px bg-border" />
          <label className="text-[11px] text-muted-foreground">Group:</label>
          <select
            value={groupBy}
            onChange={(e) => setGroupBy(e.target.value as GroupBy)}
            className="h-8 rounded-lg border border-border bg-background px-2 text-[12px] outline-none"
          >
            <option value="day">Day</option>
            <option value="week">Week</option>
            <option value="month">Month</option>
            <option value="quarter">Quarter</option>
            <option value="year">Year</option>
          </select>
        </div>
      </div>

      {error && (
        <div className="mb-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {loading && !summary && (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      )}

      {summary && (
        <>
          {/* ── Summary KPI cards ── */}
          <SummaryCards summary={summary} />

          {/* ── Revenue Trend ── */}
          <ChartCard
            title="Revenue Trend"
            subtitle={`${fmtDate(dateRange.from)} – ${fmtDate(dateRange.to)} · grouped by ${groupBy}`}
          >
            <ResponsiveContainer width="100%" height={320}>
              <AreaChart data={series} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="grad-total" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis
                  dataKey="bucket"
                  tick={{ fontSize: 10 }}
                  tickFormatter={(v) => {
                    const d = new Date(v);
                    if (groupBy === "year") return String(d.getFullYear());
                    if (groupBy === "month" || groupBy === "quarter")
                      return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
                    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
                  }}
                />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={fmtPeso} width={60} />
                <Tooltip
                  contentStyle={{ fontSize: 11, borderRadius: 6 }}
                  formatter={pesoTooltipFormatter}
                  labelFormatter={pesoTooltipLabelFormatter}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Area
                  type="monotone"
                  dataKey="total"
                  name="Total"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  fill="url(#grad-total)"
                />
                <Line type="monotone" dataKey="autoParts" name="Auto Parts" stroke={DIVISION_COLORS.auto_parts} strokeWidth={1.5} dot={false} />
                <Line type="monotone" dataKey="accessories" name="Accessories" stroke={DIVISION_COLORS.accessories} strokeWidth={1.5} dot={false} />
                <Line type="monotone" dataKey="service" name="Service" stroke={DIVISION_COLORS.service} strokeWidth={1.5} dot={false} />
                <Line type="monotone" dataKey="painting" name="Painting" stroke={DIVISION_COLORS.painting} strokeWidth={1.5} dot={false} />
                <Line type="monotone" dataKey="junior" name="Junior" stroke={DIVISION_COLORS.junior} strokeWidth={1.5} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* ── Division Breakdown + Cash vs Credit side by side ── */}
          <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <ChartCard title="Division Breakdown" subtitle="Share of total revenue">
              {divisions && <DivisionPie divisions={divisions.divisions} />}
            </ChartCard>

            <ChartCard title="Cash vs Credit" subtitle="Per division, selected period">
              {divisions && <CashCreditStack divisions={divisions.divisions} />}
            </ChartCard>
          </div>

          {/* ── Payments Trend + Day of Week ── */}
          <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <ChartCard title="Collections (AR Payments)" subtitle="Payments received over time">
              <PaymentsTrend series={series} groupBy={groupBy} />
            </ChartCard>

            <ChartCard title="Day-of-Week Heatmap" subtitle="Average sales by weekday">
              <DayOfWeekChart dow={dow} />
            </ChartCard>
          </div>

          {/* ── YoY ── */}
          <ChartCard title="Year-over-Year Comparison" subtitle="Monthly totals across every year in the data">
            <YoYChart yoy={yoy} />
          </ChartCard>

          {/* ── Detailed daily data table ── */}
          <DailyDataTable rows={rows} from={dateRange.from} to={dateRange.to} />
        </>
      )}
    </div>
  );
}

/* ═════════════════════════════════════════════════════════════
 *  Summary cards
 * ═════════════════════════════════════════════════════════════ */
function SummaryCards({ summary }: { summary: SummaryResponse }) {
  const growthPositive = summary.yoyGrowthPct != null && summary.yoyGrowthPct >= 0;
  return (
    <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <KPICard
        icon={<DollarSign size={14} />}
        label="Total Revenue"
        value={fmtPesoFull(summary.totalSales)}
        sub={`${summary.dayCount} business days`}
        accent
      />
      <KPICard
        icon={<BarChart3 size={14} />}
        label="Avg Daily Sales"
        value={fmtPesoFull(summary.avgDailySales)}
        sub={summary.cashShare != null ? `${(summary.cashShare * 100).toFixed(0)}% cash, ${((summary.creditShare ?? 0) * 100).toFixed(0)}% credit` : ""}
      />
      <KPICard
        icon={<Award size={14} />}
        label="Best Day"
        value={summary.bestDay ? fmtPesoFull(summary.bestDay.amount) : "—"}
        sub={summary.bestDay ? fmtDate(summary.bestDay.date) : ""}
      />
      <KPICard
        icon={growthPositive ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
        label="YoY Growth"
        value={fmtPct(summary.yoyGrowthPct)}
        sub={`vs ${fmtPesoFull(summary.prevTotalSales)} prior`}
        color={
          summary.yoyGrowthPct == null
            ? undefined
            : growthPositive
            ? "text-emerald-600"
            : "text-red-600"
        }
      />
    </div>
  );
}

function KPICard({
  icon,
  label,
  value,
  sub,
  accent,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
  color?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-background p-4 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]",
        accent && "border-amber-200 bg-amber-50/40 dark:border-amber-800 dark:bg-amber-950/20",
      )}
    >
      <div className="flex items-center gap-1.5 text-muted-foreground">
        {icon}
        <span className="text-[11px] font-medium">{label}</span>
      </div>
      <div className={cn("mt-1 text-xl font-bold tabular-nums text-foreground", color)}>
        {value}
      </div>
      {sub && <div className="mt-0.5 text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

/* ═════════════════════════════════════════════════════════════
 *  ChartCard wrapper
 * ═════════════════════════════════════════════════════════════ */
function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-4 rounded-xl border border-border bg-background p-4 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
      <div className="mb-3">
        <h3 className="text-[14px] font-semibold text-foreground">{title}</h3>
        {subtitle && <p className="text-[11px] text-muted-foreground">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

/* ═════════════════════════════════════════════════════════════
 *  Division Breakdown pie
 * ═════════════════════════════════════════════════════════════ */
function DivisionPie({ divisions }: { divisions: DivisionRow[] }) {
  const data = divisions.filter((d) => d.total > 0);
  if (data.length === 0) {
    return <div className="py-10 text-center text-[11px] text-muted-foreground">No data for this period</div>;
  }
  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie
          data={data}
          dataKey="total"
          nameKey="label"
          cx="50%"
          cy="50%"
          outerRadius={90}
          label={(entry: any) =>
            `${entry.label}: ${entry.share != null ? (entry.share * 100).toFixed(0) + "%" : ""}`
          }
          labelLine={false}
        >
          {data.map((d) => (
            <Cell key={d.key} fill={DIVISION_COLORS[d.key] ?? "#94a3b8"} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{ fontSize: 11, borderRadius: 6 }}
          formatter={pesoTooltipFormatter}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

/* ═════════════════════════════════════════════════════════════
 *  Cash vs Credit stacked bar
 * ═════════════════════════════════════════════════════════════ */
function CashCreditStack({ divisions }: { divisions: DivisionRow[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={divisions} layout="vertical" margin={{ top: 5, right: 10, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={fmtPeso} />
        <YAxis type="category" dataKey="label" tick={{ fontSize: 10 }} width={90} />
        <Tooltip
          contentStyle={{ fontSize: 11, borderRadius: 6 }}
          formatter={pesoTooltipFormatter}
        />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Bar dataKey="cash" stackId="a" fill="#10b981" name="Cash" />
        <Bar dataKey="credit" stackId="a" fill="#f59e0b" name="Credit" />
      </BarChart>
    </ResponsiveContainer>
  );
}

/* ═════════════════════════════════════════════════════════════
 *  Payments Trend
 * ═════════════════════════════════════════════════════════════ */
function PaymentsTrend({
  series,
  groupBy,
}: {
  series: SeriesBucket[];
  groupBy: GroupBy;
}) {
  const data = series.map((r) => ({
    bucket: r.bucket,
    payments: r.payments,
    credit: r.apOnAccount + r.acOnAccount + r.serviceOnAccount + r.paintingOnAccount,
  }));
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis
          dataKey="bucket"
          tick={{ fontSize: 10 }}
          tickFormatter={(v) => {
            const d = new Date(v);
            if (groupBy === "year") return String(d.getFullYear());
            if (groupBy === "month" || groupBy === "quarter")
              return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
            return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
          }}
        />
        <YAxis tick={{ fontSize: 10 }} tickFormatter={fmtPeso} width={60} />
        <Tooltip
          contentStyle={{ fontSize: 11, borderRadius: 6 }}
          formatter={pesoTooltipFormatter}
          labelFormatter={pesoTooltipLabelFormatter}
        />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Line type="monotone" dataKey="credit" name="Credit Sales" stroke="#f59e0b" strokeWidth={1.5} dot={false} />
        <Line type="monotone" dataKey="payments" name="AR Collections" stroke="#10b981" strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

/* ═════════════════════════════════════════════════════════════
 *  Day-of-Week chart (bar, not actual heatmap — simpler + more legible)
 * ═════════════════════════════════════════════════════════════ */
function DayOfWeekChart({ dow }: { dow: DayOfWeekRow[] }) {
  const data = dow.map((r) => ({ ...r, label: DOW_NAMES[r.dow] }));
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 5, right: 10, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis dataKey="label" tick={{ fontSize: 10 }} />
        <YAxis tick={{ fontSize: 10 }} tickFormatter={fmtPeso} width={60} />
        <Tooltip
          contentStyle={{ fontSize: 11, borderRadius: 6 }}
          formatter={pesoTooltipFormatter}
        />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Bar dataKey="avg" name="Avg / day" fill="#3b82f6" />
      </BarChart>
    </ResponsiveContainer>
  );
}

/* ═════════════════════════════════════════════════════════════
 *  YoY multi-line chart
 * ═════════════════════════════════════════════════════════════ */
function YoYChart({ yoy }: { yoy: YoYRow[] }) {
  // Pivot into { month, [year1]: total, [year2]: total, ... }
  const { pivoted, years } = useMemo(() => {
    const yearSet = new Set<number>();
    const byMonth = new Map<number, Record<string, number>>();
    for (const r of yoy) {
      yearSet.add(r.year);
      if (!byMonth.has(r.month)) byMonth.set(r.month, { month: r.month });
      byMonth.get(r.month)![String(r.year)] = r.total;
    }
    const pivoted = Array.from({ length: 12 }, (_, i) => ({
      month: i + 1,
      label: MONTH_LABELS[i],
      ...(byMonth.get(i + 1) ?? {}),
    }));
    return { pivoted, years: [...yearSet].sort() };
  }, [yoy]);

  if (years.length === 0) {
    return <div className="py-10 text-center text-[11px] text-muted-foreground">No YoY data</div>;
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={pivoted} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis dataKey="label" tick={{ fontSize: 10 }} />
        <YAxis tick={{ fontSize: 10 }} tickFormatter={fmtPeso} width={60} />
        <Tooltip
          contentStyle={{ fontSize: 11, borderRadius: 6 }}
          formatter={pesoTooltipFormatter}
        />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        {years.map((y, idx) => (
          <Line
            key={y}
            type="monotone"
            dataKey={String(y)}
            name={String(y)}
            stroke={YOY_COLORS[idx % YOY_COLORS.length]}
            strokeWidth={idx === years.length - 1 ? 2.5 : 1.5}
            dot={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

/* ═════════════════════════════════════════════════════════════
 *  Detailed data table (sortable, CSV export)
 * ═════════════════════════════════════════════════════════════ */
type SortField =
  | "date"
  | "apOldSales"
  | "apNewSales"
  | "apOnAccount"
  | "acSales"
  | "acOnAccount"
  | "serviceSales"
  | "serviceOnAccount"
  | "paintingSales"
  | "paintingOnAccount"
  | "juniorSales"
  | "payments"
  | "total";

function DailyDataTable({ rows, from, to }: { rows: DailyRow[]; from: string; to: string }) {
  const [sortField, setSortField] = useState<SortField>("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [search, setSearch] = useState("");

  const sorted = useMemo(() => {
    const withTotal = rows.map((r) => ({
      ...r,
      total:
        r.apOldSales + r.apNewSales + r.apOnAccount +
        r.acSales + r.acOnAccount +
        r.serviceSales + r.serviceOnAccount +
        r.paintingSales + r.paintingOnAccount +
        r.juniorSales,
    }));
    const filtered = search
      ? withTotal.filter((r) => r.date.includes(search))
      : withTotal;
    return [...filtered].sort((a, b) => {
      let cmp: number;
      if (sortField === "date") {
        cmp = a.date.localeCompare(b.date);
      } else {
        cmp = (a[sortField] as number) - (b[sortField] as number);
      }
      return sortDir === "desc" ? -cmp : cmp;
    });
  }, [rows, search, sortField, sortDir]);

  const handleSort = (field: SortField) => {
    if (field === sortField) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir(field === "date" ? "desc" : "desc");
    }
  };

  const exportCSV = () => {
    const headers = [
      "Date",
      "A/P Old", "A/P New", "A/P On Acct",
      "A/C", "A/C On Acct",
      "Service", "Service On Acct",
      "Painting", "Painting On Acct",
      "Junior",
      "Payments",
      "Total",
    ];
    const csvRows = sorted.map((r) =>
      [
        r.date,
        r.apOldSales, r.apNewSales, r.apOnAccount,
        r.acSales, r.acOnAccount,
        r.serviceSales, r.serviceOnAccount,
        r.paintingSales, r.paintingOnAccount,
        r.juniorSales,
        r.payments,
        r.total,
      ].join(","),
    );
    const blob = new Blob([headers.join(",") + "\n" + csvRows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `daily-sales-${from}-to-${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mb-4 rounded-xl border border-border bg-background shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <h3 className="text-[14px] font-semibold text-foreground">Daily Data</h3>
          <p className="text-[11px] text-muted-foreground">
            {sorted.length} days · {fmtDate(from)} – {fmtDate(to)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter by date (YYYY-MM)…"
            className="h-8 w-56 rounded-lg border border-border bg-background px-2 text-[12px] outline-none focus:border-primary/40"
          />
          <button
            onClick={exportCSV}
            disabled={sorted.length === 0}
            className="flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-[11px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Download size={12} /> Export CSV
          </button>
        </div>
      </div>
      <div className="max-h-[480px] overflow-auto">
        <table className="w-full text-[11px]">
          <thead className="sticky top-0 bg-muted/60 backdrop-blur">
            <tr>
              <Th field="date" label="Date" activeField={sortField} dir={sortDir} onSort={handleSort} align="left" />
              <Th field="apOldSales" label="A/P Old" activeField={sortField} dir={sortDir} onSort={handleSort} />
              <Th field="apNewSales" label="A/P New" activeField={sortField} dir={sortDir} onSort={handleSort} />
              <Th field="apOnAccount" label="A/P Acct" activeField={sortField} dir={sortDir} onSort={handleSort} />
              <Th field="acSales" label="A/C" activeField={sortField} dir={sortDir} onSort={handleSort} />
              <Th field="acOnAccount" label="A/C Acct" activeField={sortField} dir={sortDir} onSort={handleSort} />
              <Th field="serviceSales" label="Service" activeField={sortField} dir={sortDir} onSort={handleSort} />
              <Th field="serviceOnAccount" label="Svc Acct" activeField={sortField} dir={sortDir} onSort={handleSort} />
              <Th field="paintingSales" label="Painting" activeField={sortField} dir={sortDir} onSort={handleSort} />
              <Th field="paintingOnAccount" label="Paint Acct" activeField={sortField} dir={sortDir} onSort={handleSort} />
              <Th field="juniorSales" label="Junior" activeField={sortField} dir={sortDir} onSort={handleSort} />
              <Th field="payments" label="Payments" activeField={sortField} dir={sortDir} onSort={handleSort} />
              <Th field="total" label="Total" activeField={sortField} dir={sortDir} onSort={handleSort} />
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.date} className="border-b border-border/40 hover:bg-accent/30">
                <td className="px-3 py-1.5 font-mono text-[11px] text-muted-foreground">{r.date}</td>
                <Td v={r.apOldSales} />
                <Td v={r.apNewSales} />
                <Td v={r.apOnAccount} />
                <Td v={r.acSales} />
                <Td v={r.acOnAccount} />
                <Td v={r.serviceSales} />
                <Td v={r.serviceOnAccount} />
                <Td v={r.paintingSales} />
                <Td v={r.paintingOnAccount} />
                <Td v={r.juniorSales} />
                <Td v={r.payments} muted />
                <td className="px-3 py-1.5 text-right tabular-nums font-semibold text-foreground">
                  {r.total > 0 ? fmtPesoFull(r.total) : "—"}
                </td>
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={13} className="px-3 py-8 text-center text-[12px] text-muted-foreground">
                  No rows in the selected period
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({
  field,
  label,
  activeField,
  dir,
  onSort,
  align = "right",
}: {
  field: SortField;
  label: string;
  activeField: SortField;
  dir: "asc" | "desc";
  onSort: (f: SortField) => void;
  align?: "left" | "right";
}) {
  const active = field === activeField;
  return (
    <th
      className={cn(
        "px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground select-none",
        align === "right" ? "text-right" : "text-left",
      )}
    >
      <button
        onClick={() => onSort(field)}
        className={cn(
          "group inline-flex items-center gap-0.5 transition-colors",
          active ? "text-foreground" : "hover:text-foreground",
          align === "right" && "flex-row-reverse",
        )}
      >
        {label}
        <span className="inline-flex w-3 justify-center">
          {active ? (
            dir === "asc" ? <ChevronUp size={10} className="text-primary" strokeWidth={2.5} />
            : <ChevronDown size={10} className="text-primary" strokeWidth={2.5} />
          ) : (
            <ChevronsUpDown size={10} className="text-muted-foreground/30 group-hover:text-muted-foreground/60" />
          )}
        </span>
      </button>
    </th>
  );
}

function Td({ v, muted }: { v: number; muted?: boolean }) {
  if (v === 0) {
    return <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground/30">—</td>;
  }
  return (
    <td
      className={cn(
        "px-3 py-1.5 text-right tabular-nums",
        muted ? "text-emerald-600" : "text-foreground",
      )}
    >
      {fmtPesoFull(v)}
    </td>
  );
}

/* ═════════════════════════════════════════════════════════════
 *  SECTION 1 — Daily Sales Report card
 *
 *  Replicates the legacy Excel "Daily Sales Report" template that
 *  Chris reviews every morning. Each division row shows the cash/credit
 *  breakdown, division total, and percentage of grand total. The
 *  Auto Parts row also shows the OLD/NEW ratio (e.g. 0.18 / 0.82).
 *
 *  Optional "Compare to yesterday" overlay renders a green/red delta
 *  next to each division total.
 * ═════════════════════════════════════════════════════════════ */

interface DailyReportCardProps {
  date: string;
  data: SingleDayResponse | null;
  previous: SingleDayResponse | null;
  loading: boolean;
  compareEnabled: boolean;
  onSetDate: (iso: string) => void;
  onStepDate: (deltaDays: number) => void;
  onToggleCompare: () => void;
  /** Opens the manual entry modal in CREATE mode (no-data CTA) */
  onCreateEntry: () => void;
  /** Opens the manual entry modal in EDIT mode (Edit pencil on populated card) */
  onEditEntry: () => void;
}

function DailyReportCard({
  date,
  data,
  previous,
  loading,
  compareEnabled,
  onSetDate,
  onStepDate,
  onToggleCompare,
  onCreateEntry,
  onEditEntry,
}: DailyReportCardProps) {
  const longDate = new Date(date + "T12:00:00Z").toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
  const dayOfWeek = data?.dayOfWeek ?? new Date(date + "T12:00:00Z").toLocaleDateString("en-US", {
    weekday: "long",
    timeZone: "UTC",
  });

  const handlePrint = () => window.print();
  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.value) onSetDate(e.target.value);
  };

  return (
    <div className="mb-4 overflow-hidden rounded-2xl border border-border bg-background shadow-[0_4px_24px_-12px_rgba(0,0,0,0.12)] print:shadow-none print:border-black">
      {/* Title strip — matches the Excel report header */}
      <div className="border-b border-border bg-gradient-to-b from-amber-50 to-background px-6 py-4 text-center print:bg-white">
        <div className="font-serif text-[15px] font-bold tracking-wide text-foreground">
          C-BROS GENUINE AUTO PARTS &amp; ACCESSORIES, INC
        </div>
        <div className="mt-0.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Daily Sales Report
        </div>
      </div>

      {/* Date navigator + actions */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-muted/20 px-6 py-3 print:hidden">
        <div className="flex items-center gap-2">
          <button
            onClick={() => onStepDate(-1)}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
            title="Previous day (←)"
          >
            <ChevronLeft size={14} />
          </button>
          <input
            type="date"
            value={date}
            onChange={handleDateChange}
            max={toIso(new Date())}
            className="h-8 rounded-md border border-border bg-background px-2 text-[12px] font-medium outline-none focus:border-primary/40"
          />
          <button
            onClick={() => onStepDate(1)}
            disabled={date >= toIso(new Date())}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
            title="Next day (→)"
          >
            <ChevronRight size={14} />
          </button>
          <div className="ml-2 flex flex-col leading-tight">
            <span className="text-[14px] font-bold text-foreground">{longDate}</span>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {dayOfWeek}
              <span className="ml-2 text-muted-foreground/60">← → arrow keys to navigate</span>
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onToggleCompare}
            className={cn(
              "flex h-8 items-center gap-1.5 rounded-md border px-3 text-[11px] font-medium transition-colors",
              compareEnabled
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <ArrowUpRight size={12} />
            Compare to Yesterday
          </button>
          {/* Edit pencil — only shown for dates that already have data.
              Dates with no data get the bigger "Enter Sales" CTA inside
              the NoDataPanel below. */}
          {data?.hasData && (
            <button
              onClick={onEditEntry}
              className="flex h-8 items-center gap-1.5 rounded-md border border-border bg-background px-3 text-[11px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
              title="Edit this day's sales"
            >
              <Pencil size={12} />
              Edit
            </button>
          )}
          <button
            onClick={handlePrint}
            className="flex h-8 items-center gap-1.5 rounded-md border border-border bg-background px-3 text-[11px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Printer size={12} />
            Print
          </button>
        </div>
      </div>

      {/* Print-only header (visible only when printing) */}
      <div className="hidden border-b border-black px-6 py-2 text-center print:block">
        <div className="text-[11px] font-bold uppercase">
          {longDate} · {dayOfWeek}
        </div>
      </div>

      {/* Body */}
      {loading && !data ? (
        <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
          <Loader2 size={16} className="mr-2 animate-spin" /> Loading…
        </div>
      ) : !data || !data.hasData ? (
        <NoDataPanel date={date} dayOfWeek={dayOfWeek} onCreateEntry={onCreateEntry} />
      ) : (
        <ReportRows data={data} previous={previous} />
      )}
    </div>
  );
}

function NoDataPanel({
  date,
  dayOfWeek,
  onCreateEntry,
}: {
  date: string;
  dayOfWeek: string;
  onCreateEntry: () => void;
}) {
  // Refuse to show the "Enter Sales" CTA for future dates — sales can't
  // be reported before they happen, and the API will reject it anyway.
  const isFuture = date > toIso(new Date());
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <Calendar size={20} className="text-muted-foreground" />
      </div>
      <div>
        <p className="text-[14px] font-semibold text-foreground">No sales data recorded</p>
        <p className="mt-0.5 text-[12px] text-muted-foreground">
          Nothing on file for {dayOfWeek}, {new Date(date + "T12:00:00Z").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" })}.
        </p>
      </div>
      {!isFuture && (
        <button
          onClick={onCreateEntry}
          className="mt-1 inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-[12px] font-semibold text-primary-foreground hover:bg-primary/90"
        >
          <Plus size={14} />
          Enter Sales for This Day
        </button>
      )}
      {isFuture && (
        <p className="text-[11px] italic text-muted-foreground/70">
          This is a future date — sales can be entered once the day has passed.
        </p>
      )}
    </div>
  );
}

/* ─── Body rows (5 divisions + totals) ─── */

const DIVISION_TINTS: Record<string, string> = {
  ap: "bg-blue-50/40",
  ac: "bg-emerald-50/40",
  service: "bg-amber-50/40",
  painting: "bg-violet-50/40",
  junior: "bg-rose-50/40",
};

function ReportRows({
  data,
  previous,
}: {
  data: SingleDayResponse;
  previous: SingleDayResponse | null;
}) {
  const compare = previous?.hasData ? previous : null;

  return (
    <div className="px-6 py-4">
      <div className="overflow-hidden rounded-lg border border-border print:border-black">
        {/* AUTO PARTS */}
        <DivisionRow
          tintClass={DIVISION_TINTS.ap}
          label="A/P"
          total={data.ap.total}
          previousTotal={compare?.ap.total ?? null}
          percentage={data.percentages.ap}
          subRows={[
            { label: "OLD", value: data.ap.old, ratio: data.ap.oldRatio },
            { label: "NEW", value: data.ap.new, ratio: data.ap.newRatio },
            { label: "ACCT", value: data.ap.onAccount },
          ]}
        />
        {/* ACCESSORIES */}
        <DivisionRow
          tintClass={DIVISION_TINTS.ac}
          label="A/C"
          total={data.ac.total}
          previousTotal={compare?.ac.total ?? null}
          percentage={data.percentages.ac}
          subRows={[
            { label: "CASH", value: data.ac.cash },
            { label: "ACCT", value: data.ac.onAccount },
          ]}
        />
        {/* SERVICE (the Excel labels this row "A/R") */}
        <DivisionRow
          tintClass={DIVISION_TINTS.service}
          label="A/R (SERVICE)"
          total={data.service.total}
          previousTotal={compare?.service.total ?? null}
          percentage={data.percentages.service}
          subRows={[
            { label: "CASH", value: data.service.cash },
            { label: "ACCT", value: data.service.onAccount },
          ]}
        />
        {/* PAINTING */}
        <DivisionRow
          tintClass={DIVISION_TINTS.painting}
          label="PAINTING"
          total={data.painting.total}
          previousTotal={compare?.painting.total ?? null}
          percentage={data.percentages.painting}
          subRows={[
            { label: "CASH", value: data.painting.cash },
            { label: "ACCT", value: data.painting.onAccount },
          ]}
        />
        {/* JUNIOR */}
        <DivisionRow
          tintClass={DIVISION_TINTS.junior}
          label="JUNIOR"
          total={data.junior.total}
          previousTotal={compare?.junior.total ?? null}
          percentage={data.percentages.junior}
          subRows={[
            { label: "CASH", value: data.junior.cash },
          ]}
          isLast
        />
      </div>

      {/* TOTALS block */}
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <TotalsTile label="TOTAL CASH" value={data.totals.cash} />
        <TotalsTile label="TOTAL ON ACCT" value={data.totals.onAccount} />
        <TotalsTile label="GRAND TOTAL" value={data.totals.grandTotal} highlight />
      </div>

      {/* PAYMENTS row (separate — these are AR collections, not sales) */}
      <div className="mt-2 flex items-center justify-between rounded-lg border border-border bg-muted/30 px-4 py-3">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Payments Received (AR Collections)
        </span>
        <span className="text-[15px] font-bold tabular-nums text-emerald-600">
          {data.totals.payments > 0 ? fmtPesoFull(data.totals.payments) : "—"}
        </span>
      </div>
    </div>
  );
}

/* ─── One division row (label + total + sub-rows + % bar) ─── */

interface SubRow {
  label: string;
  value: number;
  /** Optional ratio (0..1) — used for A/P OLD/NEW */
  ratio?: number | null;
}

function DivisionRow({
  tintClass,
  label,
  total,
  previousTotal,
  percentage,
  subRows,
  isLast,
}: {
  tintClass: string;
  label: string;
  total: number;
  previousTotal: number | null;
  percentage: number;
  subRows: SubRow[];
  isLast?: boolean;
}) {
  const delta = previousTotal != null ? total - previousTotal : null;
  return (
    <div
      className={cn(
        tintClass,
        !isLast && "border-b border-border print:border-black",
        "px-4 py-3",
      )}
    >
      <div className="flex items-baseline justify-between gap-4">
        {/* Label */}
        <div className="min-w-[140px] text-[13px] font-bold uppercase tracking-wider text-foreground">
          {label}
        </div>
        {/* Total + delta */}
        <div className="flex flex-1 items-baseline justify-end gap-3">
          {delta != null && (
            <DeltaPill delta={delta} />
          )}
          <div className="text-[18px] font-bold tabular-nums text-foreground">
            {total > 0 ? fmtPesoFull(total) : "—"}
          </div>
          {/* Percent of grand total + bar */}
          <div className="ml-2 flex w-20 flex-col items-end">
            <div className="text-[11px] font-semibold tabular-nums text-muted-foreground">
              {percentage.toFixed(1)}%
            </div>
            <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-border">
              <div
                className="h-full rounded-full bg-foreground/60"
                style={{ width: `${Math.min(100, Math.max(0, percentage))}%` }}
              />
            </div>
          </div>
        </div>
      </div>
      {/* Sub-rows */}
      <div className="mt-1.5 grid grid-cols-[140px_1fr] gap-y-0.5 text-[12px]">
        {subRows.map((sub) => (
          <SubRowDisplay key={sub.label} sub={sub} />
        ))}
      </div>
    </div>
  );
}

function SubRowDisplay({ sub }: { sub: SubRow }) {
  return (
    <>
      <div className="pl-6 text-muted-foreground">{sub.label}</div>
      <div className="flex items-baseline justify-end gap-2 tabular-nums text-foreground/80">
        <span>{sub.value > 0 ? fmtPesoFull(sub.value) : "—"}</span>
        {sub.ratio != null && (
          <span className="text-[10px] text-muted-foreground/70">
            ({sub.ratio.toFixed(2)})
          </span>
        )}
      </div>
    </>
  );
}

/** Green ↑ / red ↓ delta pill rendered next to a division total. */
function DeltaPill({ delta }: { delta: number }) {
  if (delta === 0) {
    return (
      <span className="inline-flex items-center gap-0.5 rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
        ±0
      </span>
    );
  }
  const positive = delta > 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-semibold tabular-nums",
        positive
          ? "bg-emerald-50 text-emerald-700"
          : "bg-red-50 text-red-700",
      )}
    >
      {positive ? <ArrowUpRight size={10} /> : <ArrowDownRight size={10} />}
      {positive ? "+" : ""}
      {fmtPesoFull(delta)}
    </span>
  );
}

/* ═════════════════════════════════════════════════════════════
 *  Manual Entry Modal — POST /analytics/daily-sales/upsert
 *
 *  Mode 'create' opens an empty form (used by the no-data CTA).
 *  Mode 'edit'   prefills from the existing SingleDayResponse so the user
 *                can correct individual values.
 *
 *  Submitting writes to daily_sales_summary with source='MANUAL' and
 *  recorded_by set to the current admin user. The parent page is told via
 *  onSaved so it can replace its local state without a follow-up GET.
 * ═════════════════════════════════════════════════════════════ */

interface EntryForm {
  apOldSales: string;
  apNewSales: string;
  apOnAccount: string;
  acSales: string;
  acOnAccount: string;
  serviceSales: string;
  serviceOnAccount: string;
  paintingSales: string;
  paintingOnAccount: string;
  juniorSales: string;
  payments: string;
  notes: string;
}

const EMPTY_ENTRY_FORM: EntryForm = {
  apOldSales: "",
  apNewSales: "",
  apOnAccount: "",
  acSales: "",
  acOnAccount: "",
  serviceSales: "",
  serviceOnAccount: "",
  paintingSales: "",
  paintingOnAccount: "",
  juniorSales: "",
  payments: "",
  notes: "",
};

function ManualEntryModal({
  mode,
  date,
  existing,
  token,
  locationId,
  onClose,
  onSaved,
}: {
  mode: "create" | "edit";
  date: string;
  existing: SingleDayResponse | null;
  token: string;
  locationId: string;
  onClose: () => void;
  onSaved: (saved: SingleDayResponse) => void;
}) {
  // Prefill from existing data when editing. We use string state (not number)
  // so empty inputs stay empty rather than rendering "0" — and the user can
  // type partial decimals without React fighting them.
  const [form, setForm] = useState<EntryForm>(() => {
    if (mode === "edit" && existing && existing.hasData) {
      const fmt = (n: number) => (n === 0 ? "" : String(n));
      return {
        apOldSales: fmt(existing.ap.old),
        apNewSales: fmt(existing.ap.new),
        apOnAccount: fmt(existing.ap.onAccount),
        acSales: fmt(existing.ac.cash),
        acOnAccount: fmt(existing.ac.onAccount),
        serviceSales: fmt(existing.service.cash),
        serviceOnAccount: fmt(existing.service.onAccount),
        paintingSales: fmt(existing.painting.cash),
        paintingOnAccount: fmt(existing.painting.onAccount),
        juniorSales: fmt(existing.junior.cash),
        payments: fmt(existing.totals.payments),
        notes: "",
      };
    }
    return { ...EMPTY_ENTRY_FORM };
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Live grand-total preview (sums all sales fields, excludes payments).
  const grandTotal = useMemo(() => {
    const fields: Array<keyof EntryForm> = [
      "apOldSales",
      "apNewSales",
      "apOnAccount",
      "acSales",
      "acOnAccount",
      "serviceSales",
      "serviceOnAccount",
      "paintingSales",
      "paintingOnAccount",
      "juniorSales",
    ];
    return fields.reduce((sum, key) => {
      const n = parseFloat(form[key]);
      return sum + (isFinite(n) ? n : 0);
    }, 0);
  }, [form]);

  // ESC closes the modal (unless mid-save).
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !saving) onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, saving]);

  const setField = (key: keyof EntryForm, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      // Convert string fields to numbers, omitting empty strings (treated as 0)
      const toNum = (s: string) => {
        const n = parseFloat(s);
        return isFinite(n) && n >= 0 ? n : 0;
      };
      // Validate: at least one positive value (otherwise saving an
      // all-zero row is pointless and would confuse the auto-snap logic).
      const hasAnyValue =
        toNum(form.apOldSales) > 0 ||
        toNum(form.apNewSales) > 0 ||
        toNum(form.apOnAccount) > 0 ||
        toNum(form.acSales) > 0 ||
        toNum(form.acOnAccount) > 0 ||
        toNum(form.serviceSales) > 0 ||
        toNum(form.serviceOnAccount) > 0 ||
        toNum(form.paintingSales) > 0 ||
        toNum(form.paintingOnAccount) > 0 ||
        toNum(form.juniorSales) > 0 ||
        toNum(form.payments) > 0;
      if (!hasAnyValue) {
        throw new Error("Enter at least one non-zero value before saving");
      }
      const payload = {
        date,
        apOldSales: toNum(form.apOldSales),
        apNewSales: toNum(form.apNewSales),
        apOnAccount: toNum(form.apOnAccount),
        acSales: toNum(form.acSales),
        acOnAccount: toNum(form.acOnAccount),
        serviceSales: toNum(form.serviceSales),
        serviceOnAccount: toNum(form.serviceOnAccount),
        paintingSales: toNum(form.paintingSales),
        paintingOnAccount: toNum(form.paintingOnAccount),
        juniorSales: toNum(form.juniorSales),
        payments: toNum(form.payments),
        notes: form.notes.trim() || null,
      };
      const result = await apiFetch<SingleDayResponse>(
        "/analytics/daily-sales/upsert",
        {
          method: "POST",
          token,
          locationId,
          body: JSON.stringify(payload),
        },
      );
      onSaved(result);
    } catch (err: any) {
      setError(err?.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const longDate = new Date(date + "T12:00:00Z").toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
        onClick={() => !saving && onClose()}
      />

      {/* Dialog */}
      <div className="relative w-full max-w-2xl rounded-2xl border border-border bg-background shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border bg-gradient-to-b from-amber-50 to-background px-6 py-4">
          <div>
            <h2 className="text-[15px] font-semibold text-foreground">
              {mode === "edit" ? "Edit Daily Sales" : "Enter Daily Sales"}
            </h2>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{longDate}</p>
          </div>
          <button
            onClick={onClose}
            disabled={saving}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body — scrollable form */}
        <form onSubmit={handleSubmit} className="max-h-[70vh] overflow-y-auto">
          <div className="space-y-4 px-6 py-4">
            <EntrySection title="Auto Parts (A/P)" tint="bg-blue-50/40">
              <EntryField label="OLD" value={form.apOldSales} onChange={(v) => setField("apOldSales", v)} />
              <EntryField label="NEW" value={form.apNewSales} onChange={(v) => setField("apNewSales", v)} />
              <EntryField label="On Account" value={form.apOnAccount} onChange={(v) => setField("apOnAccount", v)} />
            </EntrySection>

            <EntrySection title="Accessories (A/C)" tint="bg-emerald-50/40">
              <EntryField label="Cash" value={form.acSales} onChange={(v) => setField("acSales", v)} />
              <EntryField label="On Account" value={form.acOnAccount} onChange={(v) => setField("acOnAccount", v)} />
            </EntrySection>

            <EntrySection title="A/R (Service)" tint="bg-amber-50/40">
              <EntryField label="Cash" value={form.serviceSales} onChange={(v) => setField("serviceSales", v)} />
              <EntryField label="On Account" value={form.serviceOnAccount} onChange={(v) => setField("serviceOnAccount", v)} />
            </EntrySection>

            <EntrySection title="Painting" tint="bg-violet-50/40">
              <EntryField label="Cash" value={form.paintingSales} onChange={(v) => setField("paintingSales", v)} />
              <EntryField label="On Account" value={form.paintingOnAccount} onChange={(v) => setField("paintingOnAccount", v)} />
            </EntrySection>

            <EntrySection title="Junior Branch" tint="bg-rose-50/40">
              <EntryField label="Cash" value={form.juniorSales} onChange={(v) => setField("juniorSales", v)} />
            </EntrySection>

            <EntrySection title="AR Collections (separate from sales)" tint="bg-muted/40">
              <EntryField label="Payments Received" value={form.payments} onChange={(v) => setField("payments", v)} />
            </EntrySection>

            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Notes (optional)
              </label>
              <textarea
                value={form.notes}
                onChange={(e) => setField("notes", e.target.value)}
                rows={2}
                placeholder="e.g. half-day, holiday, system was down…"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-[12px] outline-none focus:border-primary/40 focus:ring-1 focus:ring-primary/20"
              />
            </div>

            {error && (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
                {error}
              </div>
            )}
          </div>

          {/* Footer with grand-total preview */}
          <div className="flex items-center justify-between gap-3 border-t border-border bg-muted/20 px-6 py-3">
            <div className="text-[11px] text-muted-foreground">
              Grand total preview:{" "}
              <span className="ml-1 text-[14px] font-bold tabular-nums text-foreground">
                {grandTotal > 0 ? fmtPesoFull(grandTotal) : "—"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className="rounded-md border border-border px-3 py-1.5 text-[12px] font-medium hover:bg-muted disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-1.5 text-[12px] font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
              >
                {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                {mode === "edit" ? "Save Changes" : "Save Entry"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

function EntrySection({
  title,
  tint,
  children,
}: {
  title: string;
  tint: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("rounded-lg border border-border p-3", tint)}>
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">{children}</div>
    </div>
  );
}

function EntryField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="mb-0.5 block text-[10px] font-medium text-muted-foreground">
        {label}
      </label>
      <div className="relative">
        <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground">
          ₱
        </span>
        <input
          type="number"
          inputMode="decimal"
          min={0}
          step="0.01"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="0.00"
          className="h-8 w-full rounded-md border border-border bg-background pl-5 pr-2 text-right text-[12px] tabular-nums outline-none focus:border-primary/40 focus:ring-1 focus:ring-primary/20"
        />
      </div>
    </div>
  );
}

function TotalsTile({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border px-4 py-3",
        highlight
          ? "border-amber-300 bg-amber-50 print:border-black"
          : "border-border bg-muted/30 print:border-black print:bg-white",
      )}
    >
      <div
        className={cn(
          "text-[10px] font-semibold uppercase tracking-[0.12em]",
          highlight ? "text-amber-700" : "text-muted-foreground",
        )}
      >
        {label}
      </div>
      <div
        className={cn(
          "mt-1 tabular-nums font-bold",
          highlight ? "text-[22px] text-amber-900" : "text-[16px] text-foreground",
        )}
      >
        {value > 0 ? fmtPesoFull(value) : "—"}
      </div>
    </div>
  );
}
