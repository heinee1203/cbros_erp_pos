"use client";

/**
 * Monthly Sales Report — admin analytics page.
 *
 * Reads one month of pre-aggregated data from GET /analytics/monthly-sales/
 * single-month and renders a visual layout identical to the Daily Sales
 * Report card but rolled up over the month:
 *   - 5 colored division cards (A/P, A/C, A/R, Painting, Junior)
 *   - A/P OLD/NEW segmented bar
 *   - Gold 3-column grand total footer
 *   - Averages card (weekday / Sunday / daily — new vs daily page)
 *
 * Compare modes: None / Previous Month (MoM) / Same Month Last Year (YoY) /
 * Both. When compare is active, each division card, footer cell, and average
 * row renders a delta pill with a distinct badge style per compare type:
 *   - MoM: filled badge (green or red background)
 *   - YoY: outlined badge (green or red border only)
 *
 * Copy-as-image pipeline is the same hardened one used by the daily page:
 * a static inline-styled HTML template, mounted off-screen, captured via
 * dom-to-image-more, with the scoped `.ds-img-root *` reset to neutralize
 * Tailwind preflight borders.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowDownRight,
  ArrowUpRight,
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Lock,
  TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/app/auth-context";
import { apiFetch } from "@/lib/api";

/* ═════════════════════════════════════════════════════════════
 *  Types  — mirror the backend service shape
 * ═════════════════════════════════════════════════════════════ */

type MonthlyCompareMode = "none" | "mom" | "yoy" | "both";

interface MonthlyPeriod {
  month: string; // "YYYY-MM"
  startDate: string; // "YYYY-MM-DD"
  endDate: string; // "YYYY-MM-DD"
  totalDays: number;
  weekdays: number;
  sundays: number;
}

interface MonthlyAggregates {
  period: MonthlyPeriod;
  ap: {
    total: number;
    old: number;
    new: number;
    onAccount: number;
    oldRatio: number | null;
    newRatio: number | null;
    pctOfTotal: number;
  };
  ac: { total: number; cash: number; onAccount: number; pctOfTotal: number };
  service: { total: number; cash: number; onAccount: number; pctOfTotal: number };
  painting: { total: number; cash: number; onAccount: number; pctOfTotal: number };
  junior: { total: number; cash: number; pctOfTotal: number };
  totals: { cash: number; onAccount: number; grandTotal: number; payments: number };
  averages: { weekday: number; sunday: number; daily: number };
  hasData: boolean;
}

interface MonthlySalesResponse extends MonthlyAggregates {
  comparisons?: {
    mom?: MonthlyAggregates;
    yoy?: MonthlyAggregates;
  };
}

/* ═════════════════════════════════════════════════════════════
 *  Formatters & helpers
 * ═════════════════════════════════════════════════════════════ */

