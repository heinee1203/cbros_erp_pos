/**
 * Analytics service — aggregations over `daily_sales_summary` for the
 * admin dashboard. All amounts in the DB are stored as integer CENTAVOS;
 * the API layer returns pesos as numbers (value / 100) so the frontend
 * never has to juggle centavos.
 *
 * Heavy queries (YoY, daily series) run as raw SQL with date_trunc +
 * GROUP BY for efficient server-side aggregation.
 */
import { db } from "@apex/database";
import { sql } from "drizzle-orm";

// ── Shared types ──

export type GroupBy = "day" | "week" | "month" | "quarter" | "year";

/** Maps all the centavos columns into peso numbers for the API surface. */
function centavosRowToPeso(r: any) {
  return {
    date: r.date,
    apOldSales: Number(r.ap_old_sales ?? 0) / 100,
    apNewSales: Number(r.ap_new_sales ?? 0) / 100,
    apOnAccount: Number(r.ap_on_account ?? 0) / 100,
    acSales: Number(r.ac_sales ?? 0) / 100,
    acOnAccount: Number(r.ac_on_account ?? 0) / 100,
    serviceSales: Number(r.service_sales ?? 0) / 100,
    serviceOnAccount: Number(r.service_on_account ?? 0) / 100,
    paintingSales: Number(r.painting_sales ?? 0) / 100,
    paintingOnAccount: Number(r.painting_on_account ?? 0) / 100,
    juniorSales: Number(r.junior_sales ?? 0) / 100,
    payments: Number(r.payments ?? 0) / 100,
  };
}

// date_trunc unit keyword for each groupBy. Using a direct lookup keeps
// the raw-SQL surface minimal (no string interpolation risk).
const GROUP_TRUNC: Record<GroupBy, string> = {
  day: "day",
  week: "week",
  month: "month",
  quarter: "quarter",
  year: "year",
};

// ════════════════════════════════════════════════════════════════
//   1.  TIME SERIES  — GET /analytics/daily-sales
// ════════════════════════════════════════════════════════════════
/**
 * Returns a chronological series of buckets (by day/week/month/quarter/year)
 * with per-division totals plus a computed `total` combining every division.
 *
 * Used by the Revenue Trend line chart and the Payments trend chart.
 */
export async function getDailySalesSeries(
  orgId: string,
  from: string,
  to: string,
  groupBy: GroupBy = "day",
) {
  // `trunc` is resolved from a closed whitelist (GROUP_TRUNC) above, so
  // inlining it via sql.raw is safe. We MUST inline rather than bind it
  // as a parameter — Postgres treats each parameterized date_trunc as a
  // distinct expression, which breaks "GROUP BY expr must match SELECT expr".
  const trunc = GROUP_TRUNC[groupBy] ?? "day";
  const truncExpr = sql.raw(`date_trunc('${trunc}', date)`);
  const rows = (await db.execute(sql`
    SELECT
      to_char(${truncExpr}, 'YYYY-MM-DD') AS bucket,
      SUM(ap_old_sales)::bigint        AS ap_old_sales,
      SUM(ap_new_sales)::bigint        AS ap_new_sales,
      SUM(ap_on_account)::bigint       AS ap_on_account,
      SUM(ac_sales)::bigint            AS ac_sales,
      SUM(ac_on_account)::bigint       AS ac_on_account,
      SUM(service_sales)::bigint       AS service_sales,
      SUM(service_on_account)::bigint  AS service_on_account,
      SUM(painting_sales)::bigint      AS painting_sales,
      SUM(painting_on_account)::bigint AS painting_on_account,
      SUM(junior_sales)::bigint        AS junior_sales,
      SUM(payments)::bigint            AS payments,
      COUNT(*)::int                    AS day_count
    FROM daily_sales_summary
    WHERE org_id = ${orgId}
      AND date >= ${from}::date
      AND date <= ${to}::date
    GROUP BY ${truncExpr}
    ORDER BY ${truncExpr} ASC
  `)) as any[];

  return rows.map((r: any) => {
    const apCash = (Number(r.ap_old_sales) + Number(r.ap_new_sales)) / 100;
    const apCredit = Number(r.ap_on_account) / 100;
    const acCash = Number(r.ac_sales) / 100;
    const acCredit = Number(r.ac_on_account) / 100;
    const svcCash = Number(r.service_sales) / 100;
    const svcCredit = Number(r.service_on_account) / 100;
    const pntCash = Number(r.painting_sales) / 100;
    const pntCredit = Number(r.painting_on_account) / 100;
    const junior = Number(r.junior_sales) / 100;
    const payments = Number(r.payments) / 100;

    const autoParts = apCash + apCredit;
    const accessories = acCash + acCredit;
    const service = svcCash + svcCredit;
    const painting = pntCash + pntCredit;
    const total = autoParts + accessories + service + painting + junior;

    return {
      bucket: r.bucket,
      dayCount: r.day_count,
      // Raw division breakdowns (peso)
      apOldSales: Number(r.ap_old_sales) / 100,
      apNewSales: Number(r.ap_new_sales) / 100,
      apOnAccount: apCredit,
      acSales: acCash,
      acOnAccount: acCredit,
      serviceSales: svcCash,
      serviceOnAccount: svcCredit,
      paintingSales: pntCash,
      paintingOnAccount: pntCredit,
      juniorSales: junior,
      payments,
      // Convenience roll-ups for the chart legends
      autoParts,
      accessories,
      service,
      painting,
      junior,
      total,
    };
  });
}

