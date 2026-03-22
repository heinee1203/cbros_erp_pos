import type { FastifyRequest, FastifyReply } from "fastify";

/**
 * Fastify preHandler that checks if the user has the required permission.
 * Usage:
 *   app.get("/foo", { preHandler: requirePermission("bo.manage_items") }, handler);
 *
 * Falls back gracefully: if permissions are not in the JWT (legacy token),
 * allows access (the existing role-based checks in route handlers still apply).
 */
export function requirePermission(permissionKey: string) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const permissions: string[] = (request.user as any)?.permissions ?? [];

    // If no permissions in JWT (legacy token), allow through — existing role checks handle it
    if (permissions.length === 0) return;

    if (!permissions.includes(permissionKey)) {
      return reply.status(403).send({
        error: "Access denied",
        requiredPermission: permissionKey,
      });
    }
  };
}

/**
 * Check if the user has any of the specified permissions.
 */
export function requireAnyPermission(...keys: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const permissions: string[] = (request.user as any)?.permissions ?? [];
    if (permissions.length === 0) return;

    if (!keys.some((k) => permissions.includes(k))) {
      return reply.status(403).send({
        error: "Access denied",
        requiredPermissions: keys,
      });
    }
  };
}
