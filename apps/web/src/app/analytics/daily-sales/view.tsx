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
  useRef,
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
  Camera,
  Check,
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
export function DailySalesView() {
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

/**
 * Builds a static, print-ready HTML string for the Daily Sales Report image.
 *
 * Design brief: mirror the live on-screen `#daily-report-card` element-for-
 * element at its full 640px width, so the captured PNG is visually identical
 * to what the user sees in the browser. The on-screen card is rendered by
 * `DailyReportCard` → `ReportRows` → `DivisionCard`; this template hand-
 * rewrites the same layout in inline-styled HTML that survives the
 * dom-to-image-more cloning pass without Tailwind class lookups.
 *
 * Why a static string instead of capturing the live React card directly:
 * dom-to-image-more struggles with the live card's modern CSS (oklch color
 * vars, flexbox gaps, backdrop filters, responsive breakpoints). An earlier
 * attempt in this codebase produced mangled output with cut-off text and
 * washed colors. The static-HTML + scoped-reset approach is robust and we've
 * already proved it captures cleanly at 1:1.
 *
 * Template rules — all chosen to survive dom-to-image-more's CSS inlining:
 *  • A scoped `<style>` reset (`.ds-img-root *, ...`) zeroes out every
 *    descendant's border/outline/box-shadow so Tailwind's preflight
 *    `border:0 solid #E5E7EB` can't leak through as ghost 0.666…px
 *    hairlines. Specificity (0,1,0) beats preflight's `*` (0,0,0) but
 *    stays below inline styles (1,0,0,0), so the elements that explicitly
 *    declare a border still get one.
 *  • Every <div>, <table>, and <td> starts its inline style with
 *    `NO_BORDER` belt-and-suspenders; elements with real borders declare
 *    them after.
 *  • Flex layouts are replaced with 2-cell <table> rows (baseline-aligned).
 *  • Proportion bars are divs with nested fill divs — no table cells.
 *  • A/P's segmented OLD/NEW bar uses a `width:${barPct}%` outer div
 *    containing a 2-cell table whose widths are `${oldRatio*100}%` and
 *    `${newRatio*100}%`. Left cell gets 0.55 opacity for the OLD segment.
 *  • All colors are hex; no CSS variables, no oklch.
 *  • Geist/SF stack with Arial/Courier fallbacks since web fonts may not
 *    load inside the foreignObject pipeline.
 *  • Dimensions and font sizes match the on-screen card verbatim.
 */
function buildDailySalesImageHtml(
  data: SingleDayResponse,
  longDate: string,
  dayOfWeek: string,
): string {
  const peso = (v: number): string =>
    v > 0
      ? `\u20B1${v.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : "\u2014";
  const pct = (v: number): string => `${v.toFixed(1)}%`;

  const SANS = "'Geist','SF Pro Display',-apple-system,'Segoe UI',Arial,sans-serif";
  const MONO = "'Geist Mono','SF Mono','Cascadia Code','Courier New',monospace";
  const SERIF = "Georgia,'Times New Roman',serif";

  // Mirrors DIVISION_STYLES at the top of this file. Kept as a local copy
  // so the template is a pure string function with no cross-cutting deps.
  // If the on-screen palette ever changes, update both places.
  const DS = {
    ap:       { bar: "#2563eb", headerBg: "#eff6ff", text: "#1e40af" },
    ac:       { bar: "#16a34a", headerBg: "#f0fdf4", text: "#15803d" },
    service:  { bar: "#ea580c", headerBg: "#fff7ed", text: "#c2410c" },
    painting: { bar: "#7c3aed", headerBg: "#f5f3ff", text: "#6d28d9" },
    junior:   { bar: "#0891b2", headerBg: "#ecfeff", text: "#0e7490" },
  };

  const NO_BORDER = "border:0;";
  const TD = `${NO_BORDER}padding:0;`;

  type DivisionStyleKey = keyof typeof DS;
  type SubItemSpec = {
    label: string;
    value: number;
    ratio?: number | null;
  };

  // Renders an inline SubItem — label + amount + optional ratio — matching
  // the on-screen `SubItem` component at `page.tsx:2117`.
  const renderSubItem = (spec: SubItemSpec, accentColor: string, isZero: boolean): string => {
    const valueColor = isZero ? "#CBD5E1" : "#334155";
    const labelColor = isZero ? "#CBD5E1" : accentColor;
    const ratioText =
      spec.ratio != null && spec.value > 0
        ? `<span style="${NO_BORDER}font-size:9px;color:#94A3B8;margin-left:4px;font-family:${MONO};">(${spec.ratio.toFixed(2)})</span>`
        : "";
    return `<span style="${NO_BORDER}font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:${labelColor};opacity:0.7;margin-right:4px;font-family:${SANS};">${spec.label}</span><span style="${NO_BORDER}font-size:12px;font-weight:600;color:${valueColor};font-family:${MONO};white-space:nowrap;">${peso(spec.value)}</span>${ratioText}`;
  };

  // Renders one DivisionCard: header strip (tinted bg with label+amount+pct),
  // progress bar row, and sub-row with CASH/OLD/NEW/ACCT SubItems.
  const section = (opts: {
    styleKey: DivisionStyleKey;
    label: string;
    sublabel?: string;
    total: number;
    percentage: number;
    segmented?: { old: { value: number; ratio: number | null }; new: { value: number; ratio: number | null } };
    cash?: number;
    acct?: number;
  }): string => {
    const { styleKey, label, sublabel, total, percentage, segmented, cash, acct } = opts;
    const style = DS[styleKey];
    const isZero = total <= 0;
    const barPct = Math.max(0, Math.min(100, percentage));

    // Header strip bg/colors match on-screen: zero sections use slate-50
    // wash with muted label colors, active sections use the per-division
    // headerBg tint with full-strength label colors.
    const headerBg = isZero ? "#F8FAFC" : style.headerBg;
    const labelColor = isZero ? "#94A3B8" : style.text;
    const sublabelColor = isZero ? "#CBD5E1" : style.text;
    const amountColor = isZero ? "#94A3B8" : "#0F172A";
    const percentColor = isZero ? "#CBD5E1" : "#64748B";
    const cardBg = isZero ? "#F8FAFCcc" : "#FFFFFF"; // slate-50/40 equiv for zero
    const cardOpacity = isZero ? "opacity:0.7;" : "";

    // Header row: label [+ sublabel] left, amount + percent right.
    const sublabelSpan = sublabel
      ? `<span style="${NO_BORDER}font-size:10px;font-weight:500;text-transform:uppercase;letter-spacing:0.05em;color:${sublabelColor};opacity:0.7;margin-left:8px;font-family:${SANS};">${sublabel}</span>`
      : "";
    const headerRow = `
      <table style="${NO_BORDER}width:100%;border-collapse:collapse;background:${headerBg};">
        <tr>
          <td style="${TD}padding:6px 14px;font-size:13px;font-weight:800;text-transform:uppercase;letter-spacing:0.05em;color:${labelColor};font-family:${SANS};vertical-align:middle;">${label}${sublabelSpan}</td>
          <td style="${TD}padding:6px 14px;text-align:right;vertical-align:middle;white-space:nowrap;"><span style="${NO_BORDER}font-size:16px;font-weight:800;color:${amountColor};font-family:${MONO};">${isZero ? "\u2014" : peso(total)}</span><span style="${NO_BORDER}font-size:11px;font-weight:700;color:${percentColor};font-family:${MONO};margin-left:8px;min-width:42px;display:inline-block;text-align:right;">${pct(percentage)}</span></td>
        </tr>
      </table>`;

    // Progress bar row. Track is a gray rounded div; fill is either a
    // single colored div (non-segmented) or a percentage-width div
    // containing a 2-cell table whose cells hold OLD (55% opacity) + NEW.
    let fillHtml = "";
    if (!isZero) {
      if (segmented) {
        const oldPct = (segmented.old.ratio ?? 0) * 100;
        const newPct = (segmented.new.ratio ?? 0) * 100;
        fillHtml = `
          <div style="${NO_BORDER}width:${barPct.toFixed(1)}%;height:10px;">
            <table style="${NO_BORDER}width:100%;height:10px;border-collapse:collapse;table-layout:fixed;">
              <tr>
                <td style="${TD}width:${oldPct.toFixed(1)}%;background:${style.bar};opacity:0.55;height:10px;font-size:0;line-height:0;">&nbsp;</td>
                <td style="${TD}width:${newPct.toFixed(1)}%;background:${style.bar};height:10px;font-size:0;line-height:0;">&nbsp;</td>
              </tr>
            </table>
          </div>`;
      } else {
        fillHtml = `<div style="${NO_BORDER}width:${barPct.toFixed(1)}%;height:10px;background:${style.bar};border-radius:9999px;"></div>`;
      }
    }
    const barRow = `
      <div style="${NO_BORDER}padding:8px 14px 0 14px;">
        <div style="${NO_BORDER}height:10px;background:#F1F5F9;border-radius:9999px;overflow:hidden;">
          ${fillHtml}
        </div>
      </div>`;

    // Sub-row: SubItems on the left (OLD·NEW or CASH), ACCT on the right.
    let leftContent = "";
    if (segmented) {
      leftContent = `${renderSubItem({ label: "OLD", value: segmented.old.value, ratio: segmented.old.ratio }, style.text, isZero)}<span style="${NO_BORDER}color:#CBD5E1;margin:0 8px;">\u00B7</span>${renderSubItem({ label: "NEW", value: segmented.new.value, ratio: segmented.new.ratio }, style.text, isZero)}`;
    } else if (cash !== undefined) {
      leftContent = renderSubItem({ label: "CASH", value: cash }, style.text, isZero);
    }
    const rightContent =
      acct !== undefined
        ? renderSubItem({ label: "ACCT", value: acct }, style.text, isZero)
        : "";
    const subRow = `
      <table style="${NO_BORDER}width:100%;border-collapse:collapse;">
        <tr>
          <td style="${TD}padding:8px 14px 10px 14px;vertical-align:middle;">${leftContent}</td>
          <td style="${TD}padding:8px 14px 10px 14px;text-align:right;vertical-align:middle;white-space:nowrap;">${rightContent}</td>
        </tr>
      </table>`;

    return `
    <div style="${NO_BORDER}border:1px solid #E2E8F0;border-radius:12px;overflow:hidden;background:${cardBg};${cardOpacity}margin-bottom:10px;">
      ${headerRow}
      ${barRow}
      ${subRow}
    </div>`;
  };

  // Grand-total footer: 3-column table (Total Cash | Total On Acct | Grand
  // Total) plus a PAYMENTS row underneath. The on-screen card uses
  // `grid-cols-[1fr_1fr_1.4fr]`, which at 3.4 total fractions gives
  // 29.4% / 29.4% / 41.2%.
  const totalCashCell = `
    <td style="${TD}padding:10px 18px;vertical-align:middle;border-right:1px solid #FDE68A;width:29.4%;">
      <div style="${NO_BORDER}font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.16em;color:#B45309;opacity:0.8;font-family:${SANS};">Total Cash</div>
      <div style="${NO_BORDER}margin-top:2px;font-size:14px;font-weight:700;color:#78350F;font-family:${MONO};white-space:nowrap;">${peso(data.totals.cash)}</div>
    </td>`;
  const totalAcctCell = `
    <td style="${TD}padding:10px 18px;vertical-align:middle;border-right:1px solid #FDE68A;width:29.4%;">
      <div style="${NO_BORDER}font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.16em;color:#B45309;opacity:0.8;font-family:${SANS};">Total On Acct</div>
      <div style="${NO_BORDER}margin-top:2px;font-size:14px;font-weight:700;color:#78350F;font-family:${MONO};white-space:nowrap;">${peso(data.totals.onAccount)}</div>
    </td>`;
  const grandTotalCell = `
    <td style="${TD}padding:10px 18px;text-align:right;vertical-align:middle;width:41.2%;">
      <div style="${NO_BORDER}font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.18em;color:#B45309;font-family:${SANS};">Grand Total</div>
      <div style="${NO_BORDER}margin-top:2px;font-size:22px;font-weight:800;color:#78350F;font-family:${MONO};white-space:nowrap;">${peso(data.totals.grandTotal)}</div>
    </td>`;

  return `
<div class="ds-img-root" style="${NO_BORDER}width:640px;background:#FFFFFF;color:#0F172A;box-sizing:border-box;font-family:${SANS};border:1px solid #E5E7EB;border-radius:16px;overflow:hidden;">
  <style>
    .ds-img-root *, .ds-img-root *::before, .ds-img-root *::after {
      border-width: 0;
      border-style: none;
      border-color: transparent;
      outline-style: none;
      outline-width: 0;
      box-shadow: none;
    }
  </style>

  <div style="${NO_BORDER}padding:16px 24px;text-align:center;border-bottom:1px solid #E5E7EB;background:linear-gradient(180deg,#FFFBEB 0%,#FFFFFF 100%);">
    <div style="${NO_BORDER}font-family:${SERIF};font-size:15px;font-weight:700;letter-spacing:0.02em;color:#0F172A;">
      C-BROS GENUINE AUTO PARTS &amp; ACCESSORIES, INC
    </div>
    <div style="${NO_BORDER}font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.18em;color:#64748B;margin-top:2px;font-family:${SANS};">
      Daily Sales Report
    </div>
    <div style="${NO_BORDER}font-size:12px;font-weight:600;color:#334155;margin-top:8px;font-family:${SANS};">
      ${longDate} <span style="color:#94A3B8;">&middot;</span> <span style="text-transform:uppercase;letter-spacing:0.06em;color:#64748B;">${dayOfWeek}</span>
    </div>
  </div>

  <div style="${NO_BORDER}padding:16px 20px;">
    ${section({
      styleKey: "ap",
      label: "A/P",
      sublabel: "Auto Parts",
      total: data.ap.total,
      percentage: data.percentages.ap,
      segmented: {
        old: { value: data.ap.old, ratio: data.ap.oldRatio },
        new: { value: data.ap.new, ratio: data.ap.newRatio },
      },
      acct: data.ap.onAccount,
    })}
    ${section({
      styleKey: "ac",
      label: "A/C",
      sublabel: "Accessories",
      total: data.ac.total,
      percentage: data.percentages.ac,
      cash: data.ac.cash,
      acct: data.ac.onAccount,
    })}
    ${section({
      styleKey: "service",
      label: "A/R",
      sublabel: "Service",
      total: data.service.total,
      percentage: data.percentages.service,
      cash: data.service.cash,
      acct: data.service.onAccount,
    })}
    ${section({
      styleKey: "painting",
      label: "Painting",
      total: data.painting.total,
      percentage: data.percentages.painting,
      cash: data.painting.cash,
      acct: data.painting.onAccount,
    })}
    ${section({
      styleKey: "junior",
      label: "Junior",
      total: data.junior.total,
      percentage: data.percentages.junior,
      cash: data.junior.cash,
    })}

    <div style="${NO_BORDER}margin-top:12px;border:1px solid #FCD34D;border-radius:12px;overflow:hidden;background:linear-gradient(180deg,#FFFBEB 0%,#FEF3C7 100%);">
      <table style="${NO_BORDER}width:100%;border-collapse:collapse;table-layout:fixed;">
        <tr>
          ${totalCashCell}
          ${totalAcctCell}
          ${grandTotalCell}
        </tr>
      </table>
      <table style="${NO_BORDER}width:100%;border-collapse:collapse;border-top:1px solid #FDE68A;background:#FFFBEB;">
        <tr>
          <td style="${TD}padding:8px 18px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.16em;color:#B45309;font-family:${SANS};">Payments (AR Collections)</td>
          <td style="${TD}padding:8px 18px;text-align:right;font-size:13px;font-weight:700;color:#78350F;font-family:${MONO};white-space:nowrap;">${peso(data.totals.payments)}</td>
        </tr>
      </table>
    </div>
  </div>
</div>
  `.trim();
}

/**
 * Renders the static image template into an off-screen container, captures
 * it with dom-to-image-more, and writes the PNG to the clipboard.
 *
 * Why dom-to-image-more (not html2canvas): html2canvas crashes on the modern
 * Tailwind/shadcn `oklch()` color function. Even though this template uses
 * only hex colors, the rest of the page still has oklch(), and html2canvas
 * walks the stylesheet list globally. dom-to-image-more's SVG-foreignObject
 * pipeline sidesteps that by letting the browser do color resolution.
 *
 * Dynamic import keeps the library (~150kB) out of the initial bundle — it
 * loads on first click only. ClipboardItem is not available in some browsers
 * (Safari < 13.4, older Firefox), so we fall back to a download.
 */
async function copyReportAsImage(
  data: SingleDayResponse,
  date: string,
  longDate: string,
  dayOfWeek: string,
): Promise<"copied" | "downloaded" | "failed"> {
  const html = buildDailySalesImageHtml(data, longDate, dayOfWeek);

  // Offscreen container — positioned far off-screen so it doesn't flash
  // visibly, but still laid out so offsetHeight is real.
  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.left = "-10000px";
  container.style.top = "0";
  container.style.width = "640px";
  container.style.background = "#ffffff";
  container.innerHTML = html;
  document.body.appendChild(container);

  try {
    const mod = await import("dom-to-image-more");
    const domtoimage = (mod as any).default ?? mod;

    // 2x scale via transform → sharper output without relying on a `scale`
    // option that dom-to-image-more doesn't have. Matches what the previous
    // implementation did and is the documented way to get retina PNGs.
    const w = 640;
    const h = container.offsetHeight;
    const blob: Blob | null = await domtoimage.toBlob(container, {
      bgcolor: "#ffffff",
      width: w * 2,
      height: h * 2,
      style: {
        transform: "scale(2)",
        transformOrigin: "top left",
        width: `${w}px`,
        height: `${h}px`,
      },
    });
    if (!blob) return "failed";

    if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
      try {
        await navigator.clipboard.write([
          new ClipboardItem({ "image/png": blob }),
        ]);
        return "copied";
      } catch {
        // fall through to download
      }
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `daily-sales-${date}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return "downloaded";
  } catch (e) {
    console.error("copyReportAsImage failed:", e);
    return "failed";
  } finally {
    document.body.removeChild(container);
  }
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

  // Two-second confirmation pill on the Copy button after a successful capture
  const [copyState, setCopyState] = useState<"idle" | "copying" | "copied" | "downloaded" | "failed">("idle");
  const copyResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handlePrint = () => window.print();
  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.value) onSetDate(e.target.value);
  };

  const handleCopy = async () => {
    if (copyState === "copying") return;
    if (!data || !data.hasData) return;
    setCopyState("copying");
    const result = await copyReportAsImage(data, date, longDate, dayOfWeek);
    setCopyState(result);
    if (copyResetRef.current) clearTimeout(copyResetRef.current);
    copyResetRef.current = setTimeout(() => setCopyState("idle"), 2200);
  };

  useEffect(() => {
    return () => {
      if (copyResetRef.current) clearTimeout(copyResetRef.current);
    };
  }, []);

  return (
    <div className="mb-4 print:shadow-none">
      {/* Date navigator + actions — kept OUTSIDE the capture target so the
          screenshot is just the report card, not the navigation chrome. */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-muted/20 px-4 py-2.5 print:hidden">
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
          <div className="ml-2 hidden flex-col leading-tight sm:flex">
            <span className="text-[13px] font-bold text-foreground">{longDate}</span>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {dayOfWeek}
              <span className="ml-2 text-muted-foreground/60">← → arrow keys</span>
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
            Compare
          </button>
          {data?.hasData && (
            <button
              onClick={handleCopy}
              disabled={copyState === "copying"}
              className={cn(
                "flex h-8 items-center gap-1.5 rounded-md border px-3 text-[11px] font-medium transition-colors",
                copyState === "copied" || copyState === "downloaded"
                  ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                  : copyState === "failed"
                    ? "border-red-500 bg-red-50 text-red-700"
                    : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
                copyState === "copying" && "cursor-wait opacity-70",
              )}
              title="Copy as image — paste directly into Viber/Messenger"
            >
              {copyState === "copying" ? (
                <Loader2 size={12} className="animate-spin" />
              ) : copyState === "copied" || copyState === "downloaded" ? (
                <Check size={12} />
              ) : (
                <Camera size={12} />
              )}
              {copyState === "copied"
                ? "Copied!"
                : copyState === "downloaded"
                  ? "Downloaded"
                  : copyState === "failed"
                    ? "Failed"
                    : "Copy"}
            </button>
          )}
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

      {/* ── Capture target ──
          Everything inside #daily-report-card ends up in the screenshot.
          Max-w-[640px] keeps the captured PNG at a chat-friendly width.
          Width: max-w-[640px] desktop / full-width mobile.
      */}
      <div
        id="daily-report-card"
        data-date={date}
        className="mx-auto max-w-[640px] overflow-hidden rounded-2xl border border-border bg-white shadow-[0_4px_24px_-12px_rgba(0,0,0,0.12)] print:max-w-none print:shadow-none print:border-black"
      >
        {/* Title strip — matches the Excel report header */}
        <div className="border-b border-border bg-gradient-to-b from-amber-50 to-white px-6 py-4 text-center print:bg-white">
          <div className="font-serif text-[15px] font-bold tracking-wide text-slate-900">
            C-BROS GENUINE AUTO PARTS &amp; ACCESSORIES, INC
          </div>
          <div className="mt-0.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
            Daily Sales Report
          </div>
          <div className="mt-2 text-[12px] font-semibold text-slate-700">
            {longDate} <span className="text-slate-400">·</span>{" "}
            <span className="uppercase tracking-wider text-slate-500">{dayOfWeek}</span>
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

/* ─── Body cards (5 divisions + totals) ─── */

/**
 * Per-division visual identity. Each division gets its own color so the report
 * can be scanned at a glance. The hex strings are used directly on inline
 * styles for the progress bar fill so html2canvas captures them faithfully —
 * Tailwind arbitrary classes occasionally get purged when serialized.
 */
interface DivisionStyle {
  bar: string;       // solid bar fill
  barSoft: string;   // 12% tint for the empty track + card outline
  text: string;      // header text color
  headerBg: string;  // soft tint for the card header strip
}

const DIVISION_STYLES: Record<"ap" | "ac" | "service" | "painting" | "junior", DivisionStyle> = {
  ap:       { bar: "#2563eb", barSoft: "#dbeafe", text: "#1e40af", headerBg: "#eff6ff" },
  ac:       { bar: "#16a34a", barSoft: "#dcfce7", text: "#15803d", headerBg: "#f0fdf4" },
  service:  { bar: "#ea580c", barSoft: "#ffedd5", text: "#c2410c", headerBg: "#fff7ed" },
  painting: { bar: "#7c3aed", barSoft: "#ede9fe", text: "#6d28d9", headerBg: "#f5f3ff" },
  junior:   { bar: "#0891b2", barSoft: "#cffafe", text: "#0e7490", headerBg: "#ecfeff" },
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
    <div className="space-y-2.5 px-5 py-4">
      {/* AUTO PARTS — special: OLD/NEW segmented bar */}
      <DivisionCard
        styleKey="ap"
        label="A/P"
        sublabel="Auto Parts"
        total={data.ap.total}
        previousTotal={compare?.ap.total ?? null}
        percentage={data.percentages.ap}
        segmented={{
          old: { value: data.ap.old, ratio: data.ap.oldRatio },
          new: { value: data.ap.new, ratio: data.ap.newRatio },
        }}
        acct={data.ap.onAccount}
      />
      {/* ACCESSORIES */}
      <DivisionCard
        styleKey="ac"
        label="A/C"
        sublabel="Accessories"
        total={data.ac.total}
        previousTotal={compare?.ac.total ?? null}
        percentage={data.percentages.ac}
        cash={data.ac.cash}
        acct={data.ac.onAccount}
      />
      {/* SERVICE */}
      <DivisionCard
        styleKey="service"
        label="A/R"
        sublabel="Service"
        total={data.service.total}
        previousTotal={compare?.service.total ?? null}
        percentage={data.percentages.service}
        cash={data.service.cash}
        acct={data.service.onAccount}
      />
      {/* PAINTING */}
      <DivisionCard
        styleKey="painting"
        label="Painting"
        total={data.painting.total}
        previousTotal={compare?.painting.total ?? null}
        percentage={data.percentages.painting}
        cash={data.painting.cash}
        acct={data.painting.onAccount}
      />
      {/* JUNIOR — no ACCT column at all */}
      <DivisionCard
        styleKey="junior"
        label="Junior"
        total={data.junior.total}
        previousTotal={compare?.junior.total ?? null}
        percentage={data.percentages.junior}
        cash={data.junior.cash}
      />

      {/* GRAND TOTAL — prominent footer card */}
      <div
        className="mt-3 overflow-hidden rounded-xl border border-amber-300"
        style={{ background: "linear-gradient(180deg, #fffbeb 0%, #fef3c7 100%)" }}
      >
        <div className="grid grid-cols-1 gap-0 sm:grid-cols-[1fr_1fr_1.4fr]">
          <FooterStat label="Total Cash" value={data.totals.cash} />
          <FooterStat label="Total On Acct" value={data.totals.onAccount} />
          <div className="flex flex-col items-end justify-center px-5 py-3 sm:items-end sm:border-l sm:border-amber-300">
            <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber-700">
              Grand Total
            </span>
            <span className="mt-0.5 text-[22px] font-extrabold tabular-nums text-amber-900">
              {fmtPesoFull(data.totals.grandTotal)}
            </span>
          </div>
        </div>
        <div className="flex items-center justify-between border-t border-amber-200 bg-amber-50/50 px-5 py-2">
          <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-amber-700">
            Payments (AR Collections)
          </span>
          <span className="text-[13px] font-bold tabular-nums text-amber-900">
            {data.totals.payments > 0 ? fmtPesoFull(data.totals.payments) : "—"}
          </span>
        </div>
      </div>
    </div>
  );
}

/** Cell for the Cash / On Acct columns of the GRAND TOTAL footer. */
function FooterStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col items-start justify-center px-5 py-3 sm:border-r sm:border-amber-200 sm:last:border-r-0">
      <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-amber-700/80">
        {label}
      </span>
      <span className="mt-0.5 text-[14px] font-bold tabular-nums text-amber-900">
        {value > 0 ? fmtPesoFull(value) : "—"}
      </span>
    </div>
  );
}

