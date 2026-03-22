import type { FastifyPluginAsync } from "fastify";
import {
  listPermissions,
  listRoles,
  getRole,
  createRole,
  updateRole,
  deleteRole,
} from "./service";

export const rbacRoutes: FastifyPluginAsync = async (app) => {
  // GET /rbac/permissions — list all available permissions
  app.get("/permissions", async (request, reply) => {
    const perms = await listPermissions();
    const grouped = {
      POS: perms.filter((p) => p.category === "POS"),
      BACKOFFICE: perms.filter((p) => p.category === "BACKOFFICE"),
    };
    return reply.send({ data: grouped });
  });

  // GET /rbac/roles — list all roles for the org
  app.get("/roles", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const roles = await listRoles(orgId);
    return reply.send({ data: roles });
  });

  // GET /rbac/roles/:id — role detail with permissions
  app.get("/roles/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;
    const role = await getRole(id, orgId);
    if (!role) return reply.status(404).send({ error: "Role not found" });
    return reply.send(role);
  });

  // POST /rbac/roles — create role (ADMIN only)
  app.post("/roles", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { role: userRole } = request.user;
    if (userRole !== "ADMIN") {
      return reply.status(403).send({ error: "Admin required" });
    }
    const body = request.body as { name: string; permissionKeys: string[] };
    if (!body.name || !body.permissionKeys) {
      return reply.status(400).send({ error: "name and permissionKeys are required" });
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

  // PUT /rbac/roles/:id — update role permissions (ADMIN only)
  app.put("/roles/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;
    const { role: userRole } = request.user;
    if (userRole !== "ADMIN") {
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

  // DELETE /rbac/roles/:id — delete role (ADMIN only)
  app.delete("/roles/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;
    const { role: userRole } = request.user;
    if (userRole !== "ADMIN") {
      return reply.status(403).send({ error: "Admin required" });
    }
    try {
      await deleteRole(id, orgId);
      return reply.send({ success: true });
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });
};