// ════════════════════════════════════════════════════════════════
//   1b. SINGLE DAY  — GET /analytics/daily-sales/single-day
// ════════════════════════════════════════════════════════════════
/**
 * Returns one day of data shaped to match the legacy Excel "Daily Sales
 * Report" template — used by the dashboard's primary daily view.
 *
 * For the requested date this returns the full division breakdown plus the
 * percentage each division contributes to grand-total sales (cash + credit).
 * The dayOfWeek string is computed in JS so the UI doesn't need to know the
 * server's locale.
 */
export async function getDailySalesSingleDay(orgId: string, date: string) {
  const [row] = (await db.execute(sql`
    SELECT
      to_char(date, 'YYYY-MM-DD') AS date,
      ap_old_sales, ap_new_sales, ap_on_account,
      ac_sales, ac_on_account,
      service_sales, service_on_account,
      painting_sales, painting_on_account,
      junior_sales,
      payments
    FROM daily_sales_summary
    WHERE org_id = ${orgId}
      AND date = ${date}::date
  `)) as any[];

  // Compute the dayOfWeek even when there's no row, so the UI can still
  // render "no data for Tuesday, April 7, 2026" without an extra query.
  const dow = new Date(date + "T12:00:00Z").toLocaleDateString("en-US", {
    weekday: "long",
    timeZone: "UTC",
  });

  if (!row) {
    return {
      date,
      dayOfWeek: dow,
      hasData: false,
      ap: { old: 0, new: 0, total: 0, onAccount: 0, oldRatio: null, newRatio: null },
      ac: { cash: 0, onAccount: 0, total: 0 },
      service: { cash: 0, onAccount: 0, total: 0 },
      painting: { cash: 0, onAccount: 0, total: 0 },
      junior: { cash: 0, total: 0 },
      totals: { cash: 0, onAccount: 0, grandTotal: 0, payments: 0 },
      percentages: { ap: 0, ac: 0, service: 0, painting: 0, junior: 0 },
    };
  }

  // Convert centavos → peso
  const apOld = Number(row.ap_old_sales ?? 0) / 100;
  const apNew = Number(row.ap_new_sales ?? 0) / 100;
  const apOnAccount = Number(row.ap_on_account ?? 0) / 100;
  const acCash = Number(row.ac_sales ?? 0) / 100;
  const acOnAccount = Number(row.ac_on_account ?? 0) / 100;
  const svcCash = Number(row.service_sales ?? 0) / 100;
  const svcOnAccount = Number(row.service_on_account ?? 0) / 100;
  const pntCash = Number(row.painting_sales ?? 0) / 100;
  const pntOnAccount = Number(row.painting_on_account ?? 0) / 100;
  const junior = Number(row.junior_sales ?? 0) / 100;
  const payments = Number(row.payments ?? 0) / 100;

  const apTotal = apOld + apNew + apOnAccount;
  const acTotal = acCash + acOnAccount;
  const svcTotal = svcCash + svcOnAccount;
  const pntTotal = pntCash + pntOnAccount;
  const juniorTotal = junior;

  const cashTotal = apOld + apNew + acCash + svcCash + pntCash + junior;
  const creditTotal = apOnAccount + acOnAccount + svcOnAccount + pntOnAccount;
  const grandTotal = cashTotal + creditTotal;

  // OLD/NEW ratio inside Auto Parts cash sales (matches the Excel "0.18 / 0.82" cells)
  const apCashTotal = apOld + apNew;
  const oldRatio = apCashTotal > 0 ? apOld / apCashTotal : null;
  const newRatio = apCashTotal > 0 ? apNew / apCashTotal : null;

  const pct = (n: number) => (grandTotal > 0 ? (n / grandTotal) * 100 : 0);

  return {
    date: row.date,
    dayOfWeek: dow,
    hasData: true,
    ap: {
      old: apOld,
      new: apNew,
      total: apTotal,
      onAccount: apOnAccount,
      oldRatio,
      newRatio,
    },
    ac: { cash: acCash, onAccount: acOnAccount, total: acTotal },
    service: { cash: svcCash, onAccount: svcOnAccount, total: svcTotal },
    painting: { cash: pntCash, onAccount: pntOnAccount, total: pntTotal },
    junior: { cash: junior, total: juniorTotal },
    totals: {
      cash: cashTotal,
      onAccount: creditTotal,
      grandTotal,
      payments,
    },
    percentages: {
      ap: pct(apTotal),
      ac: pct(acTotal),
      service: pct(svcTotal),
      painting: pct(pntTotal),
      junior: pct(juniorTotal),
    },
  };
}

