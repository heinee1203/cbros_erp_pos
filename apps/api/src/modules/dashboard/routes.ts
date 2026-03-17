import type { FastifyPluginAsync } from "fastify";
import { getDashboardSummary } from "./service";

export const dashboardRoutes: FastifyPluginAsync = async (app) => {
  /**
   * GET /dashboard/summary
   *
   * Single aggregation endpoint for the Dashboard page.
   * Returns inventory summary, procurement/transfer/job card counts,
   * financial KPIs, low-stock items, and recent activity.
   *
   * - Scoped to current location by default (X-Location-ID header).
   * - allLocations=true allowed only for ADMIN/MANAGER.
   * - Financial KPIs returned only for ADMIN/MANAGER.
   * - Procurement/Transfer/Job Card counts returned for ADMIN/MANAGER/WAREHOUSE_STAFF.
   *
   * Query params:
   *   allLocations - "true" to see org-wide (ADMIN/MANAGER only)
   */
  app.get("/summary", async (request, reply) => {
    const { orgId, locationId } = request.storeContext!;
    const userRole = (request.user as any)?.role ?? "";
    const q = request.query as Record<string, string | undefined>;

    const allLocations = q.allLocations === "true";

    // Guard: only ADMIN/MANAGER can see all locations
    if (allLocations && userRole !== "ADMIN" && userRole !== "MANAGER") {
      return reply.status(403).send({
        error: "Cross-location dashboard requires ADMIN or MANAGER role",
      });
    }

    const result = await getDashboardSummary(
      orgId,
      locationId ?? "",
      userRole,
      allLocations || !locationId,
    );

    return reply.send(result);
  });
};
