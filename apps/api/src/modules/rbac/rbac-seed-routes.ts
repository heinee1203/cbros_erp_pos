import type { FastifyInstance } from "fastify";
import { seedCashierAccounts } from "./rbac-route-service";
import { isAdminRole } from "./rbac-route-helpers";

export async function registerRbacSeedRoutes(app: FastifyInstance) {
  app.post("/seed-cashiers", async (request, reply) => {
    const { role: userRole } = request.user;
    if (!isAdminRole(userRole)) {
      return reply.status(403).send({ error: "Admin required" });
    }

    const { orgId } = request.storeContext!;
    const result = await seedCashierAccounts(orgId);
    return reply.send(result);
  });
}