// ════════════════════════════════════════════════════════════════
//   2.  SUMMARY KPIs  — GET /analytics/daily-sales/summary
// ════════════════════════════════════════════════════════════════
/**
 * Returns top-level cards for the dashboard:
 *   - total sales (all divisions combined)
 *   - average daily sales
 *   - best day (date + amount)
 *   - worst day (date + amount, excluding zero days)
 *   - cash vs credit ratio
 *   - total payments collected
 *   - YoY growth vs the same window one year prior
 */
export async function getDailySalesSummary(
  orgId: string,
  from: string,
  to: string,
) {
  // Main window — total + cash/credit breakdown
  const [main] = (await db.execute(sql`
    SELECT
      COUNT(*)::int AS day_count,
      SUM(
        ap_old_sales + ap_new_sales + ap_on_account
        + ac_sales + ac_on_account
        + service_sales + service_on_account
        + painting_sales + painting_on_account
        + junior_sales
      )::bigint AS total_sales,
      SUM(
        ap_old_sales + ap_new_sales
        + ac_sales
        + service_sales
        + painting_sales
        + junior_sales
      )::bigint AS cash_sales,
      SUM(
        ap_on_account
        + ac_on_account
        + service_on_account
        + painting_on_account
      )::bigint AS credit_sales,
      SUM(payments)::bigint AS total_payments
    FROM daily_sales_summary
    WHERE org_id = ${orgId}
      AND date >= ${from}::date
      AND date <= ${to}::date
  `)) as any[];

  const totalSalesCents = Number(main?.total_sales ?? 0);
  const cashSalesCents = Number(main?.cash_sales ?? 0);
  const creditSalesCents = Number(main?.credit_sales ?? 0);
  const totalPaymentsCents = Number(main?.total_payments ?? 0);
  const dayCount = Number(main?.day_count ?? 0);

  // Best / worst day (excluding zero days for worst)
  const extremesRows = (await db.execute(sql`
    WITH daily AS (
      SELECT
        date,
        (ap_old_sales + ap_new_sales + ap_on_account
         + ac_sales + ac_on_account
         + service_sales + service_on_account
         + painting_sales + painting_on_account
         + junior_sales) AS day_total
      FROM daily_sales_summary
      WHERE org_id = ${orgId}
        AND date >= ${from}::date
        AND date <= ${to}::date
    )
    SELECT
      (SELECT date::text FROM daily WHERE day_total > 0 ORDER BY day_total DESC NULLS LAST LIMIT 1) AS best_date,
      (SELECT day_total FROM daily WHERE day_total > 0 ORDER BY day_total DESC NULLS LAST LIMIT 1) AS best_amount,
      (SELECT date::text FROM daily WHERE day_total > 0 ORDER BY day_total ASC NULLS LAST LIMIT 1) AS worst_date,
      (SELECT day_total FROM daily WHERE day_total > 0 ORDER BY day_total ASC NULLS LAST LIMIT 1) AS worst_amount
  `)) as any[];
  const ex = extremesRows[0] ?? {};

  // YoY comparison — same window offset by one year
  const fromDate = new Date(from);
  const toDate = new Date(to);
  const prevFrom = new Date(fromDate);
  prevFrom.setFullYear(prevFrom.getFullYear() - 1);
  const prevTo = new Date(toDate);
  prevTo.setFullYear(prevTo.getFullYear() - 1);
  const prevFromIso = prevFrom.toISOString().slice(0, 10);
  const prevToIso = prevTo.toISOString().slice(0, 10);

  const [prev] = (await db.execute(sql`
    SELECT SUM(
      ap_old_sales + ap_new_sales + ap_on_account
      + ac_sales + ac_on_account
      + service_sales + service_on_account
      + painting_sales + painting_on_account
      + junior_sales
    )::bigint AS total_sales
    FROM daily_sales_summary
    WHERE org_id = ${orgId}
      AND date >= ${prevFromIso}::date
      AND date <= ${prevToIso}::date
  `)) as any[];
  const prevTotalCents = Number(prev?.total_sales ?? 0);

  // Growth: (current - prior) / prior. Null if prior window is empty.
  const yoyGrowthPct =
    prevTotalCents > 0
      ? ((totalSalesCents - prevTotalCents) / prevTotalCents) * 100
      : null;

  const avgDailySales =
    dayCount > 0 ? totalSalesCents / dayCount / 100 : 0;

  return {
    from,
    to,
    dayCount,
    totalSales: totalSalesCents / 100,
    cashSales: cashSalesCents / 100,
    creditSales: creditSalesCents / 100,
    totalPayments: totalPaymentsCents / 100,
    avgDailySales,
    // Cash as a share of total sales. Null if no sales at all.
    cashShare:
      totalSalesCents > 0 ? cashSalesCents / totalSalesCents : null,
    creditShare:
      totalSalesCents > 0 ? creditSalesCents / totalSalesCents : null,
    bestDay: ex.best_date
      ? { date: ex.best_date, amount: Number(ex.best_amount) / 100 }
      : null,
    worstDay: ex.worst_date
      ? { date: ex.worst_date, amount: Number(ex.worst_amount) / 100 }
      : null,
    // YoY
    prevFrom: prevFromIso,
    prevTo: prevToIso,
    prevTotalSales: prevTotalCents / 100,
    yoyGrowthPct,
  };
}

