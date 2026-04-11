/**
 * Smoke test the analytics service functions against the live DB.
 * Calls every exported function with a realistic window and sanity-checks
 * the shapes + totals against the known full-import sums.
 */
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
dotenv.config({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../../../.env") });

import {
  getDailySalesSeries,
  getDailySalesSummary,
  getDailySalesDivisionBreakdown,
  getDailySalesYoY,
  getDailySalesByDayOfWeek,
  getDailySalesRows,
} from "../src/modules/analytics/service";

const ORG_ID = "556e350a-7180-4ec9-9e1e-ea0ca1937f40";

// Full import window — lets us compare against the reconciliation totals
// from import-daily-sales.ts for an end-to-end sanity check.
const FROM = "2019-06-01";
const TO = "2026-03-01";

const KNOWN_TOTALS = {
  // Sum of ALL division columns (cash + credit), excluding payments.
  // Computed from the import reconciliation table earlier in the session.
  grandSalesTotal:
    74_278_041.79 + 268_077_100.05 + 63_044_504.79 +
    179_274_796.2 + 5_441_364.56 +
    261_989_494.82 + 25_992_032.46 +
    18_658_889.74 + 2_627_745 +
    79_553_970.4,
  totalPayments: 21_007_888.56,
};

function fmt(n: number) {
  return n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

async function main() {
  console.log("=== Analytics service smoke test ===\n");

  // ── 1. Summary — full window ──
  console.log("[1/6] getDailySalesSummary (full window)");
  const summary = await getDailySalesSummary(ORG_ID, FROM, TO);
  console.log(`  dayCount:       ${summary.dayCount}`);
  console.log(`  totalSales:     ${fmt(summary.totalSales)}`);
  console.log(`  cashSales:      ${fmt(summary.cashSales)}`);
  console.log(`  creditSales:    ${fmt(summary.creditSales)}`);
  console.log(`  totalPayments:  ${fmt(summary.totalPayments)}`);
  console.log(`  avgDailySales:  ${fmt(summary.avgDailySales)}`);
  console.log(
    `  cashShare:      ${summary.cashShare != null ? (summary.cashShare * 100).toFixed(1) + "%" : "n/a"}`,
  );
  console.log(`  bestDay:        ${summary.bestDay?.date}  ${summary.bestDay ? fmt(summary.bestDay.amount) : "n/a"}`);
  console.log(`  worstDay:       ${summary.worstDay?.date}  ${summary.worstDay ? fmt(summary.worstDay.amount) : "n/a"}`);
  console.log(`  YoY:            prev=${summary.prevFrom}..${summary.prevTo}  prevTotal=${fmt(summary.prevTotalSales)}  growth=${summary.yoyGrowthPct?.toFixed(1) ?? "n/a"}%`);

  const grandDelta = Math.abs(summary.totalSales - KNOWN_TOTALS.grandSalesTotal);
  const paymentsDelta = Math.abs(summary.totalPayments - KNOWN_TOTALS.totalPayments);
  console.log(`  ↳ grand total delta vs import: ${fmt(grandDelta)} ${grandDelta < 1 ? "\u2713" : "\u2717"}`);
  console.log(`  ↳ payments delta vs import:    ${fmt(paymentsDelta)} ${paymentsDelta < 1 ? "\u2713" : "\u2717"}`);
  if (grandDelta > 1) throw new Error("grand total mismatch");
  if (paymentsDelta > 1) throw new Error("payments total mismatch");
  if (summary.dayCount !== 2277) throw new Error(`dayCount should be 2277, got ${summary.dayCount}`);

  // ── 2. Series (groupBy: year) — matches the import YoY table ──
  console.log("\n[2/6] getDailySalesSeries (groupBy=year)");
  const yearly = await getDailySalesSeries(ORG_ID, FROM, TO, "year");
  console.table(
    yearly.map((r) => ({
      bucket: r.bucket,
      days: r.dayCount,
      total: fmt(r.total),
      autoParts: fmt(r.autoParts),
      service: fmt(r.service),
      payments: fmt(r.payments),
    })),
  );
  if (yearly.length !== 8) throw new Error(`expected 8 year buckets, got ${yearly.length}`);

  // ── 3. Series (groupBy: month) — should be ~82 buckets ──
  console.log("\n[3/6] getDailySalesSeries (groupBy=month)");
  const monthly = await getDailySalesSeries(ORG_ID, FROM, TO, "month");
  console.log(`  ${monthly.length} monthly buckets`);
  console.log(`  first: ${monthly[0]?.bucket}  total=${fmt(monthly[0]?.total ?? 0)}`);
  console.log(`  last:  ${monthly[monthly.length - 1]?.bucket}  total=${fmt(monthly[monthly.length - 1]?.total ?? 0)}`);
  // Sanity: sum of all monthly totals should equal the grand total
  const monthlySum = monthly.reduce((s, r) => s + r.total, 0);
  if (Math.abs(monthlySum - summary.totalSales) > 1) {
    throw new Error(`monthly sum ${fmt(monthlySum)} != summary total ${fmt(summary.totalSales)}`);
  }
  console.log(`  ↳ monthly sum reconciles \u2713`);

  // ── 4. Division breakdown ──
  console.log("\n[4/6] getDailySalesDivisionBreakdown");
  const divs = await getDailySalesDivisionBreakdown(ORG_ID, FROM, TO);
  console.table(
    divs.divisions.map((d) => ({
      label: d.label,
      cash: fmt(d.cash),
      credit: fmt(d.credit),
      total: fmt(d.total),
      share: d.share != null ? (d.share * 100).toFixed(1) + "%" : "n/a",
    })),
  );
  console.log(`  grandTotal: ${fmt(divs.grandTotal)}`);
  console.log(`  totalCash:  ${fmt(divs.totalCash)}`);
  console.log(`  totalCredit:${fmt(divs.totalCredit)}`);
  const divsDelta = Math.abs(divs.grandTotal - summary.totalSales);
  if (divsDelta > 1) throw new Error(`division grand ${fmt(divs.grandTotal)} != summary total ${fmt(summary.totalSales)}`);
  console.log(`  ↳ division grand reconciles \u2713`);

  // ── 5. YoY monthly grid ──
  console.log("\n[5/6] getDailySalesYoY");
  const yoy = await getDailySalesYoY(ORG_ID);
  console.log(`  ${yoy.length} (year, month) rows`);
  const years = new Set(yoy.map((r) => r.year));
  console.log(`  years: ${[...years].sort().join(", ")}`);
  const yoySum = yoy.reduce((s, r) => s + r.total, 0);
  if (Math.abs(yoySum - summary.totalSales) > 1) {
    throw new Error(`YoY sum ${fmt(yoySum)} != summary total ${fmt(summary.totalSales)}`);
  }
  console.log(`  ↳ YoY sum reconciles \u2713`);

  // ── 6. Day of week + rows ──
  console.log("\n[6/6] getDailySalesByDayOfWeek + getDailySalesRows (sample window)");
  const dow = await getDailySalesByDayOfWeek(ORG_ID, "2025-01-01", "2025-12-31");
  const DOW_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  console.table(
    dow.map((r) => ({
      day: DOW_NAMES[r.dow],
      days: r.dayCount,
      total: fmt(r.total),
      avg: fmt(r.avg),
    })),
  );

  const rows2025 = await getDailySalesRows(ORG_ID, "2025-01-01", "2025-01-10");
  console.log(`\n  sample rows (2025-01-01..2025-01-10): ${rows2025.length}`);
  console.table(rows2025.slice(0, 5));

  console.log("\n=== ALL SMOKE TESTS PASSED ===");
  process.exit(0);
}

main().catch((e) => {
  console.error("\nFAILED:", e.message);
  console.error(e);
  process.exit(1);
});
