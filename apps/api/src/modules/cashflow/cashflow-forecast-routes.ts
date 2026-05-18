import type { FastifyInstance } from "fastify";
import {
  buildForecast,
  getCashFlowSummary,
} from "./cashflow-route-service";
import {
  canViewCashflow,
  parseForecastDays,
  sendCashflowAdminManagerRequired,
  type CashflowForecastQuery,
} from "./cashflow-route-helpers";

export async function registerCashflowForecastRoutes(app: FastifyInstance) {
  app.get("/forecast", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { role } = request.user;
    if (!canViewCashflow(role)) {
      return sendCashflowAdminManagerRequired(reply);
    }
    const query = request.query as CashflowForecastQuery;
    const result = await buildForecast(
      orgId,
      parseForecastDays(query),
      query.startDate,
    );
    return reply.send(result);
  });

  app.get("/summary", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { role } = request.user;
    if (!canViewCashflow(role)) {
      return sendCashflowAdminManagerRequired(reply);
    }
    const result = await getCashFlowSummary(orgId);
    return reply.send(result);
  });
}
