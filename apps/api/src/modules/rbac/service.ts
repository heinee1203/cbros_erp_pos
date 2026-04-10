import { db } from "@apex/database";
import {
  permissions,
  roles,
  rolePermissions,
  users,
} from "@apex/database/schema";
import { eq, and, sql, desc, inArray } from "drizzle-orm";

// ── Legacy permission map (fallback for users without roleId) ──

const ALL_KEYS = [
  "pos.accept_payments","pos.apply_discounts","pos.change_taxes","pos.open_cash_drawer",
  "pos.view_receipts","pos.perform_refunds","pos.reprint_receipts","pos.view_shift_report",
  "pos.manage_items","pos.view_cost","pos.change_settings","pos.force_close_shift",
  "pos.void_sale","pos.manual_price_override",
  "bo.view_sales_reports","bo.cancel_receipts","bo.manage_items","bo.manage_inventory",
  "bo.view_cost","bo.manage_employees","bo.manage_customers","bo.manage_settings",
  "bo.manage_billing","bo.manage_payment_types","bo.manage_taxes","bo.manage_pos_devices",
  "bo.manage_purchase_orders","bo.manage_suppliers","bo.view_demand_reports",
];

const LEGACY_MAP: Record<string, string[]> = {
  ADMIN: ALL_KEYS,
  MANAGER: [
    "pos.accept_payments","pos.apply_discounts","pos.view_receipts","pos.perform_refunds",
    "pos.reprint_receipts","pos.view_shift_report","pos.view_cost","pos.force_close_shift",
    "bo.view_sales_reports","bo.manage_items","bo.manage_inventory","bo.manage_customers",
  ],
  CASHIER: ["pos.accept_payments","pos.view_receipts","pos.reprint_receipts","pos.view_shift_report"],
  WAREHOUSE_STAFF: ["bo.manage_inventory","bo.manage_items","bo.view_cost","bo.manage_purchase_orders"],
  STAFF: ["bo.manage_items","bo.manage_inventory"],
};

/**
 * Get permissions for a user. Uses RBAC role if available, falls back to legacy enum.
 */
export async function getUserPermissions(userId: string, legacyRole: string): Promise<string[]> {
  // Check if user has an RBAC roleId
  const [user] = await db
    .select({ roleId: users.roleId })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (user?.roleId) {
    // Fetch from RBAC
    const perms = await db
      .select({ key: permissions.key })
      .from(rolePermissions)
      .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
      .where(eq(rolePermissions.roleId, user.roleId));
    return perms.map((p) => p.key);
  }

  // Fallback to legacy
  return LEGACY_MAP[legacyRole] ?? [];
}

// ══════════════════════════════════════════════════════
// PERMISSIONS
// ══════════════════════════════════════════════════════

export async function listPermissions() {
  return db
    .select()
    .from(permissions)
    .orderBy(permissions.category, permissions.sortOrder);
}

// ══════════════════════════════════════════════════════
// ROLES CRUD
// ══════════════════════════════════════════════════════

export async function listRoles(orgId: string) {
  const roleRows = await db
    .select({
      id: roles.id,
      name: roles.name,
      isSystem: roles.isSystem,
      createdAt: roles.createdAt,
      permissionCount: sql<number>`(SELECT COUNT(*)::int FROM role_permissions rp WHERE rp.role_id = ${roles.id})`,
      employeeCount: sql<number>`(SELECT COUNT(*)::int FROM users u WHERE u.role_id = ${roles.id})`,
    })
    .from(roles)
    .where(eq(roles.orgId, orgId))
    .orderBy(desc(roles.isSystem), roles.name);

  return roleRows;
}

export async function getRole(id: string, orgId: string) {
  const [role] = await db
    .select()
    .from(roles)
    .where(and(eq(roles.id, id), eq(roles.orgId, orgId)))
    .limit(1);

  if (!role) return null;

  const perms = await db
    .select({ key: permissions.key })
    .from(rolePermissions)
    .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
    .where(eq(rolePermissions.roleId, id));

  return { ...role, permissions: perms.map((p) => p.key) };
}

export async function createRole(orgId: string, input: { name: string; permissionKeys: string[] }) {
  const [role] = await db
    .insert(roles)
    .values({ orgId, name: input.name })
    .returning();

  await syncRolePermissions(role.id, input.permissionKeys);
  return getRole(role.id, orgId);
}

export async function updateRole(
  id: string,
  orgId: string,
  input: { name?: string; permissionKeys?: string[] },
) {
  const [role] = await db
    .select()
    .from(roles)
    .where(and(eq(roles.id, id), eq(roles.orgId, orgId)))
    .limit(1);

  if (!role) throw new Error("Role not found");

  if (input.name && !role.isSystem) {
    await db.update(roles).set({ name: input.name }).where(eq(roles.id, id));
  }

  if (input.permissionKeys) {
    await syncRolePermissions(id, input.permissionKeys);
  }

  return getRole(id, orgId);
}

export async function deleteRole(id: string, orgId: string) {
  const [role] = await db
    .select()
    .from(roles)
    .where(and(eq(roles.id, id), eq(roles.orgId, orgId)))
    .limit(1);

  if (!role) throw new Error("Role not found");
  if (role.isSystem) throw new Error("Cannot delete system roles");

  // Check if any users are assigned
  const [count] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(users)
    .where(eq(users.roleId, id));

  if (count && count.count > 0) {
    throw new Error(`Cannot delete role — ${count.count} employee(s) still assigned`);
  }

  await db.delete(rolePermissions).where(eq(rolePermissions.roleId, id));
  await db.delete(roles).where(eq(roles.id, id));
  return { success: true };
}

// ── Helpers ──

async function syncRolePermissions(roleId: string, permissionKeys: string[]) {
  await db.delete(rolePermissions).where(eq(rolePermissions.roleId, roleId));

  if (permissionKeys.length === 0) return;

  const permRows = await db
    .select({ id: permissions.id })
    .from(permissions)
    .where(inArray(permissions.key, permissionKeys));

  if (permRows.length > 0) {
    await db.insert(rolePermissions).values(
      permRows.map((p) => ({ roleId, permissionId: p.id })),
    );
  }
}