function fmtPesoFull(v: number): string {
  return `\u20B1${v.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtPesoOrDash(v: number): string {
  return v > 0 ? fmtPesoFull(v) : "\u2014";
}

/** Returns the current month as "YYYY-MM" in LOCAL time. */
function currentMonthLocal(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

/** Parses "YYYY-MM" → Date object for the first of that month (UTC). */
function monthToDate(ym: string): Date {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1));
}

/** Formats "YYYY-MM" → "March 2026". */
function fmtMonthLong(ym: string): string {
  return monthToDate(ym).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Formats "2026-03-01" → "March 1, 2026". */
function fmtDateLong(iso: string): string {
  return new Date(iso + "T12:00:00Z").toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Shift a "YYYY-MM" string by N months, returning a new "YYYY-MM". */
function shiftMonth(ym: string, deltaMonths: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + deltaMonths, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Earliest month we have data for — matches the legacy Excel import window. */
const MIN_MONTH = "2022-01";

/** Delta result shape — encodes "new" (prior=0, current>0) and "absent". */
type DeltaResult =
  | { kind: "pct"; delta: number; pct: number }
  | { kind: "new" }
  | null;

/**
 * Computes the percentage change between two values.
 * Returns null when both are zero (nothing meaningful), "new" when
 * prior is 0 and current is positive, and a regular pct otherwise.
 */
function computeDelta(current: number, prior: number | null | undefined): DeltaResult {
  if (prior == null) return null;
  if (prior === 0) {
    return current > 0 ? { kind: "new" } : null;
  }
  const delta = current - prior;
  return { kind: "pct", delta, pct: (delta / prior) * 100 };
}

/* ═════════════════════════════════════════════════════════════
 *  Division palette — mirrors DIVISION_STYLES in daily-sales page
 * ═════════════════════════════════════════════════════════════ */

interface DivisionStyle {
  bar: string;
  barSoft: string;
  text: string;
  headerBg: string;
}

const DIVISION_STYLES: Record<"ap" | "ac" | "service" | "painting" | "junior", DivisionStyle> = {
  ap: { bar: "#2563eb", barSoft: "#dbeafe", text: "#1e40af", headerBg: "#eff6ff" },
  ac: { bar: "#16a34a", barSoft: "#dcfce7", text: "#15803d", headerBg: "#f0fdf4" },
  service: { bar: "#ea580c", barSoft: "#ffedd5", text: "#c2410c", headerBg: "#fff7ed" },
  painting: { bar: "#7c3aed", barSoft: "#ede9fe", text: "#6d28d9", headerBg: "#f5f3ff" },
  junior: { bar: "#0891b2", barSoft: "#cffafe", text: "#0e7490", headerBg: "#ecfeff" },
};

/* ═════════════════════════════════════════════════════════════
 *  Delta pills
 *
 *  MoMPill  = filled (green/red bg + white-ish text)
 *  YoYPill  = outlined (transparent bg + colored border + colored text)
 *
 *  Both accept a DeltaResult from computeDelta() or null.
 * ═════════════════════════════════════════════════════════════ */

function MoMPill({ result }: { result: DeltaResult }) {
  if (result == null) return null;
  if (result.kind === "new") {
    return (
      <span className="inline-flex items-center gap-0.5 rounded-md bg-sky-600 px-1.5 py-0.5 text-[9px] font-bold tabular-nums text-white">
        NEW · MoM
      </span>
    );
  }
  const positive = result.delta > 0;
  const zero = result.delta === 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[9px] font-bold tabular-nums",
        zero && "bg-slate-400 text-white",
        !zero && positive && "bg-emerald-600 text-white",
        !zero && !positive && "bg-red-600 text-white",
      )}
    >
      {positive ? <ArrowUpRight size={9} /> : !zero ? <ArrowDownRight size={9} /> : null}
      {positive ? "+" : ""}
      {result.pct.toFixed(1)}% MoM
    </span>
  );
}

function YoYPill({ result }: { result: DeltaResult }) {
  if (result == null) return null;
  if (result.kind === "new") {
    return (
      <span className="inline-flex items-center gap-0.5 rounded-md border border-sky-600 bg-transparent px-1.5 py-0.5 text-[9px] font-bold tabular-nums text-sky-700">
        NEW · YoY
      </span>
    );
  }
  const positive = result.delta > 0;
  const zero = result.delta === 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-md border bg-transparent px-1.5 py-0.5 text-[9px] font-bold tabular-nums",
        zero && "border-slate-400 text-slate-600",
        !zero && positive && "border-emerald-600 text-emerald-700",
        !zero && !positive && "border-red-600 text-red-700",
      )}
    >
      {positive ? <ArrowUpRight size={9} /> : !zero ? <ArrowDownRight size={9} /> : null}
      {positive ? "+" : ""}
      {result.pct.toFixed(1)}% YoY
    </span>
  );
}

/** A pair of pills for when both compare modes are active. */
function CompareBadges({
  mom,
  yoy,
}: {
  mom: DeltaResult;
  yoy: DeltaResult;
}) {
  if (!mom && !yoy) return null;
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {mom && <MoMPill result={mom} />}
      {yoy && <YoYPill result={yoy} />}
    </span>
  );
}

/* ═════════════════════════════════════════════════════════════
 *  Division card — one per division (A/P, A/C, A/R, Painting, Junior)
 *
 *  Copied from the daily-sales page's DivisionCard, extended with
 *  mom/yoy compare badges next to the total.
 * ═════════════════════════════════════════════════════════════ */

interface MonthlyDivisionCardProps {
  styleKey: keyof typeof DIVISION_STYLES;
  label: string;
  sublabel?: string;
  total: number;
  percentage: number;
  cash?: number;
  segmented?: {
    old: { value: number; ratio: number | null };
    new: { value: number; ratio: number | null };
  };
  acct?: number;
  mom: DeltaResult;
  yoy: DeltaResult;
}

function MonthlyDivisionCard({
  styleKey,
  label,
  sublabel,
  total,
  percentage,
  cash,
  segmented,
  acct,
  mom,
  yoy,
}: MonthlyDivisionCardProps) {
  const style = DIVISION_STYLES[styleKey];
  const isZero = total <= 0;
  const barPct = Math.min(100, Math.max(0, percentage));
  const oldRatio = segmented?.old.ratio ?? 0;
  const newRatio = segmented?.new.ratio ?? 0;

  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border transition-all",
        isZero ? "border-slate-200 bg-slate-50/40 opacity-70" : "border-slate-200 bg-white",
      )}
    >
      {/* Header strip */}
      <div
        className="flex items-center justify-between gap-3 px-4 py-2"
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
        <div className="flex flex-wrap items-baseline justify-end gap-x-2 gap-y-1">
          <CompareBadges mom={mom} yoy={yoy} />
          <span
            className={cn(
              "text-[16px] font-extrabold tabular-nums",
              isZero ? "text-slate-400" : "text-slate-900",
            )}
          >
            {isZero ? "\u2014" : fmtPesoFull(total)}
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

      {/* Progress bar */}
      <div className="px-4 pt-2">
        <div
          className="relative h-2.5 w-full overflow-hidden rounded-full"
          style={{ backgroundColor: "#f1f5f9" }}
        >
          {!isZero && segmented ? (
            <div className="flex h-full" style={{ width: `${barPct}%` }}>
              <div
                className="h-full"
                style={{ backgroundColor: style.bar, width: `${oldRatio * 100}%`, opacity: 0.55 }}
              />
              <div
                className="h-full"
                style={{ backgroundColor: style.bar, width: `${newRatio * 100}%` }}
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

      {/* Sub-row: OLD/NEW/CASH on left, ACCT on right */}
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
    <div className={cn("flex items-baseline gap-1.5", align === "right" && "justify-end")}>
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
        {value > 0 ? fmtPesoFull(value) : "\u2014"}
      </span>
      {ratio != null && value > 0 && (
        <span className="text-[9px] text-slate-400">({ratio.toFixed(2)})</span>
      )}
    </div>
  );
}

/* ═════════════════════════════════════════════════════════════
 *  Gold footer (3-col Total Cash | Total On Acct | Grand Total)
 *   + PAYMENTS row
 *   + optional compare pills on each stat
 * ═════════════════════════════════════════════════════════════ */

function FooterStat({
  label,
  value,
  mom,
  yoy,
  align = "left",
  emphasis = false,
}: {
  label: string;
  value: number;
  mom: DeltaResult;
  yoy: DeltaResult;
  align?: "left" | "right";
  emphasis?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col justify-center gap-0.5 px-5 py-3",
        align === "right" ? "items-end" : "items-start",
      )}
    >
      <span
        className={cn(
          "text-[10px] font-bold uppercase tracking-[0.16em]",
          emphasis ? "text-amber-700" : "text-amber-700/80",
        )}
      >
        {label}
      </span>
      <span
        className={cn(
          "tabular-nums text-amber-900",
          emphasis ? "text-[22px] font-extrabold" : "text-[14px] font-bold",
        )}
      >
        {fmtPesoOrDash(value)}
      </span>
      {(mom || yoy) && (
        <span className="mt-0.5">
          <CompareBadges mom={mom} yoy={yoy} />
        </span>
      )}
    </div>
  );
}

/* ═════════════════════════════════════════════════════════════
 *  Averages card (below the gold footer)
 * ═════════════════════════════════════════════════════════════ */

function AveragesCard({
  averages,
  weekdayMom,
  weekdayYoy,
  sundayMom,
  sundayYoy,
  dailyMom,
  dailyYoy,
  totalDays,
}: {
  averages: { weekday: number; sunday: number; daily: number };
  weekdayMom: DeltaResult;
  weekdayYoy: DeltaResult;
  sundayMom: DeltaResult;
  sundayYoy: DeltaResult;
  dailyMom: DeltaResult;
  dailyYoy: DeltaResult;
  totalDays: number;
}) {
  const row = (
    label: string,
    sub: string | null,
    value: number,
    mom: DeltaResult,
    yoy: DeltaResult,
  ) => (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-5 py-1.5">
      <div className="flex items-baseline gap-2">
        <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-600">
          {label}
        </span>
        {sub && <span className="text-[10px] text-slate-400">{sub}</span>}
      </div>
      <div className="flex flex-wrap items-baseline justify-end gap-x-2 gap-y-1">
        <CompareBadges mom={mom} yoy={yoy} />
        <span className="text-[14px] font-bold tabular-nums text-slate-800">
          {fmtPesoOrDash(value)}
        </span>
      </div>
    </div>
  );

  return (
    <div className="mt-2.5 overflow-hidden rounded-xl border border-slate-200 bg-slate-50/60">
      <div className="border-b border-slate-200 bg-white/60 px-5 py-1.5">
        <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
          Averages
        </span>
      </div>
      <div className="divide-y divide-slate-200/70">
        {row("Weekday Average", "Mon – Sat", averages.weekday, weekdayMom, weekdayYoy)}
        {row("Sunday Average", null, averages.sunday, sundayMom, sundayYoy)}
        {row("Daily Average", `${totalDays} days`, averages.daily, dailyMom, dailyYoy)}
      </div>
    </div>
  );
}

/* ═════════════════════════════════════════════════════════════
 *  Report body — division rows + gold footer + averages
 * ═════════════════════════════════════════════════════════════ */

function ReportBody({
  data,
  compareMode,
}: {
  data: MonthlySalesResponse;
  compareMode: MonthlyCompareMode;
}) {
  const mom = data.comparisons?.mom ?? null;
  const yoy = data.comparisons?.yoy ?? null;

  // Helper to compute per-division deltas based on active compare mode
  const d = (current: number, priorMom: number | undefined, priorYoy: number | undefined) => ({
    mom: compareMode === "mom" || compareMode === "both" ? computeDelta(current, priorMom ?? null) : null,
    yoy: compareMode === "yoy" || compareMode === "both" ? computeDelta(current, priorYoy ?? null) : null,
  });

  const apD = d(data.ap.total, mom?.ap.total, yoy?.ap.total);
  const acD = d(data.ac.total, mom?.ac.total, yoy?.ac.total);
  const arD = d(data.service.total, mom?.service.total, yoy?.service.total);
  const pntD = d(data.painting.total, mom?.painting.total, yoy?.painting.total);
  const jrD = d(data.junior.total, mom?.junior.total, yoy?.junior.total);

  const cashD = d(data.totals.cash, mom?.totals.cash, yoy?.totals.cash);
  const acctD = d(data.totals.onAccount, mom?.totals.onAccount, yoy?.totals.onAccount);
  const gtD = d(data.totals.grandTotal, mom?.totals.grandTotal, yoy?.totals.grandTotal);
  const payD = d(data.totals.payments, mom?.totals.payments, yoy?.totals.payments);

  const weekdayD = d(data.averages.weekday, mom?.averages.weekday, yoy?.averages.weekday);
  const sundayD = d(data.averages.sunday, mom?.averages.sunday, yoy?.averages.sunday);
  const dailyD = d(data.averages.daily, mom?.averages.daily, yoy?.averages.daily);

  return (
    <div className="space-y-2.5 px-5 py-4">
      <MonthlyDivisionCard
        styleKey="ap"
        label="A/P"
        sublabel="Auto Parts"
        total={data.ap.total}
        percentage={data.ap.pctOfTotal}
        segmented={{
          old: { value: data.ap.old, ratio: data.ap.oldRatio },
          new: { value: data.ap.new, ratio: data.ap.newRatio },
        }}
        acct={data.ap.onAccount}
        mom={apD.mom}
        yoy={apD.yoy}
      />
      <MonthlyDivisionCard
        styleKey="ac"
        label="A/C"
        sublabel="Accessories"
        total={data.ac.total}
        percentage={data.ac.pctOfTotal}
        cash={data.ac.cash}
        acct={data.ac.onAccount}
        mom={acD.mom}
        yoy={acD.yoy}
      />
      <MonthlyDivisionCard
        styleKey="service"
        label="A/R"
        sublabel="Service"
        total={data.service.total}
        percentage={data.service.pctOfTotal}
        cash={data.service.cash}
        acct={data.service.onAccount}
        mom={arD.mom}
        yoy={arD.yoy}
      />
      <MonthlyDivisionCard
        styleKey="painting"
        label="Painting"
        total={data.painting.total}
        percentage={data.painting.pctOfTotal}
        cash={data.painting.cash}
        acct={data.painting.onAccount}
        mom={pntD.mom}
        yoy={pntD.yoy}
      />
      <MonthlyDivisionCard
        styleKey="junior"
        label="Junior"
        total={data.junior.total}
        percentage={data.junior.pctOfTotal}
        cash={data.junior.cash}
        mom={jrD.mom}
        yoy={jrD.yoy}
      />

      {/* Gold footer */}
      <div
        className="mt-3 overflow-hidden rounded-xl border border-amber-300"
        style={{ background: "linear-gradient(180deg, #fffbeb 0%, #fef3c7 100%)" }}
      >
        <div className="grid grid-cols-1 gap-0 sm:grid-cols-[1fr_1fr_1.4fr]">
          <FooterStat label="Total Cash" value={data.totals.cash} mom={cashD.mom} yoy={cashD.yoy} />
          <div className="sm:border-l sm:border-amber-300">
            <FooterStat
              label="Total On Acct"
              value={data.totals.onAccount}
              mom={acctD.mom}
              yoy={acctD.yoy}
            />
          </div>
          <div className="sm:border-l sm:border-amber-300">
            <FooterStat
              label="Grand Total"
              value={data.totals.grandTotal}
              mom={gtD.mom}
              yoy={gtD.yoy}
              align="right"
              emphasis
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-amber-200 bg-amber-50/50 px-5 py-2">
          <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-amber-700">
            Payments (AR Collections)
          </span>
          <div className="flex flex-wrap items-baseline justify-end gap-x-2 gap-y-1">
            <CompareBadges mom={payD.mom} yoy={payD.yoy} />
            <span className="text-[13px] font-bold tabular-nums text-amber-900">
              {fmtPesoOrDash(data.totals.payments)}
            </span>
          </div>
        </div>
      </div>

      {/* Averages */}
      <AveragesCard
        averages={data.averages}
        weekdayMom={weekdayD.mom}
        weekdayYoy={weekdayD.yoy}
        sundayMom={sundayD.mom}
        sundayYoy={sundayD.yoy}
        dailyMom={dailyD.mom}
        dailyYoy={dailyD.yoy}
        totalDays={data.period.totalDays}
      />
    </div>
  );
}

/* ═════════════════════════════════════════════════════════════
 *  Share-as-image: static HTML template + dom-to-image-more
 *
 *  Same hardened pipeline as the daily page:
 *  - Scoped `.ds-img-root *` style reset to neutralize Tailwind preflight
 *  - Every inline style starts with `border:0` (belt-and-suspenders)
 *  - Block divs for layout; 2-cell tables only where two items share a baseline
 *  - A/P segmented bar = `width:${barPct}%` container holding a 2-cell table
 *  - Fixed 640px width, 2× retina via transform:scale
 * ═════════════════════════════════════════════════════════════ */

function buildMonthlySalesImageHtml(
  data: MonthlySalesResponse,
  compareMode: MonthlyCompareMode,
): string {
  const peso = (v: number): string =>
    v > 0
      ? `\u20B1${v.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : "\u2014";
  const pct = (v: number): string => `${v.toFixed(1)}%`;

  const SANS = "'Geist','SF Pro Display',-apple-system,'Segoe UI',Arial,sans-serif";
  const MONO = "'Geist Mono','SF Mono','Cascadia Code','Courier New',monospace";
  const SERIF = "Georgia,'Times New Roman',serif";

  const DS = {
    ap: { bar: "#2563eb", headerBg: "#eff6ff", text: "#1e40af" },
    ac: { bar: "#16a34a", headerBg: "#f0fdf4", text: "#15803d" },
    service: { bar: "#ea580c", headerBg: "#fff7ed", text: "#c2410c" },
    painting: { bar: "#7c3aed", headerBg: "#f5f3ff", text: "#6d28d9" },
    junior: { bar: "#0891b2", headerBg: "#ecfeff", text: "#0e7490" },
  };

  const NO_BORDER = "border:0;";
  const TD = `${NO_BORDER}padding:0;`;

  // Compute deltas once up-front
  const mom = data.comparisons?.mom ?? null;
  const yoy = data.comparisons?.yoy ?? null;
  const useMom = compareMode === "mom" || compareMode === "both";
  const useYoy = compareMode === "yoy" || compareMode === "both";
  const deltaOf = (current: number, priorMom?: number, priorYoy?: number) => ({
    mom: useMom ? computeDelta(current, priorMom ?? null) : null,
    yoy: useYoy ? computeDelta(current, priorYoy ?? null) : null,
  });

  // Pill HTML renderers — plain inline spans, no flex.
  const pillColorMom = (res: DeltaResult): { bg: string; fg: string; arrow: string } => {
    if (!res || res.kind === "new") return { bg: "#0284C7", fg: "#FFFFFF", arrow: "" };
    if (res.delta === 0) return { bg: "#94A3B8", fg: "#FFFFFF", arrow: "" };
    return res.delta > 0
      ? { bg: "#059669", fg: "#FFFFFF", arrow: "\u25B2" }
      : { bg: "#DC2626", fg: "#FFFFFF", arrow: "\u25BC" };
  };
  const pillColorYoy = (res: DeltaResult): { border: string; fg: string; arrow: string } => {
    if (!res || res.kind === "new") return { border: "#0284C7", fg: "#0369A1", arrow: "" };
    if (res.delta === 0) return { border: "#94A3B8", fg: "#475569", arrow: "" };
    return res.delta > 0
      ? { border: "#059669", fg: "#047857", arrow: "\u25B2" }
      : { border: "#DC2626", fg: "#B91C1C", arrow: "\u25BC" };
  };
  const momPillHtml = (res: DeltaResult): string => {
    if (!res) return "";
    const c = pillColorMom(res);
    const text = res.kind === "new" ? "NEW" : `${res.delta > 0 ? "+" : ""}${res.pct.toFixed(1)}%`;
    return `<span style="${NO_BORDER}display:inline-block;background:${c.bg};color:${c.fg};border-radius:4px;padding:1px 5px;font-size:9px;font-weight:700;font-family:${MONO};white-space:nowrap;margin-left:4px;vertical-align:middle;">${c.arrow ? c.arrow + " " : ""}${text} MoM</span>`;
  };
  const yoyPillHtml = (res: DeltaResult): string => {
    if (!res) return "";
    const c = pillColorYoy(res);
    const text = res.kind === "new" ? "NEW" : `${res.delta > 0 ? "+" : ""}${res.pct.toFixed(1)}%`;
    return `<span style="${NO_BORDER}display:inline-block;background:#FFFFFF;color:${c.fg};border:1px solid ${c.border};border-radius:4px;padding:1px 5px;font-size:9px;font-weight:700;font-family:${MONO};white-space:nowrap;margin-left:4px;vertical-align:middle;">${c.arrow ? c.arrow + " " : ""}${text} YoY</span>`;
  };
  const pills = (current: number, pMom?: number, pYoy?: number): string => {
    const d = deltaOf(current, pMom, pYoy);
    return `${momPillHtml(d.mom)}${yoyPillHtml(d.yoy)}`;
  };

  type SubItemSpec = { label: string; value: number; ratio?: number | null };
  const renderSubItem = (spec: SubItemSpec, accent: string, isZero: boolean): string => {
    const valueColor = isZero ? "#CBD5E1" : "#334155";
    const labelColor = isZero ? "#CBD5E1" : accent;
    const ratioText =
      spec.ratio != null && spec.value > 0
        ? `<span style="${NO_BORDER}font-size:9px;color:#94A3B8;margin-left:4px;font-family:${MONO};">(${spec.ratio.toFixed(2)})</span>`
        : "";
    return `<span style="${NO_BORDER}font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:${labelColor};opacity:0.7;margin-right:4px;font-family:${SANS};">${spec.label}</span><span style="${NO_BORDER}font-size:12px;font-weight:600;color:${valueColor};font-family:${MONO};white-space:nowrap;">${peso(spec.value)}</span>${ratioText}`;
  };

  const section = (opts: {
    styleKey: "ap" | "ac" | "service" | "painting" | "junior";
    label: string;
    sublabel?: string;
    total: number;
    percentage: number;
    segmented?: { old: { value: number; ratio: number | null }; new: { value: number; ratio: number | null } };
    cash?: number;
    acct?: number;
    pillsHtml: string;
  }): string => {
    const { styleKey, label, sublabel, total, percentage, segmented, cash, acct, pillsHtml } = opts;
    const style = DS[styleKey];
    const isZero = total <= 0;
    const barPct = Math.max(0, Math.min(100, percentage));

    const headerBg = isZero ? "#F8FAFC" : style.headerBg;
    const labelColor = isZero ? "#94A3B8" : style.text;
    const sublabelColor = isZero ? "#CBD5E1" : style.text;
    const amountColor = isZero ? "#94A3B8" : "#0F172A";
    const percentColor = isZero ? "#CBD5E1" : "#64748B";
    const cardBg = isZero ? "#F8FAFC" : "#FFFFFF";
    const cardOpacity = isZero ? "opacity:0.7;" : "";

    const sublabelSpan = sublabel
      ? `<span style="${NO_BORDER}font-size:10px;font-weight:500;text-transform:uppercase;letter-spacing:0.05em;color:${sublabelColor};opacity:0.7;margin-left:8px;font-family:${SANS};">${sublabel}</span>`
      : "";

    const headerRow = `
      <table style="${NO_BORDER}width:100%;border-collapse:collapse;background:${headerBg};">
        <tr>
          <td style="${TD}padding:6px 14px;font-size:13px;font-weight:800;text-transform:uppercase;letter-spacing:0.05em;color:${labelColor};font-family:${SANS};vertical-align:middle;">${label}${sublabelSpan}</td>
          <td style="${TD}padding:6px 14px;text-align:right;vertical-align:middle;white-space:nowrap;">${pillsHtml}<span style="${NO_BORDER}font-size:16px;font-weight:800;color:${amountColor};font-family:${MONO};margin-left:8px;">${isZero ? "\u2014" : peso(total)}</span><span style="${NO_BORDER}font-size:11px;font-weight:700;color:${percentColor};font-family:${MONO};margin-left:8px;min-width:42px;display:inline-block;text-align:right;">${pct(percentage)}</span></td>
        </tr>
      </table>`;

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

    let leftContent = "";
    if (segmented) {
      leftContent = `${renderSubItem({ label: "OLD", value: segmented.old.value, ratio: segmented.old.ratio }, style.text, isZero)}<span style="${NO_BORDER}color:#CBD5E1;margin:0 8px;">\u00B7</span>${renderSubItem({ label: "NEW", value: segmented.new.value, ratio: segmented.new.ratio }, style.text, isZero)}`;
    } else if (cash !== undefined) {
      leftContent = renderSubItem({ label: "CASH", value: cash }, style.text, isZero);
    }
    const rightContent =
      acct !== undefined ? renderSubItem({ label: "ACCT", value: acct }, style.text, isZero) : "";
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

  // Header metadata
  const monthLabel = fmtMonthLong(data.period.month);
  const startLabel = fmtDateLong(data.period.startDate);
  const endLabel = fmtDateLong(data.period.endDate);
  const dayLine = `${data.period.totalDays} days (${data.period.weekdays} weekdays, ${data.period.sundays} Sundays)`;

  // Grand total cells
  const gtCashPills = pills(data.totals.cash, mom?.totals.cash, yoy?.totals.cash);
  const gtAcctPills = pills(data.totals.onAccount, mom?.totals.onAccount, yoy?.totals.onAccount);
  const gtGrandPills = pills(data.totals.grandTotal, mom?.totals.grandTotal, yoy?.totals.grandTotal);
  const gtPayPills = pills(data.totals.payments, mom?.totals.payments, yoy?.totals.payments);

  // Averages pills
  const avgWPills = pills(data.averages.weekday, mom?.averages.weekday, yoy?.averages.weekday);
  const avgSPills = pills(data.averages.sunday, mom?.averages.sunday, yoy?.averages.sunday);
  const avgDPills = pills(data.averages.daily, mom?.averages.daily, yoy?.averages.daily);

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
      Monthly Sales Report
    </div>
    <div style="${NO_BORDER}font-size:14px;font-weight:700;color:#0F172A;margin-top:6px;font-family:${SANS};">
      ${monthLabel}
    </div>
    <div style="${NO_BORDER}font-size:11px;font-weight:500;color:#475569;margin-top:2px;font-family:${SANS};">
      ${startLabel} &ndash; ${endLabel} <span style="color:#94A3B8;">&middot;</span> ${dayLine}
    </div>
  </div>

  <div style="${NO_BORDER}padding:16px 20px;">
    ${section({
      styleKey: "ap",
      label: "A/P",
      sublabel: "Auto Parts",
      total: data.ap.total,
      percentage: data.ap.pctOfTotal,
      segmented: { old: { value: data.ap.old, ratio: data.ap.oldRatio }, new: { value: data.ap.new, ratio: data.ap.newRatio } },
      acct: data.ap.onAccount,
      pillsHtml: pills(data.ap.total, mom?.ap.total, yoy?.ap.total),
    })}
    ${section({
      styleKey: "ac",
      label: "A/C",
      sublabel: "Accessories",
      total: data.ac.total,
      percentage: data.ac.pctOfTotal,
      cash: data.ac.cash,
      acct: data.ac.onAccount,
      pillsHtml: pills(data.ac.total, mom?.ac.total, yoy?.ac.total),
    })}
    ${section({
      styleKey: "service",
      label: "A/R",
      sublabel: "Service",
      total: data.service.total,
      percentage: data.service.pctOfTotal,
      cash: data.service.cash,
      acct: data.service.onAccount,
      pillsHtml: pills(data.service.total, mom?.service.total, yoy?.service.total),
    })}
    ${section({
      styleKey: "painting",
      label: "Painting",
      total: data.painting.total,
      percentage: data.painting.pctOfTotal,
      cash: data.painting.cash,
      acct: data.painting.onAccount,
      pillsHtml: pills(data.painting.total, mom?.painting.total, yoy?.painting.total),
    })}
    ${section({
      styleKey: "junior",
      label: "Junior",
      total: data.junior.total,
      percentage: data.junior.pctOfTotal,
      cash: data.junior.cash,
      pillsHtml: pills(data.junior.total, mom?.junior.total, yoy?.junior.total),
    })}

    <div style="${NO_BORDER}margin-top:12px;border:1px solid #FCD34D;border-radius:12px;overflow:hidden;background:linear-gradient(180deg,#FFFBEB 0%,#FEF3C7 100%);">
      <table style="${NO_BORDER}width:100%;border-collapse:collapse;table-layout:fixed;">
        <tr>
          <td style="${TD}padding:10px 18px;vertical-align:middle;border-right:1px solid #FDE68A;width:29.4%;">
            <div style="${NO_BORDER}font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.16em;color:#B45309;opacity:0.8;font-family:${SANS};">Total Cash</div>
            <div style="${NO_BORDER}margin-top:2px;font-size:14px;font-weight:700;color:#78350F;font-family:${MONO};white-space:nowrap;">${peso(data.totals.cash)}</div>
            <div style="${NO_BORDER}margin-top:2px;">${gtCashPills}</div>
          </td>
          <td style="${TD}padding:10px 18px;vertical-align:middle;border-right:1px solid #FDE68A;width:29.4%;">
            <div style="${NO_BORDER}font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.16em;color:#B45309;opacity:0.8;font-family:${SANS};">Total On Acct</div>
            <div style="${NO_BORDER}margin-top:2px;font-size:14px;font-weight:700;color:#78350F;font-family:${MONO};white-space:nowrap;">${peso(data.totals.onAccount)}</div>
            <div style="${NO_BORDER}margin-top:2px;">${gtAcctPills}</div>
          </td>
          <td style="${TD}padding:10px 18px;text-align:right;vertical-align:middle;width:41.2%;">
            <div style="${NO_BORDER}font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.18em;color:#B45309;font-family:${SANS};">Grand Total</div>
            <div style="${NO_BORDER}margin-top:2px;font-size:22px;font-weight:800;color:#78350F;font-family:${MONO};white-space:nowrap;">${peso(data.totals.grandTotal)}</div>
            <div style="${NO_BORDER}margin-top:2px;">${gtGrandPills}</div>
          </td>
        </tr>
      </table>
      <table style="${NO_BORDER}width:100%;border-collapse:collapse;border-top:1px solid #FDE68A;background:#FFFBEB;">
        <tr>
          <td style="${TD}padding:8px 18px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.16em;color:#B45309;font-family:${SANS};">Payments (AR Collections)</td>
          <td style="${TD}padding:8px 18px;text-align:right;font-size:13px;font-weight:700;color:#78350F;font-family:${MONO};white-space:nowrap;">${gtPayPills}<span style="${NO_BORDER}margin-left:8px;">${peso(data.totals.payments)}</span></td>
        </tr>
      </table>
    </div>

    <div style="${NO_BORDER}margin-top:10px;border:1px solid #E2E8F0;border-radius:12px;overflow:hidden;background:#F8FAFC;">
      <div style="${NO_BORDER}padding:6px 20px;border-bottom:1px solid #E2E8F0;background:#FFFFFFaa;">
        <span style="${NO_BORDER}font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.18em;color:#64748B;font-family:${SANS};">Averages</span>
      </div>
      <table style="${NO_BORDER}width:100%;border-collapse:collapse;">
        <tr>
          <td style="${TD}padding:10px 20px;border-bottom:1px solid #E2E8F080;"><span style="${NO_BORDER}font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.16em;color:#475569;font-family:${SANS};">Weekday Average</span><span style="${NO_BORDER}font-size:10px;color:#94A3B8;margin-left:6px;font-family:${SANS};">Mon &ndash; Sat</span></td>
          <td style="${TD}padding:10px 20px;text-align:right;border-bottom:1px solid #E2E8F080;white-space:nowrap;">${avgWPills}<span style="${NO_BORDER}font-size:14px;font-weight:700;color:#1E293B;font-family:${MONO};margin-left:8px;">${peso(data.averages.weekday)}</span></td>
        </tr>
        <tr>
          <td style="${TD}padding:10px 20px;border-bottom:1px solid #E2E8F080;"><span style="${NO_BORDER}font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.16em;color:#475569;font-family:${SANS};">Sunday Average</span></td>
          <td style="${TD}padding:10px 20px;text-align:right;border-bottom:1px solid #E2E8F080;white-space:nowrap;">${avgSPills}<span style="${NO_BORDER}font-size:14px;font-weight:700;color:#1E293B;font-family:${MONO};margin-left:8px;">${peso(data.averages.sunday)}</span></td>
        </tr>
        <tr>
          <td style="${TD}padding:10px 20px;"><span style="${NO_BORDER}font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.16em;color:#475569;font-family:${SANS};">Daily Average</span><span style="${NO_BORDER}font-size:10px;color:#94A3B8;margin-left:6px;font-family:${SANS};">${data.period.totalDays} days</span></td>
          <td style="${TD}padding:10px 20px;text-align:right;white-space:nowrap;">${avgDPills}<span style="${NO_BORDER}font-size:14px;font-weight:700;color:#1E293B;font-family:${MONO};margin-left:8px;">${peso(data.averages.daily)}</span></td>
        </tr>
      </table>
    </div>
  </div>
</div>
  `.trim();
}

async function copyReportAsImage(
  data: MonthlySalesResponse,
  compareMode: MonthlyCompareMode,
): Promise<"copied" | "downloaded" | "failed"> {
  const html = buildMonthlySalesImageHtml(data, compareMode);

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
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        return "copied";
      } catch {
        // fall through to download
      }
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `monthly-sales-${data.period.month}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return "downloaded";
  } catch (e) {
    console.error("copyReportAsImage (monthly) failed:", e);
    return "failed";
  } finally {
    document.body.removeChild(container);
  }
}

/* ═════════════════════════════════════════════════════════════
 *  Page component
 * ═════════════════════════════════════════════════════════════ */

export function MonthlySalesView() {
  const { user, token, locationId, loading: authLoading } = useAuth();
  const isAdmin = user?.role === "ADMIN";

  const router = useRouter();
  const searchParams = useSearchParams();

  const nowMonth = useMemo(() => currentMonthLocal(), []);

  // Read initial month from URL, default to current month
  const [month, setMonth] = useState<string>(() => {
    const raw = searchParams?.get("month");
    if (raw && /^\d{4}-\d{2}$/.test(raw)) {
      const [y, m] = raw.split("-").map(Number);
      if (y >= 2022 && m >= 1 && m <= 12 && raw <= nowMonth && raw >= MIN_MONTH) {
        return raw;
      }
    }
    return nowMonth;
  });

  const [compareMode, setCompareMode] = useState<MonthlyCompareMode>("none");
  const [data, setData] = useState<MonthlySalesResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Copy-as-image button state
  const [copyState, setCopyState] = useState<"idle" | "copying" | "copied" | "downloaded" | "failed">(
    "idle",
  );
  const copyResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync selected month to URL (?month=YYYY-MM)
  useEffect(() => {
    const current = searchParams?.get("month");
    if (current !== month) {
      const params = new URLSearchParams(searchParams?.toString() ?? "");
      params.set("month", month);
      router.replace(`?${params.toString()}`, { scroll: false });
    }
  }, [month, router, searchParams]);

  // Fetch data whenever month or compareMode changes
  const fetchData = useCallback(async () => {
    if (!isAdmin || !token || !locationId) return;
    setLoading(true);
    setError(null);
    try {
      const result = await apiFetch<MonthlySalesResponse>(
        `/analytics/monthly-sales/single-month?month=${month}&compare=${compareMode}`,
        { token, locationId },
      );
      setData(result);
    } catch (err: any) {
      setError(err?.message || "Failed to load monthly sales");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [isAdmin, token, locationId, month, compareMode]);

  useEffect(() => {
    if (!authLoading) fetchData();
  }, [authLoading, fetchData]);

  // Month navigation (arrows)
  const canStepBack = month > MIN_MONTH;
  const canStepForward = month < nowMonth;
  const stepMonth = useCallback(
    (delta: number) => {
      const next = shiftMonth(month, delta);
      if (next < MIN_MONTH || next > nowMonth) return;
      setMonth(next);
    },
    [month, nowMonth],
  );

  // Keyboard ← / →
  useEffect(() => {
    if (!isAdmin) return;
    const handler = (e: KeyboardEvent) => {
      if (e.target && (e.target as HTMLElement).tagName === "INPUT") return;
      if (e.key === "ArrowLeft") stepMonth(-1);
      else if (e.key === "ArrowRight") stepMonth(1);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isAdmin, stepMonth]);

  // Copy handler
  const handleCopy = async () => {
    if (copyState === "copying" || !data || !data.hasData) return;
    setCopyState("copying");
    const result = await copyReportAsImage(data, compareMode);
    setCopyState(result);
    if (copyResetRef.current) clearTimeout(copyResetRef.current);
    copyResetRef.current = setTimeout(() => setCopyState("idle"), 2200);
  };
  useEffect(() => {
    return () => {
      if (copyResetRef.current) clearTimeout(copyResetRef.current);
    };
  }, []);

  // Guard: loading state
  if (authLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 size={20} className="animate-spin text-muted-foreground" />
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
          The Monthly Sales dashboard is restricted to ADMIN users. Your current role is{" "}
          <span className="font-mono font-semibold">{user?.role || "guest"}</span>.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-full max-w-5xl flex-col">
      {/* ── Page header ── */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/[0.06]">
            <TrendingUp size={16} className="text-primary" />
          </div>
          <div>
            <h1 className="text-[18px] font-semibold tracking-tight text-foreground">
              Monthly Sales Report
            </h1>
            <p className="text-[13px] text-muted-foreground">
              Month-over-month and year-over-year comparisons across all divisions
            </p>
          </div>
          <span className="ml-2 inline-flex items-center gap-1 rounded-md bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
            <Lock size={10} /> ADMIN
          </span>
        </div>
      </div>

      {/* ── Toolbar ── */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-muted/20 px-4 py-1.5">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => stepMonth(-1)}
            disabled={!canStepBack}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
            title="Previous month (←)"
          >
            <ChevronLeft size={14} />
          </button>
          <input
            type="month"
            value={month}
            onChange={(e) => {
              const v = e.target.value;
              if (v && v >= MIN_MONTH && v <= nowMonth) setMonth(v);
            }}
            min={MIN_MONTH}
            max={nowMonth}
            className="h-8 rounded-md border border-border bg-background px-2 text-[12px] font-medium outline-none focus:border-primary/40"
          />
          <button
            type="button"
            onClick={() => stepMonth(1)}
            disabled={!canStepForward}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
            title="Next month (→)"
          >
            <ChevronRight size={14} />
          </button>
          <div className="ml-2 hidden flex-col leading-tight sm:flex">
            <span className="text-[13px] font-bold text-foreground">{fmtMonthLong(month)}</span>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
              ← → arrow keys
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-[11px] font-medium text-muted-foreground">
            Compare:
            <select
              value={compareMode}
              onChange={(e) => setCompareMode(e.target.value as MonthlyCompareMode)}
              className="h-8 rounded-md border border-border bg-background px-2 text-[11px] font-medium outline-none focus:border-primary/40"
            >
              <option value="none">None</option>
              <option value="mom">Previous Month (MoM)</option>
              <option value="yoy">Same Month Last Year (YoY)</option>
              <option value="both">Both</option>
            </select>
          </label>
          {data?.hasData && (
            <button
              type="button"
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
              {copyState === "copying"
                ? "Copying…"
                : copyState === "copied"
                  ? "Copied!"
                  : copyState === "downloaded"
                    ? "Downloaded"
                    : copyState === "failed"
                      ? "Failed"
                      : "Copy"}
            </button>
          )}
        </div>
      </div>

      {/* ── Error banner ── */}
      {error && (
        <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700">
          {error}
        </div>
      )}

      {/* ── Report card ── */}
      <div
        id="monthly-report-card"
        data-month={month}
        className="mx-auto w-full max-w-[640px] overflow-hidden rounded-2xl border border-border bg-white shadow-[0_4px_24px_-12px_rgba(0,0,0,0.12)]"
      >
        {/* Title strip */}
        <div className="border-b border-border bg-gradient-to-b from-amber-50 to-white px-6 py-4 text-center">
          <div className="font-serif text-[15px] font-bold tracking-wide text-slate-900">
            C-BROS GENUINE AUTO PARTS &amp; ACCESSORIES, INC
          </div>
          <div className="mt-0.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
            Monthly Sales Report
          </div>
          <div className="mt-2 text-[14px] font-bold text-slate-900">{fmtMonthLong(month)}</div>
          {data && (
            <div className="mt-1 text-[11px] font-medium text-slate-600">
              {fmtDateLong(data.period.startDate)} – {fmtDateLong(data.period.endDate)}{" "}
              <span className="text-slate-400">·</span>{" "}
              <span>
                {data.period.totalDays} days ({data.period.weekdays} weekdays,{" "}
                {data.period.sundays} Sundays)
              </span>
            </div>
          )}
        </div>

        {/* Body */}
        {loading && !data ? (
          <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
            <Loader2 size={16} className="mr-2 animate-spin" /> Loading…
          </div>
        ) : !data || !data.hasData ? (
          <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
            <p className="text-[14px] font-semibold text-foreground">No sales data recorded</p>
            <p className="text-[12px] text-muted-foreground">
              Nothing on file for {fmtMonthLong(month)}.
            </p>
          </div>
        ) : (
          <ReportBody data={data} compareMode={compareMode} />
        )}
      </div>
    </div>
  );
}
