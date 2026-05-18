import type { FastifyReply } from "fastify";

export const SUBCATEGORY_MANAGE_ROLES = ["ADMIN", "MANAGER"];

export type SubcategoryListQuery = {
  categoryId?: string;
};

export type SubcategoryIdParams = {
  id: string;
};

export function canManageSubcategories(role: string | undefined) {
  return SUBCATEGORY_MANAGE_ROLES.includes(role ?? "");
}

export function sendSubcategoryManageRequired(reply: FastifyReply, action: "create" | "delete" | "update") {
  return reply.status(403).send({ error: `Only ADMIN or MANAGER can ${action} subcategories` });
}
