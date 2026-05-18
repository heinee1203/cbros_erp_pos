import type { FastifyReply } from "fastify";

export const CASHFLOW_ADMIN_ROLES = ["ADMIN", "MANAGER"];
export const CASHFLOW_ADMIN_MANAGER_ERROR = "Admin or Manager required";
export const CASHFLOW_ADMIN_ERROR = "Admin required";

export type CashflowForecastQuery = {
  days?: string;
  startDate?: string;
};

export function canViewCashflow(role: string | undefined) {
  return CASHFLOW_ADMIN_ROLES.includes(role ?? "");
}

export function sendCashflowAdminManagerRequired(reply: FastifyReply) {
  return reply.status(403).send({ error: CASHFLOW_ADMIN_MANAGER_ERROR });
}

export function sendCashflowAdminRequired(reply: FastifyReply) {
  return reply.status(403).send({ error: CASHFLOW_ADMIN_ERROR });
}

export function parseForecastDays(query: CashflowForecastQuery) {
  return Math.min(parseInt(query.days ?? "90", 10) || 90, 180);
}