// ════════════════════════════════════════════════════════════════
//   3.  PER-DIVISION BREAKDOWN  — GET /analytics/daily-sales/divisions
// ════════════════════════════════════════════════════════════════
/**
 * Per-division totals for the selected window: used by the Division
 * Breakdown pie/stacked-bar chart and the Cash vs Credit chart.
 *
 * Divisions are the 5 top-level business units — Auto Parts combines
 * OLD + NEW + ON ACCT so the dashboard doesn't need to know the internal
 * split. Each row reports both cash and credit separately.
 */
export async function getDailySalesDivisionBreakdown(
  orgId: string,
  from: string,
  to: string,
) {
  const [main] = (await db.execute(sql`
    SELECT
      SUM(ap_old_sales + ap_new_sales)::bigint AS ap_cash,
      SUM(ap_on_account)::bigint               AS ap_credit,
      SUM(ac_sales)::bigint                    AS ac_cash,
      SUM(ac_on_account)::bigint               AS ac_credit,
      SUM(service_sales)::bigint               AS service_cash,
      SUM(service_on_account)::bigint          AS service_credit,
      SUM(painting_sales)::bigint              AS painting_cash,
      SUM(painting_on_account)::bigint         AS painting_credit,
      SUM(junior_sales)::bigint                AS junior_cash
    FROM daily_sales_summary
    WHERE org_id = ${orgId}
      AND date >= ${from}::date
      AND date <= ${to}::date
  `)) as any[];

  const toPeso = (v: unknown) => Number(v ?? 0) / 100;

  const divisions = [
    {
      key: "auto_parts",
      label: "Auto Parts",
      cash: toPeso(main?.ap_cash),
      credit: toPeso(main?.ap_credit),
    },
    {
      key: "accessories",
      label: "Accessories",
      cash: toPeso(main?.ac_cash),
      credit: toPeso(main?.ac_credit),
    },
    {
      key: "service",
      label: "Service",
      cash: toPeso(main?.service_cash),
      credit: toPeso(main?.service_credit),
    },
    {
      key: "painting",
      label: "Painting",
      cash: toPeso(main?.painting_cash),
      credit: toPeso(main?.painting_credit),
    },
    {
      key: "junior",
      label: "Junior Branch",
      cash: toPeso(main?.junior_cash),
      // Junior branch had no separate credit column in the source Excel
      credit: 0,
    },
  ].map((d) => ({ ...d, total: d.cash + d.credit }));

  const grandTotal = divisions.reduce((s, d) => s + d.total, 0);

  return {
    from,
    to,
    divisions: divisions.map((d) => ({
      ...d,
      // Share of grand total (0..1). Null when there are no sales.
      share: grandTotal > 0 ? d.total / grandTotal : null,
    })),
    totalCash: divisions.reduce((s, d) => s + d.cash, 0),
    totalCredit: divisions.reduce((s, d) => s + d.credit, 0),
    grandTotal,
  };
}

