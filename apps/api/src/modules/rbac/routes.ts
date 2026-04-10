import type { FastifyPluginAsync } from "fastify";
import bcrypt from "bcryptjs";
import {
  listPermissions,
  listRoles,
  getRole,
  createRole,
  updateRole,
  deleteRole,
} from "./service";
import { db } from "@apex/database";
import { users, roles } from "@apex/database/schema";
import { eq, and, sql, inArray } from "drizzle-orm";

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

  // GET /rbac/employees — list employees with role info
  app.get("/employees", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const rows = await db.execute(sql`
      SELECT u.id, u.full_name AS "fullName", u.email, u.role,
        u.role_id AS "roleId",
        r.name AS "roleName",
        u.primary_location_id AS "primaryLocationId",
        u.created_at AS "createdAt"
      FROM users u
      LEFT JOIN roles r ON r.id = u.role_id
      WHERE u.org_id = ${orgId}
      ORDER BY u.full_name
    `);
    return reply.send({ data: rows });
  });

  // PUT /rbac/users/:userId/role — assign role to user
  app.put("/users/:userId/role", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { role: userRole } = request.user;
    if (userRole !== "ADMIN") {
      return reply.status(403).send({ error: "Admin required" });
    }

    const { userId } = request.params as { userId: string };
    const body = request.body as { roleId: string };
    if (!body?.roleId) {
      return reply.status(400).send({ error: "roleId is required" });
    }

    // Verify role exists and belongs to org
    const [role] = await db
      .select()
      .from(roles)
      .where(and(eq(roles.id, body.roleId), eq(roles.orgId, orgId)))
      .limit(1);
    if (!role) return reply.status(404).send({ error: "Role not found" });

    // Verify user belongs to org
    const [user] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.id, userId), eq(users.orgId, orgId)))
      .limit(1);
    if (!user) return reply.status(404).send({ error: "User not found" });

    await db.update(users).set({ roleId: body.roleId }).where(eq(users.id, userId));
    return reply.send({ success: true });
  });

  // POST /rbac/seed-cashiers — create user accounts for CBROS cashiers
  app.post("/seed-cashiers", async (request, reply) => {
    const { role: userRole } = request.user;
    if (userRole !== "ADMIN") {
      return reply.status(403).send({ error: "Admin required" });
    }

    const { orgId } = request.storeContext!;

    // Cashier definitions — from Loyverse historical_sales employee names
    const CASHIERS = [
      { name: "Shaira", nickname: "SHAIRA" },
      { name: "Marie Joy", nickname: "MARIE JOY" },
      { name: "Ella", nickname: "ELLA" },
      { name: "Legine", nickname: "LEGINE" },
      { name: "Trina", nickname: "TRINA" },
      { name: "Roselyn", nickname: "ROSELYN" },
      { name: "Jelyn", nickname: "JELYN" },
      { name: "Grace", nickname: "GRACE" },
      { name: "Anna", nickname: "ANNA" },
      { name: "Maylene", nickname: "MAYLENE" },
    ];

    // Find Cashier role
    const [cashierRole] = await db
      .select({ id: roles.id })
      .from(roles)
      .where(and(eq(roles.orgId, orgId), eq(roles.name, "Cashier")))
      .limit(1);

    // Find Owner role for Chris
    const [ownerRole] = await db
      .select({ id: roles.id })
      .from(roles)
      .where(and(eq(roles.orgId, orgId), eq(roles.name, "Owner")))
      .limit(1);

    // Check existing emails to avoid duplicates
    const existingEmails = await db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.orgId, orgId));
    const emailSet = new Set(existingEmails.map((e) => e.email.toLowerCase()));

    // Link CHRIS to the existing admin user
    const [adminUser] = await db
      .select({ id: users.id, fullName: users.fullName })
      .from(users)
      .where(and(eq(users.orgId, orgId), eq(users.role, "ADMIN")))
      .limit(1);

    let linked = 0;
    if (adminUser && ownerRole) {
      await db.update(users).set({ roleId: ownerRole.id }).where(eq(users.id, adminUser.id));
      linked++;
    }

    // Default password for new accounts (cashiers should change on first login)
    const defaultPassword = await bcrypt.hash("***REMOVED***", 10);

    const seeded: string[] = [];
    for (const c of CASHIERS) {
      const email = `${c.nickname.toLowerCase().replace(/\s+/g, ".")}@cbros.local`;
      if (emailSet.has(email)) continue;

      await db.insert(users).values({
        orgId,
        fullName: c.name,
        email,
        passwordHash: defaultPassword,
        role: "CASHIER",
        roleId: cashierRole?.id ?? null,
      });
      seeded.push(c.name);
    }

    return reply.send({
      seeded: seeded.length,
      linked,
      message: `Created ${seeded.length} cashier accounts${linked ? ", linked Chris to Owner role" : ""}`,
      names: seeded,
      defaultPassword: "***REMOVED***",
    });
  });
};
