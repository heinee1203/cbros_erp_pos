import type { FastifyPluginAsync } from "fastify";
import { getCatalogDelta, getInventoryDelta } from "./service";

export const syncRoutes: FastifyPluginAsync = async (app) => {
  // ─── GET /sync/catalog ─────────────────────────────
  // Delta sync: returns products updated since given timestamp
  // Excludes costPrice — mobile-safe by design
  app.get("/catalog", async (request, reply) => {
    const { orgId, locationId } = request.storeContext!;
    const query = request.query as { since?: string };

    const data = await getCatalogDelta({
      orgId,
      locationId,
      since: query.since,
    });

    return reply.send({
      data,
      syncedAt: new Date().toISOString(),
      count: data.length,
    });
  });

  // ─── GET /sync/inventory ───────────────────────────
  // Delta sync: returns inventory rows updated since given timestamp
  // Scoped to current location via X-Location-ID
  app.get("/inventory", async (request, reply) => {
    const { orgId, locationId } = request.storeContext!;
    const query = request.query as { since?: string };

    const data = await getInventoryDelta({
      orgId,
      locationId,
      since: query.since,
    });

    return reply.send({
      data,
      syncedAt: new Date().toISOString(),
      count: data.length,
    });
  });
};
