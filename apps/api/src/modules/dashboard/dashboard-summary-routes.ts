import type { FastifyInstance } from "fastify";
import { getDashboardSummary } from "./dashboard-route-service";
import {
  canViewAllDashboardLocations,
  isAllLocationsDashboardRequest,
  sendDashboardCrossLocationRequired,
  shouldUseAllDashboardLocations,
  type DashboardSummaryQuery,
} from "./dashboard-route-helpers";

export async function registerDashboardSummaryRoutes(app: FastifyInstance) {
  app.get("/summary", async (request, reply) => {
    const { orgId, locationId } = request.storeContext!;
    const userRole = (request.user as any)?.role ?? "";
    const query = request.query as DashboardSummaryQuery;

    const allLocations = isAllLocationsDashboardRequest(query);

    if (allLocations && !canViewAllDashboardLocations(userRole)) {
      return sendDashboardCrossLocationRequired(reply);
    }

    const result = await getDashboardSummary(
      orgId,
      locationId ?? "",
      userRole,
      shouldUseAllDashboardLocations(allLocations, locationId),
    );

    return reply.send(result);
  });
}