/* ─── One division card ─── */

interface DivisionCardProps {
  styleKey: keyof typeof DIVISION_STYLES;
  label: string;
  sublabel?: string;
  total: number;
  previousTotal: number | null;
  percentage: number;
  /** A/C / Service / Painting / Junior — single CASH amount */
  cash?: number;
  /** A/P only — OLD/NEW split with the OLD ratio */
  segmented?: {
    old: { value: number; ratio: number | null };
    new: { value: number; ratio: number | null };
  };
  acct?: number;
}

function DivisionCard({
  styleKey,
  label,
  sublabel,
  total,
  previousTotal,
  percentage,
  cash,
  segmented,
  acct,
}: DivisionCardProps) {
  const style = DIVISION_STYLES[styleKey];
  const isZero = total <= 0;
  const delta = previousTotal != null ? total - previousTotal : null;
  // Cap visible bar width to 100%; clamp negatives to 0
  const barPct = Math.min(100, Math.max(0, percentage));

  // For A/P: split the colored fill between OLD and NEW so the user can see
  // the mix at a glance. ratios are 0..1 of the AP TOTAL (not grand total).
  const oldRatio = segmented?.old.ratio ?? 0;
  const newRatio = segmented?.new.ratio ?? 0;

  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border transition-all",
        isZero ? "border-slate-200 bg-slate-50/40 opacity-70" : "border-slate-200 bg-white",
      )}
    >
      {/* Header strip — division name, total, percentage */}
      <div
        className="flex items-center justify-between px-4 py-2"
        style={{ backgroundColor: isZero ? "#f8fafc" : style.headerBg }}
      >
        <div className="flex items-baseline gap-2">
          <span
            className="text-[13px] font-extrabold uppercase tracking-wider"
            style={{ color: isZero ? "#94a3b8" : style.text }}
          >
            {label}
          </span>
          {sublabel && (
            <span
              className="text-[10px] font-medium uppercase tracking-wider"
              style={{ color: isZero ? "#cbd5e1" : style.text, opacity: 0.7 }}
            >
              {sublabel}
            </span>
          )}
        </div>
        <div className="flex items-baseline gap-2">
          {delta != null && !isZero && <DeltaPill delta={delta} />}
          <span
            className={cn(
              "text-[16px] font-extrabold tabular-nums",
              isZero ? "text-slate-400" : "text-slate-900",
            )}
          >
            {isZero ? "—" : fmtPesoFull(total)}
          </span>
          <span
            className={cn(
              "min-w-[42px] text-right text-[11px] font-bold tabular-nums",
              isZero ? "text-slate-300" : "text-slate-500",
            )}
          >
            {percentage.toFixed(1)}%
          </span>
        </div>
      </div>

      {/* Full-width progress bar — proportional to grand total */}
      <div className="px-4 pt-2">
        <div
          className="relative h-2.5 w-full overflow-hidden rounded-full"
          style={{ backgroundColor: "#f1f5f9" }}
        >
          {!isZero && segmented ? (
            // A/P: two segments side-by-side, both filling to barPct total
            <div className="flex h-full" style={{ width: `${barPct}%` }}>
              <div
                className="h-full"
                style={{
                  backgroundColor: style.bar,
                  width: `${(oldRatio || 0) * 100}%`,
                  opacity: 0.55,
                }}
              />
              <div
                className="h-full"
                style={{
                  backgroundColor: style.bar,
                  width: `${(newRatio || 0) * 100}%`,
                }}
              />
            </div>
          ) : !isZero ? (
            <div
              className="h-full rounded-full"
              style={{ backgroundColor: style.bar, width: `${barPct}%` }}
            />
          ) : null}
        </div>
      </div>

      {/* Sub-row: CASH/OLD/NEW on left, ACCT on right */}
      <div className="flex items-center justify-between gap-3 px-4 pb-2.5 pt-2 text-[11px]">
        <div className="flex flex-1 items-center gap-3 tabular-nums">
          {segmented ? (
            <>
              <SubItem
                label="OLD"
                value={segmented.old.value}
                ratio={segmented.old.ratio}
                color={style.text}
                isZero={isZero}
              />
              <span className="text-slate-300">·</span>
              <SubItem
                label="NEW"
                value={segmented.new.value}
                ratio={segmented.new.ratio}
                color={style.text}
                isZero={isZero}
              />
            </>
          ) : cash !== undefined ? (
            <SubItem label="CASH" value={cash} color={style.text} isZero={isZero} />
          ) : null}
        </div>
        {acct !== undefined && (
          <SubItem
            label="ACCT"
            value={acct}
            color={style.text}
            isZero={isZero}
            align="right"
          />
        )}
      </div>
    </div>
  );
}

