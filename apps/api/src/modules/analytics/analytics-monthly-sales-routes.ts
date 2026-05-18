import type { FastifyInstance } from "fastify";
import {
  getMonthlySalesSingleMonth,
  type MonthlyCompareMode,
} from "./analytics-read-service";
import {
  assertAdmin,
  parseIsoMonth,
  VALID_COMPARE_MODES,
} from "./analytics-route-helpers";

export async function registerAnalyticsMonthlySalesRoutes(app: FastifyInstance) {
  // GET /monthly-sales/single-month - aggregated month with optional comparisons.
  app.get("/monthly-sales/single-month", async (request, reply) => {
    try {
      assertAdmin(request.user.role);
    } catch (err: any) {
      return reply.status(err.statusCode ?? 403).send({ error: err.message });
    }

    const { orgId } = request.storeContext!;
    const q = request.query as { month?: string; compare?: string };
    const month = parseIsoMonth(q.month);
    if (!month) {
      return reply.status(400).send({ error: "month must be YYYY-MM" });
    }
    const compare: MonthlyCompareMode = VALID_COMPARE_MODES.has(q.compare as MonthlyCompareMode)
      ? (q.compare as MonthlyCompareMode)
      : "none";

    const data = await getMonthlySalesSingleMonth(orgId, month, compare);
    return reply.send(data);
  });
}
