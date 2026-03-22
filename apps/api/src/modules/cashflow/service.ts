import { db } from "@apex/database";
import {
  recurringExpenses,
  checkVouchers,
  checkVoucherLines,
  supplierInvoices,
  customerTransactions,
  customers,
  sales,
} from "@apex/database/schema";
import { eq, and, sql, desc } from "drizzle-orm";

// ══════════════════════════════════════════════════════
// RECURRING EXPENSES CRUD
// ══════════════════════════════════════════════════════

export async function listExpenses(orgId: string) {
  return db
    .select()
    .from(recurringExpenses)
    .where(and(eq(recurringExpenses.orgId, orgId), eq(recurringExpenses.isActive, true)))
    .orderBy(recurringExpenses.dueDay);
}

export async function createExpense(orgId: string, input: {
  name: string;
  category?: string;
  amount: string;
  dueDay: number;
  locationId?: string | null;
  notes?: string | null;
}) {
  const [expense] = await db
    .insert(recurringExpenses)
    .values({
      orgId,
      name: input.name,
      category: (input.category as any) ?? "OTHER",
      amount: input.amount,
      dueDay: Math.max(1, Math.min(31, input.dueDay)),
      locationId: input.locationId ?? null,
      notes: input.notes ?? null,
    })
    .returning();
  return expense;
}

export async function updateExpense(id: string, orgId: string, updates: Record<string, any>) {
  if (updates.dueDay) updates.dueDay = Math.max(1, Math.min(31, updates.dueDay));
  const [updated] = await db
    .update(recurringExpenses)
    .set(updates)
    .where(and(eq(recurringExpenses.id, id), eq(recurringExpenses.orgId, orgId)))
    .returning();
  return updated;
}

export async function deactivateExpense(id: string, orgId: string) {
  return updateExpense(id, orgId, { isActive: false });
}

// ══════════════════════════════════════════════════════
// CASH FLOW FORECAST
// ══════════════════════════════════════════════════════

interface ForecastDay {
  date: string;
  inflows: { arCollections: number; projectedSales: number; total: number };
  outflows: { pdcs: number; apInvoices: number; recurring: number; total: number };
  netFlow: number;
  runningNet: number;
  alerts: string[];
}

interface WeeklyBucket {
  week: string;
  inflows: number;
  outflows: number;
  net: number;
}

interface MonthlyBucket {
  month: string;
  inflows: number;
  outflows: number;
  net: number;
}