// ════════════════════════════════════════════════════════════════
//   4.  YoY MULTI-YEAR COMPARISON  — /analytics/daily-sales/yoy
// ════════════════════════════════════════════════════════════════
/**
 * Groups every daily_sales_summary row by month and year for a multi-line
 * YoY chart. Returns an array of { year, month, total } entries the
 * dashboard client can pivot into (year -> [12 months]).
 */
export async function getDailySalesYoY(orgId: string) {
  const rows = (await db.execute(sql`
    SELECT
      EXTRACT(YEAR FROM date)::int  AS year,
      EXTRACT(MONTH FROM date)::int AS month,
      SUM(
        ap_old_sales + ap_new_sales + ap_on_account
        + ac_sales + ac_on_account
        + service_sales + service_on_account
        + painting_sales + painting_on_account
        + junior_sales
      )::bigint AS total
    FROM daily_sales_summary
    WHERE org_id = ${orgId}
    GROUP BY EXTRACT(YEAR FROM date), EXTRACT(MONTH FROM date)
    ORDER BY year ASC, month ASC
  `)) as any[];

  return rows.map((r: any) => ({
    year: r.year,
    month: r.month,
    total: Number(r.total ?? 0) / 100,
  }));
}

// ════════════════════════════════════════════════════════════════
//   5.  DAY-OF-WEEK HEATMAP  — /analytics/daily-sales/day-of-week
// ════════════════════════════════════════════════════════════════
/**
 * Average and total sales by day of week (0=Sun..6=Sat) for the window.
 * Powers the heatmap chart.
 */
export async function getDailySalesByDayOfWeek(
  orgId: string,
  from: string,
  to: string,
) {
  const rows = (await db.execute(sql`
    SELECT
      EXTRACT(DOW FROM date)::int AS dow,
      COUNT(*)::int               AS day_count,
      SUM(
        ap_old_sales + ap_new_sales + ap_on_account
        + ac_sales + ac_on_account
        + service_sales + service_on_account
        + painting_sales + painting_on_account
        + junior_sales
      )::bigint AS total
    FROM daily_sales_summary
    WHERE org_id = ${orgId}
      AND date >= ${from}::date
      AND date <= ${to}::date
    GROUP BY EXTRACT(DOW FROM date)
    ORDER BY dow ASC
  `)) as any[];

  return rows.map((r: any) => {
    const cents = Number(r.total ?? 0);
    const dayCount = r.day_count;
    return {
      dow: r.dow, // 0=Sun, 6=Sat
      dayCount,
      total: cents / 100,
      avg: dayCount > 0 ? cents / dayCount / 100 : 0,
    };
  });
}

// ════════════════════════════════════════════════════════════════
//   6.  RAW DAILY DATA TABLE  — /analytics/daily-sales/rows
// ════════════════════════════════════════════════════════════════
/**
 * Raw per-day rows for the dashboard's detailed data table. Returns
 * every column in peso-denominated numbers with the date as ISO string.
 */
export async function getDailySalesRows(
  orgId: string,
  from: string,
  to: string,
) {
  const rows = (await db.execute(sql`
    SELECT
      to_char(date, 'YYYY-MM-DD') AS date,
      ap_old_sales, ap_new_sales, ap_on_account,
      ac_sales, ac_on_account,
      service_sales, service_on_account,
      painting_sales, painting_on_account,
      junior_sales,
      payments
    FROM daily_sales_summary
    WHERE org_id = ${orgId}
      AND date >= ${from}::date
      AND date <= ${to}::date
    ORDER BY date ASC
  `)) as any[];

  return rows.map(centavosRowToPeso);
}
