import type { FastifyInstance } from "fastify";
import { backfillProductSuppliers } from "./product-supplier-route-service";

export async function registerProductSupplierMaintenanceRoutes(
  app: FastifyInstance,
) {
  app.post("/backfill-suppliers", async (request, reply) => {
    const role = (request.user as any)?.role;
    if (role !== "ADMIN") return reply.status(403).send({ error: "Admin only" });

    const { orgId } = request.storeContext!;
    const count = await backfillProductSuppliers(orgId);
    return reply.send({ success: true, created: count });
  });
}
