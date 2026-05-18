import type { FastifyRequest, FastifyReply } from "fastify";
import type { StoreContext } from "@apex/types";

function userPermissions(request: FastifyRequest): string[] {
  return (request.user as any)?.permissions ?? [];
}

function userRole(request: FastifyRequest): string | undefined {
  return (request.user as any)?.role;
}

export function hasPermission(permissions: string[], permissionKey: string): boolean {
  return permissions.includes(permissionKey);
}

export function hasAnyPermission(permissions: string[], keys: string[]): boolean {
  return keys.some((key) => permissions.includes(key));
}

/**
 * Fastify preHandler that checks if the user has the required permission.
 * Usage:
 *   app.get("/foo", { preHandler: requirePermission("bo.manage_items") }, handler);
 */
export function requirePermission(permissionKey: string) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const permissions = userPermissions(request);

    if (!hasPermission(permissions, permissionKey)) {
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
    const permissions = userPermissions(request);

    if (!hasAnyPermission(permissions, keys)) {
      return reply.status(403).send({
        error: "Access denied",
        requiredPermissions: keys,
      });
    }
  };
}

/**
 * Legacy role guard for routes not yet migrated to granular RBAC.
 * Keep usage explicit so every privileged route declares its access model.
 */
export function requireAnyRole(...roles: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const role = userRole(request);
    if (!role || !roles.includes(role)) {
      return reply.status(403).send({
        error: "Access denied",
        requiredRoles: roles,
      });
    }
  };
}

/**
 * Returns a location-scoped context or sends 400. Use this in mutations that
 * should never run in org-wide/ALL-location context.
 */
export function getRequiredLocationContext(
  request: FastifyRequest,
  reply: FastifyReply,
): (StoreContext & { locationId: string }) | null {
  const context = request.storeContext;
  if (!context?.locationId) {
    reply.status(400).send({
      error: "A specific location must be selected for this operation",
    });
    return null;
  }
  return context as StoreContext & { locationId: string };
}

export function requireLocationContext() {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const context = getRequiredLocationContext(request, reply);
    if (!context) return reply;
  };
}
