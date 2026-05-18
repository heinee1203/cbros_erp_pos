import type { FastifyInstance } from "fastify";
import { MANAGE_ROLES } from "./route-permissions";
import { rollbackLatestItemImport } from "./import-rollback";

export function registerItemRollbackRoutes(app: FastifyInstance) {
  app.post(
    "/rollback/latest",
    {
      schema: {
        body: {
          type: "object",
          properties: {
            dryRun: { type: "boolean" },
          },
        },
      },
    },
    async (request, reply) => {
      if (!MANAGE_ROLES.includes(request.user.role)) {
        return reply.status(403).send({ error: "Insufficient permissions" });
      }

      const body = (request.body ?? {}) as { dryRun?: boolean };
      try {
        const result = await rollbackLatestItemImport({
          orgId: request.user.orgId,
          userId: request.user.userId,
          ipAddress: request.ip,
          dryRun: body.dryRun !== false,
        });
        return reply.status(200).send(result);
      } catch (err: any) {
        return reply.status(400).send({ error: err.message || "Rollback failed" });
      }
    },
  );
}
