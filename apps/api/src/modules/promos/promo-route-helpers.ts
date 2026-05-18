import type { FastifyReply } from "fastify";

export const PROMO_MANAGE_ROLES = ["ADMIN", "MANAGER"];
export const PROMO_MANAGE_ERROR = "Admin or Manager required";
export const PROMO_ADMIN_ERROR = "Admin required";

export type PromoApplyBody = {
  promoRuleId: string;
  saleId: string;
  discountAmount: number;
  freeItems?: any;
};

export function canManagePromos(role: string | undefined) {
  return PROMO_MANAGE_ROLES.includes(role ?? "");
}

export function sendPromoManageRequired(reply: FastifyReply) {
  return reply.status(403).send({ error: PROMO_MANAGE_ERROR });
}

export function sendPromoAdminRequired(reply: FastifyReply) {
  return reply.status(403).send({ error: PROMO_ADMIN_ERROR });
}
