import type { FastifyReply } from "fastify";

export const BRAND_MANAGE_ROLES = ["ADMIN", "MANAGER"];
export const BRAND_MANAGE_ERROR = "Only ADMIN or MANAGER can manage brands";

export function canManageBrands(role: string | undefined) {
  return BRAND_MANAGE_ROLES.includes(role ?? "");
}

export function getBrandUserRole(user: unknown) {
  return (user as { role?: string } | undefined)?.role;
}

export function sendBrandManageRequired(reply: FastifyReply) {
  return reply.status(403).send({
    error: BRAND_MANAGE_ERROR,
  });
}

export function getBrandErrorStatus(err: unknown) {
  return (err as { message?: string }).message?.includes("not found")
    ? 404
    : 400;
}

export function getBrandErrorMessage(err: unknown) {
  return (err as { message?: string }).message;
}
