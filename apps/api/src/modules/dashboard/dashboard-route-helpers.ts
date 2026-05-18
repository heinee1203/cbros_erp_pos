import type { FastifyReply } from "fastify";

export type DashboardSummaryQuery = {
  allLocations?: string;
};

export const DASHBOARD_CROSS_LOCATION_ROLES = ["ADMIN", "MANAGER"];

export function isAllLocationsDashboardRequest(query: DashboardSummaryQuery) {
  return query.allLocations === "true";
}

export function canViewAllDashboardLocations(role: string) {
  return DASHBOARD_CROSS_LOCATION_ROLES.includes(role);
}

export function sendDashboardCrossLocationRequired(reply: FastifyReply) {
  return reply.status(403).send({
    error: "Cross-location dashboard requires ADMIN or MANAGER role",
  });
}

export function shouldUseAllDashboardLocations(allLocations: boolean, locationId: string | null | undefined) {
  return allLocations || !locationId;
}
