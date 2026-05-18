import type { FastifyInstance } from "fastify";
import {
  getDailySalesByDayOfWeek,
  getDailySalesDivisionBreakdown,
  getDailySalesRows,
  getDailySalesSeries,
  getDailySalesSingleDay,
  getDailySalesSummary,
  getDailySalesYoY,
  type GroupBy,
} from "./analytics-read-service";
import { assertAdmin, parseIsoDate, VALID_GROUP_BY } from "./analytics-route-helpers";

export async function registerAnalyticsDailySalesRoutes(app: FastifyInstance) {
  // GET /daily-sales - time series aggregated by day/week/month/quarter/year.
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

  // GET /daily-sales/single-day - legacy daily report-shaped response.
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

  // GET /daily-sales/summary - KPI cards for the dashboard top section.
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

  // GET /daily-sales/divisions - division breakdown with cash vs credit split.
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

  // GET /daily-sales/yoy - multi-year YoY rows across the database.
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

  // GET /daily-sales/day-of-week - average and total sales by day of week.
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
}

export async function registerAnalyticsDailySalesRowsRoute(app: FastifyInstance) {
  // GET /daily-sales/rows - raw per-day rows for table and CSV export.
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
}
