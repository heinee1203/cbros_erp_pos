/**
 * Analytics routes — strictly admin-only. Powers the Daily Sales Dashboard
 * (admin) built on top of the `daily_sales_summary` table seeded from the
 * legacy Excel workbook and updated going forward via a manual entry form.
 *
 * All endpoints require the ADMIN role. Role is enforced per-handler
 * rather than via a route-level preHandler so non-admin users get a 403
 * with a consistent error shape.
 */
import type { FastifyPluginAsync } from "fastify";
import {
  getDailySalesSeries,
  getDailySalesSingleDay,
  getDailySalesSummary,
  getDailySalesDivisionBreakdown,
  getDailySalesYoY,
  getDailySalesByDayOfWeek,
  getDailySalesRows,
  type GroupBy,
} from "./service";

const VALID_GROUP_BY = new Set<GroupBy>(["day", "week", "month", "quarter", "year"]);

function assertAdmin(role: string) {
  if (role !== "ADMIN") {
    throw Object.assign(new Error("Admin role required for analytics endpoints"), {
      statusCode: 403,
    });
  }
}

/**
 * Parse and validate a YYYY-MM-DD date string. Returns null on bad input.
 * We keep this strict because the service SQL interpolates these directly.
 */
function parseIsoDate(s: unknown): string | null {
  if (typeof s !== "string") return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(s + "T00:00:00Z");
  if (isNaN(d.getTime())) return null;
  return s;
}

export const analyticsRoutes: FastifyPluginAsync = async (app) => {
  // ─── GET /daily-sales ───────────────────────────────────────
  // Time series aggregated by day/week/month/quarter/year.
  app.get("/daily-sales", async (request, reply) => {
    try {
      assertAdmin(request.user.role);
    } catch (err: any) {
      return reply.status(err.statusCode ?? 403).send({ error: err.message });
    }

    const { orgId } = request.storeContext!;
    const q = request.query as { from?: string; to?: string; groupBy?: string };
    const from = parseIsoDate(q.from);
    const to = parseIsoDate(q.to);
    if (!from || !to) {
      return reply.status(400).send({ error: "from and to must be YYYY-MM-DD" });
    }
    const groupBy: GroupBy = VALID_GROUP_BY.has(q.groupBy as GroupBy)
      ? (q.groupBy as GroupBy)
      : "day";

    const data = await getDailySalesSeries(orgId, from, to, groupBy);
    return reply.send({ from, to, groupBy, data });
  });

  // ─── GET /daily-sales/single-day ────────────────────────────
  // One day's data shaped to match the legacy Excel "Daily Sales Report"
  // template (the primary view in the dashboard's Section 1).
  app.get("/daily-sales/single-day", async (request, reply) => {
    try {
      assertAdmin(request.user.role);
    } catch (err: any) {
      return reply.status(err.statusCode ?? 403).send({ error: err.message });
    }

    const { orgId } = request.storeContext!;
    const q = request.query as { date?: string };
    const date = parseIsoDate(q.date);
    if (!date) {
      return reply.status(400).send({ error: "date must be YYYY-MM-DD" });
    }

    const data = await getDailySalesSingleDay(orgId, date);
    return reply.send(data);
  });

  // ─── GET /daily-sales/summary ───────────────────────────────
  // KPI cards: total sales, avg/day, best/worst day, cash vs credit,
  // YoY growth. Used by the top of the dashboard.
  app.get("/daily-sales/summary", async (request, reply) => {
    try {
      assertAdmin(request.user.role);
    } catch (err: any) {
      return reply.status(err.statusCode ?? 403).send({ error: err.message });
    }

    const { orgId } = request.storeContext!;
    const q = request.query as { from?: string; to?: string };
    const from = parseIsoDate(q.from);
    const to = parseIsoDate(q.to);
    if (!from || !to) {
      return reply.status(400).send({ error: "from and to must be YYYY-MM-DD" });
    }

    const data = await getDailySalesSummary(orgId, from, to);
    return reply.send(data);
  });

  // ─── GET /daily-sales/divisions ─────────────────────────────
  // Division breakdown (Auto Parts / Accessories / Service / Painting / Junior)
  // with cash vs credit split per division. Used by the Division Breakdown
  // pie chart and the Cash vs Credit stacked bar.
  app.get("/daily-sales/divisions", async (request, reply) => {
    try {
      assertAdmin(request.user.role);
    } catch (err: any) {
      return reply.status(err.statusCode ?? 403).send({ error: err.message });
    }

    const { orgId } = request.storeContext!;
    const q = request.query as { from?: string; to?: string };
    const from = parseIsoDate(q.from);
    const to = parseIsoDate(q.to);
    if (!from || !to) {
      return reply.status(400).send({ error: "from and to must be YYYY-MM-DD" });
    }

    const data = await getDailySalesDivisionBreakdown(orgId, from, to);
    return reply.send(data);
  });

  // ─── GET /daily-sales/yoy ───────────────────────────────────
  // Multi-year YoY: one entry per (year, month) across the entire DB.
  // The dashboard pivots into a year-by-year line chart.
  app.get("/daily-sales/yoy", async (request, reply) => {
    try {
      assertAdmin(request.user.role);
    } catch (err: any) {
      return reply.status(err.statusCode ?? 403).send({ error: err.message });
    }

    const { orgId } = request.storeContext!;
    const data = await getDailySalesYoY(orgId);
    return reply.send({ data });
  });

  // ─── GET /daily-sales/day-of-week ───────────────────────────
  // Average + total sales by day of week for the heatmap chart.
  app.get("/daily-sales/day-of-week", async (request, reply) => {
    try {
      assertAdmin(request.user.role);
    } catch (err: any) {
      return reply.status(err.statusCode ?? 403).send({ error: err.message });
    }

    const { orgId } = request.storeContext!;
    const q = request.query as { from?: string; to?: string };
    const from = parseIsoDate(q.from);
    const to = parseIsoDate(q.to);
    if (!from || !to) {
      return reply.status(400).send({ error: "from and to must be YYYY-MM-DD" });
    }

    const data = await getDailySalesByDayOfWeek(orgId, from, to);
    return reply.send({ from, to, data });
  });

  // ─── GET /daily-sales/rows ──────────────────────────────────
  // Raw per-day rows for the detailed data table + CSV export.
  app.get("/daily-sales/rows", async (request, reply) => {
    try {
      assertAdmin(request.user.role);
    } catch (err: any) {
      return reply.status(err.statusCode ?? 403).send({ error: err.message });
    }

    const { orgId } = request.storeContext!;
    const q = request.query as { from?: string; to?: string };
    const from = parseIsoDate(q.from);
    const to = parseIsoDate(q.to);
    if (!from || !to) {
      return reply.status(400).send({ error: "from and to must be YYYY-MM-DD" });
    }

    const data = await getDailySalesRows(orgId, from, to);
    return reply.send({ from, to, data });
  });
};
