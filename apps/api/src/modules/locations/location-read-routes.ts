import type { FastifyInstance } from "fastify";
import { listLocationsForOrg } from "./location-route-service";
import {
  shouldIncludeInactiveLocations,
  type LocationListQuery,
} from "./location-route-helpers";

export async function registerLocationReadRoutes(app: FastifyInstance) {
  /**
   * GET /locations
   * List locations for the authenticated user's organization.
   * ?includeInactive=true to include soft-deleted locations.
   */
  app.get("/", async (request, reply) => {
    const user = request.user as { orgId: string } | null;
    if (!user) {
      return reply.status(401).send({ error: "Unauthorized" });
    }

    const query = request.query as LocationListQuery;
    const showAll = shouldIncludeInactiveLocations(query);
    const rows = await listLocationsForOrg(user.orgId, showAll);

    return reply.send({ data: rows });
  });
}