export async function buildForecast(orgId: string, days: number = 90, startDate?: string) {
  const start = startDate ? new Date(startDate) : new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + days);

  const startStr = start.toISOString().split("T")[0];
  const endStr = end.toISOString().split("T")[0];

  // 1. Average daily revenue (30-day rolling)
  const [revRow] = await db.execute(
    sql`SELECT COALESCE(SUM(grand_total::numeric) / 30, 0)::numeric(14,2) AS avg_daily
        FROM sales
        WHERE status = 'COMPLETED' AND org_id = ${orgId}
          AND created_at >= NOW() - INTERVAL '30 days'`,
  );
  const avgDailyRevenue = parseFloat((revRow as any)?.avg_daily ?? "0");

  // 2. PDCs due in range (committed outflows)
  const pdcByDate = new Map<string, number>();
  try {
  const pdcRows = await db.execute(
    sql`SELECT check_date::text AS dt, SUM(net_amount::numeric)::numeric(14,2) AS total
        FROM check_vouchers
        WHERE org_id = ${orgId}
          AND status IN ('APPROVED', 'PRINTED', 'RELEASED')
          AND check_date >= ${startStr}::date AND check_date < ${endStr}::date
        GROUP BY check_date`,
  );
  for (const r of pdcRows) {
    pdcByDate.set((r as any).dt, parseFloat((r as any).total));
  }
  } catch { /* check_vouchers table may not exist */ }

  // 3. Open AP invoices NOT covered by a check voucher
  const apByDate = new Map<string, number>();
  try {
  const apRows = await db.execute(
    sql`SELECT si.due_date::text AS dt, SUM(si.balance::numeric)::numeric(14,2) AS total
        FROM supplier_invoices si
        WHERE si.org_id = ${orgId}
          AND si.status = 'OPEN' AND si.balance::numeric > 0
          AND si.due_date >= ${startStr}::date AND si.due_date < ${endStr}::date
          AND NOT EXISTS (
            SELECT 1 FROM check_voucher_lines cvl
            JOIN check_vouchers cv ON cvl.check_voucher_id = cv.id
            WHERE cvl.supplier_invoice_id = si.id
              AND cv.status NOT IN ('VOIDED', 'STALE')
          )
        GROUP BY si.due_date`,
  );
  for (const r of apRows) {
    apByDate.set((r as any).dt, parseFloat((r as any).total));
  }
  } catch { /* supplier_invoices/check_vouchers may not exist */ }

  // 4. AR collections expected (CHARGE transactions + customer payment terms)
  const arByDate = new Map<string, number>();
  try {
    const arRows = await db.execute(
      sql`SELECT (ct.recorded_at::date + COALESCE(c.payment_terms_days, 30))::text AS dt,
                 SUM(ct.amount::numeric)::numeric(14,2) AS total
          FROM customer_transactions ct
          JOIN customers c ON ct.customer_id = c.id
          WHERE ct.org_id = ${orgId} AND ct.type = 'CHARGE'
            AND (ct.recorded_at::date + COALESCE(c.payment_terms_days, 30)) >= ${startStr}::date
            AND (ct.recorded_at::date + COALESCE(c.payment_terms_days, 30)) < ${endStr}::date
          GROUP BY dt`,
    );
    for (const r of arRows) {
      arByDate.set((r as any).dt, parseFloat((r as any).total));
    }
  } catch {
    // customer_transactions table may not exist yet — skip AR
  }

  // 5. Recurring expenses
  const expenses = await db
    .select()
    .from(recurringExpenses)
    .where(and(eq(recurringExpenses.orgId, orgId), eq(recurringExpenses.isActive, true)));

  const recurringByDate = new Map<string, number>();
  // Expand recurring expenses into each month in the range
  const current = new Date(start);
  while (current < end) {
    const year = current.getFullYear();
    const month = current.getMonth();
    for (const exp of expenses) {
      const day = Math.min(exp.dueDay, new Date(year, month + 1, 0).getDate()); // handle 31st
      const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      if (dateStr >= startStr && dateStr < endStr) {
        recurringByDate.set(dateStr, (recurringByDate.get(dateStr) ?? 0) + parseFloat(exp.amount));
      }
    }
    current.setMonth(current.getMonth() + 1);
  }

  // 6. Build day-by-day forecast
  const forecast: ForecastDay[] = [];
  let runningNet = 0;
  const dayIter = new Date(start);

  while (dayIter < end) {
    const dateStr = dayIter.toISOString().split("T")[0];
    const arCollections = arByDate.get(dateStr) ?? 0;
    const projectedSales = avgDailyRevenue;
    const pdcs = pdcByDate.get(dateStr) ?? 0;
    const apInv = apByDate.get(dateStr) ?? 0;
    const recurring = recurringByDate.get(dateStr) ?? 0;

    const totalInflows = arCollections + projectedSales;
    const totalOutflows = pdcs + apInv + recurring;
    const netFlow = totalInflows - totalOutflows;
    runningNet += netFlow;

    const alerts: string[] = [];
    if (pdcs > 0) alerts.push(`PDC due: ₱${pdcs.toLocaleString("en-PH")}`);
    if (apInv > 0) alerts.push(`AP invoice due: ₱${apInv.toLocaleString("en-PH")}`);
    if (netFlow < -50000) alerts.push(`Large net outflow: ₱${Math.abs(netFlow).toLocaleString("en-PH")}`);

    forecast.push({
      date: dateStr,
      inflows: { arCollections, projectedSales, total: totalInflows },
      outflows: { pdcs, apInvoices: apInv, recurring, total: totalOutflows },
      netFlow,
      runningNet,
      alerts,
    });

    dayIter.setDate(dayIter.getDate() + 1);
  }

  // 7. Aggregate into weekly/monthly buckets
  const weeklyBuckets: WeeklyBucket[] = [];
  for (let i = 0; i < forecast.length; i += 7) {
    const chunk = forecast.slice(i, i + 7);
    const first = chunk[0].date;
    const last = chunk[chunk.length - 1].date;
    const label = `${formatShort(first)}–${formatShort(last)}`;
    weeklyBuckets.push({
      week: label,
      inflows: sum(chunk, (d) => d.inflows.total),
      outflows: sum(chunk, (d) => d.outflows.total),
      net: sum(chunk, (d) => d.netFlow),
    });
  }

  const monthlyBuckets: MonthlyBucket[] = [];
  const monthMap = new Map<string, { inflows: number; outflows: number; net: number }>();
  for (const day of forecast) {
    const key = day.date.substring(0, 7); // YYYY-MM
    const bucket = monthMap.get(key) ?? { inflows: 0, outflows: 0, net: 0 };
    bucket.inflows += day.inflows.total;
    bucket.outflows += day.outflows.total;
    bucket.net += day.netFlow;
    monthMap.set(key, bucket);
  }
  for (const [key, bucket] of monthMap) {
    const [y, m] = key.split("-");
    const monthName = new Date(parseInt(y), parseInt(m) - 1).toLocaleDateString("en-PH", { month: "long", year: "numeric" });
    monthlyBuckets.push({ month: monthName, ...bucket });
  }

  // Summary
  const totalInflows = sum(forecast, (d) => d.inflows.total);
  const totalOutflows = sum(forecast, (d) => d.outflows.total);
  const dangerDays = forecast.filter((d) => d.netFlow < -50000).length;
  const lowestDay = forecast.reduce((min, d) => d.runningNet < min.runningNet ? d : min, forecast[0]);

  return {
    startDate: startStr,
    days,
    avgDailyRevenue,
    forecast,
    summary: {
      totalInflows,
      totalOutflows,
      netFlow: totalInflows - totalOutflows,
      lowestPoint: lowestDay ? { date: lowestDay.date, amount: lowestDay.runningNet } : null,
      dangerDays,
      pdcTotal: sum(forecast, (d) => d.outflows.pdcs),
      arCollectible: sum(forecast, (d) => d.inflows.arCollections),
      recurringMonthly: expenses.reduce((s, e) => s + parseFloat(e.amount), 0),
    },
    weeklyBuckets,
    monthlyBuckets,
  };
}

export async function getCashFlowSummary(orgId: string) {
  const [r30, r60, r90] = await Promise.all([
    buildForecast(orgId, 30),
    buildForecast(orgId, 60),
    buildForecast(orgId, 90),
  ]);

  return {
    next30Days: r30.summary,
    next60Days: r60.summary,
    next90Days: r90.summary,
  };
}

// Helpers
function sum<T>(arr: T[], fn: (item: T) => number): number {
  return arr.reduce((s, item) => s + fn(item), 0);
}

function formatShort(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-PH", { month: "short", day: "numeric" });
}
