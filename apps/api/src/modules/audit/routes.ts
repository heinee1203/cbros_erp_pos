import type { FastifyPluginAsync } from "fastify";
import { queryAuditLog } from "./service";

const auditRoutes: FastifyPluginAsync = async (app) => {
  // GET /audit-log — paginated audit log (admin only)
  app.get("/", async (request, reply) => {
    const user = request.user as any;
    if (user.role !== "ADMIN") {
      return reply.code(403).send({ error: "Admin access required" });
    }

    const { orgId } = request.storeContext!;
    const query = request.query as {
      userId?: string;
      action?: string;
      entityType?: string;
      from?: string;
      to?: string;
      cursor?: string;
      limit?: string;
    };

    const result = await queryAuditLog({
      orgId,
      userId: query.userId,
      action: query.action,
      entityType: query.entityType,
      from: query.from,
      to: query.to,
      cursor: query.cursor,
      limit: query.limit ? parseInt(query.limit, 10) : undefined,
    });

    return reply.send(result);
  });
};

export default auditRoutes;
