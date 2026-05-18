import type { FastifyInstance } from "fastify";
import { getDailySalesSummary, getSalesKPIs } from "./sales-reports";

type SalesDashboardQuery = {
  from?: string;
  to?: string;
  allLocations?: string;
  employeeId?: string;
};

function resolveLocationId(
  query: SalesDashboardQuery,
  locationId: string | null | undefined,
) {
  return query.allLocations === "true" || !locationId ? undefined : locationId;
}

export async function registerReportingSalesDashboardRoutes(
  app: FastifyInstance,
) {
  app.get("/daily-sales-summary", async (request, reply) => {
    const { orgId, locationId } = request.storeContext!;
    const query = request.query as SalesDashboardQuery;

    const data = await getDailySalesSummary(orgId, {
      locationId: resolveLocationId(query, locationId),
      from: query.from,
      to: query.to,
      employeeId: query.employeeId,
    });

    return reply.send({ data });
  });

  app.get("/sales-kpis", async (request, reply) => {
    const { orgId, locationId } = request.storeContext!;
    const query = request.query as SalesDashboardQuery;

    const data = await getSalesKPIs(orgId, {
      locationId: resolveLocationId(query, locationId),
      from: query.from,
      to: query.to,
      employeeId: query.employeeId,
    });

    return reply.send(data);
  });
}
