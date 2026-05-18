import type { FastifyInstance } from "fastify";
import { getCatalogDelta } from "./sync-route-service";
import { parseSyncDeltaQuery, requireSyncLocation } from "./sync-route-helpers";

export async function registerSyncCatalogRoutes(app: FastifyInstance) {
  app.get("/catalog", async (request, reply) => {
    const query = parseSyncDeltaQuery(request.query, reply);
    if (!query) return;

    const { orgId, locationId } = request.storeContext!;
    const syncLocationId = requireSyncLocation(locationId, reply);
    if (!syncLocationId) return;

    const result = await getCatalogDelta({
      orgId,
      locationId: syncLocationId,
      since: query.since,
      cursor: query.cursor,
      limit: query.limit,
    });

    return reply.send(result);
  });
}
