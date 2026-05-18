import type { FastifyInstance } from "fastify";
import {
  assignUserRole,
  listEmployeesWithRoleInfo,
} from "./rbac-route-service";
import { getRbacErrorStatus, isAdminRole } from "./rbac-route-helpers";

export async function registerRbacUserRoutes(app: FastifyInstance) {
  app.get("/employees", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const rows = await listEmployeesWithRoleInfo(orgId);
    return reply.send({ data: rows });
  });

  app.put("/users/:userId/role", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { role: userRole } = request.user;
    if (!isAdminRole(userRole)) {
      return reply.status(403).send({ error: "Admin required" });
    }

    const { userId } = request.params as { userId: string };
    const body = request.body as { roleId: string };
    if (!body?.roleId) {
      return reply.status(400).send({ error: "roleId is required" });
    }

    try {
      const result = await assignUserRole(orgId, userId, body.roleId);
      return reply.send(result);
    } catch (err: any) {
      return reply.status(getRbacErrorStatus(err)).send({ error: err.message });
    }
  });
}