function SubItem({
  label,
  value,
  ratio,
  color,
  isZero,
  align = "left",
}: {
  label: string;
  value: number;
  ratio?: number | null;
  color: string;
  isZero: boolean;
  align?: "left" | "right";
}) {
  return (
    <div
      className={cn(
        "flex items-baseline gap-1.5",
        align === "right" && "justify-end",
      )}
    >
      <span
        className="text-[9px] font-bold uppercase tracking-wider"
        style={{ color: isZero ? "#cbd5e1" : color, opacity: 0.7 }}
      >
        {label}
      </span>
      <span
        className={cn(
          "text-[12px] font-semibold tabular-nums",
          isZero ? "text-slate-300" : "text-slate-700",
        )}
      >
        {value > 0 ? fmtPesoFull(value) : "—"}
      </span>
      {ratio != null && value > 0 && (
        <span className="text-[9px] text-slate-400">({ratio.toFixed(2)})</span>
      )}
    </div>
  );
}

/** Green ↑ / red ↓ delta pill rendered next to a division total. */
function DeltaPill({ delta }: { delta: number }) {
  if (delta === 0) {
    return (
      <span className="inline-flex items-center gap-0.5 rounded-md bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold text-slate-500">
        ±0
      </span>
    );
  }
  const positive = delta > 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[9px] font-semibold tabular-nums",
        positive
          ? "bg-emerald-50 text-emerald-700"
          : "bg-red-50 text-red-700",
      )}
    >
      {positive ? <ArrowUpRight size={9} /> : <ArrowDownRight size={9} />}
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

