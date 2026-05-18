import type { FastifyInstance } from "fastify";
import {
  deleteBatch,
  listBatches,
} from "./import-history-route-service";
import {
  canManageImportHistory,
  getImportHistoryErrorMessage,
} from "./import-history-route-helpers";

export async function registerImportHistoryBatchRoutes(app: FastifyInstance) {
  // GET /batches - list import batches
  app.get("/batches", async (request, reply) => {
    if (!canManageImportHistory(request.user.role)) {
      return reply.status(403).send({ error: "Insufficient permissions" });
    }

    const orgId = request.user.orgId;

    try {
      const batches = await listBatches(orgId);
      return reply.status(200).send({ data: batches });
    } catch (err: unknown) {
      return reply.status(500).send({
        error: getImportHistoryErrorMessage(err, "Failed to list batches"),
      });
    }
  });

  // DELETE /batches/:batchId - delete a batch
  app.delete(
    "/batches/:batchId",
    {
      schema: {
        params: {
          type: "object",
          required: ["batchId"],
          properties: {
            batchId: { type: "string", format: "uuid" },
          },
        },
      },
    },
    async (request, reply) => {
      if (!canManageImportHistory(request.user.role)) {
        return reply.status(403).send({ error: "Insufficient permissions" });
      }

      const { batchId } = request.params as { batchId: string };
      const orgId = request.user.orgId;

      try {
        const result = await deleteBatch(orgId, batchId);
        return reply.status(200).send(result);
      } catch (err: unknown) {
        return reply.status(500).send({
          error: getImportHistoryErrorMessage(err, "Failed to delete batch"),
        });
      }
    },
  );
}
