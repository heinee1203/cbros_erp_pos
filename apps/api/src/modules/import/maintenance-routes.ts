import type { FastifyInstance } from "fastify";
import { backfillOrphanedSales } from "./sales-backfill";
import { MANAGE_ROLES } from "./route-permissions";

export function registerImportMaintenanceRoutes(app: FastifyInstance) {
  app.post("/backfill-orphaned-sales", async (request, reply) => {
    if (!MANAGE_ROLES.includes(request.user.role)) {
      return reply.status(403).send({ error: "Insufficient permissions" });
    }
    const { orgId } = request.storeContext!;
    const result = await backfillOrphanedSales(orgId);
    return reply.send(result);
  });
}
