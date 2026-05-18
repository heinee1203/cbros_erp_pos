import type { FastifyInstance } from "fastify";
import { parseQuery } from "../../lib/validate-query";
import {
  countItemsQuerySchema,
  countsQuerySchema,
  isInventoryCountManager,
} from "./inventory-count-route-helpers";
import {
  getCount,
  getCountItems,
  listCounts,
} from "./inventory-count-read-service";

export async function registerInventoryCountReadRoutes(app: FastifyInstance) {
  // List counts
  app.get("/", async (request, reply) => {
    const q = parseQuery(countsQuerySchema, request.query, reply);
    if (!q) return;

    const { orgId, locationId } = request.storeContext!;
    const { role } = request.user;

    const allLocations = q.allLocations === "true" || !locationId;
    if (allLocations && !isInventoryCountManager(role)) {
      return reply
        .status(403)
        .send({ error: "Cross-location access requires ADMIN or MANAGER" });
    }

    const result = await listCounts(orgId, {
      locationId: allLocations ? q.locationId : (locationId ?? undefined),
      status: q.status,
      countType: q.countType,
      dateFrom: q.dateFrom,
      dateTo: q.dateTo,
      search: q.search,
      cursor: q.cursor,
      limit: q.limit,
    });

    return reply.send(result);
  });

  // Get count detail
  app.get("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;

    try {
      const result = await getCount(orgId, id);
      return reply.send(result);
    } catch (err: any) {
      return reply.status(404).send({ error: err.message });
    }
  });

  // Get count items (paginated)
  app.get("/:id/items", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;

    const q = parseQuery(countItemsQuerySchema, request.query, reply);
    if (!q) return;

    try {
      const result = await getCountItems(orgId, id, {
        status: q.status,
        search: q.search,
        cursor: q.cursor,
        limit: q.limit,
      });
      return reply.send(result);
    } catch (err: any) {
      return reply.status(404).send({ error: err.message });
    }
  });
}
