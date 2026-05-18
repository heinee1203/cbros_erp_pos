export const TAG_MANAGE_ROLES = ["ADMIN", "MANAGER"];

export function getUserRole(request: { user?: unknown }) {
  return (request.user as any)?.role as string | undefined;
}

export function canManageTags(role: string | undefined) {
  return !!role && TAG_MANAGE_ROLES.includes(role);
}

export function isTagAdmin(role: string | undefined) {
  return role === "ADMIN";
}

export function parseOptionalLimit(limit: string | undefined) {
  return limit ? parseInt(limit, 10) : undefined;
}

export function getTagRouteErrorStatus(err: { message?: string }) {
  return err.message?.includes("not found") ? 404 : 400;
}
