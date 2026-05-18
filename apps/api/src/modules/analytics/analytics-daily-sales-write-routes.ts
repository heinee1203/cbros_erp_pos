import type { FastifyInstance } from "fastify";
import {
  upsertDailySales,
  type ManualDailySalesInput,
} from "./analytics-write-service";
import { assertAdmin, parseIsoDate } from "./analytics-route-helpers";

export async function registerAnalyticsDailySalesWriteRoutes(app: FastifyInstance) {
  // POST /daily-sales/upsert - manual daily entry replacing the legacy workbook flow.
  app.post("/daily-sales/upsert", async (request, reply) => {
    try {
      assertAdmin(request.user.role);
    } catch (err: any) {
      return reply.status(err.statusCode ?? 403).send({ error: err.message });
    }

    const { orgId } = request.storeContext!;
    const { userId } = request.user;
    const body = (request.body ?? {}) as { date?: string } & ManualDailySalesInput;

    const date = parseIsoDate(body.date);
    if (!date) {
      return reply.status(400).send({ error: "date must be YYYY-MM-DD" });
    }
    // Refuse future dates - sales cannot be reported before they happen.
    const today = new Date().toISOString().slice(0, 10);
    if (date > today) {
      return reply.status(400).send({ error: "Cannot record sales for a future date" });
    }

    try {
      const result = await upsertDailySales(orgId, date, body, userId);
      return reply.send(result);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });
}
