import type { FastifyInstance } from "fastify";
import { parseQuery } from "../../lib/validate-query";
import { getReturn, listReturns } from "./return-route-service";
import {
  canAccessReturnsAcrossLocations,
  returnsQuerySchema,
} from "./return-route-helpers";

export async function registerReturnReadRoutes(app: FastifyInstance) {
  app.get("/", async (request, reply) => {
    const q = parseQuery(returnsQuerySchema, request.query, reply);
    if (!q) return;

    const { orgId, locationId } = request.storeContext!;
    const { role } = request.user;

    const allLocations = q.allLocations === "true" || !locationId;
    if (allLocations && !canAccessReturnsAcrossLocations(role)) {
      return reply
        .status(403)
        .send({ error: "Cross-location access requires ADMIN or MANAGER" });
    }

    const result = await listReturns(orgId, {
      locationId: allLocations ? undefined : locationId,
      status: q.status?.split(",").filter(Boolean),
      originalSaleId: q.originalSaleId,
      from: q.from,
      to: q.to,
      cursor: q.cursor,
      limit: q.limit,
    });

    return reply.send(result);
  });

  app.get("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;

    const result = await getReturn(id, orgId);
    if (!result) {
      return reply.status(404).send({ error: "Return not found" });
    }
    return reply.send(result);
  });
}
