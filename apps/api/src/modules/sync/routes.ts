import type { FastifyPluginAsync } from "fastify";
import { getCatalogDelta, getInventoryDelta } from "./service";
import { parseQuery, syncQuerySchema } from "../../lib/validate-query";

export const syncRoutes: FastifyPluginAsync = async (app) => {
  // ─── GET /sync/catalog ─────────────────────────────
  // Delta sync: returns products updated since given timestamp
  // Excludes costPrice — mobile-safe by design
  app.get("/catalog", async (request, reply) => {
    const q = parseQuery(syncQuerySchema, request.query, reply);
    if (!q) return;

    const { orgId, locationId } = request.storeContext!;
    if (!locationId) {
      return reply.status(400).send({ error: "A specific location must be selected for sync" });
    }

    const result = await getCatalogDelta({
      orgId,
      locationId,
      since: q.since,
      cursor: q.cursor,
      limit: q.limit,
    });

    return reply.send(result);
  });

  // ─── GET /sync/inventory ───────────────────────────
  // Delta sync: returns inventory rows updated since given timestamp
  // Scoped to current location via X-Location-ID
  app.get("/inventory", async (request, reply) => {
    const q = parseQuery(syncQuerySchema, request.query, reply);
    if (!q) return;

    const { orgId, locationId } = request.storeContext!;
    if (!locationId) {
      return reply.status(400).send({ error: "A specific location must be selected for sync" });
    }

    const result = await getInventoryDelta({
      orgId,
      locationId,
      since: q.since,
      cursor: q.cursor,
      limit: q.limit,
    });

    return reply.send(result);
  });
};
