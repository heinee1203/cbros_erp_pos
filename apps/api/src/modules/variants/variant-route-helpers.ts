import type { FastifyReply } from "fastify";

export const VARIANT_MANAGE_ROLES = ["ADMIN", "MANAGER"];

export type VariantProductParams = {
  productId: string;
};

export type VariantDeleteParams = {
  productId: string;
  variantId: string;
};

export function canManageVariants(role: string | undefined) {
  return VARIANT_MANAGE_ROLES.includes(role ?? "");
}

export function sendVariantManageRequired(
  reply: FastifyReply,
  action: "convert products" | "create variants" | "delete variants",
) {
  return reply.status(403).send({ error: `Only ADMIN or MANAGER can ${action}` });
}
