import type { FastifyInstance } from "fastify";
import { queryAuditLog } from "./audit-route-service";
import {
  buildAuditLogQuery,
  canViewAuditLog,
  sendAuditAdminRequired,
  type AuditLogQuery,
} from "./audit-route-helpers";

export async function registerAuditReadRoutes(app: FastifyInstance) {
  app.get("/", async (request, reply) => {
    const user = request.user as any;
    if (!canViewAuditLog(user)) {
      return sendAuditAdminRequired(reply);
    }

    const { orgId } = request.storeContext!;
    const query = request.query as AuditLogQuery;

    const result = await queryAuditLog(buildAuditLogQuery(orgId, query));

    return reply.send(result);
  });
}
