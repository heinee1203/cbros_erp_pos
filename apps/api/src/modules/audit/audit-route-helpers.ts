import type { FastifyReply } from "fastify";

export type AuditLogQuery = {
  userId?: string;
  action?: string;
  entityType?: string;
  from?: string;
  to?: string;
  cursor?: string;
  limit?: string;
};

export function canViewAuditLog(user: any) {
  return user.role === "ADMIN";
}

export function sendAuditAdminRequired(reply: FastifyReply) {
  return reply.code(403).send({ error: "Admin access required" });
}

export function buildAuditLogQuery(orgId: string, query: AuditLogQuery) {
  return {
    orgId,
    userId: query.userId,
    action: query.action,
    entityType: query.entityType,
    from: query.from,
    to: query.to,
    cursor: query.cursor,
    limit: query.limit ? parseInt(query.limit, 10) : undefined,
  };
}
