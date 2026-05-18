import type { FastifyInstance } from "fastify";
import { listAdjustments } from "./adjustment-route-service";
import { parseAdjustmentPagination } from "./adjustment-route-helpers";

export async function registerAdjustmentReadRoutes(app: FastifyInstance) {
  app.get("/", async (request, reply) => {
    const { orgId, locationId } = request.storeContext!;
    const q = request.query as Record<string, string | undefined>;
    const { page, limit, offset } = parseAdjustmentPagination(q);

    return reply.send(
      await listAdjustments({
        orgId,
        locationId,
        query: q,
        page,
        limit,
        offset,
      }),
    );
  });
}
