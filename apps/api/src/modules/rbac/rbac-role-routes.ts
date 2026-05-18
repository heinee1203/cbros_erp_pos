import type { FastifyInstance } from "fastify";
import {
  createRole,
  deleteRole,
  getRole,
  listPermissions,
  listRoles,
  updateRole,
} from "./rbac-route-service";
import { isAdminRole } from "./rbac-route-helpers";

export async function registerRbacRoleRoutes(app: FastifyInstance) {
  app.get("/permissions", async (_request, reply) => {
    const perms = await listPermissions();
    const grouped = {
      POS: perms.filter((p) => p.category === "POS"),
      BACKOFFICE: perms.filter((p) => p.category === "BACKOFFICE"),
    };
    return reply.send({ data: grouped });
  });

  app.get("/roles", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const roles = await listRoles(orgId);
    return reply.send({ data: roles });
  });

  app.get("/roles/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;
    const role = await getRole(id, orgId);
    if (!role) return reply.status(404).send({ error: "Role not found" });
    return reply.send(role);
  });

  app.post("/roles", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { role: userRole } = request.user;
    if (!isAdminRole(userRole)) {
      return reply.status(403).send({ error: "Admin required" });
    }

    const body = request.body as { name: string; permissionKeys: string[] };
    if (!body.name || !body.permissionKeys) {
      return reply
        .status(400)
        .send({ error: "name and permissionKeys are required" });
    }

    try {
      const role = await createRole(orgId, body);
      return reply.status(201).send(role);
    } catch (err: any) {
      if (err.code === "23505") {
        return reply.status(409).send({ error: "Role name already exists" });
      }
      throw err;
    }
  });

  app.put("/roles/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;
    const { role: userRole } = request.user;
    if (!isAdminRole(userRole)) {
      return reply.status(403).send({ error: "Admin required" });
    }

    const body = request.body as { name?: string; permissionKeys?: string[] };
    try {
      const role = await updateRole(id, orgId, body);
      return reply.send(role);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  app.delete("/roles/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;
    const { role: userRole } = request.user;
    if (!isAdminRole(userRole)) {
      return reply.status(403).send({ error: "Admin required" });
    }

    try {
      await deleteRole(id, orgId);
      return reply.send({ success: true });
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });
}
