import bcrypt from "bcryptjs";
import { db } from "@apex/database";
import { roles, users } from "@apex/database/schema";
import { and, eq, sql } from "drizzle-orm";

export {
  createRole,
  deleteRole,
  getRole,
  listPermissions,
  listRoles,
  updateRole,
} from "./service";

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

export async function listEmployeesWithRoleInfo(orgId: string) {
  return db.execute(sql`
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
}

export async function assignUserRole(orgId: string, userId: string, roleId: string) {
  const [role] = await db
    .select()
    .from(roles)
    .where(and(eq(roles.id, roleId), eq(roles.orgId, orgId)))
    .limit(1);
  if (!role) {
    const err = new Error("Role not found") as Error & { statusCode?: number };
    err.statusCode = 404;
    throw err;
  }

  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.id, userId), eq(users.orgId, orgId)))
    .limit(1);
  if (!user) {
    const err = new Error("User not found") as Error & { statusCode?: number };
    err.statusCode = 404;
    throw err;
  }

  await db.update(users).set({ roleId }).where(eq(users.id, userId));
  return { success: true };
}

export async function seedCashierAccounts(orgId: string) {
  const [cashierRole] = await db
    .select({ id: roles.id })
    .from(roles)
    .where(and(eq(roles.orgId, orgId), eq(roles.name, "Cashier")))
    .limit(1);

  const [ownerRole] = await db
    .select({ id: roles.id })
    .from(roles)
    .where(and(eq(roles.orgId, orgId), eq(roles.name, "Owner")))
    .limit(1);

  const existingEmails = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.orgId, orgId));
  const emailSet = new Set(existingEmails.map((e) => e.email.toLowerCase()));

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

  return {
    seeded: seeded.length,
    linked,
    message: `Created ${seeded.length} cashier accounts${linked ? ", linked Chris to Owner role" : ""}`,
    names: seeded,
    defaultPassword: "***REMOVED***",
  };
}
